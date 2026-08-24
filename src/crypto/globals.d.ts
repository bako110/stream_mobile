/**
 * TextEncoder/TextDecoder sont fournis nativement par Hermes depuis RN 0.72+
 * (polyfill moteur, pas JS) mais absents de la config "lib" TypeScript du
 * projet (pas de "dom" — voir @react-native/typescript-config/tsconfig.json)
 * donc invisibles au type-checker seul. Déclaration minimale pour ce module
 * crypto uniquement, sans toucher au tsconfig partagé du reste du projet.
 */
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}
