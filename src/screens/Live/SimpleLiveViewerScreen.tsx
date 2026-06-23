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
  ActivityIndicator, Image, Alert, AppState, AppStateStatus, Modal,
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
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
import { LiveAccessGate } from '../../components/live/LiveAccessGate';
import { LiveSettingsSheet } from '../../components/live/LiveSettingsSheet';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import { useWs } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { LiveLikeButton } from '../../components/live/LiveLikeButton';
import type { LiveLikeButtonRef } from '../../components/live/LiveLikeButton';
import { LiveReactionPicker, ReactionFloaters, useReactionFloaters } from '../../components/live/LiveReactionPicker';
import { useUser } from '../../context/UserContext';
import { BackButton } from '../../components/common';

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
  coins:      number;
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
  onOpenGift:    (receiverId: string, receiverName: string) => void;
}> = ({ live, liveId, identity, onRequested, onClose, onOpenGift }) => {
  const navigation = useNavigation<any>();
  const [myBalance,      setMyBalance]      = useState<number>(-1);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [loading,        setLoading]        = useState(false);

  const isCoins           = live.stage_type === 'coins';
  const isGift            = live.stage_type === 'gift';
  const requiredCoins     = live.stage_coins ?? 0;
  const requiredGiftName  = live.stage_gift_name ?? 'Cadeau';
  const requiredGiftEmoji = live.stage_gift_emoji ?? '🎁';
  const hostId            = live.user_id ?? '';
  const hostName          = live.user?.display_name ?? live.user?.username ?? 'le host';

  // coût effectif : pour coins → stage_coins, pour gift → coins_cost du gift_type
  const [giftCost, setGiftCost] = useState<number | null>(null);
  const effectiveCost = isCoins ? requiredCoins : (giftCost ?? 0);

  const insufficientFunds = !balanceLoading && myBalance < effectiveCost;

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const balRes = await apiClient.get(Endpoints.wallet.balance);
        setMyBalance(Number((balRes as any).data?.coins_balance ?? (balRes as any).data?.balance ?? 0));
      } catch { setMyBalance(0); }

      if (isGift && live.stage_gift_id) {
        try {
          const giftsRes = await apiClient.get(Endpoints.wallet.giftTypes);
          const list: any[] = (giftsRes as any).data?.gifts ?? (giftsRes as any).data ?? [];
          const found = list.find((g: any) => g.id === live.stage_gift_id);
          if (found) setGiftCost(Number(found.coins_cost ?? 0));
        } catch {}
      }

      setBalanceLoading(false);
    };
    fetchAll();
  }, [isCoins, isGift, live.stage_gift_id]);

  const handlePay = async () => {
    if (isGift) {
      // Pour les cadeaux : ouvrir l'overlay cadeau avec le host comme destinataire
      onClose();
      onOpenGift(hostId, hostName);
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
        Alert.alert('Solde insuffisant', msg, [
          { text: 'Pas maintenant', style: 'cancel' },
          { text: 'Recharger', onPress: () => { onClose(); navigation.navigate('Wallet'); } },
        ]);
      } else if (status === 409) {
        Alert.alert('Demande déjà envoyée', msg, [{ text: 'OK', onPress: onClose }]);
      } else if (status === 400) {
        Alert.alert('Impossible', msg);
      } else {
        Alert.alert('Erreur', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={sas.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      <Animated.View entering={SlideInDown.springify().damping(22).stiffness(200)} style={sas.sheet}>
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
          <Text style={sas.conditionEmoji}>{isCoins ? '🪙' : requiredGiftEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={sas.conditionLabel}>Condition requise</Text>
            <Text style={sas.conditionValue}>
              {isCoins ? `${requiredCoins} coins` : requiredGiftName}
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
                  {myBalance} coins
                </Text>
                {insufficientFunds && effectiveCost > 0 && (
                  <Text style={sas.balanceShort}> · manque {effectiveCost - myBalance}</Text>
                )}
              </View>
          }
        </View>

        {/* Note escrow */}
        {isCoins && requiredCoins > 0 && (
          <Text style={sas.refundNote}>
            Les coins sont réservés jusqu'à l'acceptation du host. Remboursés automatiquement si le live se termine.
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
              colors={isCoins ? ['#F59E0B', '#F97316'] : ['#F0365A', '#9B65F5']}
              style={sas.payBtnGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {loading || balanceLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Text style={{ fontSize: 18 }}>{isCoins ? '🪙' : requiredGiftEmoji}</Text>
                    <Text style={sas.payBtnText}>
                      {isCoins
                        ? `Payer ${requiredCoins} coins · Lever la main`
                        : `Envoyer ${requiredGiftName}${giftCost ? ` (${giftCost} coins)` : ''} · Lever la main`}
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
    paddingHorizontal: 22, paddingBottom: Platform.OS === 'ios' ? 46 : 28, paddingTop: 16,
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
  onGift: (id: string, name: string) => void;
  onTap:  () => void;
}> = ({ hostName, hostAvatarUrl, onGift, onTap }) => {
  const allTracks    = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const participants = useParticipants();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const localTrack      = allTracks.find(t => t.participant.isLocal) ?? null;
  const remoteTracks    = allTracks.filter(t => !t.participant.isLocal);
  const defaultSpotlight = remoteTracks[0] ?? null;
  const spotlightTrack   = remoteTracks.find(t => t.participant.identity === spotlightId) ?? defaultSpotlight;
  // Vignettes = autres remotes seulement (le local est dans le PiP)
  const thumbnailTracks  = remoteTracks.filter(t => t !== spotlightTrack);
  const localCamOn       = localTrack ? !localTrack.publication?.isMuted : false;
  const showLocalPip     = localTrack && localCamOn && spotlightTrack;

  const spotlightName  = spotlightTrack
    ? (spotlightTrack.participant.name || spotlightTrack.participant.identity)
    : '';
  const spotlightCamOn = spotlightTrack ? !spotlightTrack.publication?.isMuted : false;

  // Pas encore connecté du tout
  if (participants.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
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
        {/* Spotlight */}
        {spotlightTrack && (
          spotlightCamOn
            ? <VideoTrack trackRef={spotlightTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
            : <View style={[StyleSheet.absoluteFill, mv.noVideoBg]}>
                <Av name={spotlightName} size={96} />
                <Text style={mv.spotlightName}>{spotlightName}</Text>
              </View>
        )}

        {/* Label nom */}
        {spotlightTrack && (
          <View style={mv.spotLabel}>
            <Text style={mv.spotLabelText} numberOfLines={1}>{spotlightName}</Text>
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

        {/* PiP local "Toi" — coin bas gauche, visible seulement quand on est sur scène */}
        {showLocalPip && localTrack && (
          <View style={mv.pip} pointerEvents="none">
            <VideoTrack trackRef={localTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={mv.pipGrad}>
              <Text style={mv.pipLabel}>Toi</Text>
            </LinearGradient>
          </View>
        )}

        {/* Vignettes autres participants remotes (jamais le local) */}
        {thumbnailTracks.length > 0 && (
          <View style={mv.thumbsCol}>
            {thumbnailTracks.map(t => {
              const camOn = !t.publication?.isMuted;
              const tName = t.participant.name || t.participant.identity;
              return (
                <TouchableOpacity
                  key={t.participant.identity}
                  style={mv.thumb}
                  onPress={() => setSpotlightId(t.participant.identity)}
                  activeOpacity={0.8}
                >
                  {camOn
                    ? <VideoTrack trackRef={t} style={StyleSheet.absoluteFill} objectFit="cover" />
                    : <View style={[StyleSheet.absoluteFill, mv.thumbNoCam]}><Av name={tName} size={40} /></View>
                  }
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={mv.thumbGrad}>
                    <Text style={mv.thumbLabel} numberOfLines={1}>{tName}</Text>
                  </LinearGradient>
                  <TouchableOpacity
                    style={mv.thumbGiftBtn}
                    onPress={() => onGift(t.participant.identity, tName)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={{ fontSize: 13 }}>🎁</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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

const LeaveStageBtn: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 600 }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <TouchableOpacity style={st.actionIconWrap} onPress={onPress} activeOpacity={0.8}>
      <Animated.View style={[st.actionIconCircle, st.actionIconCircleRed, animStyle]}>
        <Icon name="arrow-down" size={18} color="#F0365A" />
      </Animated.View>
    </TouchableOpacity>
  );
};

const RoomContent: React.FC<{
  live:         LiveStream | null;
  liveId:       string;
  myIdentity:   string;
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
  reactionSpawnRef: React.RefObject<((emoji: string) => void) | null>;
  onReact:      (emoji: string) => void;
  elapsed:      number;
  goOnStageRef:  { current: (() => void) | null };
  leaveStageRef: { current: (() => void) | null };
  handRequests:  HandRequest[];
  onHandDismiss: (identity: string) => void;
  onLiveUpdated: (patch: Partial<LiveStream>) => void;
  onStopLive:    () => void;
}> = ({
  live, liveId, myIdentity, isHost, viewerCount, messages, chatInput, setChatInput,
  sending, chatRef, onSend, onLeave, onBanUser, onDemoteUser, onDeleteMsg, onEditMsg,
  giftNotifs, onGiftNotifShown, giftTicker, giftHistory, likeCount, onLike, likeRef,
  reactionSpawnRef, onReact,
  elapsed, goOnStageRef, leaveStageRef,
  handRequests, onHandDismiss, onLiveUpdated, onStopLive,
}) => {
  const { localParticipant } = useLocalParticipant();
  const { floaters, spawn }  = useReactionFloaters();

  // Exposer spawn au parent pour les réactions WS des autres
  React.useEffect(() => { reactionSpawnRef.current = spawn; }, [spawn, reactionSpawnRef]);
  const [onStage,      setOnStage]      = useState(false);
  const [camOn,        setCamOn]        = useState(false);
  const [micOn,        setMicOn]        = useState(false);
  const [handRaised,    setHandRaised]    = useState(false);
  const [checkingStage, setCheckingStage] = useState(false);
  const [showInput,     setShowInput]     = useState(false);
  const [showGifts,     setShowGifts]     = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showStageGate,    setShowStageGate]    = useState(false);
  const [showStageMenu,    setShowStageMenu]    = useState(false);
  const [freshLiveForGate, setFreshLiveForGate] = useState<LiveStream | null>(null);
  const [editTarget,    setEditTarget]    = useState<{ id: string; text: string } | null>(null);
  const giftRef = useRef<LiveGiftOverlayRef>(null);

  const hostId   = live?.user_id ?? '';
  const hostName = live?.user?.display_name ?? live?.user?.username ?? 'Host';

  // Monter sur scène : activer cam + micro
  const goOnStage = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(true);
      await localParticipant.setMicrophoneEnabled(true);
      setCamOn(true); setMicOn(true);
      setOnStage(true);
    } catch {}
  }, [localParticipant]);

  // Descendre de scène : couper cam + micro
  const leaveStage = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(false);
      await localParticipant.setMicrophoneEnabled(false);
      setCamOn(false); setMicOn(false);
      setOnStage(false); setHandRaised(false);
    } catch {}
  }, [localParticipant]);

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
        onGift={(id, name) => giftRef.current?.openGift(id, name)}
        onTap={() => likeRef.current?.trigger()}
      />

      {/* Zone tap coeur */}
      <TouchableWithoutFeedback onPress={() => likeRef.current?.trigger()}>
        <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} />
      </TouchableWithoutFeedback>

      {/* Floaters réactions */}
      <ReactionFloaters floaters={floaters} />

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

        {/* Host info */}
        <TouchableOpacity
          style={st.hostInfo}
          onPress={() => giftRef.current?.openGift(hostId, hostName)}
          activeOpacity={0.85}
        >
          <View style={st.hostAvatarWrap}>
            {live?.user?.avatar_url
              ? <Image source={{ uri: live.user.avatar_url }} style={st.hostAvatar} />
              : <Av name={hostName} size={38} color="#F0365A" />
            }
            <View style={st.liveIndicator} />
          </View>
          <View style={st.hostMeta}>
            <Text style={st.hostName} numberOfLines={1}>{hostName}</Text>
            <View style={st.hostMetaRow}>
              <LinearGradient colors={['#F0365A', '#9B65F5']} style={st.livePill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <View style={st.liveDot} />
                <Text style={st.liveText}>LIVE</Text>
                <Text style={st.timerText}>{fmt(elapsed)}</Text>
              </LinearGradient>
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
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Viewers */}
        <View style={st.viewerPill}>
          <Icon name="eye" size={11} color="rgba(255,255,255,0.8)" />
          <Text style={st.viewerCount}>{viewerCount}</Text>
        </View>

        {/* Coeur */}
        <View style={st.likeWrap}>
          <LiveLikeButton ref={likeRef} total={likeCount} onLike={onLike} />
        </View>

        {/* Engrenage host */}
        {isHost && (
          <TouchableOpacity
            style={st.settingsBtn}
            onPress={() => setShowSettings(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {handRequests.length > 0 && (
              <View style={st.settingsBadge}>
                <Text style={st.settingsBadgeText}>{handRequests.length}</Text>
              </View>
            )}
            <View style={st.settingsBtnCircle}>
              <Icon name="settings" size={17} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
      </View>

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
                  <Text style={gt.detail}>{t.giftName} · {t.coins} coins</Text>
                </View>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>
      )}

      {/* ── ZONE CHAT + BARRE ACTIONS ─────────────────────────────────── */}
      <View style={st.bottomZone}>

        {/* Chat flottant */}
        <View style={st.chatZone}>
          <FlatList
            ref={chatRef}
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
                      style={[st.chatBubble, isMine && st.chatBubbleMine]}
                      activeOpacity={(isMine || canModerate) ? 0.75 : 1}
                      onLongPress={() => {
                        if (isMine) {
                          Alert.alert('Mon message', item.text, [
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

        {/* ── BARRE D'ACTIONS ───────────────────────────────────────── */}
        <View style={st.actionBar}>
          {/* Input / placeholder */}
          <View style={st.inputWrap}>
            {showInput ? (
              <>
                {editTarget && (
                  <TouchableOpacity onPress={() => { setEditTarget(null); setChatInput(''); setShowInput(false); }} style={st.editCancelBtn}>
                    <Icon name="x" size={13} color="rgba(255,255,255,0.6)" />
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
                <TouchableOpacity
                  onPress={() => {
                    if (editTarget) { onEditMsg(editTarget.id, chatInput.trim()); setEditTarget(null); setChatInput(''); setShowInput(false); }
                    else { onSend(); setShowInput(false); }
                  }}
                  style={[st.sendBtn, editTarget && { backgroundColor: '#3FEDB6' }]}
                  disabled={sending || !chatInput.trim()}
                >
                  <Icon name={editTarget ? 'check' : 'send'} size={15} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={st.chatPlaceholder} onPress={() => setShowInput(true)} activeOpacity={0.8}>
                <Icon name="message-circle" size={15} color="rgba(255,255,255,0.5)" />
                <Text style={st.chatPlaceholderText}>Message...</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Réactions */}
          <View style={[st.actionIconWrap, { zIndex: 30, overflow: 'visible' }]}>
            <LiveReactionPicker onReact={(emoji) => { spawn(emoji); onReact(emoji); }} />
          </View>

          {/* Cadeau */}
          <TouchableOpacity style={st.actionIconWrap} onPress={() => giftRef.current?.openGift(hostId, hostName)} activeOpacity={0.8}>
            <LinearGradient colors={['rgba(255,215,0,0.25)', 'rgba(255,165,0,0.15)']} style={st.actionIconCircle}>
              <Text style={{ fontSize: 20 }}>🎁</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Historique cadeaux reçus */}
          {giftHistory.length > 0 && (
            <TouchableOpacity style={st.actionIconWrap} onPress={() => setShowGifts(v => !v)} activeOpacity={0.8}>
              <View style={[st.actionIconCircle, { backgroundColor: 'rgba(255,215,0,0.15)', borderColor: 'rgba(255,215,0,0.4)' }]}>
                <Icon name="star" size={18} color="#FFD700" />
                <View style={st.giftBadge}><Text style={st.giftBadgeText}>{giftHistory.length}</Text></View>
              </View>
            </TouchableOpacity>
          )}

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
                    : <Text style={{ fontSize: 18 }}>{handRaised ? '✋' : '🖐️'}</Text>
                  }
                </View>
              </TouchableOpacity>
            )
          )}

          {/* Quitter */}
          <TouchableOpacity style={st.actionIconWrap} onPress={() => Alert.alert(
            'Quitter le live ?',
            'Es-tu sûr de vouloir quitter ce live ?',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Quitter', style: 'destructive', onPress: onLeave },
            ]
          )} activeOpacity={0.8}>
            <View style={[st.actionIconCircle, { backgroundColor: 'rgba(240,54,90,0.18)', borderColor: 'rgba(240,54,90,0.5)' }]}>
              <Icon name="x" size={18} color="#F0365A" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── PANEL CADEAUX REÇUS ───────────────────────────────────────── */}
      {showGifts && (
        <Animated.View entering={SlideInUp.duration(280)} exiting={SlideOutDown.duration(220)} style={gp.panel}>
          <View style={gp.header}>
            <LinearGradient colors={['#9B65F5', '#F0365A']} style={gp.titleGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={gp.title}>Cadeaux reçus</Text>
              <Text style={gp.totalBadge}>{giftHistory.reduce((s, t) => s + t.coins, 0)} coins</Text>
            </LinearGradient>
            <TouchableOpacity onPress={() => setShowGifts(false)} style={gp.closeBtn}>
              <Icon name="x" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
          <View style={gp.list}>
            {giftHistory.slice(0, 20).map((t, i) => (
              <View key={`${t.id}-${i}`} style={gp.row}>
                <View style={gp.rowIconWrap}><Text style={gp.rowEmoji}>{t.emoji}</Text></View>
                <View style={gp.rowInfo}>
                  <Text style={gp.rowSender} numberOfLines={1}>{t.senderName}</Text>
                  <Text style={gp.rowGift}>{t.giftName}</Text>
                </View>
                <Text style={gp.rowCoins}>+{t.coins}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}

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
              <View style={sm.sheet}>
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
          onOpenGift={(receiverId, receiverName) => {
            setShowStageGate(false);
            setFreshLiveForGate(null);
            giftRef.current?.openGift(receiverId, receiverName);
          }}
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
    </KeyboardAvoidingView>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveViewerScreen: React.FC = () => {
  const nav   = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { liveId } = route.params;

  const [live,        setLive]        = useState<LiveStream | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [token,       setToken]       = useState<string | null>(null);
  const [wsUrl,       setWsUrl]       = useState<string | null>(null);
  const [ended,       setEnded]       = useState(false);
  const [kicked,      setKicked]      = useState<'kicked' | 'banned' | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
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
  const leaveStageRef     = useRef<(() => void) | null>(null);
  // Ref vers le bouton coeur pour déclencher l'animation depuis le WS
  const remoteLikeRef     = useRef<import('../../components/live/LiveLikeButton').LiveLikeButtonRef | null>(null);
  const reactionSpawnRef  = useRef<((emoji: string) => void) | null>(null);
  const reactionThrottle  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { currentUser } = useUser();
  const { lastLiveEnded, lastLiveViewersUpdated, addListener, removeListener } = useWs();

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
        if (l.status !== 'active') { setEnded(true); setLoading(false); return; }
        setViewerCount(l.current_viewers + 1);

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

  // Événements modération via WS global (live_guest_invited / live_guest_demoted)
  useEffect(() => {
    const handler = (d: { type: string; live_id?: string; identity?: string; [key: string]: any }) => {
      if (d.live_id !== liveId) return;

      if (d.type === 'live_guest_invited' && d.identity === myIdentity) {
        addSysMsg('Le host t\'a invité à monter sur scène !');
        goOnStageRef.current?.();
      }
      if (d.type === 'live_guest_demoted' && d.identity === myIdentity) {
        addSysMsg('Tu as été redescendu de scène.');
        leaveStageRef.current?.();
      }
      // Demande de scène — ajouter à la liste du host
      if (d.type === 'live_hand_raise' && d.live_id === liveId) {
        setHandRequests(prev => {
          if (prev.find(r => r.identity === d.identity)) return prev;
          return [...prev, { identity: d.identity, name: d.display_name ?? d.identity, avatar: d.avatar_url ?? null }];
        });
      }
      // Quand le host invite ou que l'utilisateur descend, retirer la demande
      if (d.type === 'live_guest_invited' && d.live_id === liveId) {
        setHandRequests(prev => prev.filter(r => r.identity !== d.identity));
      }
      if (d.type === 'live_guest_demoted' && d.live_id === liveId) {
        setHandRequests(prev => prev.filter(r => r.identity !== d.identity));
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [liveId, myIdentity, addSysMsg, addListener, removeListener]);

  // WS chat (commentaires, cadeaux, likes)
  useEffect(() => {
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken || !token) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}?token=${accessToken}`);
    } catch { return; }
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);

        if (d.type === 'comment_added' && d.comment) {
          const c = d.comment;
          const incomingText   = c.body;
          const incomingUserId = c.author?.id ? String(c.author.id) : undefined;
          setMessages(prev => {
            // Remplacer le message local optimiste correspondant (même texte + même auteur)
            const localIdx = prev.findIndex(
              m => m.isLocal && m.text === incomingText && m.userId === incomingUserId,
            );
            const newMsg = {
              id:     c.id ?? String(Date.now()),
              user:   c.author?.display_name ?? c.author?.username ?? 'Anonyme',
              userId: incomingUserId,
              avatar: c.author?.avatar_url ?? null,
              text:   incomingText,
            };
            if (localIdx !== -1) {
              const updated = [...prev];
              updated[localIdx] = newMsg;
              return updated;
            }
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
            coins:      gf.coins_spent ?? 0,
          };
          setGiftNotifs(prev => [...prev, {
            id: tick.id, senderName,
            emoji: tick.emoji, giftName: tick.giftName, coins: tick.coins,
          }]);
          setGiftTicker(prev => [...prev.slice(-2), tick]);
          setGiftHistory(prev => [tick, ...prev.slice(0, 49)]);
          setTimeout(() => setGiftTicker(prev => prev.filter(t => t.id !== tick.id)), 5000);
        }

        if (d.type === 'like_added') {
          const count = d.count ?? 1;
          // Déduire les likes qu'on a déjà comptés localement (optimiste)
          const ownPending = Math.min(pendingLikes.current, count);
          pendingLikes.current = Math.max(0, pendingLikes.current - ownPending);
          const netCount = count - ownPending;
          if (netCount > 0) setLikeCount(c => c + netCount);
          for (let i = 0; i < Math.min(count, 3); i++) {
            setTimeout(() => remoteLikeRef.current?.triggerRemote(), i * 120);
          }
        }

        if (d.type === 'reaction_added' && d.emoji) {
          for (let i = 0; i < Math.min(d.count ?? 1, 3); i++) {
            setTimeout(() => reactionSpawnRef.current?.(d.emoji), i * 150);
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
      id:      `local-${Date.now()}`,
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
    Alert.alert(name, 'Choisir une action de bannissement', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Exclure du live',
        onPress: async () => {
          try { await apiClient.post(Endpoints.lives.ban(liveId, identity)); }
          catch { Alert.alert('Erreur', 'Impossible d\'exclure ce participant.'); }
        },
      },
      {
        text: 'Bannir de tous mes lives', style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Bannir de tous les lives',
            `${name} ne pourra plus rejoindre aucun de tes lives.`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Confirmer', style: 'destructive',
                onPress: async () => {
                  try { await apiClient.post(Endpoints.lives.globalBan(liveId, identity)); }
                  catch { Alert.alert('Erreur', 'Impossible de bannir cet utilisateur.'); }
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
      Alert.alert('Erreur', 'Impossible de faire descendre ce participant.');
    }
  }, [liveId]);

  const handleLike = useCallback(() => {
    pendingLikes.current += 1;
    setLikeCount(c => c + 1);
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
    return <View style={[st.root, st.center]}><ActivityIndicator size="large" color="#F0365A" /></View>;
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
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={st.connectText}>Connexion...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect roomOptions={VIEWER_ROOM_OPTIONS}>
      <RoomContent
        live={live}
        liveId={liveId}
        myIdentity={myIdentity}
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
  spotLabel: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 260 : 240, left: 12, zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  spotLabelText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  spotGiftBtn: {
    display: 'none',
  },
  pip: {
    position: 'absolute', top: Platform.OS === 'ios' ? 115 : 95, left: 12,
    width: 72, height: 108, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', zIndex: 15,
  },
  pipGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
    justifyContent: 'flex-end', paddingBottom: 3,
  },
  pipLabel: { color: '#fff', fontSize: 9, textAlign: 'center' },
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
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 14, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 20,
  },
  hostInfo:      { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  hostAvatarWrap:{ position: 'relative' },
  hostAvatar:    { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#F0365A' },
  liveIndicator: {
    position: 'absolute', bottom: -2, right: -2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#F0365A', borderWidth: 2, borderColor: '#050010',
  },
  hostMeta:    { flex: 1 },
  hostMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' },
  hostName:    { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  liveDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  liveText: { color: '#fff', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  timerText:{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' },

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

  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  viewerCount: { color: '#fff', fontSize: 12, fontWeight: '800' },
  likeWrap:    { marginLeft: 2 },

  settingsBtn:       { padding: 4, position: 'relative' },
  settingsBtnCircle: {
    width: 36, height: 36, borderRadius: 18,
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
  bottomZone: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 15, paddingBottom: Platform.OS === 'ios' ? 28 : 14,
  },
  chatZone:  { paddingHorizontal: 12, paddingRight: 10 },
  chatList:  { flexGrow: 0, maxHeight: 200, marginBottom: 10 },
  chatRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 6 },
  chatAvatar:{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(155,101,245,0.5)' },
  chatBubble: {
    backgroundColor: 'rgba(8,4,20,0.65)',
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: 230, flexDirection: 'row', flexWrap: 'wrap',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  chatBubbleMine: {
    backgroundColor: 'rgba(240,54,90,0.18)',
    borderColor: 'rgba(240,54,90,0.35)',
  },
  chatUser: { color: '#9B65F5', fontSize: 12, fontWeight: '800' },
  chatText: { color: 'rgba(255,255,255,0.92)', fontSize: 13 },

  sysRow:  { marginBottom: 3, alignSelf: 'flex-start' },
  sysText: { color: 'rgba(255,255,255,0.38)', fontSize: 10, fontStyle: 'italic' },

  modRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  modBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(240,54,90,0.12)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  modBtnText: { color: '#F0365A', fontSize: 9, fontWeight: '700' as const },

  // ── Barre d'actions ──────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    gap: 8, marginTop: 2,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 26, paddingLeft: 14, paddingRight: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 44, maxWidth: '55%',
  },
  chatField: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: Platform.OS === 'ios' ? 10 : 6 },
  sendBtn:   {
    backgroundColor: '#F0365A', borderRadius: 20, padding: 8, margin: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  editCancelBtn: { padding: 5 },
  chatPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, paddingVertical: 10 },
  chatPlaceholderText: { color: 'rgba(255,255,255,0.38)', fontSize: 13 },

  actionIconWrap:   { alignItems: 'center', justifyContent: 'center' },
  actionIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  actionIconCircleRed: {
    backgroundColor: 'rgba(240,54,90,0.2)',
    borderColor: '#F0365A',
  },

  giftBadge: {
    position: 'absolute', top: -2, right: -2,
    width: 15, height: 15, borderRadius: 8,
    backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#050010',
  },
  giftBadgeText: { color: '#fff', fontSize: 7, fontWeight: '900' },

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
});

// ── Styles panel cadeaux reçus ────────────────────────────────────────────────

const gp = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 80 : 64,
    right: 10, left: 10,
    maxHeight: 300,
    backgroundColor: 'rgba(10,5,22,0.97)',
    borderRadius: 22,
    borderWidth: 1, borderColor: 'rgba(155,101,245,0.3)',
    zIndex: 50, overflow: 'hidden',
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 10,
  },
  titleGrad: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title:      { color: '#fff', fontSize: 14, fontWeight: '900' },
  totalBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    color: '#fff', fontSize: 11, fontWeight: '800',
  },
  closeBtn: { padding: 6 },
  list: { paddingHorizontal: 12, paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(155,101,245,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowEmoji:  { fontSize: 20 },
  rowInfo:   { flex: 1 },
  rowSender: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rowGift:   { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 },
  rowCoins:  { color: '#3FEDB6', fontSize: 13, fontWeight: '900' },
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
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
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
