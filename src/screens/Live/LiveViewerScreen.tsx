/**
 * LiveViewerScreen — Viewer du concert live via LiveKit SDK.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, FlatList, TextInput, KeyboardAvoidingView, Dimensions, Image,
} from 'react-native';
import {
  LiveKitRoom,
  useRemoteParticipants,
  VideoTrack,
  useTracks,
} from '@livekit/react-native';
import { Track, VideoPresets } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { concertService, liveService, toastService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { openAuthenticatedWs } from '../../utils/authenticatedWs';
import { storage } from '../../utils/storage';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { configureLiveAudioSession } from '../../utils/liveAudioSession';
import type { Concert } from '../../types';
import { BackButton, GofolyxLoader } from '../../components/common';
import { StageTileRow } from '../../components/live/StageTileRow';
import type { StageTile, StageBadge } from '../../components/live/StageTileRow';
import { LiveGiftBar } from '../../components/wallet/LiveGiftBar';
import { TicketPaymentSheet } from '../../components/wallet/TicketPaymentSheet';
import { Images } from '../../assets';
import Orientation from 'react-native-orientation-locker';

interface Props {
  concertId: string;
  onBack?: () => void;
}

interface LiveChat {
  id: string;
  username: string;
  text: string;
}

/** Un concert/événement se regarde TOUJOURS en paysage — jamais en vertical,
 * symétrique à useForceLandscape côté LiveStreamScreen (host). */
function useForceLandscape() {
  useEffect(() => {
    Orientation.lockToLandscape();
    return () => { Orientation.lockToPortrait(); };
  }, []);
}

// ── LiveKit quality config ─────────────────────────────────────────────────────

const VIEWER_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: false,
  publishDefaults: {
    videoCodec: 'h264' as const,
    videoSimulcastLayers: [VideoPresets.h720],
  },
};

// ── Video view inside the room ────────────────────────────────────────────────
// Spotlight (artiste ou invité mis en avant) + bandeau "Sur scène" pour les
// autres invités — même pattern que SimpleLiveViewerScreen, adapté au concert.

const ArtistVideoView: React.FC<{
  hostId: string;
  spotlightId: string | null;
  onTapTile: (identity: string) => void;
}> = ({ hostId, spotlightId, onTapTile }) => {
  const remoteParticipants = useRemoteParticipants();
  const allCamTracks = useTracks([Track.Source.Camera]);

  if (remoteParticipants.length === 0) {
    return (
      <View style={styles.playerFrameFull}>
        <GofolyxLoader variant="reel" color="#E53E3E" />
        <Text style={styles.connectingText}>En attente du stream...</Text>
      </View>
    );
  }

  const spotlightTrack = allCamTracks.find(t => t.participant.identity === (spotlightId ?? hostId))
    ?? allCamTracks[0] ?? null;
  const thumbnailTracks = allCamTracks.filter(t => t !== spotlightTrack);

  const stageTiles: StageTile[] = thumbnailTracks.map(t => ({
    identity: t.participant.identity,
    name:     t.participant.name || t.participant.identity,
    track:    t,
    camOn:    !t.publication?.isMuted,
    badge:    (t.participant.identity === hostId ? 'host' : 'star') as StageBadge,
    micOn:    !t.publication?.isMuted,
  }));

  return (
    <View style={styles.playerFrameFull}>
      {spotlightTrack
        ? <VideoTrack trackRef={spotlightTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
        : (
          <>
            <GofolyxLoader variant="reel" color="#E53E3E" />
            <Text style={styles.connectingText}>En attente de la vidéo...</Text>
          </>
        )}
      {stageTiles.length > 0 && (
        <View style={styles.stageRowWrap} pointerEvents="box-none">
          <StageTileRow tiles={stageTiles} onTapTile={onTapTile} />
        </View>
      )}
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const LiveViewerScreen: React.FC<Props> = ({ concertId, onBack }) => {
  useKeepAwake();
  useForceLandscape();
  useEffect(() => { configureLiveAudioSession(); }, []);
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<LiveChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [sending, setSending] = useState(false);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  // Le backend renvoie 402 quand access_type nécessite un ticket/abonnement
  // actif (streaming.py::get_viewer_token) — avant ce fix, l'erreur était
  // avalée silencieusement (catch {}) et l'utilisateur restait bloqué sur
  // "Connexion au live..." indéfiniment, sans jamais savoir qu'un abonnement
  // etait requis.
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [showBuySheet, setShowBuySheet] = useState(false);

  const chatListRef = useRef<FlatList>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);

  // Charge le concert + récupère le token viewer — réutilisée au montage ET
  // après un achat de billet réussi (retry sans recharger tout l'écran).
  const loadConcertAndToken = useCallback(async () => {
    let c: Concert | null = null;
    try {
      c = await concertService.getById(concertId);
      setConcert(c);
      if (c.status !== 'live') {
        setStreamEnded(true);
        setLoading(false);
        return;
      }
      // Chemin unifié (Live) quand disponible — seul lui donne accès à la
      // scène/cadeaux (room "live-{id}"), sinon fallback ancien streaming.py.
      if (c.live_id) {
        const result = await liveService.getToken(c.live_id);
        setToken(result.token);
        setWsUrl(result.livekit_url);
      } else {
        const result = await concertService.getStreamToken(concertId);
        setToken(result.token);
        setWsUrl(result.livekit_url);
      }
      setViewerCount(c.current_viewers + 1);
      setAccessDenied(null);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (status === 402) {
        setAccessDenied(
          c?.access_type === 'subscription'
            ? 'Un abonnement actif est requis pour accéder à ce live.'
            : 'Un billet est requis pour accéder à ce live.'
        );
      } else {
        setAccessDenied('Impossible de rejoindre ce live.');
      }
    }
    setLoading(false);
  }, [concertId]);

  useEffect(() => { loadConcertAndToken(); }, [loadConcertAndToken]);

  // Poll viewer count + check if stream ended
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await concertService.getStreamStatus(concertId);
        setViewerCount(s.current_viewers ?? 0);
        if (!s.is_live) {
          setStreamEnded(true);
          setToken(null);
        }
      } catch {}
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, concertId]);

  // WS chat dédié — réception uniquement via /social/comments/ws/concert/{id}
  useEffect(() => {
    if (!token) return;
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) return;
    const ws = openAuthenticatedWs(`${WS_BASE_URL}/api/v1/social/comments/ws/concert/${concertId}`, accessToken);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'comment_added' && d.comment) {
          const c = d.comment;
          setChatMessages(prev => [...prev, {
            id: c.id ?? `${Date.now()}-${Math.random()}`,
            username: c.author?.display_name ?? c.author?.username ?? 'Anonyme',
            text: c.body,
          }]);
          setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } catch {}
    };
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); ws.close(); };
  }, [concertId, token]);

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    setSending(true);
    try {
      await apiClient.post(Endpoints.social.comments, { body: text, concert_id: concertId });
    } catch {}
    finally { setSending(false); }
  }, [chatInput, concertId, sending]);

  const handleLeave = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
    if (onBack) onBack();
    else nav.goBack();
  }, [nav, onBack]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <GofolyxLoader variant="reel" color="#E53E3E" />
      </View>
    );
  }

  if (streamEnded) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Icon name="radio" size={48} color="#666" />
        <Text style={styles.endedTitle}>Le live est terminé</Text>
        <Text style={styles.endedSub}>{concert?.title ?? ''}</Text>
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (accessDenied) {
    const _p = (v: any) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
    const allTiers = [
      { key: 'simple' as const, label: 'Simple', icon: 'tag',   color: '#E53E3E', price: _p(concert?.ticket_price),       sub: 'Accès standard' },
      { key: 'vip'    as const, label: 'VIP',    icon: 'star',  color: '#F59E0B', price: _p(concert?.ticket_price_vip),   sub: 'Accès prioritaire' },
      { key: 'vvip'   as const, label: 'VVIP',   icon: 'award', color: '#8B5CF6', price: _p(concert?.ticket_price_vvip),  sub: 'Expérience premium' },
      { key: 'vvvip'  as const, label: 'VVVIP',  icon: 'zap',   color: '#EF4444', price: _p(concert?.ticket_price_vvvip), sub: 'All-inclusive' },
    ].filter(t => t.price !== null) as { key: 'simple'|'vip'|'vvip'|'vvvip'; label: string; icon: string; color: string; price: number; sub: string }[];

    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Lecteur — poster statique + verrou plein écran, flux non accessible
            tant que le billet n'est pas acheté. */}
        <View style={styles.playerFrameFull}>
          {concert?.thumbnail_url && (
            <Image source={{ uri: concert.thumbnail_url }} style={StyleSheet.absoluteFill as any} blurRadius={14} />
          )}
          <View style={styles.playerLockOverlay}>
            <Icon name="lock" size={32} color="#fff" />
            <Text style={styles.playerLockText}>{accessDenied}</Text>
          </View>
        </View>

        {/* Header — overlay, logo + titre, badges */}
        <View style={[
          styles.header, styles.headerOverlay,
          { paddingTop: 10 + insets.top, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right },
        ]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleLeave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Image source={Images.logoDark} style={styles.headerLogo} resizeMode="contain" />
            <View>
              <Text style={styles.titleText} numberOfLines={1}>{concert?.title ?? ''}</Text>
              <Text style={styles.artistText} numberOfLines={1}>Artiste : {concert?.artist?.display_name ?? concert?.artist?.username ?? ''}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>EN DIRECT</Text>
            </View>
          </View>
        </View>

        {/* Bandeau "Billet en vente" — overlay bas, icône/texte/bouton d'achat. */}
        {concert?.access_type === 'subscription' ? (
          <View style={[styles.bottomOverlayBar, { paddingBottom: 14 + insets.bottom, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
            <TouchableOpacity style={[styles.leaveBtn, styles.buyTicketBtn]} onPress={() => nav.navigate('SubscriptionPlans' as never)}>
              <Text style={styles.buyTicketBtnText}>Voir les abonnements</Text>
            </TouchableOpacity>
          </View>
        ) : concert?.access_type === 'ticket' && allTiers.length > 0 ? (
          <View style={[styles.bottomOverlayBar, { paddingBottom: 14 + insets.bottom, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
            <View style={styles.ticketBanner}>
              <View style={styles.ticketBannerIconWrap}>
                <Icon name="tag" size={18} color="#4FA8FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketBannerTitle}>Billet en vente</Text>
                <Text style={styles.ticketBannerSub}>Accédez au direct et vivez le concert !</Text>
              </View>
              <TouchableOpacity style={styles.ticketBannerBtn} onPress={() => setShowBuySheet(true)}>
                <Icon name="tag" size={14} color="#fff" />
                <Text style={styles.ticketBannerBtnText}>Acheter — {allTiers[0].price}€</Text>
              </TouchableOpacity>
            </View>
            {concert && (
              <TicketPaymentSheet
                visible={showBuySheet} onClose={() => setShowBuySheet(false)}
                onSuccess={() => { setShowBuySheet(false); setLoading(true); loadConcertAndToken(); }}
                itemId={concertId} title={concert.title}
                accessType={concert.access_type as any}
                ticketPrice={concert.ticket_price ?? null}
                thumbnail={concert.thumbnail_url ?? null}
                kind="concert"
                tiers={allTiers}
                selectedTierKey="simple"
                onBuy={(tierKey) => concertService.buyTicket(concertId, tierKey)}
              />
            )}
          </View>
        ) : null}
      </View>
    );
  }

  if (!token || !wsUrl) {
    return (
      <View style={[styles.container, styles.center]}>
        <GofolyxLoader variant="reel" color="#E53E3E" />
        <Text style={styles.connectingText}>Connexion au live...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect options={VIEWER_ROOM_OPTIONS}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Lecteur — plein écran paysage */}
        <ArtistVideoView
          hostId={concert?.artist_id ?? ''}
          spotlightId={spotlightId}
          onTapTile={setSpotlightId}
        />

        {/* Header — overlay, logo + titre à gauche, badges EN DIRECT/vues à droite */}
        <View style={[
          styles.header, styles.headerOverlay,
          { paddingTop: 10 + insets.top, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right },
        ]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleLeave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Image source={Images.logoDark} style={styles.headerLogo} resizeMode="contain" />
            <View>
              <Text style={styles.titleText} numberOfLines={1}>{concert?.title}</Text>
              <Text style={styles.artistText} numberOfLines={1}>Artiste : {concert?.artist?.display_name ?? concert?.artist?.username ?? ''}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>EN DIRECT</Text>
            </View>
            <View style={styles.viewerBadge}>
              <Icon name="eye" size={13} color="#fff" />
              <Text style={styles.viewerText}>{viewerCount}</Text>
            </View>
          </View>
        </View>

        {/* Chat */}
        {showChat && (
          <View style={[
            styles.chatContainer,
            {
              paddingBottom: (Platform.OS === 'ios' ? 34 : 16) + insets.bottom,
              paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right,
            },
          ]}>
            <FlatList
              ref={chatListRef}
              data={chatMessages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.chatBubble}>
                  <Text style={styles.chatUser}>{item.username}</Text>
                  <Text style={styles.chatText}>{item.text}</Text>
                </View>
              )}
              style={styles.chatList}
              showsVerticalScrollIndicator={false}
            />
            {!!concert?.live_id && (
              <LiveGiftBar
                liveId={concert.live_id}
                receiverId={concert.artist_id}
                onGiftSent={(emoji) => toastService.success(`Cadeau envoyé ${emoji}`)}
              />
            )}
            <View style={styles.chatInputRow}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Message..."
                placeholderTextColor="#999"
                style={styles.chatInputField}
                onSubmitEditing={handleSendChat}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={handleSendChat} style={styles.sendBtn}>
                <Icon name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.toggleChatBtn}
          onPress={() => setShowChat(p => !p)}
        >
          <Icon name="message-circle" size={20} color="#fff" />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </LiveKitRoom>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center' },
  noVideoCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  connectingText: { color: '#999', marginTop: 12, fontSize: 14 },
  stageRowWrap: { position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 8 },
  // Écran toujours en paysage (useForceLandscape) : header/bandeau en overlay
  // flottant par-dessus la vidéo plein écran, comme LiveStreamScreen (host).
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingBottom: 14, gap: 10,
  },
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottomOverlayBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: { width: 28, height: 28 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E53E3E', borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 4, gap: 5,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  titleText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  artistText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500', marginTop: 1 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, gap: 5,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  playerFrameFull: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center',
  },
  playerLockOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24,
  },
  playerLockText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  ticketBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  ticketBannerIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(79,168,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  ticketBannerTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  ticketBannerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, marginTop: 1 },
  ticketBannerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#4FA8FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  ticketBannerBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  chatContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '45%', paddingHorizontal: 12,
  },
  chatList: { flexGrow: 0, maxHeight: 250, marginBottom: 8 },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
  },
  chatUser: { color: '#E53E3E', fontSize: 11, fontWeight: '700' },
  chatText: { color: '#fff', fontSize: 13 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24, paddingLeft: 14, paddingRight: 4,
  },
  chatInputField: {
    flex: 1, color: '#fff', fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  sendBtn: { backgroundColor: '#E53E3E', borderRadius: 20, padding: 8 },
  toggleChatBtn: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 90 : 70,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, padding: 10, zIndex: 20,
  },
  endedTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16 },
  endedSub: { color: '#999', fontSize: 14, marginTop: 4 },
  leaveBtn: {
    marginTop: 24, backgroundColor: '#E53E3E',
    borderRadius: 24, paddingHorizontal: 32, paddingVertical: 12,
  },
  leaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buyTicketBtn: { backgroundColor: '#3FEDB6', marginTop: 24, marginBottom: 0 },
  buyTicketBtnText: { color: '#0A0A0A', fontWeight: '800', fontSize: 15 },
});
