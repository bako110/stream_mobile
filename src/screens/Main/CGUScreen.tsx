import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  onBack: () => void;
}

const SECTIONS = [
  {
    icon: 'file-text',
    title: '1. Objet',
    body: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de l'application mobile FoliX, éditée par FoliX SAS.

En accédant à l'application, vous acceptez sans réserve les présentes CGU. Si vous ne les acceptez pas, veuillez cesser d'utiliser l'application.`,
  },
  {
    icon: 'user-check',
    title: '2. Inscription & Compte',
    body: `Pour accéder aux fonctionnalités de FoliX, vous devez créer un compte en fournissant des informations exactes et à jour.

Vous êtes seul responsable de la confidentialité de vos identifiants. Toute utilisation de votre compte est réputée faite par vous. En cas d'utilisation non autorisée, contactez-nous immédiatement à support@folix.app.

Vous devez avoir au moins 13 ans pour utiliser FoliX.`,
  },
  {
    icon: 'edit-3',
    title: '3. Contenu publié',
    body: `Vous conservez la propriété des contenus que vous publiez (posts, reels, stories, etc.). En les publiant sur FoliX, vous accordez à FoliX une licence mondiale, non exclusive, gratuite, pour afficher, reproduire et distribuer ces contenus dans le cadre du service.

Il est strictement interdit de publier :
• Des contenus illicites, haineux, diffamatoires ou discriminatoires
• Des contenus sexuellement explicites impliquant des mineurs
• Des contenus portant atteinte aux droits de tiers (droits d'auteur, marques)
• Du spam, des arnaques ou de la désinformation`,
  },
  {
    icon: 'shield',
    title: '4. Confidentialité & Données',
    body: `FoliX collecte et traite vos données personnelles conformément à sa Politique de Confidentialité, disponible dans l'application.

Vos données sont hébergées en Europe et protégées conformément au RGPD. Vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données en nous contactant à privacy@folix.app.`,
  },
  {
    icon: 'zap',
    title: '5. Monétisation & Coins',
    body: `FoliX propose un système de Coins (monnaie virtuelle) permettant d'accéder à des fonctionnalités premium, d'envoyer des cadeaux ou d'accéder à des contenus exclusifs.

Les Coins achetés ne sont pas remboursables sauf obligation légale. Ils n'ont aucune valeur monétaire réelle et ne peuvent pas être échangés contre de l'argent réel, sauf dans le cadre du programme de monétisation créateur de FoliX.

FoliX se réserve le droit de modifier les tarifs à tout moment.`,
  },
  {
    icon: 'alert-triangle',
    title: '6. Comportement interdit',
    body: `Il est interdit de :
• Harceler, menacer ou intimider d'autres utilisateurs
• Usurper l'identité d'une personne ou d'une organisation
• Tenter d'accéder sans autorisation aux systèmes de FoliX
• Utiliser des robots, scrapers ou tout outil automatisé non autorisé
• Contourner les mesures de sécurité de l'application

Tout manquement peut entraîner la suspension ou la suppression définitive de votre compte.`,
  },
  {
    icon: 'tv',
    title: '7. Propriété intellectuelle',
    body: `L'application FoliX, son design, son code source, ses logos et ses marques sont la propriété exclusive de FoliX SAS et sont protégés par les lois sur la propriété intellectuelle.

Toute reproduction, modification ou exploitation non autorisée est strictement interdite.`,
  },
  {
    icon: 'x-circle',
    title: '8. Résiliation',
    body: `Vous pouvez supprimer votre compte à tout moment depuis les paramètres de l'application (Paramètres > Zone dangereuse > Supprimer mon compte).

FoliX se réserve le droit de suspendre ou supprimer tout compte en cas de violation des présentes CGU, sans préavis ni remboursement.`,
  },
  {
    icon: 'info',
    title: '9. Limitation de responsabilité',
    body: `FoliX est fourni "tel quel" sans garantie d'aucune sorte. FoliX ne saurait être tenu responsable des dommages directs ou indirects résultant de l'utilisation ou de l'impossibilité d'utiliser l'application.

FoliX ne garantit pas la disponibilité permanente du service et se réserve le droit d'interrompre le service pour maintenance.`,
  },
  {
    icon: 'refresh-cw',
    title: '10. Modifications des CGU',
    body: `FoliX se réserve le droit de modifier les présentes CGU à tout moment. Les modifications seront notifiées dans l'application. La poursuite de l'utilisation de l'application après notification vaut acceptation des nouvelles CGU.`,
  },
  {
    icon: 'globe',
    title: '11. Droit applicable',
    body: `Les présentes CGU sont régies par le droit français. Tout litige relatif à leur interprétation ou exécution sera soumis aux tribunaux compétents de Paris.

Pour toute question : legal@folix.app`,
  },
];

export const CGUScreen: React.FC<Props> = ({ onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (i: number) => setExpanded(prev => prev === i ? null : i);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Conditions d'utilisation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Intro */}
        <View style={[s.introBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <Icon name="file-text" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.introTitle, { color: colors.primary }]}>CGU FoliX</Text>
            <Text style={[s.introSub, { color: colors.textTertiary }]}>Dernière mise à jour : 1er mai 2026</Text>
          </View>
        </View>

        {/* Sections accordéon */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {SECTIONS.map((sec, i) => {
            const open = expanded === i;
            return (
              <View key={i}>
                <TouchableOpacity
                  style={[
                    s.sectionHeader,
                    i < SECTIONS.length - 1 && { borderBottomWidth: open ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                  ]}
                  onPress={() => toggle(i)}
                  activeOpacity={0.7}
                >
                  <View style={[s.sectionIconWrap, { backgroundColor: colors.primary + '15' }]}>
                    <Icon name={sec.icon} size={15} color={colors.primary} />
                  </View>
                  <Text style={[s.sectionTitle, { color: colors.textPrimary, flex: 1 }]}>{sec.title}</Text>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                </TouchableOpacity>

                {open && (
                  <View style={[s.sectionBody, { borderBottomWidth: i < SECTIONS.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.divider }]}>
                    <Text style={[s.sectionTxt, { color: colors.textSecondary }]}>{sec.body}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Contact */}
        <View style={[s.contactCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <Icon name="mail" size={16} color={colors.primary} />
          <Text style={[s.contactTxt, { color: colors.textTertiary }]}>
            Des questions ? Contactez-nous à{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>legal@folix.app</Text>
          </Text>
        </View>

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  scroll:        { padding: 16, paddingBottom: 48, gap: 14 },
  introBanner:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  introTitle:    { fontSize: 14, fontWeight: '700' },
  introSub:      { fontSize: 12, marginTop: 2 },
  card:          { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  sectionIconWrap:{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:  { fontSize: 14, fontWeight: '700' },
  sectionBody:   { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  sectionTxt:    { fontSize: 13, lineHeight: 21 },
  contactCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  contactTxt:    { flex: 1, fontSize: 13, lineHeight: 19 },
});
