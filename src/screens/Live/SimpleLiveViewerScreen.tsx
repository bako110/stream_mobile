/**
 * SimpleLiveViewerScreen — Viewer du live spontané.
 *
 * Système de modération TikTok-style :
 * - Par défaut : viewer silencieux (can_publish=false côté LiveKit)
 * - Bouton "Lever la main" → POST /lives/{id}/hand-raise/{identity} → notif WS au host
 * - Quand le host accepte → WS "live_guest_invited" → cam/micro débloqués automatiquement
 * - Quand le host fait redescendre → WS "live_guest_demoted" → cam/micro recoupés
 * - Indicateur "Sur scène" visible quand on est invité
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback,
  StatusBar, Platform, FlatList, TextInput, KeyboardAvoidingView,
  ActivityIndicator, Image, AppState, AppStateStatus, Modal,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, SlideInUp, SlideOutDown, SlideInDown,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
} from 'react-native-reanimated';
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track, VideoPresets } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { liveService } from '../../services/liveService';
import { battleService } from '../../services/battleService';
import { toastService, showConfirm } from '../../services';
import { participantAvatarUrl } from '../../utils/livekitParticipant';
import type { LiveStream, LiveRanking } from '../../services/liveService';
import { LiveAccessGate } from '../../components/live/LiveAccessGate';
import { LiveSettingsSheet } from '../../components/live/LiveSettingsSheet';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { openAuthenticatedWs } from '../../utils/authenticatedWs';
import { storage } from '../../utils/storage';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { configureLiveAudioSession } from '../../utils/liveAudioSession';
import { useWs } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { LiveGiftBar } from '../../components/wallet/LiveGiftBar';
import { LiveLikeButton } from '../../components/live/LiveLikeButton';
import type { LiveLikeButtonRef } from '../../components/live/LiveLikeButton';
import { LiveHeartsOverlay } from '../../components/live/LiveHeartsOverlay';
import { LiveReactionPicker, ReactionFloaters, useReactionFloaters } from '../../components/live/LiveReactionPicker';
import { useUser } from '../../context/UserContext';
import { BackButton, GoFolyXLoader } from '../../components/common';
import { StageTileRow } from '../../components/live/StageTileRow';
import type { StageTile, StageBadge } from '../../components/live/StageTileRow';
import { LiveMoreMenu } from '../../components/live/LiveMoreMenu';
import { LiveParticipantsModal } from '../../components/live/LiveParticipantsModal';

// ── LiveKit quality config ─────────────────────────────────────────────────────

const VIEWER_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: false,
  publishDefaults: {
    videoCodec: 'h264' as const,
    videoSimulcastLayers: [VideoPresets.h720],
  },
};

type Nav    = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveViewer'>;

interface ChatMsg {
  id:      string;
  user:    string;
  userId?: string;
  avatar?: string | null;
  text:    string;
  isJoin?:  boolean;
  isGift?:  boolean;
  isSys?:   boolean;
  edited?:  boolean;
  isLocal?: boolean;
}

interface GiftTick {
  id:         string;
  emoji:      string;
  senderName: string;
  giftName:   string;
  GoGold:      number;
}

// ── Avatar fallback ───────────────────────────────────────────────────────────

const Av: React.FC<{ name: string; size: number; color?: string }> = ({ name, size, color = '#F0365A' }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

// ── Sheet "condition pour monter sur scène" ───────────────────────────────────

const StageAccessSheet: React.FC<{
  live:          LiveStream;
  liveId:        string;
  identity:      string;
  onRequested:   () => void;
  onClose:       () => void;
}> = ({ live, liveId, identity, onRequested, onClose }) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [myBalance,      setMyBalance]      = useState<number>(-1);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [loading,        setLoading]        = useState(false);

  const isGoGold           = live.stage_type === 'gogold';
  const isGift            = live.stage_type === 'gift';
  const requiredGoGold     = live.stage_gogold ?? 0;
  const requiredGiftName  = live.stage_gift_name ?? 'Cadeau';
  const requiredGiftEmoji = live.stage_gift_emoji ?? '🎁';
  const hostId            = live.user_id ?? '';
  const hostName          = live.user?.display_name ?? live.user?.username ?? 'le host';

  // coût effectif : pour GoGold → stage_gogold, pour gift → gogold_cost du gift_type
  const [giftCost, setGiftCost] = useState<number | null>(null);
  const effectiveCost = isGoGold ? requiredGoGold : (giftCost ?? 0);

  const insufficientFunds = !balanceLoading && myBalance < effectiveCost;

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const balRes = await apiClient.get(Endpoints.wallet.balance);
        setMyBalance(Number((balRes as any).data?.gogold_balance ?? (balRes as any).data?.balance ?? 0));
      } catch { setMyBalance(0); }

      if (isGift && live.stage_gift_id) {
        try {
          const giftsRes = await apiClient.get(Endpoints.wallet.giftTypes);
          const list: any[] = (giftsRes as any).data?.gifts ?? (giftsRes as any).data ?? [];
          const found = list.find((g: any) => g.id === live.stage_gift_id);
          if (found) setGiftCost(Number(found.gogold_cost ?? 0));
        } catch {}
      }

      setBalanceLoading(false);
    };
    fetchAll();
  }, [isGoGold, isGift, live.stage_gift_id]);

  const handlePay = async () => {
    if (isGift) {
      // Pour les cadeaux : la rangée de cadeaux permanente (LiveGiftBar) est
      // toujours visible au-dessus de la barre de commentaire — plus besoin
      // d'ouvrir un overlay dédié, l'utilisateur tape directement le cadeau requis.
      onClose();
      return;
    }
    if (balanceLoading || insufficientFunds) return;
    setLoading(true);
    try {
      await apiClient.post(Endpoints.lives.handRaise(liveId, identity));
      onRequested();
    } catch (e: any) {
      const status = e?.status ?? 0;
      const msg    = e?.message ?? 'Une erreur est survenue.';
      if (status === 402) {
        showConfirm('Solde insuffisant', msg, [
          { text: 'Pas maintenant', style: 'cancel' },
          { text: 'Recharger', onPress: () => { onClose(); navigation.navigate('Wallet'); } },
        ]);
      } else if (status === 409) {
        toastService.info('Demande déjà envoyée', msg);
        onClose();
      } else if (status === 400) {
        toastService.warning('Impossible', msg);
      } else {
        toastService.error('Erreur', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={sas.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      <Animated.View entering={SlideInDown.springify().damping(22).stiffness(200)} style={[sas.sheet, { paddingBottom: (Platform.OS === 'ios' ? 46 : 28) + insets.bottom }]}>
        <View style={sas.handle} />

        {/* Titre */}
        <View style={sas.titleRow}>
          <LinearGradient colors={['#F0365A', '#9B65F5']} style={sas.lockIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={{ fontSize: 18 }}>🎤</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={sas.title}>Monter sur scène</Text>
            <Text style={sas.subtitle}>{hostName} a monétisé l'accès à la scène</Text>
          </View>
        </View>

        {/* Condition requise */}
        <View style={sas.conditionBox}>
          <Text style={sas.conditionEmoji}>{isGoGold ? '🪙' : requiredGiftEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={sas.conditionLabel}>Condition requise</Text>
            <Text style={sas.conditionValue}>
              {isGoGold ? `${requiredGoGold} GoGold` : requiredGiftName}
            </Text>
          </View>
        </View>

        {/* Solde actuel */}
        <View style={[
          sas.balanceRow,
          insufficientFunds && { borderColor: '#F0365A', backgroundColor: 'rgba(240,54,90,0.07)' },
        ]}>
          <Text style={sas.balanceLabel}>Ton solde actuel</Text>
          {balanceLoading
            ? <ActivityIndicator size="small" color="#3FEDB6" />
            : <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[sas.balanceValue, insufficientFunds && { color: '#F0365A' }]}>
                  {myBalance} GoGold
                </Text>
                {insufficientFunds && effectiveCost > 0 && (
                  <Text style={sas.balanceShort}> · manque {effectiveCost - myBalance}</Text>
                )}
              </View>
          }
        </View>

        {/* Note escrow */}
        {isGoGold && requiredGoGold > 0 && (
          <Text style={sas.refundNote}>
            Les GoGold sont réservés jusqu'à l'acceptation du host. Remboursés automatiquement si le live se termine.
          </Text>
        )}

        {/* CTA */}
        {insufficientFunds && !balanceLoading ? (
          <TouchableOpacity
            style={sas.payBtn}
            onPress={() => { onClose(); navigation.navigate('Wallet'); }}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#F0365A', '#9B65F5']} style={sas.payBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={{ fontSize: 18 }}>💳</Text>
              <Text style={sas.payBtnText}>Recharger mon solde</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[sas.payBtn, (loading || balanceLoading) && { opacity: 0.5 }]}
            onPress={handlePay}
            disabled={loading || balanceLoading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={isGoGold ? ['#F59E0B', '#F97316'] : ['#F0365A', '#9B65F5']}
              style={sas.payBtnGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {loading || balanceLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Text style={{ fontSize: 18 }}>{isGoGold ? '🪙' : requiredGiftEmoji}</Text>
                    <Text style={sas.payBtnText}>
                      {isGoGold
                        ? `Payer ${requiredGoGold} GoGold · Lever la main`
                        : `Envoyer ${requiredGiftName}${giftCost ? ` (${giftCost} GoGold)` : ''} · Lever la main`}
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onClose} style={sas.cancelBtn}>
          <Text style={sas.cancelText}>Pas maintenant</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const sas = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 80, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0D0820',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 16,
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(155,101,245,0.3)',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20,
  },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  lockIcon:   { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title:      { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },

  conditionBox: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    padding: 16, marginBottom: 12,
  },
  conditionEmoji: { fontSize: 32 },
  conditionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', marginBottom: 3 },
  conditionValue: { color: '#F59E0B', fontSize: 18, fontWeight: '800' },

  balanceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20,
  },
  balanceLabel: { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  balanceValue: { color: '#3FEDB6', fontSize: 15, fontWeight: '800' },
  balanceShort: { color: '#F0365A', fontSize: 12, fontWeight: '700' },

  refundNote: {
    color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center',
    marginBottom: 12, lineHeight: 16, paddingHorizontal: 8,
  },
  payBtn:      { borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  payBtnGrad:  { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  payBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn:   { alignItems: 'center', paddingVertical: 10 },
  cancelText:  { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
});

// ── Zone vidéo multi-participants ─────────────────────────────────────────────

const MultiVideoView: React.FC<{
  hostName:      string;
  hostAvatarUrl: string | null | undefined;
  myName:        string;
  myAvatarUrl:   string | null | undefined;
  onStage:       boolean;
  onGift: (id: string, name: string) => void;
  onTap:  () => void;
}> = ({ hostName, hostAvatarUrl, myName, myAvatarUrl, onStage, onGift, onTap }) => {
  const allTracks    = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const participants = useParticipants();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const localParticipant = participants.find(p => p.isLocal);
  const localTrack      = allTracks.find(t => t.participant.isLocal) ?? null;
  const remoteTracks    = allTracks.filter(t => !t.participant.isLocal);
  const defaultSpotlight = remoteTracks[0] ?? null;
  const spotlightTrack   = remoteTracks.find(t => t.participant.identity === spotlightId) ?? defaultSpotlight;
  // Vignettes = autres remotes (le local, s'il est sur scène, a sa propre tuile réservée
  // dans le bandeau — plus de PiP flottant séparé qui pouvait se superposer au spotlight)
  const thumbnailTracks  = remoteTracks.filter(t => t !== spotlightTrack);
  // "Sur scène" = vraiment invité (onStage, géré par RoomContent via goOnStage/leaveStage),
  // pas simplement connecté à la room — un simple spectateur ne doit pas apparaître ici.
  const localOnStage     = onStage && !!localParticipant;

  const spotlightName  = spotlightTrack
    ? (spotlightTrack.participant.name || spotlightTrack.participant.identity)
    : '';
  const spotlightCamOn = spotlightTrack ? !spotlightTrack.publication?.isMuted : false;
  // Photo de profil de la personne spotlightée (toujours un participant distant
  // ici, jamais soi-même) — extraite des métadonnées LiveKit, sans quoi le
  // fallback caméra coupée retombait sur un simple cercle avec la première
  // lettre du nom (Av) même quand une vraie photo de profil était disponible.
  const spotlightAvatarUrl = spotlightTrack ? participantAvatarUrl(spotlightTrack.participant.metadata) : null;

  // Pas encore connecté du tout
  if (participants.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noVideo]}>
        <GoFolyXLoader variant="reel" color="#F0365A" />
      </View>
    );
  }

  // Connecté mais aucune caméra active — afficher avatar du host style TikTok
  if (allTracks.length === 0) {
    return (
      <TouchableWithoutFeedback onPress={onTap}>
        <View style={[StyleSheet.absoluteFill, mv.noCamBg]}>
          {hostAvatarUrl
            ? <Image source={{ uri: hostAvatarUrl }} style={mv.noCamAvatar} />
            : <Av name={hostName} size={100} />
          }
          <Text style={mv.noCamName}>{hostName}</Text>
          <View style={mv.noCamMicRow}>
            <Icon name="mic" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={mv.noCamMicText}>Audio uniquement</Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={onTap}>
      <View style={StyleSheet.absoluteFill}>
        {/* Spotlight — "contain" (pas "cover") : un host connecté depuis le web
            filme en paysage (webcam standard, ratio large) alors que l'écran
            mobile est en portrait (étroit et haut) — avec "cover" l'image
            large est zoomée pour remplir toute la hauteur du cadre, ce qui
            rogne une grande partie gauche/droite et rend le host partiellement
            invisible pour le viewer mobile. "contain" montre l'image entière,
            quitte à laisser des bandes sombres en haut/bas (fond du root déjà
            sombre, cf. styles.root). */}
        {spotlightTrack && (
          spotlightCamOn
            ? <VideoTrack trackRef={spotlightTrack} style={StyleSheet.absoluteFill} objectFit="contain" />
            : <View style={[StyleSheet.absoluteFill, mv.noVideoBg]}>
                {spotlightAvatarUrl
                  ? <Image source={{ uri: spotlightAvatarUrl }} style={mv.spotlightAvatar} />
                  : <Av name={spotlightName} size={96} />}
                <Text style={mv.spotlightName}>{spotlightName}</Text>
              </View>
        )}

        {/* Bouton cadeau sur le spotlight */}
        {spotlightTrack && !spotlightTrack.participant.isLocal && (
          <TouchableOpacity
            style={mv.spotGiftBtn}
            onPress={() => onGift(spotlightTrack.participant.identity, spotlightName)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 20 }}>🎁</Text>
          </TouchableOpacity>
        )}

        {/* Bandeau "Sur scène" — une seule zone claire et alignée pour tous les
            participants (host, invités, et toi si tu es sur scène). Chaque tuile
            réserve sa place avec la photo de profil dès la montée sur scène, et
            bascule automatiquement sur le flux caméra dès qu'il est actif. */}
        <View style={mv.stageRowWrap} pointerEvents="box-none">
          <StageTileRow
            tiles={[
              {
                identity:  spotlightTrack?.participant.identity ?? 'host',
                name:      hostName,
                track:     spotlightTrack,
                camOn:     spotlightCamOn,
                avatarUrl: hostAvatarUrl,
                badge:     'host' as StageBadge,
                micOn:     spotlightCamOn,
                isSpeaking: spotlightTrack ? !!participants.find(p => p.identity === spotlightTrack.participant.identity)?.isSpeaking : false,
              },
              ...thumbnailTracks.map(t => ({
                identity: t.participant.identity,
                name:     t.participant.name || t.participant.identity,
                track:    t,
                camOn:    !t.publication?.isMuted,
                badge:    'star' as StageBadge,
                micOn:    !t.publication?.isMuted,
                isSpeaking: !!participants.find(p => p.identity === t.participant.identity)?.isSpeaking,
              } satisfies StageTile)),
              // Toi — dès que tu es sur scène, ta place est réservée avec ta photo de
              // profil ; dès que tu actives la caméra, le flux la remplace automatiquement
              // (même tuile, pas d'élément séparé qui pourrait se superposer au spotlight).
              ...(localOnStage ? [{
                identity: localParticipant!.identity,
                name: myName || 'Toi',
                track: localTrack,
                camOn: localTrack ? !localTrack.publication?.isMuted : false,
                avatarUrl: myAvatarUrl,
                badge: 'star' as StageBadge,
                micOn: localTrack ? !localTrack.publication?.isMuted : false,
                isSpeaking: !!localParticipant?.isSpeaking,
              } satisfies StageTile] : []),
            ]}
            onTapTile={(identity) => setSpotlightId(identity)}
            onLongPressTile={(identity) => {
              const t = remoteTracks.find(rt => rt.participant.identity === identity);
              if (t) onGift(identity, t.participant.name || identity);
            }}
          />
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

// ── Contenu dans LiveKitRoom ──────────────────────────────────────────────────

interface HandRequest {
  identity: string;
  name: string;
  avatar?: string | null;
}

const PulsingLiveDot: React.FC = () => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 650 }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[st.liveIndicator, animStyle]} />;
};

const LeaveStageBtn: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 600 }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <TouchableOpacity style={st.actionIconWrap} onPress={onPress} activeOpacity={0.8}>
      <Animated.View style={[st.actionIconCircle, st.actionIconCircleRed, animStyle]}>
        <Icon name="arrow-down" size={14} color="#F0365A" />
      </Animated.View>
    </TouchableOpacity>
  );
};

const RoomContent: React.FC<{
  live:         LiveStream | null;
  liveId:       string;
  myIdentity:   string;
  myName:       string;
  myAvatarUrl:  string | null | undefined;
  isHost:       boolean;
  viewerCount:  number;
  messages:     ChatMsg[];
  chatInput:    string;
  setChatInput: (v: string) => void;
  sending:      boolean;
  chatRef:      React.RefObject<FlatList | null>;
  onSend:       () => void;
  onLeave:      () => void;
  onBanUser:    (userId: string, name: string) => void;
  onDemoteUser: (identity: string, name: string) => void;
  onDeleteMsg:  (id: string) => void | Promise<void>;
  onEditMsg:    (id: string, newText: string) => void;
  giftNotifs:   GiftNotif[];
  onGiftNotifShown: (id: string) => void;
  giftTicker:   GiftTick[];
  giftHistory:  GiftTick[];
  likeCount:    number;
  onLike:       () => void;
  likeRef:      React.RefObject<LiveLikeButtonRef | null>;
  heartsOverlayRef: React.RefObject<import('../../components/live/LiveHeartsOverlay').LiveHeartsOverlayRef | null>;
  reactionSpawnRef: React.RefObject<((emoji: string) => void) | null>;
  onReact:      (emoji: string) => void;
  elapsed:      number;
  goOnStageRef:  { current: (() => void) | null };
  leaveStageRef: { current: ((notifyServer?: boolean) => void) | null };
  handRequests:  HandRequest[];
  onHandDismiss: (identity: string) => void;
  onLiveUpdated: (patch: Partial<LiveStream>) => void;
  onStopLive:    () => void;
}> = ({
  live, liveId, myIdentity, myName, myAvatarUrl, isHost, viewerCount, messages, chatInput, setChatInput,
  sending, chatRef, onSend, onLeave, onBanUser, onDemoteUser, onDeleteMsg, onEditMsg,
  giftNotifs, onGiftNotifShown, giftTicker, giftHistory, likeCount, onLike, likeRef, heartsOverlayRef,
  reactionSpawnRef, onReact,
  elapsed, goOnStageRef, leaveStageRef,
  handRequests, onHandDismiss, onLiveUpdated, onStopLive,
}) => {
  const { localParticipant } = useLocalParticipant();
  const roomParticipants     = useParticipants();
  const { floaters, spawn }  = useReactionFloaters();
  const insets = useSafeAreaInsets();

  // Exposer spawn au parent pour les réactions WS des autres
  React.useEffect(() => { reactionSpawnRef.current = spawn; }, [spawn, reactionSpawnRef]);
  const [onStage,      setOnStage]      = useState(false);
  const [camOn,        setCamOn]        = useState(false);
  const [micOn,        setMicOn]        = useState(false);
  const [handRaised,    setHandRaised]    = useState(false);
  const [checkingStage, setCheckingStage] = useState(false);
  const [showInput,     setShowInput]     = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showMoreMenu,  setShowMoreMenu]  = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showStageGate,    setShowStageGate]    = useState(false);
  const [showStageMenu,    setShowStageMenu]    = useState(false);
  const [freshLiveForGate, setFreshLiveForGate] = useState<LiveStream | null>(null);
  const [editTarget,    setEditTarget]    = useState<{ id: string; text: string } | null>(null);
  const giftRef = useRef<LiveGiftOverlayRef>(null);

  // Classement MVP — top donateurs du live (cartes + avatars en cascade), même
  // système que le battle (BattleScreen.tsx) : visible tant que des cadeaux
  // arrivent, masqué après 8s sans nouveau cadeau. Déclenché ici (au lieu du
  // parent) en observant giftTicker, qui change déjà à chaque cadeau reçu.
  const [ranking,    setRanking]    = useState<LiveRanking | null>(null);
  const [showDonors, setShowDonors] = useState(false);
  const donorsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGiftTickId = useRef<string | null>(null);
  useEffect(() => {
    const latest = giftTicker[giftTicker.length - 1];
    if (!latest || latest.id === lastGiftTickId.current) return;
    lastGiftTickId.current = latest.id;
    liveService.getRanking(liveId).then(setRanking).catch(() => {});
    setShowDonors(true);
    if (donorsHideTimer.current) clearTimeout(donorsHideTimer.current);
    donorsHideTimer.current = setTimeout(() => setShowDonors(false), 8000);
  }, [giftTicker, liveId]);
  useEffect(() => () => { if (donorsHideTimer.current) clearTimeout(donorsHideTimer.current); }, []);

  const hostId   = live?.user_id ?? '';
  const hostName = live?.user?.display_name ?? live?.user?.username ?? 'Host';

  // Destinataire actuel de la barre de cadeaux — l'hôte par défaut, mais tapoter
  // un participant monté sur scène le cible spécifiquement à la place.
  const [giftReceiver, setGiftReceiver] = useState<{ id: string; name: string } | null>(null);
  const effectiveGiftReceiver = giftReceiver ?? { id: hostId, name: hostName };

  // Monter sur scène : activer cam + micro
  const goOnStage = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(true);
      await localParticipant.setMicrophoneEnabled(true);
      setCamOn(true); setMicOn(true);
      setOnStage(true);
    } catch {}
  }, [localParticipant]);

  // Descendre de scène : couper cam + micro. notifyServer=true uniquement pour une
  // descente volontaire (clic utilisateur) — quand on réagit à l'événement WS
  // "live_guest_demoted" (le serveur nous informe qu'on a déjà été redescendu),
  // notifyServer doit être false, sinon on rappelle l'API demote, qui refait
  // diffuser le même événement WS, qui redéclenche cet appel : boucle infinie.
  const leaveStage = useCallback(async (notifyServer: boolean = true) => {
    try {
      await localParticipant.setCameraEnabled(false);
      await localParticipant.setMicrophoneEnabled(false);
      setCamOn(false); setMicOn(false);
      setOnStage(false); setHandRaised(false);
    } catch {}
    if (notifyServer) {
      try { await apiClient.post(Endpoints.lives.demote(liveId, myIdentity)); } catch {}
    }
  }, [localParticipant, liveId, myIdentity]);

  // Exposer les fonctions au parent via les refs
  useEffect(() => {
    goOnStageRef.current  = goOnStage;
    leaveStageRef.current = leaveStage;
  }, [goOnStage, leaveStage, goOnStageRef, leaveStageRef]);

  // Le host est publisher dès le début — marquer comme sur scène
  useEffect(() => {
    if (isHost) { setOnStage(true); setCamOn(true); setMicOn(true); }
  }, [isHost]);

  // Couper la caméra en background pour éviter le crash Android
  useEffect(() => {
    if (!onStage) return;
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        localParticipant.setCameraEnabled(false).catch(() => {});
      } else if (next === 'active') {
        localParticipant.setCameraEnabled(true).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [onStage, localParticipant]);

  const toggleCam = useCallback(async () => {
    if (!onStage) return;
    try { await localParticipant.setCameraEnabled(!camOn); setCamOn(v => !v); } catch {}
  }, [camOn, onStage, localParticipant]);

  const toggleMic = useCallback(async () => {
    if (!onStage) return;
    try { await localParticipant.setMicrophoneEnabled(!micOn); setMicOn(v => !v); } catch {}
  }, [micOn, onStage, localParticipant]);

  const doRaiseHand = useCallback(async () => {
    setHandRaised(true);
    try {
      await apiClient.post(Endpoints.lives.handRaise(liveId, myIdentity));
    } catch {
      setHandRaised(false);
    }
  }, [liveId, myIdentity]);

  const handleHandRaise = useCallback(async () => {
    if (handRaised || checkingStage) return;
    setCheckingStage(true);
    let current = live;
    try { current = await liveService.getById(liveId); } catch {}
    setCheckingStage(false);
    if (current?.stage_monetized) {
      setFreshLiveForGate(current);
      setShowStageGate(true);
      return;
    }
    await doRaiseHand();
  }, [handRaised, checkingStage, live, liveId, doRaiseHand]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── VIDÉO PLEIN ÉCRAN ──────────────────────────────────────────── */}
      <MultiVideoView
        hostName={hostName}
        hostAvatarUrl={live?.user?.avatar_url}
        myAvatarUrl={myAvatarUrl}
        myName={myName}
        onStage={onStage}
        onGift={(id, name) => setGiftReceiver({ id, name })}
        onTap={() => likeRef.current?.trigger()}
      />

      {/* Zone tap coeur */}
      <TouchableWithoutFeedback onPress={() => likeRef.current?.trigger()}>
        <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} />
      </TouchableWithoutFeedback>

      {/* Floaters réactions */}
      <ReactionFloaters floaters={floaters} />

      {/* Coeurs montants bas-droite, style TikTok — ancrage independant du compteur */}
      <LiveHeartsOverlay ref={heartsOverlayRef} />

      {/* ── GRADIENTS PREMIUM ─────────────────────────────────────────── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.3)', 'transparent']}
        style={st.gradTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(10,4,20,0.55)', 'rgba(10,4,20,0.92)']}
        style={st.gradBottom}
        pointerEvents="none"
      />

      {/* ── HEADER PREMIUM ────────────────────────────────────────────── */}
      <View style={st.header}>
        {/* Bouton retour */}
        <BackButton onPress={onLeave} transparent />

        {/* Host info : avatar (point live pulsant) + nom + timer en dessous */}
        <View style={st.hostInfo}>
          <View style={st.hostAvatarWrap}>
            {live?.user?.avatar_url
              ? <Image source={{ uri: live.user.avatar_url }} style={st.hostAvatar} />
              : <Av name={hostName} size={30} color="#F0365A" />
            }
            <PulsingLiveDot />
          </View>
          <View style={st.hostMeta}>
            <Text style={st.hostName} numberOfLines={1}>{hostName}</Text>
            <View style={st.hostTimerRow}>
              <Text style={st.liveTagText}>LIVE</Text>
              <Text style={st.timerText}>{fmt(elapsed)}</Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Participants — avatars des 3 derniers + total, tap = liste complète */}
        <TouchableOpacity style={st.participantsPill} onPress={() => setShowParticipants(true)} activeOpacity={0.75}>
          <View style={st.participantsStack}>
            {roomParticipants.slice(-3).map((p, i) => (
              <View key={p.identity} style={[st.participantAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}>
                <Text style={st.participantAvatarText}>{(p.name || p.identity || '?')[0].toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <Text style={st.viewerCount}>{viewerCount}</Text>
        </TouchableOpacity>

        {/* Coeur — compact : nombre à gauche, icône à droite */}
        <View style={st.likeWrap}>
          <LiveLikeButton ref={likeRef} total={likeCount} onLike={onLike} compact />
        </View>

        {/* Menu "..." — regroupe Suivre/Paramètres/Partager/Signaler/Quitter/Terminer */}
        <TouchableOpacity
          style={st.settingsBtn}
          onPress={() => setShowMoreMenu(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isHost && handRequests.length > 0 && (
            <View style={st.settingsBadge}>
              <Text style={st.settingsBadgeText}>{handRequests.length}</Text>
            </View>
          )}
          <View style={st.settingsBtnCircle}>
            <Icon name="more-vertical" size={17} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Pills secondaires (privé / payant) — sous le header pour ne pas l'encombrer */}
      {(live?.is_private || live?.is_monetized) && (
        <View style={st.subPillsRow} pointerEvents="none">
          {live?.is_private && (
            <View style={st.privatePill}>
              <MCIcon name="lock" size={8} color="#fff" />
              <Text style={st.privateText}>Privé</Text>
            </View>
          )}
          {live?.is_monetized && (
            <View style={st.monetPill}>
              <Text style={st.monetPillText}>🔒 Payant</Text>
            </View>
          )}
        </View>
      )}

      <LiveParticipantsModal
        visible={showParticipants}
        onClose={() => setShowParticipants(false)}
        participants={roomParticipants.map(p => ({
          identity:  p.identity,
          name:      p.name || p.identity,
          avatarUrl: participantAvatarUrl(p.metadata),
          isHost:    p.identity === hostId || (isHost && p.isLocal),
        }))}
      />

      {/* ── BADGE SUR SCÈNE ───────────────────────────────────────────── */}
      {onStage && !isHost && (
        <Animated.View entering={SlideInUp.duration(350)} exiting={SlideOutDown.duration(250)} style={st.onStageBadge}>
          <LinearGradient colors={['#3FEDB6', '#22d3a5']} style={st.onStagePill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View style={st.onStageDot} />
            <Text style={st.onStageText}>Tu es sur scène</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* ── GIFT TICKER ───────────────────────────────────────────────── */}
      {giftTicker.length > 0 && (
        <View style={gt.container} pointerEvents="none">
          {giftTicker.map(t => (
            <Animated.View key={t.id} entering={FadeIn.duration(250)} exiting={FadeOut.duration(400)} style={gt.row}>
              <LinearGradient colors={['rgba(155,101,245,0.85)', 'rgba(240,54,90,0.85)']} style={gt.pill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={gt.emoji}>{t.emoji}</Text>
                <View style={gt.info}>
                  <Text style={gt.sender} numberOfLines={1}>{t.senderName}</Text>
                  <Text style={gt.detail}>{t.giftName} · {t.GoGold} GoGold</Text>
                </View>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>
      )}

      {/* ── MVP — top donateurs du live, cartes + avatars en cascade ──────
          Même système que le battle (BattleScreen.tsx) : visible tant que des
          cadeaux arrivent, se masque après 8s sans nouveau cadeau. ──────── */}
      {showDonors && (ranking?.top_donors?.length ?? 0) > 0 && (
        <View style={gt.donorsCards} pointerEvents="none">
          {(ranking?.top_donors ?? []).slice(0, 3).map(d => (
            <View key={d.id} style={gt.donorCard}>
              {d.avatar_url
                ? <Image source={{ uri: d.avatar_url }} style={gt.donorCardAvatar} />
                : <Av name={d.display_name} size={28} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={gt.donorCardName} numberOfLines={1}>{d.display_name}</Text>
                <Text style={gt.donorCardGift} numberOfLines={1}>a envoyé {d.last_gift_name ?? 'un cadeau'}</Text>
              </View>
              {!!d.last_gift_emoji && <Text style={gt.donorCardEmoji}>{d.last_gift_emoji}</Text>}
              <Text style={gt.donorCardCount}>×{d.gifts_count}</Text>
            </View>
          ))}
        </View>
      )}

      {(ranking?.top_donors?.length ?? 0) > 0 && (
        <View style={gt.mvpRow} pointerEvents="none">
          {(ranking?.top_donors ?? []).slice(0, 3).map((d, i) => (
            d.avatar_url
              ? <Image key={d.id} source={{ uri: d.avatar_url }} style={[gt.mvpAvatar, i > 0 && { marginLeft: -8 }]} />
              : <View key={d.id} style={[gt.mvpAvatarFallback, i > 0 && { marginLeft: -8 }]}><Av name={d.display_name} size={26} /></View>
          ))}
          <View style={gt.mvpBadge}><Text style={gt.mvpBadgeText}>MVP</Text></View>
        </View>
      )}

      {/* ── ZONE CHAT + BARRE ACTIONS ─────────────────────────────────── */}
      <View style={[st.bottomZone, { paddingBottom: (Platform.OS === 'ios' ? 28 : 14) + insets.bottom }]}>

        {/* Chat flottant */}
        <View style={st.chatZone}>
          <FlatList
            ref={chatRef}
            onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => {
              if (item.isJoin || item.isSys) {
                return (
                  <Animated.View entering={FadeIn.duration(250)} style={st.sysRow}>
                    <Text style={st.sysText}>{item.text}</Text>
                  </Animated.View>
                );
              }
              const isMine      = item.isLocal === true || (!!myIdentity && item.userId === myIdentity);
              const canModerate = isHost && !!item.userId && item.userId !== myIdentity;
              return (
                <Animated.View entering={FadeIn.duration(180)} style={st.chatRow}>
                  {item.avatar
                    ? <Image source={{ uri: item.avatar }} style={st.chatAvatar} />
                    : <Av name={item.user} size={26} color="#9B65F5" />
                  }
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={st.chatBubble}
                      activeOpacity={(isMine || canModerate) ? 0.75 : 1}
                      onLongPress={() => {
                        if (isMine) {
                          showConfirm('Mon message', item.text, [
                            { text: 'Annuler', style: 'cancel' },
                            { text: 'Modifier', onPress: () => { setEditTarget({ id: item.id, text: item.text }); setChatInput(item.text); setShowInput(true); } },
                            { text: 'Supprimer', style: 'destructive', onPress: () => onDeleteMsg(item.id) },
                          ]);
                        }
                      }}
                      delayLongPress={400}
                    >
                      <Text style={[st.chatUser, isMine && { color: '#3FEDB6' }]}>{item.user} </Text>
                      <Text style={st.chatText}>{item.text}{item.edited ? ' ✏' : ''}</Text>
                    </TouchableOpacity>
                    {canModerate && (
                      <View style={st.modRow}>
                        <TouchableOpacity style={st.modBtn} onPress={() => onDeleteMsg(item.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Icon name="trash-2" size={10} color="#F0365A" />
                          <Text style={st.modBtnText}>Supp.</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.modBtn} onPress={() => onDemoteUser(item.userId!, item.user)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Icon name="arrow-down-circle" size={10} color="#FFD700" />
                          <Text style={[st.modBtnText, { color: '#FFD700' }]}>Desc.</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.modBtn} onPress={() => onBanUser(item.userId!, item.user)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Icon name="slash" size={10} color="#F0365A" />
                          <Text style={st.modBtnText}>Ban</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </Animated.View>
              );
            }}
            style={st.chatList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 6 }}
          />
        </View>

        {/* Rangée cadeaux — toujours visible, un tap envoie immédiatement.
            Cible l'hôte par défaut, ou le participant sur scène tapoté. */}
        {effectiveGiftReceiver.id !== hostId && (
          <View style={st.giftTargetPill}>
            <Text style={st.giftTargetText} numberOfLines={1}>Pour {effectiveGiftReceiver.name}</Text>
            <TouchableOpacity onPress={() => setGiftReceiver(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Icon name="x" size={12} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        )}
        <LiveGiftBar liveId={liveId} receiverId={effectiveGiftReceiver.id} onGiftSent={(emoji) => giftRef.current?.notifySent(emoji)} />

        {/* ── BARRE D'ACTIONS ───────────────────────────────────────── */}
        <View style={st.actionBar}>
          {/* Input / placeholder — emoji intégré à l'intérieur */}
          <View style={st.inputWrap}>
            {showInput ? (
              <>
                {editTarget && (
                  <TouchableOpacity onPress={() => { setEditTarget(null); setChatInput(''); setShowInput(false); }} style={st.editCancelBtn}>
                    <Icon name="x" size={12} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                )}
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder={editTarget ? 'Modifier...' : 'Envoyer un message...'}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={st.chatField}
                  onSubmitEditing={() => {
                    if (editTarget) { onEditMsg(editTarget.id, chatInput.trim()); setEditTarget(null); setChatInput(''); setShowInput(false); }
                    else { onSend(); setShowInput(false); }
                  }}
                  returnKeyType="send"
                  autoFocus
                  onBlur={() => { if (!chatInput.trim()) { setShowInput(false); setEditTarget(null); } }}
                />
                <View style={[st.inputEmojiWrap, { zIndex: 30, overflow: 'visible' }]}>
                  <LiveReactionPicker onReact={(emoji) => { spawn(emoji); onReact(emoji); }} compact />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (editTarget) { onEditMsg(editTarget.id, chatInput.trim()); setEditTarget(null); setChatInput(''); setShowInput(false); }
                    else { onSend(); setShowInput(false); }
                  }}
                  style={[st.sendBtn, editTarget && { backgroundColor: '#3FEDB6' }]}
                  disabled={sending || !chatInput.trim()}
                >
                  <Icon name={editTarget ? 'check' : 'send'} size={13} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={st.chatPlaceholder} onPress={() => setShowInput(true)} activeOpacity={0.8}>
                  <Icon name="message-circle" size={14} color="rgba(255,255,255,0.5)" />
                  <Text style={st.chatPlaceholderText}>Message...</Text>
                </TouchableOpacity>
                <View style={[st.inputEmojiWrap, { zIndex: 30, overflow: 'visible' }]}>
                  <LiveReactionPicker onReact={(emoji) => { spawn(emoji); onReact(emoji); }} compact />
                </View>
              </>
            )}
          </View>

          {/* Contrôles scène */}
          {onStage ? (
            <>
              {!isHost && <LeaveStageBtn onPress={() => setShowStageMenu(true)} />}
            </>
          ) : (
            !isHost && (
              <TouchableOpacity style={st.actionIconWrap} onPress={handleHandRaise} activeOpacity={0.8} disabled={checkingStage}>
                <View style={[st.actionIconCircle, handRaised && { backgroundColor: 'rgba(255,215,0,0.2)', borderColor: '#FFD700' }]}>
                  {checkingStage
                    ? <ActivityIndicator size="small" color="#FFD700" />
                    : <Text style={{ fontSize: 14 }}>{handRaised ? '✋' : '🖐️'}</Text>
                  }
                </View>
              </TouchableOpacity>
            )
          )}

        </View>
      </View>

      {/* ── MENU SCÈNE ───────────────────────────────────────────────── */}
      <Modal
        visible={showStageMenu}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setShowStageMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowStageMenu(false)}>
          <View style={sm.backdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[sm.sheet, { paddingBottom: (Platform.OS === 'ios' ? 40 : 24) + insets.bottom }]}>
                <View style={sm.handle} />
                <Text style={sm.title}>Sur scène</Text>

                <TouchableOpacity style={sm.row} onPress={() => { toggleMic(); setShowStageMenu(false); }} activeOpacity={0.75}>
                  <View style={[sm.iconWrap, !micOn && sm.iconWrapRed]}>
                    <Icon name={micOn ? 'mic' : 'mic-off'} size={20} color={micOn ? '#3FEDB6' : '#F0365A'} />
                  </View>
                  <Text style={sm.rowText}>{micOn ? 'Couper le micro' : 'Activer le micro'}</Text>
                  <View style={[sm.dot, { backgroundColor: micOn ? '#3FEDB6' : '#F0365A' }]} />
                </TouchableOpacity>

                <TouchableOpacity style={sm.row} onPress={() => { toggleCam(); setShowStageMenu(false); }} activeOpacity={0.75}>
                  <View style={[sm.iconWrap, !camOn && sm.iconWrapRed]}>
                    <Icon name={camOn ? 'video' : 'video-off'} size={20} color={camOn ? '#3FEDB6' : '#F0365A'} />
                  </View>
                  <Text style={sm.rowText}>{camOn ? 'Couper la caméra' : 'Activer la caméra'}</Text>
                  <View style={[sm.dot, { backgroundColor: camOn ? '#3FEDB6' : '#F0365A' }]} />
                </TouchableOpacity>

                <View style={sm.separator} />

                <TouchableOpacity style={sm.row} onPress={() => { setShowStageMenu(false); leaveStage(); }} activeOpacity={0.75}>
                  <View style={[sm.iconWrap, sm.iconWrapRed]}>
                    <Icon name="arrow-down" size={20} color="#F0365A" />
                  </View>
                  <Text style={[sm.rowText, { color: '#F0365A' }]}>Descendre de scène</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── GATE scène monétisée ────────────────────────────────────── */}
      {showStageGate && (freshLiveForGate ?? live) != null && (
        <StageAccessSheet
          live={(freshLiveForGate ?? live)!}
          liveId={liveId}
          identity={myIdentity}
          onRequested={() => { setShowStageGate(false); setFreshLiveForGate(null); setHandRaised(true); }}
          onClose={() => { setShowStageGate(false); setFreshLiveForGate(null); }}
        />
      )}

      <LiveGiftOverlay
        ref={giftRef}
        liveId={liveId}
        incomingNotifs={giftNotifs}
        onNotifShown={onGiftNotifShown}
      />

      {isHost && (
        <LiveSettingsSheet
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          live={live}
          liveId={liveId}
          camOn={camOn}
          micOn={micOn}
          onToggleCam={toggleCam}
          onToggleMic={toggleMic}
          handRequests={handRequests}
          onInvite={async (identity) => {
            try { await apiClient.post(Endpoints.lives.invite(liveId, identity)); }
            catch {}
            onHandDismiss(identity);
          }}
          onDismissHand={onHandDismiss}
          onStopLive={onStopLive}
          onMonetizationUpdated={onLiveUpdated}
        />
      )}

      <LiveMoreMenu
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        isHost={isHost}
        liveId={liveId}
        hostId={hostId}
        hostName={hostName}
        onOpenSettings={() => setShowSettings(true)}
        onStopLive={onStopLive}
        onLeave={onLeave}
      />
    </KeyboardAvoidingView>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveViewerScreen: React.FC = () => {
  useKeepAwake();
  const nav   = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { liveId } = route.params;

  useEffect(() => { configureLiveAudioSession(); }, []);

  const [live,        setLive]        = useState<LiveStream | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [token,       setToken]       = useState<string | null>(null);
  const [wsUrl,       setWsUrl]       = useState<string | null>(null);
  const [ended,       setEnded]       = useState(false);
  const [kicked,      setKicked]      = useState<'kicked' | 'banned' | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
  const localMsgSeq = useRef(0);
  const [chatInput,   setChatInput]   = useState('');
  const [sending,     setSending]     = useState(false);
  const [giftNotifs,  setGiftNotifs]  = useState<GiftNotif[]>([]);
  const [giftTicker,  setGiftTicker]  = useState<GiftTick[]>([]);
  const [giftHistory, setGiftHistory] = useState<GiftTick[]>([]);
  const [likeCount,   setLikeCount]   = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  // identity LiveKit du viewer (= userId stocké)
  const [myIdentity,  setMyIdentity]  = useState('');
  // Accès monétisé
  const [accessGranted,  setAccessGranted]  = useState(false);
  const [accessChecking, setAccessChecking] = useState(false);
  // Demandes de scène (mains levées) — host uniquement
  const [handRequests,   setHandRequests]   = useState<HandRequest[]>([]);

  const chatRef      = useRef<FlatList>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const elapsedRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const likeThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLikes = useRef(0);
  // Refs vers les fonctions de RoomContent pour réagir aux WS
  const goOnStageRef      = useRef<(() => void) | null>(null);
  const leaveStageRef     = useRef<((notifyServer?: boolean) => void) | null>(null);
  // Ref vers le bouton coeur pour déclencher l'animation depuis le WS
  const remoteLikeRef     = useRef<import('../../components/live/LiveLikeButton').LiveLikeButtonRef | null>(null);
  // Coeurs montants bas-droite (effet TikTok), independants du compteur en haut
  const heartsOverlayRef  = useRef<import('../../components/live/LiveHeartsOverlay').LiveHeartsOverlayRef | null>(null);
  const reactionSpawnRef  = useRef<((emoji: string) => void) | null>(null);
  const reactionThrottle  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { currentUser } = useUser();
  const { lastLiveEnded, lastLiveViewersUpdated } = useWs();

  const addSysMsg = useCallback((text: string) => {
    const id = `sys-${Date.now()}`;
    setMessages(prev => [...prev.slice(-149), { id, user: '', text, isSys: true }]);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
    setTimeout(() => setMessages(prev => prev.filter(m => m.id !== id)), 4000);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const l = await liveService.getById(liveId);
        setLive(l);
        liveService.recordView(liveId);
        if (l.status !== 'active') { setEnded(true); setLoading(false); return; }
        setViewerCount(l.current_viewers + 1);
        setLikeCount(l.like_count ?? 0);

        // Historique des commentaires — sans ça, quitter puis revenir sur le live
        // repartait d'un chat vide (le WS ne livre que les nouveaux messages après
        // connexion, jamais l'existant).
        try {
          const res = await apiClient.get<any[]>(`${Endpoints.social.comments}?live_id=${liveId}&limit=50`);
          const history = (res.data ?? []).slice().reverse().map((c: any) => ({
            id:     c.id,
            user:   c.author?.display_name ?? c.author?.username ?? 'Anonyme',
            userId: c.author?.id ? String(c.author.id) : undefined,
            avatar: c.author?.avatar_url ?? null,
            text:   c.body ?? '',
          }));
          if (history.length) setMessages(prev => [...history, ...prev]);
        } catch { /* pas bloquant — le live reste utilisable sans historique */ }

        // Le host de ce live est peut-etre deja en plein battle (rejoint apres le debut
        // du match, donc apres l'emission de l'evenement WS "battle_started" — sans ce
        // check, ce viewer resterait bloque sur le live simple sans jamais voir le match).
        const activeBattle = await battleService.getActiveForLive(liveId).catch(() => null);
        if (activeBattle && activeBattle.status === 'active') {
          nav.replace('BattleScreen', { battleId: activeBattle.id, followedHostId: l.user_id });
          return;
        }

        // Si le live est monétisé, vérifier si l'utilisateur a déjà l'accès
        if (l.is_monetized) {
          try {
            const access = await liveService.checkAccess(liveId);
            if (access.has_access) setAccessGranted(true);
          } catch { /* accès non accordé — afficher le verrou */ }
          setLoading(false);
          return; // ne pas charger le token LiveKit encore
        }

        const t = await liveService.getToken(liveId);
        setToken(t.token);
        setWsUrl(t.livekit_url);

        const storedUserId = storage.getItem(STORAGE_KEYS.LAST_USER_ID);
        if (storedUserId) setMyIdentity(storedUserId);

        const startMs = new Date(l.started_at).getTime();
        elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 1000);
      } catch {}
      setLoading(false);
    })();
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [liveId]);

  // Charger le token LiveKit dès que l'accès est accordé (live monétisé)
  useEffect(() => {
    if (!accessGranted) return;
    // token déjà chargé (ex: accès déjà accordé au chargement initial)
    if (token) return;
    (async () => {
      try {
        const t = await liveService.getToken(liveId);
        setToken(t.token);
        setWsUrl(t.livekit_url);
        const storedUserId = storage.getItem(STORAGE_KEYS.LAST_USER_ID);
        if (storedUserId) setMyIdentity(storedUserId);
        // live peut ne pas être encore dans le state — on le recharge si besoin
        const currentLive = live ?? await liveService.getById(liveId);
        const startMs = new Date(currentLive.started_at).getTime();
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 1000);
      } catch {}
    })();
  }, [accessGranted]);

  useEffect(() => {
    if (lastLiveEnded === liveId) { setEnded(true); setToken(null); }
  }, [lastLiveEnded, liveId]);

  useEffect(() => {
    if (lastLiveViewersUpdated?.live_id === liveId) {
      setViewerCount(lastLiveViewersUpdated.current_viewers);
    }
  }, [lastLiveViewersUpdated, liveId]);

  // WS chat (commentaires, cadeaux, likes)
  useEffect(() => {
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken || !token) return;
    let ws: WebSocket;
    try {
      ws = openAuthenticatedWs(`${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}`, accessToken);
    } catch { return; }
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);

        if (d.type === 'comment_added' && d.comment && String(d.comment.body ?? '').trim()) {
          const c = d.comment;
          const incomingText   = c.body;
          const incomingUserId = c.author?.id ? String(c.author.id) : undefined;
          setMessages(prev => {
            // Remplacer le message local optimiste correspondant (même texte + même auteur)
            const localIdx = prev.findIndex(
              m => m.isLocal && m.text === incomingText && m.userId === incomingUserId,
            );
            if (localIdx !== -1) {
              // Garder l'id local pour ne pas changer la key React (évite un remount + re-fade visuel)
              const updated = [...prev];
              updated[localIdx] = { ...updated[localIdx], isLocal: false };
              return updated;
            }
            const newMsg = {
              id:     c.id ?? String(Date.now()),
              user:   c.author?.display_name ?? c.author?.username ?? 'Anonyme',
              userId: incomingUserId,
              avatar: c.author?.avatar_url ?? null,
              text:   incomingText,
            };
            return [...prev.slice(-149), newMsg];
          });
          setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
        }

        if (d.type === 'comment_deleted') {
          const deletedId = d.comment_id ?? d.id;
          if (deletedId) setMessages(prev => prev.filter(m => m.id !== deletedId));
        }

        if (d.type === 'gift_received' && d.gift) {
          const gf         = d.gift;
          const senderName = gf.sender?.display_name ?? gf.sender?.username ?? 'Quelqu\'un';
          const tick: GiftTick = {
            id:         gf.id ?? String(Date.now()),
            senderName,
            emoji:      gf.gift_type?.emoji ?? '🎁',
            giftName:   gf.gift_type?.name  ?? 'Cadeau',
            GoGold:      gf.gogold_spent ?? 0,
          };
          setGiftNotifs(prev => [...prev, {
            id: tick.id, senderName,
            emoji: tick.emoji, giftName: tick.giftName, GoGold: tick.GoGold,
          }]);
          setGiftTicker(prev => [...prev.slice(-2), tick]);
          setGiftHistory(prev => [tick, ...prev.slice(0, 49)]);
          setTimeout(() => setGiftTicker(prev => prev.filter(t => t.id !== tick.id)), 5000);
        }

        if (d.type === 'like_added') {
          const count = d.count ?? 1;
          const isOwnEcho = d.from_user_id && myIdentity && d.from_user_id === myIdentity;
          // total = source de vérité serveur — toujours s'aligner dessus plutôt que
          // d'accumuler des deltas locaux (avant : chaque client repartait de 0 et
          // divergeait selon qui recevait quels messages WS).
          if (typeof d.total === 'number') {
            setLikeCount(d.total);
          } else if (!isOwnEcho) {
            setLikeCount(c => c + count);
          }
          if (!isOwnEcho) {
            remoteLikeRef.current?.triggerRemote();
            heartsOverlayRef.current?.spawn(count);
          }
        }

        if (d.type === 'reaction_added' && d.emoji) {
          for (let i = 0; i < Math.min(d.count ?? 1, 3); i++) {
            setTimeout(() => reactionSpawnRef.current?.(d.emoji), i * 150);
          }
        }

        // Demande de montée sur scène (main levée) — visible côté host
        if (d.type === 'live_hand_raise' && d.live_id === liveId) {
          setHandRequests(prev => {
            if (prev.find(r => r.identity === d.identity)) return prev;
            return [...prev, { identity: d.identity, name: d.display_name ?? d.identity, avatar: d.avatar_url ?? null }];
          });
        }

        if (d.type === 'live_guest_invited' && d.live_id === liveId) {
          setHandRequests(prev => prev.filter(r => r.identity !== d.identity));
          if (d.identity === myIdentity) {
            addSysMsg('Le host t\'a invité à monter sur scène !');
            goOnStageRef.current?.();
          }
        }

        if (d.type === 'live_guest_demoted' && d.live_id === liveId) {
          setHandRequests(prev => prev.filter(r => r.identity !== d.identity));
          if (d.identity === myIdentity) {
            addSysMsg('Tu as été redescendu de scène.');
            // notifyServer=false : cet événement VIENT du serveur (host qui nous a
            // redescendu, ou notre propre demote déjà envoyé) — le renvoyer créerait
            // une boucle infinie de POST demote / diffusion WS.
            leaveStageRef.current?.(false);
          }
        }

        // Kick temporaire du live — ciblé par identity (= userId)
        if (
          d.type === 'viewer_kicked' &&
          d.live_id === liveId &&
          d.identity === myIdentity
        ) {
          setKicked('kicked');
          setEnded(true);
          setToken(null);
          try { ws.close(); } catch {}
        }

        // Ban global — ciblé par identity (= userId)
        if (
          d.type === 'live_user_globally_banned' &&
          d.live_id === liveId &&
          d.identity === myIdentity
        ) {
          setKicked('banned');
          setEnded(true);
          setToken(null);
          try { ws.close(); } catch {}
        }

        // Battle : le host de ce live vient d'accepter/demarrer un battle — les viewers
        // basculent aussi vers l'ecran de battle en split-screen (comme les deux hosts).
        if (d.type === 'battle_started' && d.battle_id) {
          // replace (pas navigate) : sinon ce live reste monte en dessous avec son propre
          // LiveKitRoom connecte en parallele de celui du battle, ce qui peut empecher les
          // tracks video du battle de s'afficher correctement.
          // followedHostId : permet a BattleScreen de couper l'audio du camp adverse pour
          // ce viewer, qui ne suivait que ce host avant le debut du match.
          nav.replace('BattleScreen', { battleId: d.battle_id, followedHostId: live?.user_id });
        }
      } catch {}
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); try { ws.close(); } catch {} };
  }, [liveId, token, addSysMsg]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    setSending(true);
    // Affichage local immédiat
    setMessages(prev => [...prev.slice(-149), {
      id:      `local-${Date.now()}-${localMsgSeq.current++}`,
      user:    currentUser?.display_name ?? currentUser?.username ?? 'Moi',
      userId:  currentUser?.id ? String(currentUser.id) : undefined,
      avatar:  currentUser?.avatar_url ?? null,
      text,
      isLocal: true,
    }]);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
    try { await apiClient.post(Endpoints.social.comments, { body: text, live_id: liveId }); }
    catch {}
    finally { setSending(false); }
  }, [chatInput, sending, liveId, currentUser]);

  const handleLeave = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    nav.goBack();
  }, [nav]);

  const handleDeleteMsg = useCallback(async (id: string) => {
    // Suppression optimiste locale immédiate
    setMessages(prev => prev.filter(m => m.id !== id));
    // Suppression persistante côté serveur (les autres viewers reçoivent comment_deleted via WS)
    try { await apiClient.delete(Endpoints.social.commentById(id)); } catch {}
  }, []);

  const handleEditMsg = useCallback((id: string, newText: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text: newText, edited: true } : m));
  }, []);

  const isHost = !!live && !!currentUser && String(live.user_id) === String(currentUser.id);

  const handleBanUser = useCallback((identity: string, name: string) => {
    showConfirm(name, 'Choisir une action de bannissement', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Exclure du live',
        onPress: async () => {
          try { await apiClient.post(Endpoints.lives.ban(liveId, identity)); }
          catch { toastService.error('Erreur', 'Impossible d\'exclure ce participant.'); }
        },
      },
      {
        text: 'Bannir de tous mes lives', style: 'destructive',
        onPress: () => {
          showConfirm(
            'Bannir de tous les lives',
            `${name} ne pourra plus rejoindre aucun de tes lives.`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Confirmer', style: 'destructive',
                onPress: async () => {
                  try { await apiClient.post(Endpoints.lives.globalBan(liveId, identity)); }
                  catch { toastService.error('Erreur', 'Impossible de bannir cet utilisateur.'); }
                },
              },
            ]
          );
        },
      },
    ]);
  }, [liveId]);

  const handleDemoteUser = useCallback(async (identity: string, _name: string) => {
    try {
      await apiClient.post(Endpoints.lives.demote(liveId, identity));
    } catch {
      toastService.error('Erreur', 'Impossible de faire descendre ce participant.');
    }
  }, [liveId]);

  const handleLike = useCallback(() => {
    pendingLikes.current += 1;
    setLikeCount(c => c + 1);
    heartsOverlayRef.current?.spawn(1);
    if (likeThrottle.current) return;
    likeThrottle.current = setTimeout(async () => {
      const batch = pendingLikes.current;
      pendingLikes.current = 0;
      likeThrottle.current = null;
      try { await apiClient.post(Endpoints.lives.like(liveId), { count: batch }); }
      catch {}
    }, 500);
  }, [liveId]);

  const handleHandDismiss = useCallback((identity: string) => {
    setHandRequests(prev => prev.filter(r => r.identity !== identity));
  }, []);

  const handleLiveUpdated = useCallback((patch: Partial<LiveStream>) => {
    setLive(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const handleStopLive = useCallback(async () => {
    try { await liveService.stopLive(liveId); } catch {}
    handleLeave();
  }, [liveId, handleLeave]);

  const handleReact = useCallback((emoji: string) => {
    if (reactionThrottle.current) return;
    reactionThrottle.current = setTimeout(() => { reactionThrottle.current = null; }, 500);
    try { apiClient.post(Endpoints.lives.react(liveId), { emoji }); }
    catch {}
  }, [liveId]);

  if (loading) {
    return <View style={[st.root, st.center]}><GoFolyXLoader variant="reel" color="#F0365A" /></View>;
  }

  if (ended) {
    const isKicked = kicked === 'kicked';
    const isBanned = kicked === 'banned';
    return (
      <View style={[st.root, st.center]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={st.endedCard}>
          <Icon
            name={isBanned ? 'slash' : isKicked ? 'user-x' : 'radio'}
            size={44}
            color={isBanned || isKicked ? '#F0365A' : 'rgba(255,255,255,0.3)'}
          />
          <Text style={st.endedTitle}>
            {isBanned
              ? 'Tu as été banni'
              : isKicked
              ? 'Tu as été exclu du live'
              : 'Live terminé'}
          </Text>
          <Text style={st.endedSub}>
            {isBanned
              ? 'Le créateur t\'a interdit d\'accès à ses lives.'
              : isKicked
              ? 'Le créateur t\'a retiré de ce live.'
              : (live?.title ?? '')}
          </Text>
          <TouchableOpacity style={st.endedBtn} onPress={handleLeave}>
            <Text style={st.endedBtnText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Live monétisé sans accès encore accordé → afficher le verrou EN PREMIER
  if (live?.is_monetized && !accessGranted && !isHost) {
    return (
      <LiveAccessGate
        live={live}
        checking={accessChecking}
        onAccessGranted={() => setAccessGranted(true)}
        onLeave={handleLeave}
        setChecking={setAccessChecking}
        liveId={liveId}
      />
    );
  }

  if (!token || !wsUrl) {
    return (
      <View style={[st.root, st.center]}>
        <GoFolyXLoader variant="reel" color="#F0365A" />
        <Text style={st.connectText}>Connexion...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect options={VIEWER_ROOM_OPTIONS}>
      <RoomContent
        live={live}
        liveId={liveId}
        myIdentity={myIdentity}
        myName={currentUser?.display_name ?? currentUser?.username ?? 'Toi'}
        myAvatarUrl={currentUser?.avatar_url}
        isHost={isHost}
        viewerCount={viewerCount}
        messages={messages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        sending={sending}
        chatRef={chatRef}
        onSend={sendChat}
        onLeave={handleLeave}
        onBanUser={handleBanUser}
        onDemoteUser={handleDemoteUser}
        onDeleteMsg={handleDeleteMsg}
        onEditMsg={handleEditMsg}
        giftNotifs={giftNotifs}
        onGiftNotifShown={(id) => setGiftNotifs(prev => prev.filter(n => n.id !== id))}
        giftTicker={giftTicker}
        giftHistory={giftHistory}
        likeCount={likeCount}
        onLike={handleLike}
        likeRef={remoteLikeRef}
        heartsOverlayRef={heartsOverlayRef}
        reactionSpawnRef={reactionSpawnRef}
        onReact={handleReact}
        elapsed={elapsed}
        goOnStageRef={goOnStageRef}
        leaveStageRef={leaveStageRef}
        handRequests={handRequests}
        onHandDismiss={handleHandDismiss}
        onLiveUpdated={handleLiveUpdated}
        onStopLive={handleStopLive}
      />
    </LiveKitRoom>
  );
};

// ── Styles MultiVideoView ─────────────────────────────────────────────────────

const mv = StyleSheet.create({
  stageRowWrap: {
    position: 'absolute', left: 0, right: 0,
    top: Platform.OS === 'ios' ? 118 : 98,
    zIndex: 12, paddingHorizontal: 12,
  },
  noVideo:       { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111', gap: 12 },
  noVideoText:   { color: '#999', fontSize: 14 },
  noVideoBg:     { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0e0e0e', gap: 12 },
  // Fond quand caméra désactivée — style TikTok (avatar centré sur fond sombre/flou)
  noCamBg:       { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a12', gap: 14 },
  noCamAvatar:   { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#F0365A' },
  noCamName:     { color: '#fff', fontSize: 18, fontWeight: '800' },
  noCamMicRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  noCamMicText:  { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  spotlightName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  spotlightAvatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 4 },
  spotGiftBtn: {
    display: 'none',
  },
  thumbsCol: {
    position: 'absolute', top: Platform.OS === 'ios' ? 115 : 95,
    left: 92, zIndex: 15, gap: 8,
  },
  thumb: {
    width: 78, height: 116, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  thumbNoCam:  { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', flex: 1 },
  thumbGrad:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, justifyContent: 'flex-end', paddingBottom: 4 },
  thumbLabel:  { color: '#fff', fontSize: 9, textAlign: 'center', paddingHorizontal: 2 },
  thumbGiftBtn:{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
});

// ── Styles page ───────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#050010' },
  center:      { justifyContent: 'center', alignItems: 'center' },
  connectText: { color: 'rgba(255,255,255,0.5)', marginTop: 14, fontSize: 14, fontWeight: '500' },

  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 200, zIndex: 5 } as any,
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320, zIndex: 5 } as any,

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 32,
    paddingHorizontal: 10, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 20,
  },
  hostInfo:      { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 96 },
  hostAvatarWrap:{ position: 'relative' },
  hostAvatar:    { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#F0365A' },
  liveIndicator: {
    position: 'absolute', bottom: -1, right: -1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#F0365A', borderWidth: 1.5, borderColor: '#050010',
  },
  hostMeta:  { flexShrink: 1 },
  hostName:  { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  hostTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  liveTagText: { color: '#F0365A', fontWeight: '900', fontSize: 8, letterSpacing: 0.4 },
  timerText:   { color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: '600' },

  subPillsRow: {
    position: 'absolute', left: 12,
    top: Platform.OS === 'ios' ? 92 : 74,
    flexDirection: 'row', gap: 6, zIndex: 19,
  },
  privatePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(123,63,242,0.7)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  privateText: { color: '#fff', fontWeight: '700', fontSize: 9 },
  monetPill: {
    backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
  },
  monetPillText: { color: '#F59E0B', fontSize: 9, fontWeight: '700' },

  participantsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  participantsStack: { flexDirection: 'row', alignItems: 'center' },
  participantAvatar: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#050010',
  },
  participantAvatarText: { color: '#fff', fontSize: 7, fontWeight: '800' },
  viewerCount: { color: '#fff', fontSize: 10, fontWeight: '800' },
  likeWrap:    { marginLeft: 0 },

  settingsBtn:       { padding: 2, position: 'relative' },
  settingsBtnCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  settingsBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center',
    zIndex: 1, borderWidth: 1.5, borderColor: '#050010',
  },
  settingsBadgeText: { color: '#fff', fontSize: 8, fontWeight: '900' },

  // ── Badge sur scène ──────────────────────────────────────────────────────
  onStageBadge: {
    position: 'absolute', zIndex: 30,
    top: Platform.OS === 'ios' ? 116 : 96,
    alignSelf: 'center',
  },
  onStagePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
  },
  onStageDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  onStageText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  // ── Zone bas (chat + barre actions) ─────────────────────────────────────
  // paddingBottom réel appliqué inline (base + insets.bottom, voir usage)
  bottomZone: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 15,
  },
  chatZone:  { paddingHorizontal: 12, paddingRight: 10 },
  chatList:  { flexGrow: 0, maxHeight: 200, marginBottom: 10 },
  chatRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 6 },
  chatAvatar:{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(155,101,245,0.5)' },
  chatBubble: {
    paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: 230, flexDirection: 'row', flexWrap: 'wrap',
  },
  chatUser: { color: '#9B65F5', fontSize: 12, fontWeight: '800' },
  chatText: { color: 'rgba(255,255,255,0.92)', fontSize: 13 },

  sysRow:  { marginBottom: 3, alignSelf: 'flex-start' },
  sysText: { color: 'rgba(255,255,255,0.38)', fontSize: 10, fontStyle: 'italic' },

  modRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  modBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(240,54,90,0.12)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  modBtnText: { color: '#F0365A', fontSize: 9, fontWeight: '700' as const },

  // ── Cible cadeau (quand ≠ hôte) ──────────────────────────────────────────
  giftTargetPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginLeft: 12, marginBottom: 4,
    backgroundColor: 'rgba(255,215,0,0.15)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  giftTargetText: { color: '#FFD700', fontSize: 11, fontWeight: '700', maxWidth: 160 },

  // ── Barre d'actions ──────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    gap: 6, marginTop: 2,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22, paddingLeft: 14, paddingRight: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 38,
  },
  chatField: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: Platform.OS === 'ios' ? 8 : 5 },
  inputEmojiWrap: { alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  sendBtn:   {
    backgroundColor: '#F0365A', borderRadius: 17, padding: 7, margin: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  editCancelBtn: { padding: 5 },
  chatPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, paddingVertical: 8 },
  chatPlaceholderText: { color: 'rgba(255,255,255,0.38)', fontSize: 13 },

  actionIconWrap:   { alignItems: 'center', justifyContent: 'center' },
  actionIconCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  actionIconCircleRed: {
    backgroundColor: 'rgba(240,54,90,0.2)',
    borderColor: '#F0365A',
  },

  // ── Ended ────────────────────────────────────────────────────────────────
  endedCard: {
    alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 28, padding: 40, marginHorizontal: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  endedTitle:   { color: '#fff', fontSize: 22, fontWeight: '900' },
  endedSub:     { color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  endedBtn:     { marginTop: 8, backgroundColor: '#F0365A', borderRadius: 26, paddingHorizontal: 40, paddingVertical: 14 },
  endedBtnText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },
});

// ── Styles gift ticker ────────────────────────────────────────────────────────

const gt = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 130 : 115,
    left: 12, zIndex: 40, gap: 6, alignItems: 'flex-start',
  },
  row:   { maxWidth: 210 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8,
  },
  emoji:  { fontSize: 20 },
  info:   { flex: 1 },
  sender: { color: '#fff', fontSize: 11, fontWeight: '800' },
  detail: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },

  // ── MVP / top donateurs (portage du battle, BattleScreen.tsx) ──────────────────
  donorsCards: {
    position: 'absolute', left: 12, right: 90,
    bottom: Platform.OS === 'ios' ? 220 : 205,
    gap: 4, zIndex: 41,
  },
  donorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(20,16,28,0.65)', borderRadius: 14,
    paddingVertical: 5, paddingHorizontal: 7, paddingLeft: 4,
  },
  donorCardAvatar: { width: 28, height: 28, borderRadius: 14 },
  donorCardName: { color: '#fff', fontSize: 11, fontWeight: '700' },
  donorCardGift: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 1 },
  donorCardEmoji: { fontSize: 17 },
  donorCardCount: { color: '#FDE68A', fontSize: 12, fontWeight: '900' },

  mvpRow: {
    position: 'absolute', left: 12,
    bottom: Platform.OS === 'ios' ? 185 : 170,
    flexDirection: 'row', alignItems: 'center', zIndex: 41,
  },
  mvpAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#0B0812' },
  mvpAvatarFallback: { borderWidth: 2, borderColor: '#0B0812', borderRadius: 13 },
  mvpBadge: { marginLeft: 4, backgroundColor: '#FFD700', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  mvpBadgeText: { color: '#000', fontSize: 8, fontWeight: '900' },
});

// ── Styles menu scène ─────────────────────────────────────────────────────────

const sm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D0820',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(63,237,182,0.25)',
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 16,
  },
  title: {
    color: '#3FEDB6', fontSize: 13, fontWeight: '800',
    letterSpacing: 0.5, marginBottom: 14,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(63,237,182,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(63,237,182,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapRed: {
    backgroundColor: 'rgba(240,54,90,0.12)',
    borderColor: '#F0365A',
  },
  rowText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 6,
  },
});
