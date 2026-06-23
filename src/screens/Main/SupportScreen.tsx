import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Linking, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';

interface Props {
  navigation: any;
}

const SUPPORT_OPTIONS = [
  {
    icon:    'message-circle',
    label:   'Messagerie',
    sub:     'Discuter avec notre équipe support',
    color:   '#7B3FF2',
    kind:    'chat',
  },
  {
    icon:    'mail',
    label:   'Email',
    sub:     'support@gofolyx.app',
    color:   '#10B981',
    kind:    'email',
    value:   'mailto:support@gofolyx.app?subject=Assistance%20GoFolyX',
  },
  {
    icon:    'phone',
    label:   'Appel',
    sub:     '+226 70 00 00 00',
    color:   '#F0365A',
    kind:    'phone',
    value:   'tel:+22670000000',
  },
] as const;

const FAQ = [
  { q: 'Comment réinitialiser mon mot de passe ?',  a: 'Va dans Paramètres → Compte → Changer le mot de passe, ou utilise "Mot de passe oublié" sur l\'écran de connexion.' },
  { q: 'Comment supprimer mon compte ?',             a: 'Va dans Paramètres → Danger → Supprimer mon compte. Cette action est irréversible.' },
  { q: 'Comment signaler un contenu inapproprié ?',  a: 'Appuie longuement sur le contenu ou utilise le bouton "..." pour accéder à l\'option Signaler.' },
  { q: 'Pourquoi mon paiement a-t-il échoué ?',      a: 'Vérifie que ton moyen de paiement est valide et que tu as une connexion internet stable. Contacte-nous si le problème persiste.' },
  { q: 'Comment devenir artiste vérifié ?',          a: 'Va dans Paramètres → Vérification et soumets les documents requis. L\'équipe GoFolyX examine les demandes sous 72h.' },
];

export const SupportScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const handleOption = (opt: typeof SUPPORT_OPTIONS[number]) => {
    if (opt.kind === 'chat') {
      navigation.navigate('SupportChat');
      return;
    }
    Linking.canOpenURL(opt.value).then(ok => {
      if (ok) Linking.openURL(opt.value);
      else Alert.alert('Erreur', 'Impossible d\'ouvrir ce lien');
    });
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Assistance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* Illustration / intro */}
        <View style={[s.hero, { backgroundColor: colors.primary + '12' }]}>
          <View style={[s.heroIcon, { backgroundColor: colors.primary + '20' }]}>
            <Icon name="life-buoy" size={36} color={colors.primary} />
          </View>
          <Text style={[s.heroTitle, { color: colors.textPrimary }]}>Comment pouvons-nous{'\n'}vous aider ?</Text>
          <Text style={[s.heroSub, { color: colors.textTertiary }]}>
            Notre équipe est disponible pour vous accompagner
          </Text>
        </View>

        {/* Options de contact */}
        <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>NOUS CONTACTER</Text>
        <View style={[s.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {SUPPORT_OPTIONS.map((opt, idx) => (
            <TouchableOpacity
              key={opt.kind}
              style={[
                s.contactRow,
                idx < SUPPORT_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
              ]}
              activeOpacity={0.75}
              onPress={() => handleOption(opt)}
            >
              <View style={[s.contactIcon, { backgroundColor: opt.color + '18' }]}>
                <Icon name={opt.icon} size={20} color={opt.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.contactLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                <Text style={[s.contactSub, { color: colors.textTertiary }]}>{opt.sub}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* FAQ */}
        <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>QUESTIONS FRÉQUENTES</Text>
        <View style={[s.faqCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {FAQ.map((item, idx) => {
            const open = expanded === idx;
            return (
              <TouchableOpacity
                key={idx}
                activeOpacity={0.8}
                onPress={() => setExpanded(open ? null : idx)}
                style={[
                  s.faqItem,
                  idx < FAQ.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                ]}
              >
                <View style={s.faqRow}>
                  <Text style={[s.faqQ, { color: colors.textPrimary, flex: 1 }]}>{item.q}</Text>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                </View>
                {open && (
                  <Text style={[s.faqA, { color: colors.textSecondary }]}>{item.a}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Liens utiles */}
        <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>LIENS UTILES</Text>
        <View style={[s.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[s.contactRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
            activeOpacity={0.75}
            onPress={() => navigation.navigate('CGU')}
          >
            <View style={[s.contactIcon, { backgroundColor: '#6366F118' }]}>
              <Icon name="file-text" size={20} color="#6366F1" />
            </View>
            <Text style={[s.contactLabel, { color: colors.textPrimary, flex: 1 }]}>Conditions d'utilisation</Text>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.contactRow}
            activeOpacity={0.75}
            onPress={() => navigation.navigate('PolitiqueConfidentialite')}
          >
            <View style={[s.contactIcon, { backgroundColor: '#14B8A618' }]}>
              <Icon name="shield" size={20} color="#14B8A6" />
            </View>
            <Text style={[s.contactLabel, { color: colors.textPrimary, flex: 1 }]}>Politique de confidentialité</Text>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 18, fontWeight: '800' },

  hero:         { margin: 16, borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 },
  heroIcon:     { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle:    { fontSize: 20, fontWeight: '800', textAlign: 'center', lineHeight: 28 },
  heroSub:      { fontSize: 13, textAlign: 'center' },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },

  contactCard:  { marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  contactIcon:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { fontSize: 15, fontWeight: '700' },
  contactSub:   { fontSize: 12, marginTop: 2 },

  faqCard:      { marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  faqItem:      { padding: 16 },
  faqRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faqQ:         { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  faqA:         { fontSize: 13, lineHeight: 20, marginTop: 10 },
});
