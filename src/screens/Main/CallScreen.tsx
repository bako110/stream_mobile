/**
 * CallScreen — Écran d'appel vocal / vidéo
 * - Appel entrant : avatar + swipe ↑ décrocher / swipe ↓ rejeter + boutons tap
 * - Appel sortant : attend call_answer de l'autre côté
 * - Appel en cours : contrôles mute/haut-parleur/caméra + raccrocher
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Vibration, Animated, Easing, PermissionsAndroid,
  Image, Dimensions, PanResponder,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  RTCView,
  MediaStream,
} from '@livekit/react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { callHistoryService } from '../../services/callHistoryService';

const { height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_H * 0.15;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80',              username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
    { urls: 'turn:global.relay.metered.ca:443',              username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
  ],
};

interface RouteParams {
  partnerId:      string;
  partnerName:    string;
  partnerAvatar?: string | null;
  callType:       'voice' | 'video';
  isIncoming:     boolean;
  offer?:         any;   // RTCSessionDescription JSON du caller
  autoAccept?:    boolean; // true = décroché depuis le toast, accepter directement
}

type CallState = 'ringing' | 'connected' | 'ended';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const CallScreen: React.FC = () => {
  const { theme }   = useTheme();
  const { colors }  = theme;
  const nav         = useNavigation<any>();
  const route       = useRoute();
  const {
    partnerId, partnerName, partnerAvatar, callType, isIncoming, offer, autoAccept,
  } = route.params as RouteParams;

  const [state,        setState]        = useState<CallState>('ringing');
  const [elapsed,      setElapsed]      = useState(0);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isSpeaker,    setIsSpeaker]    = useState(callType === 'video');
  const [isCamOff,     setIsCamOff]     = useState(false);
  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef              = useRef<RTCPeerConnection | null>(null);
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef           = useRef<CallState>('ringing');
  const pendingCandidates  = useRef<any[]>([]);
  const remoteStreamRef    = useRef<MediaStream | null>(null);
  const localStreamRef     = useRef<MediaStream | null>(null);
  const mountedRef         = useRef(true);
  const callSavedRef       = useRef(false);
  const connectedAtRef     = useRef<number | null>(null);
  const startedAtRef       = useRef<string>(new Date().toISOString());

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulse2Anim = useRef(new Animated.Value(1)).current;
  const swipeY     = useRef(new Animated.Value(0)).current;
  const swipeOp    = useRef(new Animated.Value(1)).current;
  const arrowUpOp  = useRef(new Animated.Value(0.6)).current;
  const arrowDnOp  = useRef(new Animated.Value(0.6)).current;

  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
  const isVideo  = callType === 'video';

  const {
    sendMessage: sendWs,
    addListener, removeListener,
    notifyCallConnected, notifyCallEnded,
    markCallAccepted, markCallEnded,
    drainCallBuffer,
  } = useWs();

  // ── Save call record (called once per call) ───────────────────────────────────
  const saveCallRecord = useCallback((direction: 'incoming' | 'outgoing' | 'missed') => {
    if (callSavedRef.current) return;
    callSavedRef.current = true;
    const durationSec = connectedAtRef.current
      ? Math.round((Date.now() - connectedAtRef.current) / 1000)
      : 0;
    callHistoryService.add({
      partnerId:   partnerId,
      partnerName: partnerName,
      avatarUrl:   partnerAvatar ?? undefined,
      callType:    callType,
      direction,
      startedAt:   startedAtRef.current,
      durationSec,
    });
    __DEV__ && console.log('[CallScreen] saved call record:', direction, 'duration:', durationSec);
  }, [partnerId, partnerName, partnerAvatar, callType]);

  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Pulse animation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'ringing') return;
    const a1 = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim,  { toValue: 1.35, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim,  { toValue: 1,    duration: 900, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
    ]));
    const a2 = Animated.loop(Animated.sequence([
      Animated.delay(450),
      Animated.timing(pulse2Anim, { toValue: 1.35, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse2Anim, { toValue: 1,    duration: 900, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
    ]));
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, [state]);

  // Arrow hint pulse
  useEffect(() => {
    if (state !== 'ringing' || !isIncoming) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(arrowUpOp, { toValue: 1,   duration: 600, useNativeDriver: true }),
      Animated.timing(arrowUpOp, { toValue: 0.4, duration: 600, useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(arrowDnOp, { toValue: 1,   duration: 600, useNativeDriver: true }),
      Animated.timing(arrowDnOp, { toValue: 0.4, duration: 600, useNativeDriver: true }),
    ]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [state, isIncoming]);

  // ── Refs for stable PanResponder callbacks ───────────────────────────────────
  const acceptCallRef = useRef<(() => void) | null>(null);
  const hangupRef     = useRef<(() => void) | null>(null);

  // ── PanResponder ─────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => stateRef.current === 'ringing',
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => {
        swipeY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(swipeY,  { toValue: -SCREEN_H, duration: 220, useNativeDriver: true }),
            Animated.timing(swipeOp, { toValue: 0,         duration: 220, useNativeDriver: true }),
          ]).start(() => acceptCallRef.current?.());
        } else if (g.dy > SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(swipeY,  { toValue: SCREEN_H, duration: 220, useNativeDriver: true }),
            Animated.timing(swipeOp, { toValue: 0,        duration: 220, useNativeDriver: true }),
          ]).start(() => hangupRef.current?.());
        } else {
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 8 }).start();
        }
      },
    }),
  ).current;

  // ── Request permissions + get local stream ───────────────────────────────────
  const getLocalStream = useCallback(async (): Promise<MediaStream> => {
    if (Platform.OS === 'android') {
      const perms = isVideo
        ? [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.CAMERA] as const
        : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] as const;
      await PermissionsAndroid.requestMultiple(perms);
    }
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { facingMode: 'user', width: 640, height: 480 } : false,
    }) as unknown as MediaStream;
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, [isVideo]);

  // ── Build RTCPeerConnection ───────────────────────────────────────────────────
  const createPC = useCallback((stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    remoteStreamRef.current = null;

    stream.getTracks().forEach((track: any) => {
      try { pc.addTrack(track, stream); } catch {}
    });

    (pc as any).ontrack = (event: any) => {
      const incoming = event.streams?.[0] ?? null;
      if (incoming) {
        remoteStreamRef.current = incoming;
        if (mountedRef.current) setRemoteStream(incoming);
      } else if (event.track) {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream(undefined as any);
        }
        remoteStreamRef.current.addTrack(event.track);
        // Force re-render
        if (mountedRef.current) {
          setRemoteStream(null);
          setTimeout(() => {
            if (mountedRef.current) setRemoteStream(remoteStreamRef.current);
          }, 0);
        }
      }
    };

    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate) {
        sendWs({ type: 'call_ice', to: partnerId, candidate: event.candidate.toJSON() });
      }
    };

    // Detect connection established via iceConnectionState (more reliable across libs)
    (pc as any).oniceconnectionstatechange = () => {
      const s = (pc as any).iceConnectionState as string;
      if (s === 'connected' || s === 'completed') {
        if (stateRef.current !== 'connected') {
          connectedAtRef.current = Date.now();
          notifyCallConnected(partnerId);
          if (mountedRef.current) setState('connected');
        }
      }
      // Ne jamais raccrocher sur failed/disconnected/closed — laisser le bouton ou call_hangup WS gérer
    };

    (pc as any).onconnectionstatechange = () => {
      const s = (pc as any).connectionState as string;
      if (s === 'connected') {
        if (stateRef.current !== 'connected') {
          connectedAtRef.current = Date.now();
          notifyCallConnected(partnerId);
          if (mountedRef.current) setState('connected');
        }
      }
      // Ne jamais raccrocher automatiquement — seul le bouton ou call_hangup WS raccroche
    };

    return pc;
  }, [partnerId, sendWs, notifyCallConnected]);

  // ── Flush pending ICE candidates once remote description is set ───────────────
  const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingCandidates.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidates.current = [];
  }, []);

  // ── Accept incoming call ──────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (stateRef.current !== 'ringing') return;
    markCallAccepted(partnerId);
    // Receveur : arrêter la sonnerie + vibration
    InCallManager.stopRingtone();
    Vibration.cancel();
    InCallManager.start({ media: isVideo ? 'video' : 'audio' });
    InCallManager.setSpeakerphoneOn(isVideo);

    try {
      const stream = await getLocalStream();
      if (!mountedRef.current) return;
      const pc = createPC(stream);

      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWs({ type: 'call_answer', to: partnerId, sdp: answer });
      } else {
        // offer pas encore reçu — WS handler s'en chargera quand il arrive
        __DEV__ && console.warn('[CallScreen] acceptCall: no offer yet, waiting for call_offer via WS');
      }
    } catch (e) {
      __DEV__ && console.error('[CallScreen] acceptCall error:', e);
      hangupRef.current?.();
    }
  }, [offer, partnerId, isVideo, getLocalStream, createPC, flushPendingCandidates, sendWs, markCallAccepted]);

  // ── Hangup ────────────────────────────────────────────────────────────────────
  const hangup = useCallback(() => {
    if (stateRef.current === 'ended') return;
    const dir = connectedAtRef.current
      ? (isIncoming ? 'incoming' : 'outgoing')
      : (isIncoming ? 'missed' : 'outgoing');
    saveCallRecord(dir);
    notifyCallEnded(partnerId);
    markCallEnded(partnerId);
    sendWs({ type: 'call_hangup', to: partnerId });
    if (mountedRef.current) setState('ended');
  }, [partnerId, isIncoming, saveCallRecord, notifyCallEnded, markCallEnded, sendWs]);

  useEffect(() => { acceptCallRef.current = acceptCall; }, [acceptCall]);
  useEffect(() => { hangupRef.current     = hangup; },     [hangup]);

  // ── Initial setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      if (!isIncoming) {
        // ── APPELANT : ringback (coun coun), PAS de vibration ────────────────
        try {
          const stream = await getLocalStream();
          if (!mountedRef.current) return;
          InCallManager.start({ media: isVideo ? 'video' : 'audio' });
          InCallManager.setSpeakerphoneOn(false);
          InCallManager.startRingback('_BUNDLE_'); // ringback.wav dans res/raw/
          const pc = createPC(stream);
          const offerDesc = await pc.createOffer({});
          await pc.setLocalDescription(offerDesc);
          sendWs({
            type:      'call_offer',
            to:        partnerId,
            to_name:   partnerName,
            to_avatar: partnerAvatar ?? null,
            call_type: callType,
            sdp:       offerDesc,
          });
        } catch (e) {
          __DEV__ && console.error('[CallScreen] outgoing start error:', e);
        }
      } else if (autoAccept) {
        // ── RECEVEUR via toast : accepter directement ─────────────────────────
        markCallAccepted(partnerId);
        InCallManager.stopRingtone();
        Vibration.cancel();
        InCallManager.start({ media: isVideo ? 'video' : 'audio' });
        InCallManager.setSpeakerphoneOn(isVideo);
        try {
          const stream = await getLocalStream();
          if (!mountedRef.current) return;
          const pc = createPC(stream);
          if (offer) {
            // SDP reçu dans les params — répondre directement
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            await flushPendingCandidates(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendWs({ type: 'call_answer', to: partnerId, sdp: answer });
          }
          // Si offer absent : le WS handler le traitera quand call_offer arrive
        } catch (e) {
          __DEV__ && console.error('[CallScreen] autoAccept error:', e);
          // Ne pas raccrocher — laisser le WS handler gérer l'offer si elle arrive
        }
      } else {
        // ── RECEVEUR direct (FCM quit state) : sonnerie forte + vibration ────
        InCallManager.start({ media: isVideo ? 'video' : 'audio' });
        setTimeout(() => InCallManager.startRingtone('_DEFAULT_', 0, '', 30), 200);
        Vibration.vibrate([0, 600, 400, 600], true);
      }
    };

    start();

    // Auto-hangup after 30s if still ringing
    const timeout = setTimeout(() => {
      if (stateRef.current === 'ringing') hangupRef.current?.();
    }, 30_000);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
    };
  }, []); // intentionally empty — run once on mount

  // ── WebSocket event handler ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (payload: WsPayload) => {
      // Accept events from partner in either direction field
      const senderId = payload.from ?? payload.sender_id;
      if (senderId !== partnerId && payload.to !== partnerId) return;

      // ── Remote answered our outgoing call ────────────────────────────────────
      if (payload.type === 'call_answer') {
        InCallManager.stopRingback();
        InCallManager.setSpeakerphoneOn(isVideo);

        const pc = pcRef.current;
        if (!pc) return;
        try {
          if (payload.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushPendingCandidates(pc);
          }
          // Mark as connected immediately — don't wait for ICE if it's slow
          if (stateRef.current !== 'connected' && mountedRef.current) {
            if (!connectedAtRef.current) connectedAtRef.current = Date.now();
            notifyCallConnected(partnerId);
            setState('connected');
          }
        } catch (e) {
          __DEV__ && console.error('[CallScreen] call_answer error:', e);
        }
        return;
      }

      // ── ICE candidate ────────────────────────────────────────────────────────
      if (payload.type === 'call_ice') {
        const pc = pcRef.current;
        if (!payload.candidate) return;
        if (pc && (pc as any).remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
        } else {
          pendingCandidates.current.push(payload.candidate);
        }
        return;
      }

      // ── Offer reçu en retard (déjà traité via autoAccept) ───────────────────
      if (payload.type === 'call_offer' && isIncoming) {
        // Si on a déjà une localDescription, la négociation est terminée — ignorer
        if ((pcRef.current as any)?.localDescription) return;
        const pc = pcRef.current;
        if (!pc) {
          setTimeout(() => handler(payload), 500);
          return;
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs({ type: 'call_answer', to: partnerId, sdp: answer });
        } catch {
          // Erreur silencieuse — l'appel est déjà établi via autoAccept
        }
        return;
      }

      // ── Remote hung up ───────────────────────────────────────────────────────
      if (payload.type === 'call_hangup') {
        __DEV__ && console.log('[CallScreen] call_hangup received from', payload.from, 'to', payload.to, 'state=', stateRef.current);
        const dir = connectedAtRef.current
          ? (isIncoming ? 'incoming' : 'outgoing')
          : (isIncoming ? 'missed' : 'outgoing');
        saveCallRecord(dir);
        notifyCallEnded(partnerId);
        markCallEnded(partnerId);
        if (mountedRef.current) setState('ended');
      }
    };

    addListener(handler);

    // Rejouer les events arrivés avant que ce listener soit actif
    // Exclure call_hangup du buffer : peut être un hangup résiduel d'avant le décrochage
    drainCallBuffer(partnerId)
      .filter(p => p.type !== 'call_hangup')
      .forEach(p => handler(p));

    return () => removeListener(handler);
  }, [partnerId, isVideo, isIncoming, addListener, removeListener, sendWs, flushPendingCandidates, notifyCallConnected, notifyCallEnded, markCallEnded, drainCallBuffer, saveCallRecord]);

  // ── Timer ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state === 'connected') {
      timerRef.current = setInterval(() => {
        if (mountedRef.current) setElapsed(p => p + 1);
      }, 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [state]);

  // ── Cleanup on end ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'ended') return;
    InCallManager.stop();
    InCallManager.stopRingtone();
    InCallManager.stopRingback();
    Vibration.cancel();
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    const t = setTimeout(() => { if (mountedRef.current) nav.goBack(); }, 1500);
    return () => clearTimeout(t);
  }, [state]);

  // ── Toggles ───────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeaker;
    InCallManager.setSpeakerphoneOn(next);
    setIsSpeaker(next);
  }, [isSpeaker]);

  const toggleCamera = useCallback(() => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCamOff(!t.enabled); }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  const showIncomingUI = isIncoming && state === 'ringing' && !autoAccept;

  const AvatarView = () => partnerAvatar ? (
    <Image source={{ uri: partnerAvatar }} style={styles.avatarImg} />
  ) : (
    <LinearGradient colors={['#7B3FF2', '#E0389A']} style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{partnerName.charAt(0).toUpperCase()}</Text>
    </LinearGradient>
  );

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? '#000' : '#0D0D1A' }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background gradient */}
      {!isVideo && (
        <LinearGradient
          colors={showIncomingUI ? ['#0D0D1A', '#1A0D2E', '#2E1065'] : ['#0D0D1A', '#1a1a2e']}
          start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Remote video full screen */}
      {isVideo && remoteStream && state === 'connected' && (
        <RTCView streamURL={(remoteStream as any).toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      )}

      {/* Local video PiP */}
      {isVideo && localStream && state === 'connected' && !isCamOff && (
        <View style={styles.localVideoWrap}>
          <RTCView streamURL={(localStream as any).toURL()} style={{ width: 120, height: 160 }} objectFit="cover" mirror zOrder={1} />
        </View>
      )}

      {/* ════════════ INCOMING RINGING UI ════════════ */}
      {showIncomingUI ? (
        <Animated.View
          style={[styles.incomingWrap, { transform: [{ translateY: swipeY }], opacity: swipeOp }]}
          {...panResponder.panHandlers}
        >
          {/* Caller info */}
          <View style={[styles.callerInfoTop, { paddingTop: STATUS_H + 32 }]}>
            <Text style={styles.incomingLabel}>
              {isVideo ? '📹  Appel vidéo entrant' : '📞  Appel vocal entrant'}
            </Text>
            <Text style={styles.callerNameLarge}>{partnerName}</Text>
          </View>

          {/* Avatar + pulse */}
          <View style={styles.avatarCenter}>
            <Animated.View style={[styles.pulseRing, styles.pulseRing2, { transform: [{ scale: pulse2Anim }] }]} />
            <Animated.View style={[styles.pulseRing, styles.pulseRing1, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.avatarOuter}>
              <AvatarView />
            </View>
          </View>

          {/* Swipe hints */}
          <View style={styles.swipeHintsRow}>
            <Animated.View style={[styles.swipeHintItem, { opacity: arrowUpOp }]}>
              <Icon name="chevron-up"   size={20} color="rgba(255,255,255,0.7)" />
              <Icon name="chevron-up"   size={20} color="rgba(255,255,255,0.5)" style={{ marginTop: -10 }} />
              <Text style={styles.swipeHintLabel}>Glisser ↑ Décrocher</Text>
            </Animated.View>
            <Animated.View style={[styles.swipeHintItem, { opacity: arrowDnOp }]}>
              <Text style={styles.swipeHintLabel}>Glisser ↓ Rejeter</Text>
              <Icon name="chevron-down" size={20} color="rgba(255,255,255,0.7)" />
              <Icon name="chevron-down" size={20} color="rgba(255,255,255,0.5)" style={{ marginTop: -10 }} />
            </Animated.View>
          </View>

          {/* Tap buttons */}
          <View style={styles.incomingBtns}>
            <TouchableOpacity style={[styles.callActionBtn, styles.rejectCallBtn]} onPress={hangup} activeOpacity={0.85}>
              <Icon name="phone-off" size={26} color="#fff" />
              <Text style={styles.callActionLabel}>Rejeter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.callActionBtn, styles.acceptCallBtn]} onPress={acceptCall} activeOpacity={0.85}>
              <Icon name="phone" size={26} color="#fff" />
              <Text style={styles.callActionLabel}>Décrocher</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

      ) : (
        /* ════════════ OUTGOING / CONNECTED / ENDED UI ════════════ */
        <>
          {/* Top info */}
          <View style={[styles.topInfo, { paddingTop: STATUS_H + 24 }]}>
            <Text style={styles.callerName}>{partnerName}</Text>
            <Text style={styles.callStatus}>
              {state === 'ringing'
                ? (isIncoming ? 'Appel entrant…' : 'Appel en cours…')
                : state === 'connected'
                ? formatElapsed(elapsed)
                : 'Appel terminé'}
            </Text>
            <Text style={styles.callTypeLabel}>{isVideo ? 'Appel vidéo' : 'Appel vocal'}</Text>
          </View>

          {/* Avatar (voice, or video while connecting) */}
          {(!isVideo || state !== 'connected') && (
            <View style={styles.avatarArea}>
              {state === 'ringing' && (
                <Animated.View style={[styles.pulseRing, styles.pulseRing1, { transform: [{ scale: pulseAnim }], opacity: 0.5 }]} />
              )}
              <View style={styles.avatarOuter}>
                <AvatarView />
              </View>
            </View>
          )}

          {/* Controls */}
          <View style={styles.controls}>
            {state === 'connected' && (
              <View style={styles.controlRow}>
                <TouchableOpacity style={styles.controlBtn} onPress={toggleMute}>
                  <View style={[styles.controlIcon, isMuted && styles.controlIconActive]}>
                    <Icon name={isMuted ? 'mic-off' : 'mic'} size={22} color="#fff" />
                  </View>
                  <Text style={styles.controlLabel}>{isMuted ? 'Activé' : 'Muet'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.controlBtn} onPress={toggleSpeaker}>
                  <View style={[styles.controlIcon, isSpeaker && styles.controlIconActive]}>
                    <Icon name={isSpeaker ? 'volume-2' : 'volume-x'} size={22} color="#fff" />
                  </View>
                  <Text style={styles.controlLabel}>HP</Text>
                </TouchableOpacity>

                {isVideo && (
                  <TouchableOpacity style={styles.controlBtn} onPress={toggleCamera}>
                    <View style={[styles.controlIcon, isCamOff && styles.controlIconActive]}>
                      <Icon name={isCamOff ? 'camera-off' : 'camera'} size={22} color="#fff" />
                    </View>
                    <Text style={styles.controlLabel}>Caméra</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.actionRow}>
              {(state === 'ringing' || state === 'connected') && (
                <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={hangup}>
                  <Icon name="phone-off" size={28} color="#fff" />
                </TouchableOpacity>
              )}
              {state === 'ended' && (
                <View style={styles.endedBadge}>
                  <Text style={styles.endedText}>Appel terminé</Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
};

const AVATAR_SIZE = 140;
const PULSE_SIZE  = AVATAR_SIZE + 60;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Incoming ────────────────────────────────────────────────────────────────
  incomingWrap: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 48,
  },
  callerInfoTop: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  incomingLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.4,
  },
  callerNameLarge: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  avatarCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  avatarOuter: {
    width:         AVATAR_SIZE,
    height:        AVATAR_SIZE,
    borderRadius:  AVATAR_SIZE / 2,
    overflow:      'hidden',
    borderWidth:   3,
    borderColor:   'rgba(255,255,255,0.25)',
    elevation:     12,
    shadowColor:   '#7B3FF2',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius:  16,
  },
  avatarImg: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
  },
  avatarFallback: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 52, fontWeight: '800', color: '#fff',
  },
  pulseRing: {
    position:     'absolute',
    borderRadius: PULSE_SIZE / 2,
    borderWidth:  1.5,
    borderColor:  'rgba(123,63,242,0.4)',
  },
  pulseRing1: {
    width: PULSE_SIZE, height: PULSE_SIZE,
  },
  pulseRing2: {
    width:        PULSE_SIZE + 55,
    height:       PULSE_SIZE + 55,
    borderRadius: (PULSE_SIZE + 55) / 2,
    borderColor:  'rgba(123,63,242,0.2)',
  },
  swipeHintsRow: {
    flexDirection:  'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  swipeHintItem: {
    alignItems: 'center',
    gap: 4,
  },
  swipeHintLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  incomingBtns: {
    flexDirection:  'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    gap: 20,
  },
  callActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 22,
    gap: 6,
  },
  acceptCallBtn: {
    backgroundColor: '#16A34A',
  },
  rejectCallBtn: {
    backgroundColor: '#DC2626',
  },
  callActionLabel: {
    color: '#fff', fontSize: 13, fontWeight: '700',
  },

  // ── Outgoing / connected ─────────────────────────────────────────────────────
  topInfo: {
    alignItems: 'center', gap: 6, zIndex: 10,
  },
  callerName: {
    fontSize: 28, fontWeight: '800', color: '#fff',
  },
  callStatus: {
    fontSize: 16, color: 'rgba(255,255,255,0.8)',
  },
  callTypeLabel: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2,
  },
  avatarArea: {
    alignItems: 'center', justifyContent: 'center', flex: 1,
  },
  localVideoWrap: {
    position: 'absolute', top: 100, right: 16,
    width: 120, height: 160, borderRadius: 12,
    overflow: 'hidden', zIndex: 20, elevation: 10,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  controls: {
    paddingBottom: 52, gap: 28, zIndex: 10,
  },
  controlRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 44,
  },
  controlBtn: {
    alignItems: 'center', gap: 6,
  },
  controlIcon: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  controlIconActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.65)', fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 50,
  },
  actionBtn: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  rejectBtn: { backgroundColor: '#EF4444' },
  endedBadge: {
    paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  endedText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600',
  },
});
