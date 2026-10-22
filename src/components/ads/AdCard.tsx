/**
 * AdCard — publicité native (feed principal et overlay recherche global).
 * Extraite de FeedScreen pour être partagée avec SearchOverlay, monté à la
 * racine de la navigation et donc hors de l'arbre de FeedScreen.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { CachedImage } from '../common/CachedImage';
import { AdvertiserRow } from './AdvertiserRow';
import { AdCTA } from './AdCTA';
import { AdSocialBar } from './AdSocialBar';
import { adIsVideo, adHasContact, type AdData } from './types';
import { callPhone, openWhatsapp } from '../../utils/phoneMenu';
import type { AppColors } from '../../theme/colors';
import { FontSize, FontWeight } from '../../theme';
import { FeedCardLayout, FeedRadius, getFeedCardStyle } from '../../theme/feed';

// ── AdCard — publicité native dans le feed (direction éditoriale) ─────────────
// Type AdData, hooks et sous-composants viennent de src/components/ads/.
// `settled` = la carte est immobile à l'écran depuis ≥ ~450 ms → le CTA passe
// de « lien texte » à « bouton discret » avec une accroche unique.

export const AdCard: React.FC<{
  ad: AdData;
  colors: AppColors;
  settled?: boolean;
  searchOverlay?: boolean;   // rendu dans l'overlay recherche : CTA = lien texte, entrée FadeInDown
  onImpression: (id: string) => void;
  onPress: (id: string, url: string) => void;
  onOpenFullscreen: (ad: AdData) => void;
}> = React.memo(({ ad, colors, settled = false, searchOverlay = false, onImpression, onPress, onOpenFullscreen }) => {
  // Impression envoyée au montage UNIQUEMENT dans l'overlay recherche (ScrollView
  // non virtualisé : tout ce qui est monté est déjà visible ou à portée immédiate
  // de scroll). Dans le flux principal (FlatList virtualisée), une carte peut être
  // montée par la fenêtre de rendu AVANT d'être réellement visible à l'écran — le
  // tracking y est fait par le parent via onFeedViewableChanged (vraie viewability,
  // même principe que ReelsScreen/AdSlide avec `isActive`), jamais ici.
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    if (searchOverlay && ad?.id && firedRef.current !== ad.id) {
      firedRef.current = ad.id;
      onImpression(ad.id);
    }
  }, [searchOverlay, ad?.id, onImpression]);

  const creativeUri = ad.creative_url || ad.thumbnail_url;
  const isVideo = adIsVideo(ad);
  const [imgFailed, setImgFailed] = useState(false);
  const hasCreative = !!creativeUri && !(imgFailed && !isVideo);

  // Contact direct (numéro + Appel et/ou WhatsApp cochés par l'annonceur) prime sur
  // cta_url — même priorité que ReelsScreen.tsx (AdSlide / carte recherche). Le tap
  // sur la CARTE (hors bouton CTA, qui gère sa propre action via AdCTA/runAdButton)
  // reste un comportement simple à une seule action : WhatsApp si disponible, sinon
  // appel, sinon lien — pas de choix à faire, cohérent avec "ouvrir le lien" d'avant.
  const hasContact = adHasContact(ad);
  const handleCardPress = () => {
    if (isVideo) { onOpenFullscreen(ad); return; }
    if (hasContact) {
      onPress(ad.id, '');
      if (ad.contact_whatsapp) openWhatsapp((ad.contact_phone ?? '').trim());
      else callPhone((ad.contact_phone ?? '').trim());
      return;
    }
    if (ad.cta_url) onPress(ad.id, ad.cta_url);
  };

  // Carte douce SANS ombre (direction éditoriale : la pub se fond). La pub arrive
  // déjà résolue depuis le backend (voir InjectionPlanner.maybe_inject_ads côté
  // serveur) — plus de placeholder à hauteur estimée qui change de taille au
  // chargement, donc plus besoin de minHeight réservée ici.
  const cardStyle = {
    ...getFeedCardStyle(colors),
    shadowOpacity: 0,
    elevation: 0,
  };
  // Dans l'overlay recherche : entrée FadeInDown + fond sombre (cohérent avec l'overlay).
  const Wrapper: any = searchOverlay ? Animated.View : React.Fragment;
  const wrapperProps = searchOverlay ? { entering: FadeInDown.duration(220) } : {};
  const mediaAlwaysOn = searchOverlay || settled;

  return (
    <Wrapper {...wrapperProps}>
    <GHTouchableOpacity style={cardStyle} activeOpacity={0.94} onPress={handleCardPress}>
      <AdvertiserRow ad={ad} variant="light" />

      {(ad.title || ad.description) ? (
        <View style={adSt.copy}>
          {ad.title ? <Text style={[adSt.hl, { color: colors.textPrimary }]} numberOfLines={2}>{ad.title}</Text> : null}
          {ad.description ? <Text style={[adSt.sub, { color: colors.textSecondary }]} numberOfLines={3}>{ad.description}</Text> : null}
        </View>
      ) : null}

      <View style={adSt.mediaWrap}>
        {hasCreative ? (
          isVideo ? (
            <View style={adSt.mediaClip}>
              <FeedAdVideo uri={creativeUri!} thumbnailUri={ad.thumbnail_url} isVisible={mediaAlwaysOn} />
            </View>
          ) : (
            <CachedImage uri={creativeUri!} style={[adSt.image, adSt.mediaClip]} resizeMode="cover" onError={() => setImgFailed(true)} />
          )
        ) : (
          <View style={[adSt.imagePlaceholder, adSt.mediaClip, { backgroundColor: colors.primary + '12' }]}>
            <Icon name="image" size={30} color={colors.primary + '55'} />
          </View>
        )}
      </View>

      {(ad.cta_url || hasContact) ? (
        <AdCTA
          ad={ad}
          context={searchOverlay ? 'search-overlay' : 'feed'}
          activated={searchOverlay ? true : settled}
          onPress={() => onPress(ad.id, ad.cta_url ?? '')}
        />
      ) : null}

      {/* Like / commentaire / favori — DANS la même carte que le reste de la
          pub (pas une pilule flottante séparée en dessous), jamais dans
          l'overlay recherche (espace contraint, AdCTA y est déjà réduit à un
          simple lien texte). Reste à l'intérieur du GHTouchableOpacity mais
          chaque bouton interne stoppe sa propre propagation pour ne jamais
          déclencher handleCardPress en même temps que lui-même. */}
      {!searchOverlay && <AdSocialBar ad={ad} showDivider={!(ad.cta_url || hasContact)} />}
    </GHTouchableOpacity>
    </Wrapper>
  );
});

// Créatif vidéo du feed — jamais d'autoplay : miniature figée + bouton play
// tant que l'utilisateur n'a pas tapé dessus explicitement. `isVisible` ne
// sert plus qu'à mettre en pause si la carte sort de l'écran pendant la
// lecture, jamais à déclencher la lecture elle-même.
const FeedAdVideo: React.FC<{ uri: string; thumbnailUri?: string; isVisible: boolean }> = ({ uri, thumbnailUri, isVisible }) => {
  const [muted, setMuted] = useState(true);
  const [userStarted, setUserStarted] = useState(false);

  const videoSource = useMemo(
    () => (userStarted ? { uri } : 'about:blank'),
    [uri, userStarted],
  );
  const player = useVideoPlayer(videoSource, p => { p.loop = true; p.muted = true; });

  useEffect(() => {
    if (!userStarted) return;
    if (isVisible) player.play();
    else player.pause();
  }, [isVisible, userStarted, player]);

  const toggleMute = useCallback(() => {
    setMuted(m => { player.muted = !m; return !m; });
  }, [player]);

  if (!userStarted) {
    // Miniature statique + bouton play cliquable — la lecture ne démarre que
    // sur une action explicite de l'utilisateur, jamais toute seule.
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => setUserStarted(true)} style={{ position: 'relative' }}>
        {thumbnailUri ? (
          <CachedImage uri={thumbnailUri} style={adSt.image} resizeMode="cover" />
        ) : (
          <View style={[adSt.image, { backgroundColor: '#1a1a2e' }]} />
        )}
        <View style={adSt.videoPlayOverlay} pointerEvents="none">
          <View style={adSt.videoPlayCircle}>
            <Icon name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <View style={{ position: 'relative' }}>
      <VideoView player={player} style={adSt.image} resizeMode="cover" controls={false} />
      <TouchableOpacity onPress={toggleMute} style={adSt.muteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name={muted ? 'volume-x' : 'volume-2'} size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const adSt = StyleSheet.create({
  copy:            { paddingHorizontal: FeedCardLayout.padH, paddingTop: 10, paddingBottom: 12 },
  hl:              { fontSize: FontSize.basePlus, fontWeight: FontWeight.bold, lineHeight: 21, letterSpacing: -0.2 },
  sub:             { fontSize: FontSize.smPlus, lineHeight: 19, marginTop: 5 },
  mediaWrap:       { paddingHorizontal: FeedCardLayout.padH, paddingBottom: 0 },
  mediaClip:       { borderRadius: FeedRadius.media, overflow: 'hidden' },
  image:           { width: '100%', aspectRatio: 1.6 },
  imagePlaceholder:{ width: '100%', aspectRatio: 1.6, alignItems: 'center', justifyContent: 'center' },
  muteBtn:         { position: 'absolute', bottom: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  // Indicateur "c'est une vidéo" sur la miniature statique — même design que
  // PostCard (voile sombre + cercle play centré), avant que la lecture démarre.
  videoPlayOverlay:{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  videoPlayCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
