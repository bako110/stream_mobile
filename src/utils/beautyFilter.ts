/**
 * Filtre beauté temps réel (DeepAR, lissage peau façon TikTok) appliqué à la piste
 * caméra locale avant publication LiveKit. Android uniquement pour l'instant — voir
 * DeepArVideoFrameProcessor.kt (module natif, enregistré au démarrage de l'app) et
 * le hook "video effects" du fork LiveKit de react-native-webrtc.
 *
 * _setVideoEffect est une API interne non exportée dans les types publics de
 * @livekit/react-native-webrtc — présente et fonctionnelle côté JS/natif, juste pas
 * documentée/typée, d'où le cast `as any`.
 */
import { Platform } from 'react-native';
import type { LocalParticipant } from 'livekit-client';
import { Track } from 'livekit-client';

export const DEEPAR_BEAUTY_EFFECT_NAME = 'deepar_beauty';

/**
 * Active le filtre beauté sur la piste caméra locale, si elle existe déjà.
 * À appeler juste après setCameraEnabled(true) (une fois la piste réellement créée).
 * Ne fait rien sur iOS (module natif Android uniquement pour l'instant) ni si la
 * piste caméra n'est pas encore publiée.
 */
export function enableBeautyFilter(localParticipant: LocalParticipant): void {
  if (Platform.OS !== 'android') return;
  try {
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (track && typeof (track as any)._setVideoEffect === 'function') {
      (track as any)._setVideoEffect(DEEPAR_BEAUTY_EFFECT_NAME);
    }
  } catch {
    // Best-effort — un live sans filtre reste utilisable, jamais bloquant.
  }
}

/** Retire le filtre beauté de la piste caméra locale (repasse en flux brut). */
export function disableBeautyFilter(localParticipant: LocalParticipant): void {
  if (Platform.OS !== 'android') return;
  try {
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (track && typeof (track as any)._setVideoEffects === 'function') {
      (track as any)._setVideoEffects([]);
    }
  } catch {
    // Best-effort.
  }
}
