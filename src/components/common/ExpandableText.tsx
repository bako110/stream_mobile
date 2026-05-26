import React, { useState, useCallback } from 'react';
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
  moreLabel = 'Lire la suite',
  lessLabel  = 'Voir moins',
}) => {
  const [expanded,    setExpanded]    = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const onTextLayout = useCallback((e: any) => {
    if (!expanded && e.nativeEvent.lines.length > maxLines) {
      setIsTruncated(true);
    }
  }, [expanded, maxLines]);

  return (
    <View>
      <Text
        style={textStyle}
        numberOfLines={expanded ? undefined : maxLines}
        ellipsizeMode="tail"
        onTextLayout={onTextLayout}
      >
        {text}
      </Text>

      {isTruncated && !expanded && (
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        >
          <Text style={[st.toggle, { color: primaryColor }]}>{moreLabel}</Text>
        </TouchableOpacity>
      )}

      {expanded && (
        <TouchableOpacity
          onPress={() => setExpanded(false)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        >
          <Text style={[st.toggle, { color: primaryColor }]}>{lessLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  toggle: {
    fontSize:   13,
    fontWeight: '600',
    marginTop:  4,
  },
});
