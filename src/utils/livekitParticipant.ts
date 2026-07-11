/**
 * Extrait l'avatar_url encode dans les metadonnees JSON d'un participant LiveKit
 * (voir LiveKitService.generate_token cote backend — avatar_url en JSON, sinon vide).
 */
export function participantAvatarUrl(metadata?: string | null): string | undefined {
  if (!metadata) return undefined;
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed?.avatar_url === 'string' ? parsed.avatar_url : undefined;
  } catch {
    return undefined;
  }
}
