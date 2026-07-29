/**
 * Identifiant d'appareil stable, utilisé comme signal anti-bot à l'inscription
 * (voir device_fingerprint dans RegisterRequest). Contrairement au web (pas
 * d'identifiant matériel stable, fingerprint calculé à partir du navigateur),
 * react-native-device-info fournit un UUID stable généré et persisté par l'OS/
 * la librairie — déjà utilisée dans ce projet pour la vérification de version
 * (UpdateBanner.tsx).
 */
import DeviceInfo from 'react-native-device-info';

let cached: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;
  try {
    cached = await DeviceInfo.getUniqueId();
    return cached;
  } catch {
    return '';
  }
}
