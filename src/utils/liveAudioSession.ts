import { Platform } from 'react-native';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';

let configured = false;

/**
 * Sans config explicite, LiveKit RN route l'audio Android sur le flux appel
 * (STREAM_VOICE_CALL / mode inCommunication) — plafond de gain materiel bien
 * plus bas que le flux media (STREAM_MUSIC) sur la plupart des devices, d'ou
 * un volume percu comme faible. Bascule vers le preset "media", adapte a un
 * contenu de type live show plutot qu'un appel vocal. A appeler avant de se
 * connecter a une room (live simple ou battle), host comme viewer.
 */
export async function configureLiveAudioSession(): Promise<void> {
  try {
    if (Platform.OS === 'android' && !configured) {
      await AudioSession.configureAudio({ android: { audioTypeOptions: AndroidAudioTypePresets.media } });
      configured = true;
    }
    await AudioSession.startAudioSession();
  } catch {
    // best-effort — un live doit rester utilisable meme si cette configuration echoue
  }
}
