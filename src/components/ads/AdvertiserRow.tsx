/**
 * AdvertiserRow — en-tête annonceur unifié pour tous les encarts.
 *
 *  variant="light" : sur carte claire (Feed, overlay recherche). Logo carré 30px,
 *                    nom + « Sponsorisé · domaine », bouton ⋯ optionnel.
 *  variant="dark"  : sur média sombre (Reels, Stories). Logo rond 32px, nom blanc,
 *                    cliquable → profil annonceur.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { CachedImage } from '../common';
import { useTheme } from '../../hooks/useTheme';
import { adAdvertiserLabel, adDomain, adInitials, type AdData } from './types';

interface Props {
  ad: AdData;
  variant?: 'light' | 'dark';
  onDismiss?: () => void;
  onPressAdvertiser?: (advertiserId: string) => void;
}

export const AdvertiserRow: React.FC<Props> = ({
  ad, variant = 'light', onDismiss, onPressAdvertiser,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const label = adAdvertiserLabel(ad);
  const dom = adDomain(ad);
  const logo = ad.advertiser_logo;
  const initials = adInitials(ad);
  const dark = variant === 'dark';

  const nameColor = dark ? '#fff' : colors.textPrimary;
  const metaColor = dark ? 'rgba(255,255,255,0.7)' : colors.textTertiary;

  const LogoInner = logo
    ? <CachedImage uri={logo} style={dark ? s.logoDark : s.logoLight} resizeMode="cover" />
    : (
      <View style={[
        dark ? s.logoDark : s.logoLight,
        dark ? s.fbDark : { backgroundColor: '#1E1B2E' },
        { alignItems: 'center', justifyContent: 'center' },
      ]}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: dark ? 12 : 11, letterSpacing: -0.3 }}>
          {initials}
        </Text>
      </View>
    );

  const body = (
    <>
      {LogoInner}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.name, { color: nameColor }, dark && s.nameShadow]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[s.meta, { color: metaColor }]} numberOfLines={1}>
          {dom ? `Sponsorisé · ${dom}` : 'Sponsorisé'}
        </Text>
      </View>
    </>
  );

  if (dark) {
    return (
      <TouchableOpacity
        style={s.rowDark}
        activeOpacity={0.85}
        disabled={!ad.advertiser_id || !onPressAdvertiser}
        onPress={() => ad.advertiser_id && onPressAdvertiser?.(ad.advertiser_id)}
      >
        {body}
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.rowLight}>
      {body}
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="more-horizontal" size={16} color="#C9C7DC" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  rowLight: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 14 },
  rowDark:  { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoLight: { width: 30, height: 30, borderRadius: 8 },
  logoDark:  { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  fbDark:    { backgroundColor: '#211C33' },
  name:      { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1 },
  nameShadow:{ textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  meta:      { fontSize: 10.5, fontWeight: '500', marginTop: 1, letterSpacing: 0.1 },
});
