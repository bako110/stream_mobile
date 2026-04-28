/**
 * @format
 * react-native-gesture-handler DOIT être importé en premier
 */
import 'react-native-gesture-handler';
import { registerGlobals } from '@livekit/react-native';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { handleBackgroundFCM, setupNotifeeBackgroundHandler } from './src/services/fcmService';
import App from './App';
import { name as appName } from './app.json';

registerGlobals();

// Notifee background event handler (action buttons on call notification)
setupNotifeeBackgroundHandler();

// FCM background/quit handler — shows Notifee full-screen call notification
messaging().setBackgroundMessageHandler(handleBackgroundFCM);

AppRegistry.registerComponent(appName, () => App);
