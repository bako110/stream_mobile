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
  ActivityIndicator, Image, Alert, AppState, AppStateStatus,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, SlideInUp, SlideOutDown,
} from 'react-native-reanimated';
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
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
import { useUser } from '../../context/UserContext';

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
  elapsed:      number;
  goOnStageRef:  { current: (() => void) | null };
  leaveStageRef: { current: (() => void) | null };
}> = ({
  live, liveId, myIdentity, isHost, viewerCount, messages, chatInput, setChatInput,
  sending, chatRef, onSend, onLeave, onBanUser, onDemoteUser, onDeleteMsg, onEditMsg,
  giftNotifs, onGiftNotifShown, giftTicker, giftHistory, likeCount, onLike, likeRef,
  elapsed, goOnStageRef, leaveStageRef,
}) => {
  const { localParticipant } = useLocalParticipant();
  const [onStage,    setOnStage]    = useState(false);
  const [camOn,      setCamOn]      = useState(false);
  const [micOn,      setMicOn]      = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showInput,  setShowInput]  = useState(false);
  const [showGifts,  setShowGifts]  = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; text: string } | null>(null);
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

  const handleHandRaise = useCallback(async () => {
    if (handRaised) {
      setHandRaised(false);
      return;
    }
    setHandRaised(true);
    try {
      await apiClient.post(Endpoints.lives.handRaise(liveId, myIdentity));
    } catch {
      setHandRaised(false);
    }
  }, [handRaised, liveId, myIdentity]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Vidéo */}
      <MultiVideoView
        hostName={hostName}
        hostAvatarUrl={live?.user?.avatar_url}
        onGift={(id, name) => giftRef.current?.openGift(id, name)}
        onTap={() => likeRef.current?.trigger()}
      />

      {/* Zone de tap coeur — absoluteFill sous tous les overlays (zIndex 1).
          Les overlays (header zIndex 10, chat, sidebar) sont au-dessus et
          interceptent leurs propres taps. Les zones vides déclenchent le coeur. */}
      <TouchableWithoutFeedback onPress={() => likeRef.current?.trigger()}>
        <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} />
      </TouchableWithoutFeedback>

      {/* Gradients */}
      <LinearGradient colors={['rgba(0,0,0,0.72)', 'transparent']} style={st.gradTop} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={st.gradBottom} pointerEvents="none" />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={st.header}>
        <TouchableOpacity onPress={onLeave} style={st.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={st.hostInfo} onPress={() => giftRef.current?.openGift(hostId, hostName)} activeOpacity={0.8}>
          {live?.user?.avatar_url
            ? <Image source={{ uri: live.user.avatar_url }} style={st.hostAvatar} />
            : <Av name={hostName} size={40} color="#F0365A" />
          }
          <View>
            <View style={st.livePill}>
              <View style={st.liveDot} />
              <Text style={st.liveText}>LIVE</Text>
              <Text style={st.timerText}>{fmt(elapsed)}</Text>
            </View>
            <Text style={st.hostName} numberOfLines={1}>{hostName}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <View style={st.viewerPill}>
          <Icon name="eye" size={12} color="#fff" />
          <Text style={st.viewerCount}>{viewerCount}</Text>
        </View>
        <View style={st.likeWrap}>
          <LiveLikeButton ref={likeRef} total={likeCount} onLike={onLike} />
        </View>
      </View>

      {/* ── GIFT TICKER (bas gauche, au-dessus du chat) ───────────────── */}
      {giftTicker.length > 0 && (
        <View style={gt.container} pointerEvents="none">
          {giftTicker.map(t => (
            <Animated.View key={t.id} entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} style={gt.row}>
              <Text style={gt.emoji}>{t.emoji}</Text>
              <View style={gt.info}>
                <Text style={gt.sender} numberOfLines={1}>{t.senderName}</Text>
                <Text style={gt.detail}>{t.giftName} · {t.coins} pièces</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      )}

      {/* ── BADGE "SUR SCÈNE" ─────────────────────────────────────────── */}
      {onStage && (
        <Animated.View entering={SlideInUp.duration(350)} exiting={SlideOutDown.duration(250)} style={st.onStageBadge}>
          <View style={st.onStageDot} />
          <Text style={st.onStageText}>Tu es sur scène</Text>
        </Animated.View>
      )}

      {/* ── CHAT (bas gauche) ─────────────────────────────────────────── */}
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
              <Animated.View entering={FadeIn.duration(200)} style={st.chatRow}>
                {item.avatar
                  ? <Image source={{ uri: item.avatar }} style={st.chatAvatar} />
                  : <Av name={item.user} size={24} />
                }
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={[st.chatBubble, isMine && st.chatBubbleMine]}
                    activeOpacity={(isMine || canModerate) ? 0.7 : 1}
                    onLongPress={() => {
                      if (isMine) {
                        Alert.alert('Mon message', item.text, [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: 'Modifier', onPress: () => {
                              setEditTarget({ id: item.id, text: item.text });
                              setChatInput(item.text);
                              setShowInput(true);
                            },
                          },
                          { text: 'Supprimer', style: 'destructive', onPress: () => onDeleteMsg(item.id) },
                        ]);
                        return;
                      }
                    }}
                    delayLongPress={400}
                  >
                    <Text style={st.chatUser}>{item.user} </Text>
                    <Text style={st.chatText}>{item.text}{item.edited ? ' ✏' : ''}</Text>
                  </TouchableOpacity>

                  {/* Boutons modération host — inline sous le message */}
                  {canModerate && (
                    <View style={st.modRow}>
                      <TouchableOpacity
                        style={st.modBtn}
                        onPress={() => onDeleteMsg(item.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Icon name="trash-2" size={11} color="#F0365A" />
                        <Text style={st.modBtnText}>Supprimer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={st.modBtn}
                        onPress={() => onDemoteUser(item.userId!, item.user)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Icon name="arrow-down-circle" size={11} color="#FFD700" />
                        <Text style={[st.modBtnText, { color: '#FFD700' }]}>Descendre</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={st.modBtn}
                        onPress={() => onBanUser(item.userId!, item.user)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Icon name="slash" size={11} color="#F0365A" />
                        <Text style={st.modBtnText}>Bannir</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          }}
          style={st.chatList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 4 }}
        />

        {showInput ? (
          <View style={st.inputRow}>
            {editTarget && (
              <TouchableOpacity onPress={() => { setEditTarget(null); setChatInput(''); setShowInput(false); }} style={st.editCancelBtn}>
                <Icon name="x" size={14} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            )}
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={editTarget ? 'Modifier...' : 'Message...'}
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={st.chatField}
              onSubmitEditing={() => {
                if (editTarget) {
                  onEditMsg(editTarget.id, chatInput.trim());
                  setEditTarget(null);
                  setChatInput('');
                  setShowInput(false);
                } else {
                  onSend();
                  setShowInput(false);
                }
              }}
              returnKeyType="send"
              autoFocus
              onBlur={() => { if (!chatInput.trim()) { setShowInput(false); setEditTarget(null); } }}
            />
            <TouchableOpacity
              onPress={() => {
                if (editTarget) {
                  onEditMsg(editTarget.id, chatInput.trim());
                  setEditTarget(null); setChatInput(''); setShowInput(false);
                } else {
                  onSend(); setShowInput(false);
                }
              }}
              style={[st.sendBtn, editTarget && { backgroundColor: '#4ade80' }]}
              disabled={sending || !chatInput.trim()}
            >
              <Icon name={editTarget ? 'check' : 'send'} size={15} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={st.chatPlaceholder} onPress={() => setShowInput(true)} activeOpacity={0.8}>
            <Icon name="message-circle" size={14} color="rgba(255,255,255,0.55)" />
            <Text style={st.chatPlaceholderText}>Message...</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── CONTRÔLES DROITE ──────────────────────────────────────────── */}
      <View style={st.sideControls}>
        {/* Cadeau — envoyer */}
        <TouchableOpacity style={st.sideBtn} onPress={() => giftRef.current?.openGift(hostId, hostName)} activeOpacity={0.8}>
          <View style={[st.sideBtnCircle, { backgroundColor: 'rgba(255,215,0,0.2)', borderColor: '#FFD700' }]}>
            <Text style={{ fontSize: 22 }}>🎁</Text>
          </View>
          <Text style={st.sideBtnLabel}>Cadeau</Text>
        </TouchableOpacity>

        {/* Cadeaux reçus — historique */}
        {giftHistory.length > 0 && (
          <TouchableOpacity style={st.sideBtn} onPress={() => setShowGifts(v => !v)} activeOpacity={0.8}>
            <View style={[st.sideBtnCircle, { backgroundColor: 'rgba(255,215,0,0.15)', borderColor: 'rgba(255,215,0,0.5)' }]}>
              <Icon name="star" size={20} color="#FFD700" />
              <View style={st.giftBadge}><Text style={st.giftBadgeText}>{giftHistory.length}</Text></View>
            </View>
            <Text style={[st.sideBtnLabel, { color: '#FFD700' }]}>Envoye</Text>
          </TouchableOpacity>
        )}

        {onStage ? (
          <>
            <TouchableOpacity style={st.sideBtn} onPress={toggleMic} activeOpacity={0.8}>
              <View style={[st.sideBtnCircle, !micOn && st.sideBtnOff]}>
                <Icon name={micOn ? 'mic' : 'mic-off'} size={20} color={micOn ? '#4ade80' : '#F0365A'} />
              </View>
              <Text style={st.sideBtnLabel}>{micOn ? 'Micro' : 'Muet'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.sideBtn} onPress={toggleCam} activeOpacity={0.8}>
              <View style={[st.sideBtnCircle, !camOn && st.sideBtnOff]}>
                <Icon name={camOn ? 'video' : 'video-off'} size={20} color={camOn ? '#4ade80' : '#F0365A'} />
              </View>
              <Text style={st.sideBtnLabel}>{camOn ? 'Cam' : 'Cam off'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.sideBtn} onPress={leaveStage} activeOpacity={0.8}>
              <View style={[st.sideBtnCircle, { backgroundColor: 'rgba(240,54,90,0.2)', borderColor: '#F0365A' }]}>
                <Icon name="arrow-down" size={20} color="#F0365A" />
              </View>
              <Text style={[st.sideBtnLabel, { color: '#F0365A' }]}>Descendre</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={st.sideBtn} onPress={handleHandRaise} activeOpacity={0.8}>
            <Animated.View style={[st.sideBtnCircle, handRaised && st.sideBtnHandActive]}>
              <Text style={{ fontSize: 22 }}>{handRaised ? '✋' : '🖐️'}</Text>
            </Animated.View>
            <Text style={[st.sideBtnLabel, handRaised && { color: '#FFD700' }]}>
              {handRaised ? 'En attente...' : 'Lever la main'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={st.sideBtn} onPress={onLeave} activeOpacity={0.8}>
          <View style={[st.sideBtnCircle, { backgroundColor: 'rgba(240,54,90,0.2)', borderColor: '#F0365A' }]}>
            <Icon name="log-out" size={20} color="#F0365A" />
          </View>
          <Text style={[st.sideBtnLabel, { color: '#F0365A' }]}>Quitter</Text>
        </TouchableOpacity>
      </View>

      {/* ── PANEL CADEAUX REÇUS ───────────────────────────────────────── */}
      {showGifts && (
        <Animated.View entering={SlideInUp.duration(280)} exiting={SlideOutDown.duration(220)} style={gp.panel}>
          <View style={gp.header}>
            <Text style={gp.title}>Cadeaux envoyes ({giftHistory.length})</Text>
            <TouchableOpacity onPress={() => setShowGifts(false)} style={gp.closeBtn}>
              <Icon name="x" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
          <Text style={gp.total}>
            Total : {giftHistory.reduce((s, t) => s + t.coins, 0)} pièces
          </Text>
          <View style={gp.list}>
            {giftHistory.slice(0, 20).map((t, i) => (
              <View key={`${t.id}-${i}`} style={gp.row}>
                <Text style={gp.rowEmoji}>{t.emoji}</Text>
                <View style={gp.rowInfo}>
                  <Text style={gp.rowSender} numberOfLines={1}>{t.senderName}</Text>
                  <Text style={gp.rowGift}>{t.giftName}</Text>
                </View>
                <Text style={gp.rowCoins}>{t.coins}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      <LiveGiftOverlay
        ref={giftRef}
        liveId={liveId}
        incomingNotifs={giftNotifs}
        onNotifShown={onGiftNotifShown}
      />
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

        const t = await liveService.getToken(liveId);
        setToken(t.token);
        setWsUrl(t.livekit_url);

        // Identity LiveKit = userId stocké localement (même valeur que le token `sub`)
        const storedUserId = storage.getItem(STORAGE_KEYS.LAST_USER_ID);
        if (storedUserId) setMyIdentity(storedUserId);

        const startMs = new Date(l.started_at).getTime();
        elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 1000);
      } catch {}
      setLoading(false);
    })();
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [liveId]);

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
          setLikeCount(c => c + count);
          // Animer le coeur pour tout le monde (sans re-envoyer au serveur)
          for (let i = 0; i < Math.min(count, 3); i++) {
            setTimeout(() => remoteLikeRef.current?.triggerRemote(), i * 120);
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
    // Pas de setLikeCount ici — le WS like_added est la source de vérité
    // (évite le double comptage : local + broadcast)
    if (likeThrottle.current) return;
    likeThrottle.current = setTimeout(async () => {
      const batch = pendingLikes.current;
      pendingLikes.current = 0;
      likeThrottle.current = null;
      try { await apiClient.post(Endpoints.lives.like(liveId), { count: batch }); }
      catch {}
    }, 500);
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

  if (!token || !wsUrl) {
    return (
      <View style={[st.root, st.center]}>
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={st.connectText}>Connexion...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect>
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
        elapsed={elapsed}
        goOnStageRef={goOnStageRef}
        leaveStageRef={leaveStageRef}
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
  root:        { flex: 1, backgroundColor: '#000' },
  center:      { justifyContent: 'center', alignItems: 'center' },
  connectText: { color: '#999', marginTop: 12, fontSize: 14 },

  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 180, zIndex: 5 } as any,
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 240, zIndex: 5 } as any,

  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 52 : 34,
    paddingHorizontal: 14, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 10,
  },
  backBtn:    { padding: 6 },
  hostInfo:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#F0365A' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F0365A', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  liveDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText:   { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  timerText:  { color: 'rgba(255,255,255,0.85)', fontSize: 10 },
  hostName:   { color: '#fff', fontSize: 12, fontWeight: '600' },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  viewerCount: { color: '#fff', fontSize: 12, fontWeight: '700' },
  likeWrap:    { marginLeft: 4 },

  // Badge "sur scène"
  onStageBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 92,
    alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(74,222,128,0.2)',
    borderWidth: 1, borderColor: '#4ade80',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    zIndex: 30,
  },
  onStageDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  onStageText: { color: '#4ade80', fontSize: 13, fontWeight: '700' },

  // Chat
  chatZone: {
    position: 'absolute', bottom: 0, left: 0, right: 90,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    paddingLeft: 12, zIndex: 10,
  },
  chatList: { flexGrow: 0, maxHeight: 220, marginBottom: 8 },
  chatRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 5 },
  chatAvatar: { width: 24, height: 24, borderRadius: 12 },
  chatBubble: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5, maxWidth: 220,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  chatBubbleMine: { backgroundColor: 'rgba(240,54,90,0.25)', borderWidth: 1, borderColor: 'rgba(240,54,90,0.4)' },
  chatUser: { color: '#F0365A', fontSize: 12, fontWeight: '700' },
  chatText: { color: '#fff', fontSize: 13 },
  editCancelBtn: { padding: 6 },
  giftBadge: {
    position: 'absolute', top: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#000',
  },
  giftBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  sysRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, alignSelf: 'flex-start' },
  sysText:  { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  modRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, paddingLeft: 2 },
  modBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(240,54,90,0.15)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  modBtnText: { color: '#F0365A', fontSize: 10, fontWeight: '700' as const },
  giftMsg:  { backgroundColor: 'rgba(255,215,0,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4, alignSelf: 'flex-start' },
  giftText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  chatPlaceholder: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
  },
  chatPlaceholderText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24, paddingLeft: 14, paddingRight: 4,
  },
  chatField: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: Platform.OS === 'ios' ? 10 : 7 },
  sendBtn:   { backgroundColor: '#F0365A', borderRadius: 20, padding: 8, margin: 3 },

  // Contrôles droite
  sideControls: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center', gap: 14, zIndex: 20,
  },
  sideBtn:       { alignItems: 'center', gap: 4 },
  sideBtnCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  sideBtnOff:        { borderColor: '#F0365A', backgroundColor: 'rgba(240,54,90,0.15)' },
  sideBtnHandActive: { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.2)' },
  sideBtnLabel:      { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600' },

  // Ended
  endedCard:    { alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 36, marginHorizontal: 32 },
  endedTitle:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  endedSub:     { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' },
  endedBtn:     { marginTop: 8, backgroundColor: '#F0365A', borderRadius: 24, paddingHorizontal: 36, paddingVertical: 13 },
  endedBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

// ── Styles gift ticker ────────────────────────────────────────────────────────

const gt = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 290 : 270,
    left: 12,
    zIndex: 40,
    gap: 6,
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.6)',
    maxWidth: 200,
  },
  emoji:  { fontSize: 18 },
  info:   { flex: 1 },
  sender: { color: '#FFD700', fontSize: 11, fontWeight: '700' },
  detail: { color: 'rgba(255,255,255,0.65)', fontSize: 10 },
});

// ── Styles panel cadeaux reçus ────────────────────────────────────────────────

const gp = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 80 : 60,
    right: 76,
    width: 220, maxHeight: 320,
    backgroundColor: 'rgba(15,15,25,0.96)',
    borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
    zIndex: 50, overflow: 'hidden',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title:    { color: '#FFD700', fontSize: 13, fontWeight: '800' },
  closeBtn: { padding: 4 },
  total: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600',
    paddingHorizontal: 14, paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  list: { paddingHorizontal: 10, paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowEmoji:  { fontSize: 20 },
  rowInfo:   { flex: 1 },
  rowSender: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rowGift:   { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
  rowCoins:  { color: '#FFD700', fontSize: 12, fontWeight: '800' },
});
