import React, { useState, useCallback } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Linking, StyleProp, TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinkPreviewCard } from './LinkPreviewCard';
import { openPhoneMenu } from '../../utils/phoneMenu';

// Matches URLs, @mentions, #hashtags, phone numbers — in order. Le numéro de
// téléphone exige soit un + international, soit au moins un séparateur
// (espace/point/tiret) entre les chiffres — un nombre collé (prix, date en
// chiffres, quantité) ne matche jamais, seul un vrai numéro formaté est capturé.
const TOKEN_RE = /(https?:\/\/[^\s<>"']+|@[\w.]+|#[\wÀ-ɏ]+|\+[0-9][0-9\s.-]{6,16}[0-9]|[0-9]{2,4}[\s.-][0-9]{2,4}(?:[\s.-][0-9]{2,4}){1,4})/g;

interface Segment {
  text: string;
  type: 'text' | 'url' | 'mention' | 'hashtag' | 'phone';
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
  maxLines = 0,
  textStyle,
  primaryColor,
  moreLabel = 'Lire la suite',
  lessLabel = 'Voir moins',
  onMentionPress,
  onHashtagPress,
  showLinkPreview = true,
}) => {
  const nav = useSafeNavigation();
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  // Mesure du nombre RÉEL de lignes — doit se faire sans numberOfLines, sinon
  // onTextLayout ne rapporte jamais plus de lignes que la limite déjà appliquée
  // (la troncature ne serait donc jamais détectée).
  const onFullTextLayout = useCallback((e: any) => {
    if (maxLines > 0 && e.nativeEvent.lines.length > maxLines) {
      setIsTruncated(true);
    }
  }, [maxLines]);

  const segs = parse(text);

  // Toutes les URLs dans le texte — on affiche une preview card pour chacune
  const urls = segs.filter(s => s.type === 'url').map(s => s.text);

  const handleMention = (username: string) => {
    if (onMentionPress) { onMentionPress(username); return; }
    try { nav?.navigate('UserProfile', { username: username.slice(1) }); } catch {}
  };

  const handleHashtag = (tag: string) => {
    if (onHashtagPress) { onHashtagPress(tag); return; }
    try { nav?.navigate('Search', { query: tag }); } catch {}
  };

  const handlePhone = (raw: string) => openPhoneMenu(raw);

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
      default:
        return <Text key={i}>{seg.text}</Text>;
    }
  });

  const textNode = (
    <Text
      style={textStyle}
      numberOfLines={expanded ? undefined : (maxLines || undefined)}
      ellipsizeMode="tail"
      onPress={maxLines > 0 && isTruncated ? () => setExpanded(v => !v) : undefined}
      suppressHighlighting
    >
      {renderSegs()}
    </Text>
  );

  // Clone invisible et non-tronqué du texte, uniquement pour mesurer le
  // nombre réel de lignes qu'il occuperait sans limite.
  const measureNode = maxLines > 0 && !isTruncated ? (
    <Text
      style={[textStyle, st.measure]}
      onTextLayout={onFullTextLayout}
      aria-hidden
    >
      {renderSegs()}
    </Text>
  ) : null;

  const toggleNode = !maxLines ? null : isTruncated && !expanded ? (
    <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}>
      <Text style={[st.toggle, { color: primaryColor }]}>{moreLabel}</Text>
    </TouchableOpacity>
  ) : expanded ? (
    <TouchableOpacity onPress={() => setExpanded(false)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}>
      <Text style={[st.toggle, { color: primaryColor }]}>{lessLabel}</Text>
    </TouchableOpacity>
  ) : null;

  // Pas d'URL ou preview désactivée — rendu simple
  if (!showLinkPreview || urls.length === 0) {
    if (!maxLines) return <Text style={textStyle}>{renderSegs()}</Text>;
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
