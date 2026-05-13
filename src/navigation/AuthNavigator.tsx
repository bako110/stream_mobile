import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LoginScreen }          from '../screens/Auth/LoginScreen';
import { RegisterScreen }       from '../screens/Auth/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/Auth/ForgotPasswordScreen';
import { SocialLoginScreen }    from '../screens/Auth/SocialLoginScreen';
import { CGUScreen }                      from '../screens/Main/CGUScreen';
import { PolitiqueConfidentialiteScreen } from '../screens/Main/PolitiqueConfidentialiteScreen';

export type AuthStackParamList = {
  Login:          undefined;
  Register:       undefined;
  ForgotPassword: undefined;
  SocialLogin:    undefined;
  CGU:                      undefined;
  PolitiqueConfidentialite: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

interface Props {
  onAuthSuccess: () => void;
  initialBlockedInfo?: { reason?: string; contact?: string } | null;
}

const LoginWrapper: React.FC<{ onAuthSuccess: () => void; initialBlockedInfo?: { reason?: string; contact?: string } | null }> = ({ onAuthSuccess, initialBlockedInfo }) => {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  return (
    <LoginScreen
      onLoginSuccess={onAuthSuccess}
      onGoRegister={() => nav.navigate('Register')}
      onGoForgotPassword={() => nav.navigate('ForgotPassword')}
      onGoSocialLogin={() => nav.navigate('SocialLogin')}
      onGoCGU={() => nav.navigate('CGU')}
      onGoPrivacy={() => nav.navigate('PolitiqueConfidentialite')}
      initialBlockedInfo={initialBlockedInfo}
    />
  );
};

const SocialLoginWrapper: React.FC<{ onAuthSuccess: () => void }> = ({ onAuthSuccess }) => {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  return (
    <SocialLoginScreen
      onGoBack={() => nav.goBack()}
      onAuthSuccess={onAuthSuccess}
    />
  );
};

const RegisterWrapper: React.FC<{ onAuthSuccess: () => void }> = ({ onAuthSuccess }) => {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  return (
    <RegisterScreen
      onRegisterSuccess={onAuthSuccess}
      onGoLogin={() => nav.goBack()}
    />
  );
};

const ForgotPasswordWrapper: React.FC = () => {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  return <ForgotPasswordScreen onGoBack={() => nav.goBack()} />;
};

export const AuthNavigator: React.FC<Props> = ({ onAuthSuccess, initialBlockedInfo }) => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
      contentStyle: { backgroundColor: 'transparent' },
    }}
  >
    <Stack.Screen name="Login">
      {() => <LoginWrapper onAuthSuccess={onAuthSuccess} initialBlockedInfo={initialBlockedInfo} />}
    </Stack.Screen>
    <Stack.Screen name="Register">
      {() => <RegisterWrapper onAuthSuccess={onAuthSuccess} />}
    </Stack.Screen>
    <Stack.Screen name="ForgotPassword">
      {() => <ForgotPasswordWrapper />}
    </Stack.Screen>
    <Stack.Screen name="SocialLogin" options={{ animation: 'slide_from_bottom', presentation: 'modal' }}>
      {() => <SocialLoginWrapper onAuthSuccess={onAuthSuccess} />}
    </Stack.Screen>
    <Stack.Screen name="CGU" options={{ animation: 'slide_from_right' }}>
      {({ navigation }) => <CGUScreen onBack={() => navigation.goBack()} />}
    </Stack.Screen>
    <Stack.Screen name="PolitiqueConfidentialite" options={{ animation: 'slide_from_right' }}>
      {({ navigation }) => <PolitiqueConfidentialiteScreen onBack={() => navigation.goBack()} />}
    </Stack.Screen>
  </Stack.Navigator>
);
