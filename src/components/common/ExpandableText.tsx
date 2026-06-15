import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { RichText } from './RichText';

interface Props {
  text: string;
  maxLines?: number;
  textStyle?: StyleProp<TextStyle>;
  primaryColor: string;
  moreLabel?: string;
  lessLabel?: string;
}

// Kept for backwards-compatibility — delegates to RichText which handles
// @mentions, #hashtags, URLs and the expand/collapse logic.
export const ExpandableText: React.FC<Props> = (props) => <RichText {...props} />;
