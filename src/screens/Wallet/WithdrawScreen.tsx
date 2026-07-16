import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { BackButton } from '../../components/common';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

const CONTACT_EMAIL = 'contact@gofolyx.com';

const WithdrawScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Retirer des fonds</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.body}>
        <LinearGradient
          colors={['#9B65F522', '#E85DAD22']}
          style={s.iconCircle}
        >
          <Icon name="tool" size={40} color="#9B65F5" />
        </LinearGradient>

        <Text style={[s.title, { color: colors.textPrimary }]}>
          Fonctionnalité en maintenance
        </Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          Le retrait de fonds sera disponible très prochainement.{'\n'}
          En attendant, utilisez la version web sur{' '}
          <Text style={{ color: '#9B65F5', fontWeight: '700' }}>gofolyx.com</Text>
        </Text>

        <TouchableOpacity
          style={[s.webBtn, { backgroundColor: '#9B65F5' }]}
          activeOpacity={0.85}
          onPress={() => Linking.openURL('https://gofolyx.com')}
        >
          <Icon name="external-link" size={16} color="#FFF" />
          <Text style={s.webBtnText}>Ouvrir gofolyx.com</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.mailBtn, { borderColor: colors.border }]}
          activeOpacity={0.75}
          onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
        >
          <Icon name="mail" size={15} color={colors.textSecondary} />
          <Text style={[s.mailBtnText, { color: colors.textSecondary }]}>{CONTACT_EMAIL}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  webBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  webBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  mailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  mailBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default WithdrawScreen;
