import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    // Use dispatch + navigate action to work reliably from any screen/state
    navigationRef.dispatch(
      CommonActions.navigate({ name, params }),
    );
  } else {
    __DEV__ && console.warn('[navigationRef] not ready, cannot navigate to', name);
  }
}
