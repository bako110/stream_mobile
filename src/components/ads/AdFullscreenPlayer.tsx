/**
 * AdFullscreenPlayer — pub vidéo ouverte en plein écran avec son (via Modal).
 * Utilisé par le Feed (tap sur une AdCard vidéo). Fermeture au bouton X ;
 * le CTA ne s'ouvre jamais automatiquement.
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adIsPhone, type AdData } from './types';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { Linking } from 'react-native';

export const AdFullscreenPlayer: React.FC<{ ad: AdData; onClose: () => void; onClick?: (adId: string, url?: string) => void }> = ({ ad, onClose, onClick }) => {
  const insets = useSafeAreaInsets();
  const creativeUri = ad.creative_url || ad.thumbnail_url || '';
  const player = useVideoPlayer({ uri: creativeUri }, p => { p.loop = true; p.muted = false; p.volume = 1; });
  useEffect(() => { try { player.play(); } catch {} }, [player]);

  const rawCta = (ad.cta_url ?? '').trim();
  const handleCta = () => {
    if (onClick) { onClick(ad.id, rawCta); return; }
    if (!rawCta) return;
    if (adIsPhone(rawCta)) { openPhoneMenu(rawCta.replace(/^tel:/i, '')); return; }
    Linking.openURL(rawCta).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="contain" controls={false} />

      <TouchableOpacity
        style={[st.close, { top: insets.top + 10 }]}
        onPress={onClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="x" size={22} color="#fff" />
      </TouchableOpacity>

      <View style={[st.bottom, { bottom: Math.max(insets.bottom, 16) + 10 }]}>
        <Text style={st.title} numberOfLines={1}>{ad.title}</Text>
        {ad.description ? <Text style={st.desc} numberOfLines={3}>{ad.description}</Text> : null}
        {rawCta ? (
          <TouchableOpacity activeOpacity={0.88} onPress={handleCta} style={{ marginTop: 4 }}>
            <LinearGradient colors={['#7B3FF2', '#C044E8', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.cta}>
              <Icon name={adIsPhone(rawCta) ? 'phone' : 'globe'} size={15} color="#fff" />
              <Text style={st.ctaTxt}>{ad.cta_text || (adIsPhone(rawCta) ? 'Contactez-nous' : 'En savoir plus')}</Text>
              <Icon name="arrow-right" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  close:  { position: 'absolute', left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, gap: 8 },
  title:  { color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  desc:   { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  cta:    { borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  ctaTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
