import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

const RETRY_INTERVAL_MS = 200;
const RETRY_TIMEOUT_MS  = 15_000;

// Sur un cold start (app tuée, réveillée par une notification), le NavigationContainer
// peut ne pas encore être monté au moment où on veut naviguer (ex: accepter un appel
// depuis la notification système). Sans retry, cet appel était silencieusement perdu
// (juste un console.warn) et l'action de l'utilisateur n'avait plus aucun effet.
export function navigate(name: string, params?: any, _startedAt: number = Date.now()) {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.navigate({ name, params }),
    );
    return;
  }
  if (Date.now() - _startedAt >= RETRY_TIMEOUT_MS) {
    console.warn('[navigationRef] not ready after retry timeout, giving up on', name);
    return;
  }
  setTimeout(() => navigate(name, params, _startedAt), RETRY_INTERVAL_MS);
}
