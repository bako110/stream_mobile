import React, { useState, useCallback } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Linking, StyleProp, TextStyle, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinkPreviewCard } from './LinkPreviewCard';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { useSearchOverlayActions } from '../../context/SearchOverlayContext';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

// Matches URLs, @mentions, #hashtags, phone numbers, *bold* — in order. Le
// numéro de téléphone exige soit un + international, soit au moins un
// séparateur (espace/point/tiret) entre les chiffres — un nombre collé (prix,
// date en chiffres, quantité) ne matche jamais, seul un vrai numéro formaté
// est capturé. *bold* (style WhatsApp) : pas d'espace collé aux astérisques,
// pour ne jamais confondre avec une simple multiplication ou un énumérateur.
const TOKEN_RE = /(https?:\/\/[^\s<>"']+|@[\w.]+|#[\wÀ-ɏ]+|\+[0-9][0-9\s.-]{6,16}[0-9]|[0-9]{2,4}[\s.-][0-9]{2,4}(?:[\s.-][0-9]{2,4}){1,4}|\*[^\s*][^*]*[^\s*]\*|\*[^\s*]\*)/g;

interface Segment {
  text: string;
  type: 'text' | 'url' | 'mention' | 'hashtag' | 'phone' | 'bold';
}

function isPhoneLike(token: string): boolean {
  const digits = token.replace(/[^\d]/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function parse(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) segs.push({ text: text.slice(last, m.index), type: 'text' });
    const t = m[0];
    if (t.startsWith('http')) segs.push({ text: t, type: 'url' });
    else if (t.startsWith('@'))  segs.push({ text: t, type: 'mention' });
    else if (t.startsWith('#'))  segs.push({ text: t, type: 'hashtag' });
    else if (t.startsWith('*') && t.endsWith('*')) segs.push({ text: t.slice(1, -1), type: 'bold' });
    else if (isPhoneLike(t))     segs.push({ text: t, type: 'phone' });
    else                         segs.push({ text: t, type: 'text' });
    last = m.index! + t.length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), type: 'text' });
  return segs;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

type TruncatableEntityType = 'post' | 'event' | 'concert' | 'reel' | 'comment';

interface Props {
  text: string;
  maxLines?: number;
  textStyle?: StyleProp<TextStyle>;
  primaryColor: string;
  moreLabel?: string;
  lessLabel?: string;
  onMentionPress?: (username: string) => void;
  onHashtagPress?: (tag: string) => void;
  showLinkPreview?: boolean;
  /** true si le backend a tronqué `text` dans cette réponse de liste (jamais
   * calculé côté client) — conditionne l'affichage du bouton "Voir plus" et,
   * à son tap, le fetch du texte complet via entityType/entityId. Sans ces
   * deux props, "Voir plus" ne s'affiche jamais même si isTruncated=true. */
  isTruncated?: boolean;
  entityType?: TruncatableEntityType;
  entityId?: string;
  /** Repli "Voir plus / Voir moins" PUREMENT visuel, sans aucun appel réseau —
   * réservé aux écrans de DÉTAIL (post/event/concert) où `text` est déjà
   * complet (route de détail, jamais tronqué par le backend). Mesure locale
   * via onTextLayout UNIQUEMENT pour savoir "ce texte dépasse-t-il 2 lignes
   * oui/non" (pas un calcul de hauteur de carte dans une liste virtualisée —
   * sans rapport avec le bug de scroll déjà corrigé ailleurs). Mutuellement
   * exclusif avec isTruncated/entityType/entityId (mode liste, avec fetch). */
  localTruncate?: boolean;
}

// Safe wrapper — useNavigation crashes when called outside NavigationContainer (e.g. bare Modals).
function useSafeNavigation() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useNavigation<any>();
  } catch {
    return null;
  }
}

export const RichText: React.FC<Props> = ({
  text,
  maxLines = 2,
  textStyle,
  primaryColor,
  moreLabel = 'Voir plus',
  lessLabel = 'Voir moins',
  onMentionPress,
  onHashtagPress,
  showLinkPreview = true,
  isTruncated = false,
  entityType,
  entityId,
  localTruncate = false,
}) => {
  const nav = useSafeNavigation();
  // Actions stables uniquement (pas isOpen) : RichText est rendu en masse, il ne
  // doit pas re-rendre à chaque ouverture/fermeture de l'overlay.
  const { openSearchOverlay } = useSearchOverlayActions();
  // Texte complet récupéré au clic "Voir plus" — tant que null, on affiche
  // `text` (la version tronquée reçue du backend). Une fois chargé, remplace
  // définitivement l'affichage pour ce montage du composant (pas de retour en
  // arrière vers la version tronquée, seulement "Voir moins" pour replier).
  const [fullText, setFullText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  // Mode localTruncate uniquement — vrai dès que le texte COMPLET (déjà
  // disponible, aucun fetch) dépasse 2 lignes. Mesuré une seule fois via un
  // clone invisible (measureNode plus bas), jamais recalculé après.
  const [isLocallyLong, setIsLocallyLong] = useState(false);
  const onFullTextLayout = useCallback((e: any) => {
    if (e.nativeEvent.lines.length > maxLines) setIsLocallyLong(true);
  }, [maxLines]);

  const effectiveTruncated = localTruncate ? isLocallyLong : isTruncated;

  const displayText = fullText ?? text;
  const segs = parse(displayText);

  // Toutes les URLs dans le texte — on affiche une preview card pour chacune
  const urls = segs.filter(s => s.type === 'url').map(s => s.text);

  const handleMention = (username: string) => {
    if (onMentionPress) { onMentionPress(username); return; }
    try { nav?.navigate('UserProfile', { username: username.slice(1) }); } catch {}
  };

  const handleHashtag = (tag: string) => {
    if (onHashtagPress) { onHashtagPress(tag); return; }
    openSearchOverlay(tag);
  };

  const handlePhone = (raw: string) => openPhoneMenu(raw);

  const handleToggle = useCallback(async () => {
    if (expanded) { setExpanded(false); return; }
    // localTruncate : texte déjà complet en mémoire, jamais de fetch — bascule
    // juste l'affichage. Idem si déjà chargé une fois (fullText non-null) ou si
    // les props de fetch ne sont pas fournies — jamais de 2e appel réseau pour
    // le même composant.
    if (localTruncate || fullText !== null || !isTruncated || !entityType || !entityId) {
      setExpanded(true);
      return;
    }
    setLoadingFull(true);
    try {
      const res = await apiClient.get<{ text: string | null }>(Endpoints.contentText.fullText(entityType, entityId));
      setFullText(res.data?.text ?? text);
    } catch {
      // Échec réseau — on déplie quand même ce qu'on a (la version tronquée),
      // jamais de blocage silencieux de l'action de l'utilisateur.
    } finally {
      setLoadingFull(false);
      setExpanded(true);
    }
  }, [expanded, fullText, isTruncated, entityType, entityId, text, localTruncate]);

  const renderSegs = () => segs.map((seg, i) => {
    switch (seg.type) {
      case 'url':
        return (
          <Text
            key={i}
            style={{ color: primaryColor, textDecorationLine: 'underline', fontWeight: '500' }}
            onPress={() => Linking.openURL(seg.text).catch(() => {})}
          >
            {getDomain(seg.text)}
          </Text>
        );
      case 'mention':
        return (
          <Text
            key={i}
            style={{ color: primaryColor, fontWeight: '700' }}
            onPress={() => handleMention(seg.text)}
          >
            {seg.text}
          </Text>
        );
      case 'hashtag':
        return (
          <Text
            key={i}
            style={{ color: primaryColor, fontWeight: '600' }}
            onPress={() => handleHashtag(seg.text)}
          >
            {seg.text}
          </Text>
        );
      case 'phone':
        return (
          <Text
            key={i}
            style={{ color: primaryColor, textDecorationLine: 'underline', fontWeight: '500' }}
            onPress={() => handlePhone(seg.text)}
          >
            {seg.text}
          </Text>
        );
      case 'bold':
        return (
          <Text key={i} style={{ fontWeight: '800' }}>
            {seg.text}
          </Text>
        );
      default:
        return <Text key={i}>{seg.text}</Text>;
    }
  });

  // numberOfLines={2} replié est un simple style d'affichage RN (coupe visuelle
  // native), PAS une mesure/calcul de troncature côté client — la décision
  // "faut-il un bouton Voir plus" reste backend en mode liste (isTruncated) ou
  // mesurée une fois en mode détail (effectiveTruncated/isLocallyLong).
  // "Voir moins" doit revenir à ce même affichage 2 lignes, jamais rester sur
  // le texte complet affiché en entier. ellipsizeMode="clip" (pas "tail") :
  // le bouton "Voir plus" est déjà l'indicateur de troncature, "…" natif en
  // plus donnerait un rendu redondant "...texte...Voir plus".
  const textNode = (
    <Text
      style={textStyle}
      numberOfLines={effectiveTruncated && !expanded ? maxLines : undefined}
      ellipsizeMode={effectiveTruncated && !expanded ? 'clip' : 'tail'}
      suppressHighlighting
    >
      {renderSegs()}
    </Text>
  );

  // Clone invisible, jamais tronqué — sert UNIQUEMENT à mesurer si le texte
  // (déjà complet, localTruncate) dépasse 2 lignes. Démonté dès que la mesure
  // a eu lieu une fois (isLocallyLong devient true) pour ne pas re-mesurer à
  // chaque re-render.
  const measureNode = localTruncate && !isLocallyLong ? (
    <Text style={[textStyle, st.measure]} onTextLayout={onFullTextLayout} aria-hidden>
      {renderSegs()}
    </Text>
  ) : null;

  const toggleNode = !effectiveTruncated ? null : (
    <TouchableOpacity onPress={handleToggle} activeOpacity={0.7} disabled={loadingFull} hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}>
      {loadingFull ? (
        <ActivityIndicator size="small" color={primaryColor} style={{ marginTop: 4, alignSelf: 'flex-start' }} />
      ) : (
        <Text style={[st.toggle, { color: primaryColor }]}>{expanded ? lessLabel : moreLabel}</Text>
      )}
    </TouchableOpacity>
  );

  // Pas d'URL ou preview désactivée — rendu simple
  if (!showLinkPreview || urls.length === 0) {
    if (!effectiveTruncated && !measureNode) return <Text style={textStyle}>{renderSegs()}</Text>;
    return (
      <View>
        {textNode}
        {measureNode}
        {toggleNode}
      </View>
    );
  }

  return (
    <View>
      {textNode}
      {measureNode}
      {toggleNode}
      {/* Preview card pour chaque URL — max 1 affichée pour ne pas surcharger */}
      <LinkPreviewCard url={urls[0]} />
    </View>
  );
};

const st = StyleSheet.create({
  toggle: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  measure: {
    position: 'absolute', left: 0, right: 0, top: 0,
    opacity: 0, zIndex: -1,
  },
});
