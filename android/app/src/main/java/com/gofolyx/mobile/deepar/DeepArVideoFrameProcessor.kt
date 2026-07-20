package com.gofolyx.mobile.deepar

import ai.deepar.ar.AREventListener
import ai.deepar.ar.ARErrorType
import ai.deepar.ar.DeepAR
import ai.deepar.ar.DeepARImageFormat
import ai.deepar.ar.DeepARPixelFormat
import android.content.Context
import android.media.Image
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicReference

private const val TAG = "DeepArVideoFrameProcessor"

/**
 * Filtre beauté temps réel (lissage peau, façon TikTok) appliqué au flux caméra AVANT
 * publication LiveKit. Point d'ancrage : le hook "video effects" du fork LiveKit de
 * react-native-webrtc (VideoSource.setVideoProcessor), activé côté JS via
 * MediaStreamTrack._setVideoEffect('deepar_beauty').
 *
 * DeepAR fonctionne en pipeline YUV/RGBA (receiveFrame + callback frameAvailable
 * asynchrone), pas directement sur les textures GPU de VideoFrame — process() doit
 * rester synchrone (le pipeline WebRTC attend un retour immédiat), donc on retourne
 * toujours la DERNIÈRE frame déjà traitée par DeepAR plutôt que d'attendre celle en
 * cours : léger décalage d'une frame, invisible en pratique, mais jamais de blocage.
 */
class DeepArVideoFrameProcessor(private val context: Context) : VideoFrameProcessor, AREventListener {

    private var deepAR: DeepAR? = null
    private var initialized = false
    // Résolution réelle configurée pour le rendu offscreen — DeepAR doit connaître la
    // taille à l'avance (setOffscreenRendering), fixée à la première frame reçue.
    private var offscreenConfigured = false

    // Dernière frame traitée par DeepAR (écrite depuis frameAvailable(), lue depuis
    // process() — deux threads différents, d'où l'AtomicReference).
    private val lastProcessedImage = AtomicReference<Image?>(null)

    init {
        val engine = DeepAR(context)
        engine.setLicenseKey(BuildConfigAccessor.deepArLicenseKey(context))
        engine.initialize(context, this)
        deepAR = engine
    }

    override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame {
        val engine = deepAR
        if (engine == null || !initialized) {
            // DeepAR pas encore prêt (init asynchrone) — laisser passer la frame brute
            // plutôt que de bloquer le live en attendant.
            frame.retain()
            return frame
        }

        feedFrameToDeepAR(engine, frame)

        val processed = lastProcessedImage.get()
        if (processed == null) {
            // Aucune frame DeepAR disponible encore (tout premier appel) — frame brute.
            frame.retain()
            return frame
        }

        return imageToVideoFrame(processed, frame) ?: run {
            frame.retain()
            frame
        }
    }

    /** Convertit la frame WebRTC (I420/texture) en NV21 et l'envoie à DeepAR::receiveFrame. */
    private fun feedFrameToDeepAR(engine: DeepAR, frame: VideoFrame) {
        try {
            if (!offscreenConfigured) {
                // DeepAR doit connaître à l'avance la résolution de sortie du rendu
                // offscreen — sans cet appel, frameAvailable() n'est jamais déclenché.
                // ABGR_8888 (pas RGBA) : correspond exactement à YuvHelper.ABGRToI420,
                // conversion native déjà fournie par le SDK WebRTC — pas de conversion
                // couleur manuelle pixel par pixel à écrire/maintenir.
                engine.setOffscreenRendering(frame.buffer.width, frame.buffer.height, DeepARPixelFormat.ABGR_8888)
                offscreenConfigured = true
            }

            val i420 = frame.buffer.toI420() ?: return
            val nv21 = i420ToNv21(i420)
            i420.release()

            val buffer = ByteBuffer.allocateDirect(nv21.size)
            buffer.put(nv21)
            buffer.position(0)

            engine.receiveFrame(
                buffer,
                frame.buffer.width,
                frame.buffer.height,
                frame.rotation,
                /* mirror = */ false,
                DeepARImageFormat.YUV_NV21,
                /* pixelStride = */ 1,
            )
        } catch (e: Exception) {
            Log.w(TAG, "feedFrameToDeepAR failed: ${e.message}")
        }
    }

    private fun i420ToNv21(i420: VideoFrame.I420Buffer): ByteArray {
        val width = i420.width
        val height = i420.height
        val ySize = width * height
        val uvSize = width * height / 2
        val nv21 = ByteArray(ySize + uvSize)

        // Plan Y — copie directe ligne par ligne (strideY peut différer de width)
        var pos = 0
        val yBuf = i420.dataY
        for (row in 0 until height) {
            yBuf.position(row * i420.strideY)
            yBuf.get(nv21, pos, width)
            pos += width
        }

        // Plans U/V entrelacés en VNV21 (V puis U, sous-échantillonnés 2x2)
        val uBuf = i420.dataU
        val vBuf = i420.dataV
        val chromaWidth = (width + 1) / 2
        val chromaHeight = (height + 1) / 2
        for (row in 0 until chromaHeight) {
            for (col in 0 until chromaWidth) {
                val uIdx = row * i420.strideU + col
                val vIdx = row * i420.strideV + col
                if (pos + 1 < nv21.size) {
                    nv21[pos] = vBuf.get(vIdx)
                    nv21[pos + 1] = uBuf.get(uIdx)
                }
                pos += 2
            }
        }
        return nv21
    }

    /**
     * Reconstruit un VideoFrame WebRTC (I420) depuis l'Image ABGR_8888 (un seul plan)
     * renvoyée par DeepAR en rendu offscreen — via YuvHelper.ABGRToI420 (conversion
     * native du SDK WebRTC, pas de boucle de conversion couleur manuelle).
     */
    private fun imageToVideoFrame(image: Image, originalFrame: VideoFrame): VideoFrame? {
        return try {
            val plane = image.planes[0]
            val abgrBuffer = plane.buffer
            val abgrStride = plane.rowStride

            val i420 = JavaI420Buffer.allocate(image.width, image.height)
            org.webrtc.YuvHelper.ABGRToI420(
                abgrBuffer, abgrStride,
                i420.dataY, i420.strideY,
                i420.dataU, i420.strideU,
                i420.dataV, i420.strideV,
                image.width, image.height,
            )

            VideoFrame(i420, originalFrame.rotation, originalFrame.timestampNs)
        } catch (e: Exception) {
            Log.w(TAG, "imageToVideoFrame failed: ${e.message}")
            null
        }
    }

    fun release() {
        deepAR?.release()
        deepAR = null
        initialized = false
    }

    // ── AREventListener — callbacks DeepAR (thread interne DeepAR, pas le thread caméra) ──

    override fun initialized() {
        initialized = true
        Log.i(TAG, "DeepAR initialisé")
    }

    override fun faceVisibilityChanged(visible: Boolean) {}

    override fun imageVisibilityChanged(gameObjectID: String?, visible: Boolean) {}

    override fun frameAvailable(image: Image) {
        lastProcessedImage.getAndSet(image)?.close()
    }

    override fun error(errorType: ARErrorType?, message: String?) {
        Log.w(TAG, "DeepAR error [$errorType]: $message")
    }

    override fun shutdownFinished() {}

    override fun screenshotTaken(bitmap: android.graphics.Bitmap?) {}

    override fun videoRecordingStarted() {}

    override fun videoRecordingFinished() {}

    override fun videoRecordingFailed() {}

    override fun videoRecordingPrepared() {}

    override fun effectSwitched(slot: String?) {}
}

class DeepArVideoFrameProcessorFactory(private val context: Context) : VideoFrameProcessorFactoryInterface {
    override fun build(): VideoFrameProcessor = DeepArVideoFrameProcessor(context)
}
