package com.gofolyx.mobile.deepar

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.oney.WebRTCModule.videoEffects.ProcessorProvider

const val DEEPAR_BEAUTY_EFFECT_NAME = "deepar_beauty"

/**
 * Enregistre le processor DeepAR auprès du fork LiveKit de react-native-webrtc — une
 * seule fois, au démarrage de l'app (voir MainApplication). Pas de méthode exposée en
 * JS ici : l'activation se fait directement côté JS via
 * (videoTrack as any)._setVideoEffect('deepar_beauty') une fois la piste caméra créée.
 * Ce module ne sert qu'à confirmer, si besoin, que l'enregistrement a bien eu lieu.
 */
class DeepArModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "DeepArModule"

    companion object {
        @Volatile
        private var registered = false

        fun registerProcessor(reactContext: ReactApplicationContext) {
            if (registered) return
            ProcessorProvider.addProcessor(
                DEEPAR_BEAUTY_EFFECT_NAME,
                DeepArVideoFrameProcessorFactory(reactContext.applicationContext),
            )
            registered = true
        }
    }

    @ReactMethod
    fun isBeautyFilterRegistered(promise: com.facebook.react.bridge.Promise) {
        promise.resolve(registered)
    }
}
