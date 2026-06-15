import React, { useState, useCallback } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Linking, StyleProp, TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// Matches URLs, @mentions, #hashtags in order
const TOKEN_RE = /(https?:\/\/[^\s<>"']+|@[\w.]+|#[\wÀ-ɏ]+)/g;

interface Segment {
  text: string;
  type: 'text' | 'url' | 'mention' | 'hashtag';
}

function parse(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) segs.push({ text: text.slice(last, m.index), type: 'text' });
    const t = m[0];
    if (t.startsWith('http')) segs.push({ text: t, type: 'url' });
    else if (t.startsWith('@'))  segs.push({ text: t, type: 'mention' });
    else                         segs.push({ text: t, type: 'hashtag' });
    last = m.index! + t.length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), type: 'text' });
  return segs;
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
}) => {
  const nav = useSafeNavigation();
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const onTextLayout = useCallback((e: any) => {
    if (!expanded && maxLines > 0 && e.nativeEvent.lines.length > maxLines) {
      setIsTruncated(true);
    }
  }, [expanded, maxLines]);

  const segs = parse(text);

  const handleMention = (username: string) => {
    if (onMentionPress) { onMentionPress(username); return; }
    try { nav?.navigate('UserProfile', { username: username.slice(1) }); } catch {}
  };

  const handleHashtag = (tag: string) => {
    if (onHashtagPress) { onHashtagPress(tag); return; }
    try { nav?.navigate('Search', { query: tag }); } catch {}
  };

  const renderSegs = () => segs.map((seg, i) => {
    switch (seg.type) {
      case 'url':
        return (
          <Text
            key={i}
            style={{ color: primaryColor, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(seg.text).catch(() => {})}
          >
            {seg.text}
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
      default:
        return <Text key={i}>{seg.text}</Text>;
    }
  });

  if (!maxLines) {
    return <Text style={textStyle}>{renderSegs()}</Text>;
  }

  return (
    <View>
      <Text
        style={textStyle}
        numberOfLines={expanded ? undefined : maxLines}
        ellipsizeMode="tail"
        onTextLayout={onTextLayout}
      >
        {renderSegs()}
      </Text>

      {isTruncated && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}>
          <Text style={[st.toggle, { color: primaryColor }]}>{moreLabel}</Text>
        </TouchableOpacity>
      )}
      {expanded && (
        <TouchableOpacity onPress={() => setExpanded(false)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}>
          <Text style={[st.toggle, { color: primaryColor }]}>{lessLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  toggle: { fontSize: 13, fontWeight: '600', marginTop: 4 },
});
