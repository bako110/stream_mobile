/**
 * Encode/decode UUID ↔ base62 slug court.
 * Identique à stream_web/src/utils/slugId.ts
 *
 * UUID (32 hex chars sans tirets) est traité comme un entier 128 bits
 * et converti en base62 [0-9A-Za-z] → ~22 caractères max.
 *
 * Ex: "1bd6b59f-d37a-4cb4-9e42-52ce574288c2" → "0RjPVdNMR1A6JAQbbTqxe2"
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = BigInt(62);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[0-9A-Za-z]{1,22}$/;

function encodeBase62(n: bigint): string {
  if (n === 0n) return '0';
  let result = '';
  while (n > 0n) {
    result = ALPHABET[Number(n % BASE)] + result;
    n /= BASE;
  }
  return result;
}

function decodeBase62(s: string): bigint {
  let result = 0n;
  for (const c of s) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid slug char: ${c}`);
    result = result * BASE + BigInt(idx);
  }
  return result;
}

/** UUID → slug court base62 */
export function encodeId(uuid: string): string {
  if (!UUID_RE.test(uuid)) return uuid;
  const hex = uuid.replace(/-/g, '');
  return encodeBase62(BigInt('0x' + hex));
}

/** Slug court → UUID. Retourne le slug inchangé si ce n'est pas un slug valide. */
export function decodeId(slug: string): string {
  if (UUID_RE.test(slug)) return slug;
  if (!SLUG_RE.test(slug)) return slug;
  try {
    const n = decodeBase62(slug);
    const hex = n.toString(16).padStart(32, '0');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  } catch {
    return slug;
  }
}
