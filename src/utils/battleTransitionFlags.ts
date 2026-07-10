/**
 * Flags partages (hors React) pour signaler qu'un live bascule vers un battle plutot
 * que d'etre reellement arrete. SimpleLiveStreamScreen arrete automatiquement le live
 * dans son cleanup au demontage (retour arriere, navigation ailleurs) — sans ce garde-fou,
 * le remplacement de cet ecran par BattleScreen (nav.replace) demonterait le live et
 * declencherait cet arret automatique, cloturant le battle par forfait immediatement.
 */
const liveIdsEnteringBattle = new Set<string>();

export function markLiveEnteringBattle(liveId: string): void {
  liveIdsEnteringBattle.add(liveId);
}

export function isLiveEnteringBattle(liveId: string): boolean {
  return liveIdsEnteringBattle.has(liveId);
}

export function clearLiveEnteringBattle(liveId: string): void {
  liveIdsEnteringBattle.delete(liveId);
}
