import React from 'react';
import { View, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CachedImage } from './CachedImage';
import { AvatarWithBadge } from './AvatarWithBadge';

interface Props {
  thumbnailUrl?: string | null;
  avatarUrl?: string | null;
  initials?: string;
  /** Taille de l'avatar affiché au centre quand il sert de fond (pas de thumbnail). */
  avatarSize?: number;
  accentColor?: string;
}

/**
 * Fond d'une carte de live : thumbnail_url du live si disponible, sinon l'avatar du
 * host flouté en arrière-plan avec l'avatar net centré par-dessus, sinon un simple
 * dégradé — pattern uniformisé partout où une carte de live spontané est affichée.
 */
export const LiveThumbnailBackground: React.FC<Props> = ({
  thumbnailUrl, avatarUrl, initials = '?', avatarSize = 52, accentColor = '#7B3FF2',
}) => {
  if (thumbnailUrl) {
    return <CachedImage uri={thumbnailUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  if (avatarUrl) {
    return (
      <>
        <CachedImage uri={avatarUrl} style={[StyleSheet.absoluteFill, s.blurBg]} blurRadius={18} />
        <View style={s.centerWrap}>
          <AvatarWithBadge avatarUrl={avatarUrl} initials={initials} size={avatarSize} accentColor={accentColor} isLive />
        </View>
      </>
    );
  }
  return (
    <LinearGradient colors={[accentColor, '#F0365A']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
  );
};

const s = StyleSheet.create({
  blurBg:     { opacity: 0.55 },
  centerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
