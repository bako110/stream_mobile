import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';

interface Props {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  colors: AppColors;
}

export const LinkPreviewCard: React.FC<Props> = ({ url, title, description, image, colors }) => {
  const [imgError, setImgError] = useState(false);

  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {}

  const handlePress = () => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
      onPress={handlePress}
      activeOpacity={0.82}
    >
      {image && !imgError ? (
        <Image
          source={{ uri: image }}
          style={styles.previewImg}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : null}
      <View style={styles.info}>
        <View style={styles.domainRow}>
          <Icon name="link" size={10} color={colors.textTertiary} />
          <Text style={[styles.domain, { color: colors.textTertiary }]} numberOfLines={1}>
            {domain || url}
          </Text>
        </View>
        {title ? (
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginTop: 10,
  },
  previewImg: {
    width: '100%',
    height: 160,
  },
  info: {
    padding: 12,
    gap: 4,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  domain: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
  },
});
