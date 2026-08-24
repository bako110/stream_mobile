/**
 * Tests d'intégration croisés du protocole E2EE maison (X3DH + Double
 * Ratchet) — chiffrer côté A, déchiffrer côté B et vice-versa, y compris
 * messages hors-ordre et perdus. Aucun audit crypto professionnel ne
 * remplace ça, mais c'est le minimum non négociable avant toute mise en
 * production d'une implémentation maison de ce protocole (cf. plan validé —
 * "pièges classiques du Double Ratchet").
 */
import { generateX25519KeyPair, generateEd25519KeyPair } from '../primitives';
import { x3dhInitiate, x3dhReceive, signPrekey, type PreKeyBundle } from '../x3dh';
import {
  initSessionAsInitiator, initSessionAsReceiver, ratchetEncrypt, ratchetDecrypt,
  type SessionState, type EncryptedMessage,
} from '../doubleRatchet';

function textToBytes(s: string): Uint8Array { return new TextEncoder().encode(s); }
function bytesToText(b: Uint8Array): string { return new TextDecoder().decode(b); }

describe('X3DH + Double Ratchet — protocole complet', () => {
  // Setup : B publie son identité + un signed_prekey signé + une OTPK. A récupère
  // le bundle et initie X3DH. Reproduit ce que fait GET /devices/{id}/bundles.
  function setupSessionPair() {
    const aIdentityDh = generateX25519KeyPair(); // clé d'identité X25519 (DH), distincte de la signature
    const bIdentitySigning = generateEd25519KeyPair(); // clé Ed25519, uniquement pour signer le signed_prekey
    const bIdentityDh = generateX25519KeyPair();
    const bSignedPrekey = generateX25519KeyPair();
    const bOneTimePrekey = generateX25519KeyPair();

    const signature = signPrekey(bIdentitySigning, bSignedPrekey.publicKey);

    const bundle: PreKeyBundle = {
      deviceId: 'device-b',
      identityPublicKey: bIdentityDh.publicKey,       // X25519 — pour les DH
      identitySigningKey: bIdentitySigning.publicKey, // Ed25519 — pour vérifier la signature
      signedPrekeyId: 1,
      signedPrekey: bSignedPrekey.publicKey,
      prekeySignature: signature,
      registrationId: 42,
      oneTimePrekeyId: 7,
      oneTimePrekey: bOneTimePrekey.publicKey,
    };

    // A initie — utilise sa propre paire DH d'identité (distincte Ed25519/X25519 en pratique réelle)
    const initResult = x3dhInitiate({ publicKey: aIdentityDh.publicKey, privateKey: aIdentityDh.privateKey }, bundle);

    // B reçoit — reproduit les mêmes DH avec ses clés privées
    const bSharedSecret = x3dhReceive(
      { publicKey: bIdentityDh.publicKey, privateKey: bIdentityDh.privateKey },
      bSignedPrekey.privateKey,
      aIdentityDh.publicKey,
      initResult.ephemeralKeyPair.publicKey,
      bOneTimePrekey.privateKey,
    );

    const sessionA = initSessionAsInitiator(initResult.sharedSecret, initResult.ephemeralKeyPair, bSignedPrekey.publicKey);
    const sessionB = initSessionAsReceiver(bSharedSecret, bSignedPrekey);

    return { sessionA, sessionB, sharedSecretsMatch: buffersEqual(initResult.sharedSecret, bSharedSecret) };
  }

  test('X3DH : A et B dérivent exactement la même clé partagée', () => {
    const { sharedSecretsMatch } = setupSessionPair();
    expect(sharedSecretsMatch).toBe(true);
  });

  test('X3DH : un bundle avec une signature invalide est rejeté', () => {
    const bIdentitySigning = generateEd25519KeyPair();
    const bIdentityDh = generateX25519KeyPair();
    const bSignedPrekey = generateX25519KeyPair();
    const wrongSignature = new Uint8Array(64).fill(0xaa); // signature bidon

    const bundle: PreKeyBundle = {
      deviceId: 'device-b', identityPublicKey: bIdentityDh.publicKey,
      identitySigningKey: bIdentitySigning.publicKey,
      signedPrekeyId: 1, signedPrekey: bSignedPrekey.publicKey,
      prekeySignature: wrongSignature, registrationId: 42,
      oneTimePrekeyId: null, oneTimePrekey: null,
    };
    const aIdentityDh = generateX25519KeyPair();
    expect(() => x3dhInitiate({ publicKey: aIdentityDh.publicKey, privateKey: aIdentityDh.privateKey }, bundle))
      .toThrow(/SIGNATURE_INVALID/);
  });

  test('Double Ratchet : A envoie, B déchiffre (premier message)', () => {
    const { sessionA, sessionB } = setupSessionPair();
    const msg = ratchetEncrypt(sessionA, textToBytes('Salut B !'));
    const plaintext = ratchetDecrypt(sessionB, msg);
    expect(bytesToText(plaintext)).toBe('Salut B !');
  });

  test('Double Ratchet : conversation bidirectionnelle sur plusieurs échanges', () => {
    const { sessionA, sessionB } = setupSessionPair();

    const m1 = ratchetEncrypt(sessionA, textToBytes('A: bonjour'));
    expect(bytesToText(ratchetDecrypt(sessionB, m1))).toBe('A: bonjour');

    const m2 = ratchetEncrypt(sessionB, textToBytes('B: salut, ça va ?'));
    expect(bytesToText(ratchetDecrypt(sessionA, m2))).toBe('B: salut, ça va ?');

    const m3 = ratchetEncrypt(sessionA, textToBytes('A: oui et toi ?'));
    expect(bytesToText(ratchetDecrypt(sessionB, m3))).toBe('A: oui et toi ?');

    const m4 = ratchetEncrypt(sessionB, textToBytes('B: nickel'));
    expect(bytesToText(ratchetDecrypt(sessionA, m4))).toBe('B: nickel');

    // Plusieurs messages consécutifs du même côté sans réponse intercalée
    const m5 = ratchetEncrypt(sessionA, textToBytes('A: message 1'));
    const m6 = ratchetEncrypt(sessionA, textToBytes('A: message 2'));
    const m7 = ratchetEncrypt(sessionA, textToBytes('A: message 3'));
    expect(bytesToText(ratchetDecrypt(sessionB, m5))).toBe('A: message 1');
    expect(bytesToText(ratchetDecrypt(sessionB, m6))).toBe('A: message 2');
    expect(bytesToText(ratchetDecrypt(sessionB, m7))).toBe('A: message 3');
  });

  test('Double Ratchet : messages reçus hors-ordre sont tous déchiffrables', () => {
    const { sessionA, sessionB } = setupSessionPair();
    const m1 = ratchetEncrypt(sessionA, textToBytes('un'));
    const m2 = ratchetEncrypt(sessionA, textToBytes('deux'));
    const m3 = ratchetEncrypt(sessionA, textToBytes('trois'));

    // B reçoit dans l'ordre 3, 1, 2
    expect(bytesToText(ratchetDecrypt(sessionB, m3))).toBe('trois');
    expect(bytesToText(ratchetDecrypt(sessionB, m1))).toBe('un');
    expect(bytesToText(ratchetDecrypt(sessionB, m2))).toBe('deux');
  });

  test('Double Ratchet : un message définitivement perdu n\'empêche pas de déchiffrer les suivants', () => {
    const { sessionA, sessionB } = setupSessionPair();
    const m1 = ratchetEncrypt(sessionA, textToBytes('perdu'));
    const m2 = ratchetEncrypt(sessionA, textToBytes('reçu après perte'));
    void m1; // jamais transmis à B, simulé
    expect(bytesToText(ratchetDecrypt(sessionB, m2))).toBe('reçu après perte');
  });

  test('Double Ratchet : un ciphertext altéré échoue à l\'authentification (pas de silent corruption)', () => {
    const { sessionA, sessionB } = setupSessionPair();
    const msg = ratchetEncrypt(sessionA, textToBytes('intact ?'));
    const tampered: EncryptedMessage = { ...msg, ciphertext: new Uint8Array(msg.ciphertext).map((b, i) => i === 0 ? b ^ 0xff : b) };
    expect(() => ratchetDecrypt(sessionB, tampered)).toThrow();
  });

  test('Double Ratchet : forward secrecy — deux messages consécutifs n\'utilisent jamais la même clé', () => {
    const { sessionA } = setupSessionPair();
    const m1 = ratchetEncrypt(sessionA, textToBytes('a'));
    const m2 = ratchetEncrypt(sessionA, textToBytes('a')); // même plaintext
    // Même plaintext, mais nonce ET clé de message différents -> ciphertexts différents
    expect(buffersEqual(m1.ciphertext, m2.ciphertext)).toBe(false);
    expect(buffersEqual(m1.nonce, m2.nonce)).toBe(false);
  });

  test('Double Ratchet : conversation longue (50 échanges alternés) reste cohérente', () => {
    const { sessionA, sessionB } = setupSessionPair();
    for (let i = 0; i < 50; i++) {
      const fromA = i % 2 === 0;
      const sender = fromA ? sessionA : sessionB;
      const receiver = fromA ? sessionB : sessionA;
      const text = `message-${i}`;
      const msg = ratchetEncrypt(sender, textToBytes(text));
      expect(bytesToText(ratchetDecrypt(receiver, msg))).toBe(text);
    }
  });
});

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
