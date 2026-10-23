/**
 * onboardingDelayService — étale dans le temps les demandes intrusives du
 * tout nouveau compte (localisation, contacts, enquête écran de démarrage) au
 * lieu de toutes les montrer dès la première ouverture. Référence : date du
 * tout premier lancement de l'app SUR CET APPAREIL (pas la date d'inscription
 * du compte — reste cohérent même sans la charger depuis le serveur).
 */
import { storage } from '../utils/storage';

const FIRST_LAUNCH_KEY = 'gofolyx_first_launch_at';
const DAY_MS = 24 * 60 * 60 * 1000;

function getOrSetFirstLaunch(): number {
  const raw = storage.getItem(FIRST_LAUNCH_KEY);
  if (raw) return parseInt(raw, 10);
  const now = Date.now();
  storage.setItem(FIRST_LAUNCH_KEY, String(now));
  return now;
}

function daysSinceFirstLaunch(): number {
  return (Date.now() - getOrSetFirstLaunch()) / DAY_MS;
}

export const onboardingDelayService = {
  // Appelé une fois tôt dans l'app (ex: RootNavigator) pour poser le marqueur
  // dès le tout premier lancement, avant que les écrans qui en dépendent ne
  // calculent leur délai.
  ensureFirstLaunchRecorded: getOrSetFirstLaunch,

  canAskLocation: () => daysSinceFirstLaunch() >= 2,
  canAskContacts: () => daysSinceFirstLaunch() >= 3,
  canShowStartScreenSurvey: () => daysSinceFirstLaunch() >= 4,
};
