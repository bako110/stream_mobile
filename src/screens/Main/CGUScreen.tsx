import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';

interface Props {
  onBack: () => void;
}

interface Section {
  key:   string;
  icon:  string;
  title: string;
  body:  string;
}

const SECTIONS: Section[] = [
  {
    key: 'objet', icon: 'file-text', title: '1. Objet et champ d\'application',
    body: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme GoFolyX (application mobile et site web), éditée par GoFolyX SAS, société par actions simplifiée au capital de 10 000 €, immatriculée au RCS de Paris.

En créant un compte ou en accédant à l'application, vous acceptez sans réserve les présentes CGU dans leur intégralité. Si vous n'acceptez pas ces conditions, vous devez cesser immédiatement d'utiliser la plateforme.

Les CGU peuvent évoluer à tout moment. La version en vigueur est celle publiée dans l'application, datée en haut de ce document.`,
  },
  {
    key: 'eligibilite', icon: 'user-check', title: '2. Éligibilité et inscription',
    body: `Pour utiliser GoFolyX, vous devez :
• Avoir au moins 13 ans (ou l'âge légal de majorité numérique dans votre pays si supérieur)
• Fournir des informations exactes, complètes et à jour lors de votre inscription
• Ne pas avoir été précédemment banni de la plateforme

Vous êtes seul responsable de la confidentialité de vos identifiants (email/téléphone et mot de passe). Toute action réalisée depuis votre compte vous est réputée imputable. En cas d'accès non autorisé, contactez-nous immédiatement à support@gofolyx.app.

GoFolyX se réserve le droit de refuser l'inscription ou de suspendre un compte sans justification préalable, notamment en cas de suspicion de fraude ou de comportement contraire aux présentes CGU.`,
  },
  {
    key: 'contenu', icon: 'edit-3', title: '3. Contenu publié par les utilisateurs',
    body: `Vous conservez l'intégralité des droits de propriété intellectuelle sur les contenus que vous créez et publiez (posts, reels, stories, commentaires, sons, vidéos en direct, etc.).

En publiant du contenu sur GoFolyX, vous accordez à GoFolyX une licence mondiale, non exclusive, gratuite, sous-licenciable et transférable pour héberger, afficher, reproduire, distribuer, adapter et promouvoir ces contenus dans le cadre de la fourniture et de la promotion du service.

Sont strictement interdits :
• Les contenus illicites, haineux, discriminatoires, racistes, antisémites ou incitant à la violence
• Les contenus sexuellement explicites non consentis ou impliquant des mineurs (CSAM) — passibles de poursuites pénales
• Les contenus portant atteinte aux droits de tiers (droits d'auteur, marques, vie privée, droit à l'image)
• Le spam, les arnaques, le phishing, la désinformation délibérée et les théories du complot dangereuses
• Les contenus promouvant des activités illégales (trafic, terrorisme, drogues, armes)

GoFolyX utilise des systèmes automatisés et des équipes de modération pour détecter et retirer les contenus non conformes.`,
  },
  {
    key: 'confidentialite', icon: 'shield', title: '4. Confidentialité et données personnelles',
    body: `GoFolyX collecte et traite vos données personnelles conformément à sa Politique de Confidentialité, disponible dans l'application et consultable à tout moment.

Points clés :
• Vos données sont hébergées en Europe (Union européenne)
• Elles sont protégées par les dispositions du RGPD (Règlement Général sur la Protection des Données)
• Vous disposez d'un droit d'accès, de rectification, de suppression, de portabilité et d'opposition
• Vous pouvez exercer vos droits à l'adresse : privacy@gofolyx.app
• Vous pouvez également saisir la CNIL (www.cnil.fr) en cas de litige

GoFolyX ne vend jamais vos données personnelles à des tiers.`,
  },
  {
    key: 'monetisation', icon: 'zap', title: '5. Coins, monétisation et paiements',
    body: `GoFolyX propose un système de Coins (monnaie virtuelle interne) permettant d'accéder à des fonctionnalités premium, d'envoyer des cadeaux virtuels à des créateurs ou d'acheter des contenus exclusifs.

Conditions d'achat et d'utilisation :
• Les Coins s'achètent via les stores officiels (Apple App Store, Google Play) ou sur gofolyx.app
• Les Coins achetés sont définitifs et non remboursables, sauf obligation légale contraire
• Les Coins n'ont aucune valeur monétaire réelle en dehors du programme de monétisation GoFolyX
• Ils ne peuvent pas être échangés contre de l'argent réel, sauf dans le cadre du Programme Créateur GoFolyX sous réserve d'éligibilité

Programme Créateur :
• Les créateurs éligibles peuvent convertir leurs Coins reçus en revenus réels
• GoFolyX retient une commission définie dans les conditions du Programme Créateur
• Les revenus sont soumis aux obligations fiscales applicables dans votre pays

GoFolyX se réserve le droit de modifier les tarifs, les taux de conversion et les conditions du programme à tout moment, avec préavis de 15 jours.`,
  },
  {
    key: 'comportement', icon: 'alert-triangle', title: '6. Comportements interdits',
    body: `En utilisant GoFolyX, vous vous engagez à ne pas :

Harcèlement et violence :
• Harceler, intimider, menacer, stalker ou abuser verbalement d'autres utilisateurs
• Encourager ou coordonner des campagnes de harcèlement collectif

Fraude et sécurité :
• Usurper l'identité d'une personne physique, d'une organisation ou d'une marque
• Créer des comptes multiples pour contourner une suspension
• Tenter d'accéder sans autorisation aux systèmes, serveurs ou comptes d'autres utilisateurs

Automatisation non autorisée :
• Utiliser des robots (bots), scrapers, crawlers ou tout outil automatisé non expressément autorisé
• Manipuler artificiellement les métriques d'engagement (vues, likes, followers)
• Spammer des utilisateurs via les messages privés ou les commentaires

Tout manquement grave peut entraîner la suspension temporaire ou la suppression définitive du compte, sans préavis ni remboursement des Coins éventuels.`,
  },
  {
    key: 'ip', icon: 'tv', title: '7. Propriété intellectuelle',
    body: `L'application GoFolyX, son nom, ses logos, son design, son code source, ses algorithmes, ses bases de données et l'ensemble de ses composants sont la propriété exclusive de GoFolyX SAS et/ou de ses licenciés, protégés par le droit français et international de la propriété intellectuelle.

Toute reproduction, modification, adaptation, traduction, distribution ou exploitation commerciale non autorisée est strictement interdite et passible de poursuites civiles et pénales.

Les marques, noms commerciaux et logos des partenaires ou tiers présents sur la plateforme restent la propriété de leurs détenteurs respectifs.

Si vous pensez qu'un contenu publié sur GoFolyX porte atteinte à vos droits d'auteur, contactez notre équipe de signalement à : dmca@gofolyx.app`,
  },
  {
    key: 'services-tiers', icon: 'link', title: '8. Services tiers et liens externes',
    body: `GoFolyX peut contenir des liens vers des sites ou services tiers (réseaux sociaux, services de paiement, partenaires, etc.). Ces liens sont fournis à titre informatif uniquement.

GoFolyX n'exerce aucun contrôle sur le contenu, les politiques de confidentialité ou les pratiques des sites tiers et décline toute responsabilité à leur égard.

L'utilisation de fonctionnalités d'authentification ou de partage vers des plateformes tierces (Google, Apple, etc.) est soumise aux conditions générales de ces plateformes.`,
  },
  {
    key: 'resiliation', icon: 'x-circle', title: '9. Résiliation et suppression de compte',
    body: `Vous pouvez supprimer votre compte GoFolyX à tout moment depuis :
Paramètres > Compte > Zone dangereuse > Supprimer mon compte

Effets de la suppression :
• Vos données personnelles sont effacées sous 30 jours (délai légal de rétention)
• Vos contenus publiés sont supprimés des flux, mais peuvent être conservés temporairement dans nos sauvegardes
• Les Coins non utilisés sont définitivement perdus sans remboursement
• Les abonnements actifs ne sont pas automatiquement annulés — gérez-les depuis votre store

GoFolyX se réserve le droit de suspendre ou supprimer tout compte :
• En cas de violation grave ou répétée des CGU
• En cas d'inactivité prolongée (compte inactif depuis plus de 24 mois)
• Sur décision judiciaire ou administrative

En cas de suspension, vous serez notifié par email sauf si la notification compromet une enquête en cours.`,
  },
  {
    key: 'responsabilite', icon: 'info', title: '10. Limitation de responsabilité',
    body: `GoFolyX est fourni "en l'état" et "selon disponibilité", sans garantie d'aucune sorte, expresse ou implicite.

GoFolyX ne peut être tenu responsable :
• Des interruptions de service, pannes, erreurs ou pertes de données, même temporaires
• Des dommages directs ou indirects résultant de l'utilisation ou de l'impossibilité d'utiliser la plateforme
• Du contenu publié par les utilisateurs tiers
• Des actes malveillants de tiers (piratage, phishing, etc.) non imputables à GoFolyX

La responsabilité totale de GoFolyX, quelle qu'en soit la cause, est limitée au montant payé par l'utilisateur à GoFolyX au cours des 12 derniers mois précédant le dommage.

Ces limitations s'appliquent dans toute la mesure permise par le droit applicable.`,
  },
  {
    key: 'modifications', icon: 'refresh-cw', title: '11. Modifications des CGU',
    body: `GoFolyX se réserve le droit de modifier les présentes CGU à tout moment, notamment pour s'adapter aux évolutions légales, réglementaires ou fonctionnelles de la plateforme.

En cas de modification substantielle :
• Vous serez notifié par une alerte dans l'application et/ou par email au moins 15 jours avant l'entrée en vigueur
• La poursuite de l'utilisation de l'application après cette date vaut acceptation des nouvelles CGU
• Si vous refusez les nouvelles CGU, vous devrez supprimer votre compte

La date de dernière mise à jour est toujours indiquée en haut de ce document.`,
  },
  {
    key: 'droit', icon: 'globe', title: '12. Droit applicable et juridiction',
    body: `Les présentes CGU sont régies par le droit français.

En cas de litige relatif à l'interprétation, la validité ou l'exécution des présentes CGU :
• Nous vous encourageons à nous contacter d'abord à l'adresse legal@gofolyx.app pour tenter une résolution amiable
• À défaut d'accord amiable dans un délai de 30 jours, le litige sera soumis aux tribunaux compétents de Paris
• Pour les consommateurs résidant dans l'Union européenne, vous pouvez également recourir à la plateforme de règlement en ligne des litiges de la Commission européenne : ec.europa.eu/consumers/odr

Pour toute question légale : legal@gofolyx.app`,
  },
];

// ── Accordion item ────────────────────────────────────────────────────────────
const AccordionItem: React.FC<{
  section: Section;
  index:   number;
  total:   number;
  colors:  any;
}> = ({ section, index, total, colors }) => {
  const [open, setOpen]  = useState(false);
  const rotation         = useSharedValue(0);

  const iconAnim = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    rotation.value = withTiming(next ? 1 : 0, { duration: 220 });
  };

  return (
    <View>
      <TouchableOpacity
        style={[
          s.sectionHeader,
          index < total - 1 && !open && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
        ]}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={[s.sectionIconWrap, { backgroundColor: colors.primary + '15' }]}>
          <Icon name={section.icon} size={15} color={colors.primary} />
        </View>
        <Text style={[s.sectionTitle, { color: colors.textPrimary, flex: 1 }]}>{section.title}</Text>
        <Animated.View style={iconAnim}>
          <Icon name="chevron-down" size={16} color={colors.textTertiary} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={[
          s.sectionBody,
          { borderBottomWidth: index < total - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.divider },
        ]}>
          <Text style={[s.sectionTxt, { color: colors.textSecondary }]}>{section.body}</Text>
        </View>
      )}
    </View>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────
export const CGUScreen: React.FC<Props> = ({ onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const scrollRef = useRef<ScrollView>(null);

  const sectionRefs = useRef<Record<string, number>>({});

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={onBack} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Conditions d'utilisation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Intro banner */}
        <View style={[s.introBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <View style={[s.introIconWrap, { backgroundColor: colors.primary + '20' }]}>
            <Icon name="file-text" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.introTitle, { color: colors.textPrimary }]}>CGU GoFolyX</Text>
            <Text style={[s.introSub, { color: colors.textTertiary }]}>Dernière mise à jour : 1er mai 2026</Text>
            <Text style={[s.introDesc, { color: colors.textSecondary }]}>
              Ces conditions régissent votre utilisation de la plateforme GoFolyX. Lisez-les attentivement.
            </Text>
          </View>
        </View>

        {/* Sommaire rapide */}
        <View style={[s.tocCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <View style={s.tocHeader}>
            <Icon name="list" size={14} color={colors.primary} />
            <Text style={[s.tocHeaderTxt, { color: colors.textPrimary }]}>Sommaire</Text>
          </View>
          <View style={s.tocGrid}>
            {SECTIONS.map((sec, i) => (
              <TouchableOpacity
                key={sec.key}
                style={[s.tocItem, { borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  const y = sectionRefs.current[sec.key];
                  if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
                }}
              >
                <Icon name={sec.icon} size={12} color={colors.primary} />
                <Text style={[s.tocItemTxt, { color: colors.textSecondary }]} numberOfLines={2}>
                  {sec.title.replace(/^\d+\.\s/, '')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sections accordéon */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {SECTIONS.map((sec, idx) => (
            <View
              key={sec.key}
              onLayout={e => { sectionRefs.current[sec.key] = e.nativeEvent.layout.y; }}
            >
              <AccordionItem section={sec} index={idx} total={SECTIONS.length} colors={colors} />
            </View>
          ))}
        </View>

        {/* Contact */}
        <View style={[s.contactCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <Icon name="mail" size={16} color={colors.primary} />
          <Text style={[s.contactTxt, { color: colors.textTertiary }]}>
            Des questions ? Contactez notre équipe légale à{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>legal@gofolyx.app</Text>
          </Text>
        </View>

        {/* Version badge */}
        <Text style={[s.versionTxt, { color: colors.textTertiary }]}>
          Version 2.0 · GoFolyX SAS · Paris, France
        </Text>

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:     { flex: 1 },
  header:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle:  { fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  scroll:       { padding: 16, paddingBottom: 56, gap: 14 },

  // Intro
  introBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderRadius: 16, borderWidth: 1, padding: 16 },
  introIconWrap:{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  introTitle:   { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  introSub:     { fontSize: 12, marginBottom: 6 },
  introDesc:    { fontSize: 13, lineHeight: 19 },

  // Sommaire
  tocCard:      { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  tocHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tocHeaderTxt: { fontSize: 13, fontWeight: '700' },
  tocGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tocItem:      {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1,
    width: '47%',
  },
  tocItemTxt:   { fontSize: 11, fontWeight: '500', flex: 1, lineHeight: 15 },

  // Accordeon
  card:         { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  sectionIconWrap:{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  sectionBody:  { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4 },
  sectionTxt:   { fontSize: 13, lineHeight: 22 },

  // Contact
  contactCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  contactTxt:   { flex: 1, fontSize: 13, lineHeight: 19 },

  versionTxt:   { fontSize: 11, textAlign: 'center', marginTop: 4 },
});
