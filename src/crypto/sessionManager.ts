/**
 * Point d'entrée unique pour ChatScreen.tsx / messageService.ts — orchestre
 * X3DH, Double Ratchet et le stockage local pour chiffrer/déchiffrer un
 * message texte. Aucune primitive crypto n'est appelée directement en
 * dehors de ce module côté app.
 *
 * Phase 1 (portée actuelle) : UN appareil actif par compte. Le multi-device
 * réel (fan-out vers plusieurs appareils du même destinataire, sync vers les
 * propres autres appareils de l'expéditeur) est une phase suivante — voir le
 * plan validé. Un seul bundle (le premier appareil actif renvoyé par le
 * serveur) est utilisé pour l'instant.
 */
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import {
  loadOrCreateDeviceIdentity, loadOrCreateSignedPrekey, generateOneTimePrekeys,
  consumeOneTimePrekeyPrivate, getSignedPrekeyPrivate, loadSession, saveSession,
} from './keyStore';
import { x3dhInitiate, x3dhReceive, bundleFromApi, type PreKeyBundle } from './x3dh';
import {
  initSessionAsInitiator, initSessionAsReceiver, ratchetEncrypt, ratchetDecrypt,
  toBase64, fromBase64, type EncryptedMessage,
} from './doubleRatchet';

const OTPK_LOW_WATERMARK = 10;
const OTPK_REFILL_COUNT = 20;

let registrationPromise: Promise<void> | null = null;

/** À appeler une fois au démarrage de l'app (utilisateur authentifié) —
 * garantit que cet appareil a une identité E2EE publiée côté serveur avant
 * de pouvoir recevoir des messages chiffrés. Idempotent, safe à rappeler. */
export async function ensureDeviceRegistered(): Promise<void> {
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    const identity = await loadOrCreateDeviceIdentity();
    const signedPrekey = await loadOrCreateSignedPrekey(identity);

    let remaining = 0;
    try {
      const res = await apiClient.get<{ device_id: string; remaining_one_time_prekeys: number }[]>(Endpoints.devices.myKeysCount);
      const mine = (res.data ?? []).find(d => d.device_id === identity.deviceId);
      remaining = mine?.remaining_one_time_prekeys ?? 0;
    } catch {
      // 404/erreur réseau au tout premier lancement = pas encore enregistré, on enregistre ci-dessous
    }

    if (remaining > 0) return; // déjà enregistré avec un stock suffisant

    const oneTimePrekeys = await generateOneTimePrekeys(OTPK_REFILL_COUNT);
    await apiClient.post(Endpoints.devices.registerKeys, {
      device_id: identity.deviceId,
      device_label: devicePlatformLabel(),
      identity_public_key: toBase64(identity.identityKeyPair.publicKey),
      identity_signing_key: toBase64(identity.identitySigningKeyPair.publicKey),
      signed_prekey_id: signedPrekey.id,
      signed_prekey: signedPrekey.publicKey,
      prekey_signature: signedPrekey.signature,
      registration_id: Math.floor(Math.random() * 0x7fffffff),
      one_time_prekeys: oneTimePrekeys,
    });
  })();
  return registrationPromise;
}

/** Réapprovisionne le stock d'OTPK côté serveur si bas — à appeler
 * périodiquement (ex: à chaque ouverture de l'app) après ensureDeviceRegistered. */
export async function refillOneTimePrekeysIfLow(): Promise<void> {
  try {
    const identity = await loadOrCreateDeviceIdentity();
    const res = await apiClient.get<{ device_id: string; remaining_one_time_prekeys: number }[]>(Endpoints.devices.myKeysCount);
    const mine = (res.data ?? []).find(d => d.device_id === identity.deviceId);
    if (!mine || mine.remaining_one_time_prekeys > OTPK_LOW_WATERMARK) return;

    const oneTimePrekeys = await generateOneTimePrekeys(OTPK_REFILL_COUNT);
    await apiClient.post(Endpoints.devices.addPrekeys, { device_id: identity.deviceId, one_time_prekeys: oneTimePrekeys });
  } catch {
    // best-effort — le prochain appel (ou le prochain démarrage) réessaiera
  }
}

function devicePlatformLabel(): string {
  try {
    const { Platform } = require('react-native');
    return Platform.OS === 'ios' ? 'iPhone' : 'Android';
  } catch { return 'Appareil'; }
}

export interface EncryptedPayload {
  senderDeviceId: string;
  contentType: 'x3dh_initial' | 'ratchet';
  dhPublicKey: string;
  previousChainLength: number;
  messageNumber: number;
  nonce: string;
  ciphertext: string;
  // Présents uniquement pour un message x3dh_initial — nécessaires au
  // récepteur pour reproduire les mêmes calculs DH sans avoir à re-fetch le
  // bundle de l'expéditeur (ce qui consommerait une OTPK pour rien).
  x3dhEphemeralPublicKey?: string;
  x3dhOneTimePrekeyId?: number | null;
  x3dhSenderIdentityPublicKey?: string;
}

/**
 * Chiffre un message texte pour un utilisateur destinataire. Établit une
 * session X3DH si aucune n'existe encore avec son appareil actif (Phase 1 :
 * un seul appareil pris en compte, le premier bundle renvoyé par le serveur).
 */
export async function encryptMessageForUser(recipientUserId: string, plaintext: string): Promise<EncryptedPayload> {
  const identity = await loadOrCreateDeviceIdentity();
  const bundlesRes = await apiClient.get<any[]>(Endpoints.devices.bundles(recipientUserId));
  const bundles = bundlesRes.data ?? [];
  if (bundles.length === 0) {
    throw new Error('E2EE_NO_DEVICE: le destinataire n\'a aucun appareil avec chiffrement activé');
  }
  const bundle: PreKeyBundle = bundleFromApi(bundles[0]);

  let session = await loadSession(recipientUserId, bundle.deviceId);
  let x3dhInfo: { ephemeralPublicKey: string; oneTimePrekeyId: number | null; senderIdentityPublicKey: string } | null = null;

  if (!session) {
    const result = x3dhInitiate(identity.identityKeyPair, bundle);
    session = initSessionAsInitiator(result.sharedSecret, result.ephemeralKeyPair, bundle.signedPrekey);
    x3dhInfo = {
      ephemeralPublicKey: toBase64(result.ephemeralKeyPair.publicKey),
      oneTimePrekeyId: result.usedOneTimePrekeyId,
      senderIdentityPublicKey: toBase64(identity.identityKeyPair.publicKey),
    };
  }

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const encrypted: EncryptedMessage = ratchetEncrypt(session, plaintextBytes);
  await saveSession(recipientUserId, bundle.deviceId, session);

  return {
    senderDeviceId: identity.deviceId,
    contentType: x3dhInfo ? 'x3dh_initial' : 'ratchet',
    dhPublicKey: toBase64(encrypted.header.dhPublicKey),
    previousChainLength: encrypted.header.previousChainLength,
    messageNumber: encrypted.header.messageNumber,
    nonce: toBase64(encrypted.nonce),
    ciphertext: toBase64(encrypted.ciphertext),
    x3dhEphemeralPublicKey: x3dhInfo?.ephemeralPublicKey,
    x3dhOneTimePrekeyId: x3dhInfo?.oneTimePrekeyId ?? undefined,
    x3dhSenderIdentityPublicKey: x3dhInfo?.senderIdentityPublicKey,
  };
}

/**
 * Déchiffre un message reçu de senderUserId/payload.senderDeviceId. Si
 * payload.contentType === 'x3dh_initial', établit la session côté récepteur
 * avant de déchiffrer (premier message de cette paire d'appareils).
 */
export async function decryptMessageFromUser(senderUserId: string, payload: EncryptedPayload): Promise<string> {
  const identity = await loadOrCreateDeviceIdentity();
  let session = await loadSession(senderUserId, payload.senderDeviceId);

  if (!session) {
    if (payload.contentType !== 'x3dh_initial' || !payload.x3dhEphemeralPublicKey || !payload.x3dhSenderIdentityPublicKey) {
      throw new Error('E2EE_SESSION_MISSING: aucune session existante et ce message n\'est pas un premier message X3DH exploitable');
    }
    const signedPrekeyPair = await getSignedPrekeyPrivate();
    if (!signedPrekeyPair) throw new Error('E2EE_NO_LOCAL_SIGNED_PREKEY');

    const otpkPrivate = payload.x3dhOneTimePrekeyId != null
      ? await consumeOneTimePrekeyPrivate(payload.x3dhOneTimePrekeyId)
      : null;

    const sharedSecret = x3dhReceive(
      identity.identityKeyPair,
      signedPrekeyPair.privateKey,
      fromBase64(payload.x3dhSenderIdentityPublicKey),
      fromBase64(payload.x3dhEphemeralPublicKey),
      otpkPrivate?.privateKey ?? null,
    );
    session = initSessionAsReceiver(sharedSecret, signedPrekeyPair);
  }

  const encrypted: EncryptedMessage = {
    header: {
      dhPublicKey: fromBase64(payload.dhPublicKey),
      previousChainLength: payload.previousChainLength,
      messageNumber: payload.messageNumber,
    },
    nonce: fromBase64(payload.nonce),
    ciphertext: fromBase64(payload.ciphertext),
  };

  const plaintextBytes = ratchetDecrypt(session, encrypted);
  await saveSession(senderUserId, payload.senderDeviceId, session);

  return new TextDecoder().decode(plaintextBytes);
}
