import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function navigate(name: string, params?: any) {
  console.log('[navigationRef] navigate', name, 'isReady=', navigationRef.isReady());
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.navigate({ name, params }),
    );
  } else {
    console.warn('[navigationRef] not ready, cannot navigate to', name);
  }
}
