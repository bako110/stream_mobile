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
    key: 'identite', icon: 'info', title: '1. Identité du responsable de traitement',
    body: `Responsable de traitement :
GoFolyX SAS
Siège social : Paris, France
Email DPO : privacy@gofolyx.app

GoFolyX SAS est responsable du traitement de vos données personnelles collectées via l'application mobile GoFolyX et le site web gofolyx.app.

Pour toute question relative à la protection de vos données, vous pouvez contacter notre Délégué à la Protection des Données (DPO) à l'adresse privacy@gofolyx.app. Nous nous engageons à répondre à toute demande dans un délai maximum de 30 jours.`,
  },
  {
    key: 'collecte', icon: 'database', title: '2. Données collectées',
    body: `Nous collectons les catégories de données suivantes :

Données d'identité et de contact :
• Nom, prénom, nom d'utilisateur, photo de profil
• Adresse e-mail et/ou numéro de téléphone
• Date de naissance (pour vérification de l'âge)

Données de connexion et techniques :
• Adresse IP, type et modèle d'appareil, système d'exploitation
• Identifiants de session, tokens d'authentification
• Version de l'application, langue et fuseau horaire

Contenus et interactions :
• Posts, reels, stories, commentaires, réactions
• Messages privés (chiffrés de bout en bout)
• Historique de visionnage et interactions avec les contenus

Données de localisation :
• Localisation approximative (ville/pays) pour la personnalisation du contenu
• Géolocalisation précise uniquement si vous l'autorisez explicitement

Données financières :
• Historique des transactions Coins (montants, dates, types)
• Les données bancaires/carte sont gérées exclusivement par nos prestataires de paiement certifiés PCI-DSS (Stripe, Apple Pay, Google Pay)`,
  },
  {
    key: 'finalites', icon: 'target', title: '3. Finalités du traitement',
    body: `Vos données personnelles sont traitées pour les finalités suivantes :

Fourniture du service (nécessaire au contrat) :
• Créer, gérer et sécuriser votre compte utilisateur
• Afficher vos contenus et ceux des personnes que vous suivez
• Traiter les transactions Coins et gérer votre portefeuille virtuel
• Envoyer les notifications liées à votre activité

Amélioration du service (intérêt légitime) :
• Personnaliser votre fil d'actualité et vos recommandations via nos algorithmes
• Analyser les performances et détecter les bugs
• Prévenir les fraudes, abus et comportements malveillants

Communications (consentement) :
• Vous envoyer des newsletters et communications marketing (uniquement si vous y avez consenti)
• Vous notifier des nouveautés et mises à jour importantes

Obligations légales :
• Conserver certaines données conformément aux obligations légales (comptabilité, lutte contre le blanchiment, etc.)
• Répondre aux réquisitions judiciaires et administratives`,
  },
  {
    key: 'base-legale', icon: 'shield', title: '4. Base légale des traitements',
    body: `Conformément au RGPD, chaque traitement repose sur l'une des bases légales suivantes :

• Exécution du contrat (art. 6.1.b RGPD) : traitements nécessaires à la fourniture du service GoFolyX (compte, contenus, paiements)

• Consentement (art. 6.1.a RGPD) : communications marketing, géolocalisation précise, cookies optionnels — vous pouvez retirer votre consentement à tout moment

• Intérêt légitime (art. 6.1.f RGPD) : amélioration du service, sécurité de la plateforme, prévention des fraudes, analyses d'audience anonymisées

• Obligation légale (art. 6.1.c RGPD) : conservation des données de facturation, réponse aux autorités judiciaires

Pour les données sensibles (origine ethnique, opinions politiques, santé), GoFolyX ne collecte pas ce type de données et met en place des mesures pour éviter que les utilisateurs n'en publient volontairement dans des contextes exposés.`,
  },
  {
    key: 'partage', icon: 'users', title: '5. Partage et destinataires des données',
    body: `GoFolyX ne vend jamais vos données personnelles à des tiers. Elles peuvent être partagées uniquement dans les cas suivants :

Sous-traitants techniques (traitement pour notre compte) :
• Hébergement cloud (serveurs EU) — AWS / OVH
• Service de paiement — Stripe (certifié PCI-DSS)
• Analytics anonymisés — Mixpanel / Firebase
• Service d'emailing transactionnel — SendGrid
• Authentification sociale — Google, Apple

Tous nos sous-traitants sont liés par des DPA (Data Processing Agreements) conformes au RGPD et ne peuvent utiliser vos données qu'aux fins pour lesquelles nous les mandatons.

Autres utilisateurs GoFolyX :
• Vos contenus publics (posts, reels, profil public) sont visibles conformément à vos paramètres de confidentialité
• Vos messages privés ne sont partagés qu'avec leurs destinataires

Autorités :
• En cas d'obligation légale, judiciaire ou administrative dûment établie`,
  },
  {
    key: 'hebergement', icon: 'globe', title: '6. Hébergement et transferts internationaux',
    body: `Vos données sont hébergées sur des serveurs situés dans l'Union européenne, conformément aux exigences du RGPD.

En cas de transfert hors UE (notamment pour certains services tiers comme Google Analytics, Firebase, AWS us-east) :
• Nous nous assurons de l'existence de garanties appropriées
• Clauses Contractuelles Types (CCT) approuvées par la Commission européenne
• Décision d'adéquation de la Commission pour les pays reconnus équivalents
• Certification Privacy Shield ou mécanisme équivalent en vigueur

Vous pouvez obtenir une copie des garanties mises en place en contactant privacy@gofolyx.app.`,
  },
  {
    key: 'conservation', icon: 'clock', title: '7. Durée de conservation',
    body: `Nous conservons vos données uniquement pour la durée nécessaire aux finalités pour lesquelles elles ont été collectées :

Données de compte actif :
• Pendant toute la durée de vie de votre compte + 30 jours après suppression (délai légal de rétention et traitement des litiges éventuels)

Données financières et transactions :
• 10 ans à compter de chaque transaction (obligation comptable légale — Code de commerce)

Logs de connexion et données techniques :
• 12 mois (obligation légale — Loi pour la confiance dans l'économie numérique)

Contenus supprimés par l'utilisateur :
• Effacés immédiatement des flux publics, supprimés des sauvegardes sous 90 jours maximum

Compte désactivé (sans suppression) :
• Données conservées pendant 6 mois, puis anonymisées si aucune réactivation

Consentements marketing :
• 3 ans à compter du dernier contact ou retrait du consentement`,
  },
  {
    key: 'droits', icon: 'check-circle', title: '8. Vos droits RGPD',
    body: `Conformément au RGPD (articles 15 à 22), vous disposez des droits suivants sur vos données personnelles :

• Droit d'accès (art. 15) : obtenir une copie complète de vos données personnelles traitées par GoFolyX

• Droit de rectification (art. 16) : corriger toute donnée inexacte ou incomplète

• Droit à l'effacement / "droit à l'oubli" (art. 17) : demander la suppression de vos données, sous réserve des obligations légales de conservation

• Droit à la portabilité (art. 20) : recevoir vos données dans un format structuré, couramment utilisé et lisible par machine (JSON/CSV)

• Droit d'opposition (art. 21) : vous opposer au traitement fondé sur l'intérêt légitime, notamment à des fins de prospection commerciale

• Droit à la limitation du traitement (art. 18) : geler temporairement l'utilisation de vos données pendant une vérification ou un litige

• Droit de retrait du consentement : à tout moment, pour les traitements fondés sur votre consentement (marketing, géolocalisation)

Comment exercer vos droits :
→ Depuis l'application : Paramètres > Confidentialité > Mes données
→ Par email : privacy@gofolyx.app (réponse sous 30 jours maximum)

Recours : si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (Commission Nationale de l'Informatique et des Libertés) sur www.cnil.fr`,
  },
  {
    key: 'securite', icon: 'lock', title: '9. Sécurité des données',
    body: `GoFolyX met en œuvre un ensemble de mesures techniques et organisationnelles pour protéger vos données contre tout accès non autorisé, divulgation, altération ou destruction :

Mesures techniques :
• Chiffrement des données en transit : TLS 1.3 minimum sur toutes les connexions
• Chiffrement des données au repos : AES-256 pour les données sensibles
• Chiffrement de bout en bout pour les messages privés
• Authentification multi-facteurs disponible pour votre compte
• Hachage irréversible des mots de passe (bcrypt, salt unique)

Mesures organisationnelles :
• Accès aux données strictement limité au personnel autorisé (principe du moindre privilège)
• Formation régulière des équipes aux bonnes pratiques de sécurité
• Audits de sécurité et tests d'intrusion réguliers
• Politique de gestion des incidents de sécurité documentée

En cas de violation de données :
• GoFolyX s'engage à notifier la CNIL dans les 72 heures
• Les utilisateurs concernés seront notifiés dans les meilleurs délais si la violation présente un risque élevé pour leurs droits et libertés`,
  },
  {
    key: 'cookies', icon: 'smartphone', title: '10. Cookies et technologies de suivi',
    body: `L'application GoFolyX utilise des technologies similaires aux cookies (stockage local, identifiants d'appareil, SDK analytics) que nous classons en trois catégories :

Strictement nécessaires (toujours actifs) :
• Maintien de votre session authentifiée
• Mémorisation de vos préférences essentielles (thème, langue)
• Sécurité et protection contre la fraude

Fonctionnels (activés par défaut, désactivables) :
• Mémorisation de vos paramètres avancés
• Personnalisation de l'interface

Analytics et mesure d'audience (consentement requis) :
• Analyse du comportement anonymisé pour améliorer l'app
• Comptage des audiences et performances des contenus

Publicité et marketing (consentement requis) :
• Personnalisation des publicités éventuelles

Comment gérer vos préférences :
→ Application : Paramètres > Confidentialité > Cookies et traceurs
→ Vous pouvez retirer votre consentement à tout moment depuis ce menu`,
  },
  {
    key: 'mineurs', icon: 'user-x', title: '11. Protection des mineurs',
    body: `GoFolyX est destiné aux personnes âgées de 13 ans et plus. Nous prenons la protection des mineurs très au sérieux.

Mesures en place :
• Vérification de l'âge lors de l'inscription (déclaration de date de naissance)
• Paramètres de confidentialité renforcés pour les comptes dont l'âge déclaré est inférieur à 18 ans
• Contenu sensible masqué par défaut pour les comptes mineurs
• Signalement facilité des profils suspects

Nous ne collectons pas sciemment de données personnelles d'enfants de moins de 13 ans. Si vous êtes un parent ou tuteur légal et pensez qu'un enfant de moins de 13 ans a créé un compte sur GoFolyX, contactez-nous immédiatement à privacy@gofolyx.app. Nous procéderons à la vérification et, le cas échéant, à la suppression immédiate du compte et des données associées.`,
  },
  {
    key: 'ia', icon: 'cpu', title: '12. Intelligence artificielle et algorithmes',
    body: `GoFolyX utilise des systèmes algorithmiques et d'intelligence artificielle pour :

Personnalisation :
• Recommandation de contenus dans votre fil d'actualité
• Suggestion de créateurs et de comptes à suivre
• Sélection des contenus dans l'onglet Découvrir

Modération automatisée :
• Détection de contenus potentiellement violants ou inappropriés
• Filtrage anti-spam dans les commentaires et messages

Droits liés aux décisions automatisées :
Conformément à l'article 22 du RGPD, si une décision vous concernant (suspension de compte, restriction de visibilité) est prise de manière purement automatisée et produit des effets significatifs, vous avez le droit de :
• Demander une intervention humaine
• Exprimer votre point de vue
• Contester la décision

Contactez support@gofolyx.app pour toute demande en ce sens.`,
  },
  {
    key: 'modifications', icon: 'refresh-cw', title: '13. Modifications de la politique',
    body: `GoFolyX se réserve le droit de modifier la présente Politique de Confidentialité à tout moment, notamment pour :
• Se conformer aux évolutions légales et réglementaires
• Refléter de nouvelles pratiques de traitement
• Intégrer de nouveaux services ou fonctionnalités

Notification des changements :
• En cas de modification substantielle : notification dans l'application et/ou par email au moins 15 jours avant l'entrée en vigueur
• Pour les modifications mineures (corrections typographiques, clarifications) : mise à jour silencieuse avec mention de la date

La date de dernière mise à jour est toujours indiquée en haut de ce document. Nous vous encourageons à consulter régulièrement cette politique.

La poursuite de l'utilisation de GoFolyX après notification des modifications vaut acceptation de la nouvelle version.`,
  },
];

// ── Accordion item ────────────────────────────────────────────────────────────
const AccordionItem: React.FC<{
  section: Section;
  index:   number;
  total:   number;
  colors:  any;
}> = ({ section, index, total, colors }) => {
  const [open, setOpen] = useState(false);
  const rotation        = useSharedValue(0);

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
        <View style={[s.sectionIconWrap, { backgroundColor: colors.accentGreen + '20' }]}>
          <Icon name={section.icon} size={15} color={colors.accentGreen ?? colors.primary} />
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
export const PolitiqueConfidentialiteScreen: React.FC<Props> = ({ onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const scrollRef  = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, number>>({});

  const accentColor = colors.accentGreen ?? colors.primary;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={onBack} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Politique de confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Intro banner */}
        <View style={[s.introBanner, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
          <View style={[s.introIconWrap, { backgroundColor: accentColor + '20' }]}>
            <Icon name="shield" size={22} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.introTitle, { color: colors.textPrimary }]}>Confidentialité GoFolyX</Text>
            <Text style={[s.introSub, { color: colors.textTertiary }]}>Dernière mise à jour : 1er mai 2026</Text>
            <Text style={[s.introDesc, { color: colors.textSecondary }]}>
              Nous prenons la protection de vos données très au sérieux. Cette politique explique comment nous collectons, utilisons et protégeons vos informations.
            </Text>
          </View>
        </View>

        {/* Badges RGPD */}
        <View style={s.badgeRow}>
          {[
            { icon: 'shield', label: 'Conforme RGPD' },
            { icon: 'lock',   label: 'Chiffrement AES-256' },
            { icon: 'globe',  label: 'Hébergement UE' },
          ].map(b => (
            <View key={b.label} style={[s.badge, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
              <Icon name={b.icon} size={11} color={accentColor} />
              <Text style={[s.badgeTxt, { color: accentColor }]}>{b.label}</Text>
            </View>
          ))}
        </View>

        {/* Sommaire */}
        <View style={[s.tocCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <View style={s.tocHeader}>
            <Icon name="list" size={14} color={accentColor} />
            <Text style={[s.tocHeaderTxt, { color: colors.textPrimary }]}>Sommaire</Text>
          </View>
          <View style={s.tocGrid}>
            {SECTIONS.map((sec) => (
              <TouchableOpacity
                key={sec.key}
                style={[s.tocItem, { borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  const y = sectionRefs.current[sec.key];
                  if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
                }}
              >
                <Icon name={sec.icon} size={12} color={accentColor} />
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

        {/* Contact DPO */}
        <View style={[s.contactCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <Icon name="mail" size={16} color={accentColor} />
          <Text style={[s.contactTxt, { color: colors.textTertiary }]}>
            Questions sur vos données ? Contactez notre DPO à{' '}
            <Text style={{ color: accentColor, fontWeight: '600' }}>privacy@gofolyx.app</Text>
            {'\n'}Réponse garantie sous 30 jours.
          </Text>
        </View>

        {/* CNIL */}
        <View style={[s.cnilCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Icon name="info" size={14} color={colors.textTertiary} />
          <Text style={[s.cnilTxt, { color: colors.textTertiary }]}>
            Vous pouvez également saisir la CNIL sur{' '}
            <Text style={{ fontWeight: '600' }}>www.cnil.fr</Text>
          </Text>
        </View>

        {/* Version */}
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

  // Badges
  badgeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  badgeTxt:  { fontSize: 11, fontWeight: '700' },

  // Sommaire
  tocCard:      { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  tocHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tocHeaderTxt: { fontSize: 13, fontWeight: '700' },
  tocGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tocItem:      {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, width: '47%',
  },
  tocItemTxt:   { fontSize: 11, fontWeight: '500', flex: 1, lineHeight: 15 },

  // Accordeon
  card:           { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  sectionIconWrap:{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:   { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  sectionBody:    { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4 },
  sectionTxt:     { fontSize: 13, lineHeight: 22 },

  // Contact & CNIL
  contactCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  contactTxt:   { flex: 1, fontSize: 13, lineHeight: 19 },
  cnilCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  cnilTxt:      { flex: 1, fontSize: 12, lineHeight: 18 },

  versionTxt:   { fontSize: 11, textAlign: 'center', marginTop: 4 },
});
