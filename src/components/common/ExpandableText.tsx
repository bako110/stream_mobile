import React, { useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, StyleProp, TextStyle } from 'react-native';

interface Props {
  text: string;
  maxLines?: number;
  textStyle?: StyleProp<TextStyle>;
  primaryColor: string;
  moreLabel?: string;
  lessLabel?: string;
}

export const ExpandableText: React.FC<Props> = ({
  text,
  maxLines = 3,
  textStyle,
  primaryColor,
  moreLabel = 'Voir plus',
  lessLabel = 'Voir moins',
}) => {
  const [expanded,  setExpanded]  = useState(false);
  const [truncated, setTruncated] = useState(false);

  const toggle = () => { if (truncated || expanded) setExpanded(v => !v); };

  return (
    <View>
      <Text
        style={textStyle}
        numberOfLines={expanded ? undefined : maxLines}
        onPress={toggle}
        onTextLayout={e => {
          if (!expanded && e.nativeEvent.lines.length >= maxLines) setTruncated(true);
        }}
      >
        {text}
      </Text>
      {truncated && !expanded && (
        <TouchableOpacity onPress={toggle} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}>
          <Text style={[st.link, { color: primaryColor }]}>{moreLabel}</Text>
        </TouchableOpacity>
      )}
      {expanded && (
        <TouchableOpacity onPress={toggle} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}>
          <Text style={[st.link, { color: primaryColor }]}>{lessLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  link: { fontSize: 13, fontWeight: '600', marginTop: 3 },
});
