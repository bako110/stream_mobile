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
    icon: 'info',
    title: '1. Qui sommes-nous ?',
    body: `FoliX est une application mobile de partage de contenu éditée par FoliX SAS, dont le siège social est situé en France.

Pour toute question relative à la protection de vos données personnelles, vous pouvez nous contacter à : privacy@folix.app`,
  },
  {
    icon: 'database',
    title: '2. Données collectées',
    body: `Nous collectons les données suivantes :

• Données d'identité : nom, prénom, nom d'utilisateur, photo de profil
• Données de contact : adresse e-mail, numéro de téléphone
• Données de connexion : adresse IP, type d'appareil, système d'exploitation, identifiants de session
• Contenus publiés : posts, reels, stories, commentaires, messages
• Données de navigation : pages visitées, contenus consultés, interactions
• Données de paiement : historique de transactions Coins (les données bancaires sont gérées par notre prestataire de paiement certifié PCI-DSS)`,
  },
  {
    icon: 'target',
    title: '3. Finalités du traitement',
    body: `Vos données sont utilisées pour :

• Créer et gérer votre compte utilisateur
• Fournir et améliorer nos services
• Personnaliser votre expérience (recommandations, fil d'actualité)
• Assurer la sécurité de la plateforme et prévenir les abus
• Gérer les transactions Coins et la monétisation créateur
• Vous envoyer des notifications et communications liées au service
• Respecter nos obligations légales`,
  },
  {
    icon: 'shield',
    title: '4. Base légale',
    body: `Nos traitements reposent sur les bases légales suivantes :

• Exécution du contrat : traitement nécessaire à la fourniture du service (art. 6.1.b RGPD)
• Consentement : pour les communications marketing et certaines fonctionnalités optionnelles (art. 6.1.a RGPD)
• Intérêt légitime : amélioration du service, sécurité, prévention des fraudes (art. 6.1.f RGPD)
• Obligation légale : conservation de certaines données imposée par la loi (art. 6.1.c RGPD)`,
  },
  {
    icon: 'users',
    title: '5. Partage des données',
    body: `Nous ne vendons jamais vos données personnelles. Elles peuvent être partagées avec :

• Nos sous-traitants techniques (hébergement, paiement, analytics) dans le cadre strict de leur mission
• D'autres utilisateurs, dans la mesure prévue par les paramètres de confidentialité de votre compte
• Les autorités compétentes, en cas d'obligation légale ou judiciaire

Tous nos sous-traitants sont soumis à des engagements contractuels de confidentialité conformes au RGPD.`,
  },
  {
    icon: 'globe',
    title: '6. Hébergement & transferts',
    body: `Vos données sont hébergées sur des serveurs situés dans l'Union européenne.

En cas de transfert hors UE (par exemple pour certains services tiers), nous nous assurons de l'existence de garanties appropriées : clauses contractuelles types de la Commission européenne, décision d'adéquation ou autre mécanisme conforme au RGPD.`,
  },
  {
    icon: 'clock',
    title: '7. Durée de conservation',
    body: `Nous conservons vos données uniquement le temps nécessaire aux finalités pour lesquelles elles ont été collectées :

• Données de compte : pendant toute la durée de vie du compte, puis 30 jours après suppression (délai de rétention légal)
• Données de transaction : 10 ans (obligation comptable)
• Logs de connexion : 12 mois (obligation légale)
• Contenus supprimés : effacés immédiatement sauf obligation légale de conservation

Un compte désactivé conserve ses données pendant 6 mois, puis elles sont anonymisées.`,
  },
  {
    icon: 'check-circle',
    title: '8. Vos droits',
    body: `Conformément au RGPD, vous disposez des droits suivants sur vos données :

• Droit d'accès : obtenir une copie de vos données personnelles
• Droit de rectification : corriger des données inexactes
• Droit à l'effacement : demander la suppression de vos données
• Droit à la portabilité : recevoir vos données dans un format structuré
• Droit d'opposition : vous opposer à certains traitements
• Droit à la limitation : restreindre temporairement le traitement

Pour exercer ces droits : privacy@folix.app

Vous disposez également du droit d'introduire une réclamation auprès de la CNIL (www.cnil.fr).`,
  },
  {
    icon: 'lock',
    title: '9. Sécurité',
    body: `FoliX met en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données :

• Chiffrement des données en transit (TLS 1.3) et au repos (AES-256)
• Authentification sécurisée et gestion des sessions
• Accès aux données restreint au personnel autorisé
• Audits de sécurité réguliers
• Politique de gestion des incidents et notifications en cas de violation`,
  },
  {
    icon: 'smartphone',
    title: '10. Cookies & traceurs',
    body: `L'application FoliX utilise des technologies similaires aux cookies (stockage local, identifiants d'appareil) pour :

• Maintenir votre session connectée
• Mémoriser vos préférences
• Mesurer l'audience et améliorer l'expérience (analytics anonymisés)

Vous pouvez gérer ces préférences dans les paramètres de l'application (Paramètres > Confidentialité).`,
  },
  {
    icon: 'user-x',
    title: '11. Mineurs',
    body: `FoliX est destiné aux personnes âgées de 13 ans et plus. Nous ne collectons pas sciemment de données personnelles d'enfants de moins de 13 ans.

Si vous pensez qu'un mineur de moins de 13 ans a créé un compte, contactez-nous immédiatement à privacy@folix.app afin que nous puissions supprimer les données concernées.`,
  },
  {
    icon: 'refresh-cw',
    title: '12. Modifications',
    body: `Nous nous réservons le droit de modifier la présente Politique de Confidentialité à tout moment. En cas de modification substantielle, vous serez notifié dans l'application ou par e-mail.

La date de la dernière mise à jour est indiquée en haut de cette page. La poursuite de l'utilisation de FoliX après notification vaut acceptation des modifications.`,
  },
];

export const PolitiqueConfidentialiteScreen: React.FC<Props> = ({ onBack }) => {
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
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Politique de confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Intro */}
        <View style={[s.introBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <Icon name="shield" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.introTitle, { color: colors.primary }]}>Confidentialité FoliX</Text>
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
            Questions sur vos données ? Contactez notre DPO à{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>privacy@folix.app</Text>
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
