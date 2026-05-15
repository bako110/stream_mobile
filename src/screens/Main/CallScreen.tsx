/**
 * CallScreen — Appel vocal / vidéo
 * Design professionnel type FaceTime/WhatsApp
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
import Sound from 'react-native-sound';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { useActiveCall } from '../../context/ActiveCallContext';

const { height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_H * 0.15;
const AVATAR_SIZE     = 120;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80',               username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp',  username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
    { urls: 'turn:global.relay.metered.ca:443',               username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'db34d4755e18fc45e21ef0b3', credential: 'XXC5uD6iTSoC5/ln' },
  ],
};

interface RouteParams {
  partnerId:      string;
  partnerName:    string;
  partnerAvatar?: string | null;
  callType:       'voice' | 'video';
  isIncoming:     boolean;
  offer?:         any;
  autoAccept?:    boolean;
}

type CallState = 'ringing' | 'connected' | 'ended';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const CallScreen: React.FC = () => {
  const insets    = useSafeAreaInsets();
  const nav       = useNavigation<any>();
  const route     = useRoute();
  const {
    partnerId, partnerName, partnerAvatar, callType, isIncoming, offer, autoAccept,
  } = route.params as RouteParams;

  const [callState,    setCallState]    = useState<CallState>('ringing');
  const [elapsed,      setElapsed]      = useState(0);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isSpeaker,    setIsSpeaker]    = useState(callType === 'video');
  const [isCamOff,     setIsCamOff]     = useState(false);
  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef          = useRef<CallState>('ringing');
  const pendingCandidates = useRef<any[]>([]);
  const remoteStreamRef   = useRef<MediaStream | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const mountedRef        = useRef(true);
  const connectedAtRef    = useRef<number | null>(null);
  const iInitiatedEndRef  = useRef(false);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulse2Anim = useRef(new Animated.Value(1)).current;
  const swipeY     = useRef(new Animated.Value(0)).current;
  const swipeOp    = useRef(new Animated.Value(1)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;

  const incomingSoundRef = useRef<Sound | null>(null);
  const ringbackSoundRef = useRef<Sound | null>(null);
  const rejectedSoundRef = useRef<Sound | null>(null);

  const playIncoming = () => {
    Sound.setCategory('Playback', true);
    const s = new Sound('incoming_call.mp3', Sound.MAIN_BUNDLE, (err) => {
      if (err) return;
      s.setNumberOfLoops(-1);
      s.play();
    });
    incomingSoundRef.current = s;
  };
  const stopIncoming = () => { incomingSoundRef.current?.stop(); incomingSoundRef.current = null; };

  const playRingback = () => {
    Sound.setCategory('Playback', true);
    const s = new Sound('ringback_tone.mp3', Sound.MAIN_BUNDLE, (err) => {
      if (err) return;
      s.setNumberOfLoops(-1);
      s.play();
    });
    ringbackSoundRef.current = s;
  };
  const stopRingback = () => { ringbackSoundRef.current?.stop(); ringbackSoundRef.current = null; };

  const playRejected = () => {
    Sound.setCategory('Playback', true);
    const s = new Sound('rejected_call.mp3', Sound.MAIN_BUNDLE, (err) => {
      if (err) return;
      s.setNumberOfLoops(0);
      s.play(() => { s.release(); rejectedSoundRef.current = null; });
    });
    rejectedSoundRef.current = s;
  };
  const stopRejected = () => { rejectedSoundRef.current?.stop(); rejectedSoundRef.current = null; };

  const isVideo = callType === 'video';

  const {
    sendMessage: sendWs,
    addListener, removeListener,
    notifyCallConnected, notifyCallEnded,
    markCallAccepted, markCallEnded,
    drainCallBuffer,
  } = useWs();

  const { startCall, minimizeCall, endCall: endActiveCall } = useActiveCall();


  useEffect(() => { stateRef.current = callState; }, [callState]);

  // Pulse animation (ringing)
  useEffect(() => {
    if (callState !== 'ringing') return;
    const a1 = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim,  { toValue: 1.4, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim,  { toValue: 1,   duration: 1000, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
    ]));
    const a2 = Animated.loop(Animated.sequence([
      Animated.delay(500),
      Animated.timing(pulse2Anim, { toValue: 1.4, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse2Anim, { toValue: 1,   duration: 1000, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
    ]));
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, [callState]);

  // Ripple animation (connected)
  useEffect(() => {
    if (callState !== 'connected') return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(rippleAnim, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(rippleAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [callState]);

  const acceptCallRef = useRef<(() => void) | null>(null);
  const hangupRef     = useRef<(() => void) | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => stateRef.current === 'ringing',
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => { swipeY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(swipeY,  { toValue: -SCREEN_H, duration: 220, useNativeDriver: true }),
            Animated.timing(swipeOp, { toValue: 0,          duration: 220, useNativeDriver: true }),
          ]).start(() => acceptCallRef.current?.());
        } else if (g.dy > SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(swipeY,  { toValue: SCREEN_H, duration: 220, useNativeDriver: true }),
            Animated.timing(swipeOp, { toValue: 0,         duration: 220, useNativeDriver: true }),
          ]).start(() => hangupRef.current?.());
        } else {
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 8 }).start();
        }
      },
    }),
  ).current;

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

  const createPC = useCallback((stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    remoteStreamRef.current = null;

    stream.getTracks().forEach((track: any) => {
      try { pc.addTrack(track, stream); } catch {}
    });

    (pc as any).ontrack = (event: any) => {
      // Préférer event.streams[0] mais fallback sur construction manuelle
      const incoming = event.streams?.[0] ?? null;
      if (incoming) {
        remoteStreamRef.current = incoming;
        if (mountedRef.current) setRemoteStream(incoming);
      } else if (event.track) {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream([event.track] as any);
        } else {
          remoteStreamRef.current.addTrack(event.track);
        }
        const snap = remoteStreamRef.current;
        if (mountedRef.current) {
          setRemoteStream(null);
          setTimeout(() => { if (mountedRef.current) setRemoteStream(snap); }, 50);
        }
      }
    };

    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate) sendWs({ type: 'call_ice', to: partnerId, candidate: event.candidate.toJSON() });
    };

    const onConnected = () => {
      if (stateRef.current !== 'connected') {
        connectedAtRef.current = Date.now();
        notifyCallConnected(partnerId);
        startCall({ partnerId, partnerName, partnerAvatar, callType });
        if (mountedRef.current) setCallState('connected');
      }
    };

    (pc as any).oniceconnectionstatechange = () => {
      const s = (pc as any).iceConnectionState as string;
      if (s === 'connected' || s === 'completed') onConnected();
    };
    (pc as any).onconnectionstatechange = () => {
      if ((pc as any).connectionState === 'connected') onConnected();
    };

    return pc;
  }, [partnerId, sendWs, notifyCallConnected]);

  const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingCandidates.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidates.current = [];
  }, []);

  const acceptCall = useCallback(async () => {
    if (stateRef.current !== 'ringing') return;
    markCallAccepted(partnerId);
    stopIncoming();
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
      }
    } catch { hangupRef.current?.(); }
  }, [offer, partnerId, isVideo, getLocalStream, createPC, flushPendingCandidates, sendWs, markCallAccepted]);

  const minimize = useCallback(() => {
    minimizeCall();
    nav.goBack();
  }, [minimizeCall, nav]);

  const hangup = useCallback(() => {
    if (stateRef.current === 'ended') return;
    iInitiatedEndRef.current = true;
    endActiveCall();
    notifyCallEnded(partnerId);
    markCallEnded(partnerId);
    sendWs({ type: 'call_hangup', to: partnerId });
    if (mountedRef.current) setCallState('ended');
  }, [partnerId, endActiveCall, notifyCallEnded, markCallEnded, sendWs]);

  useEffect(() => { acceptCallRef.current = acceptCall; }, [acceptCall]);
  useEffect(() => { hangupRef.current     = hangup; },     [hangup]);

  useEffect(() => {
    mountedRef.current = true;
    markCallAccepted(partnerId);

    const start = async () => {
      if (!isIncoming) {
        try {
          const stream = await getLocalStream();
          if (!mountedRef.current) return;
          InCallManager.start({ media: isVideo ? 'video' : 'audio' });
          InCallManager.setSpeakerphoneOn(isVideo);
          playRingback();
          const pc = createPC(stream);
          const offerDesc = await pc.createOffer(
            isVideo ? { offerToReceiveVideo: true, offerToReceiveAudio: true } : { offerToReceiveAudio: true }
          );
          await pc.setLocalDescription(offerDesc);
          sendWs({ type: 'call_offer', to: partnerId, to_name: partnerName, to_avatar: partnerAvatar ?? null, call_type: callType, sdp: offerDesc });
        } catch {}
      } else if (autoAccept) {
        markCallAccepted(partnerId);
        stopIncoming();
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
          }
        } catch {}
      } else {
        InCallManager.start({ media: isVideo ? 'video' : 'audio' });
        setTimeout(() => playIncoming(), 200);
        Vibration.vibrate([0, 600, 400, 600], true);
      }
    };

    start();

    const timeout = setTimeout(() => {
      if (stateRef.current === 'ringing') hangupRef.current?.();
    }, 30_000);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
      cleanupCall();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = async (payload: WsPayload) => {
      const senderId = payload.from ?? payload.sender_id;
      if (senderId !== partnerId && payload.to !== partnerId) return;

      if (payload.type === 'call_answer') {
        stopRingback();
        InCallManager.setSpeakerphoneOn(isVideo);
        const pc = pcRef.current;
        if (!pc) return;
        try {
          if (payload.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushPendingCandidates(pc);
          }
          if (stateRef.current !== 'connected' && mountedRef.current) {
            if (!connectedAtRef.current) connectedAtRef.current = Date.now();
            notifyCallConnected(partnerId);
            setCallState('connected');
          }
        } catch {}
        return;
      }

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

      if (payload.type === 'call_offer' && isIncoming) {
        if ((pcRef.current as any)?.localDescription) return;
        const pc = pcRef.current;
        if (!pc) { setTimeout(() => handler(payload), 500); return; }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs({ type: 'call_answer', to: partnerId, sdp: answer });
        } catch {}
        return;
      }

      if (payload.type === 'call_hangup') {
        const wasConnected = !!connectedAtRef.current;
        if (!wasConnected && !isIncoming) playRejected();
        notifyCallEnded(partnerId);
        markCallEnded(partnerId);
        if (mountedRef.current) setCallState('ended');
      }
    };

    addListener(handler);
    drainCallBuffer(partnerId)
      .filter(p => p.type !== 'call_hangup')
      .forEach(p => handler(p));
    return () => removeListener(handler);
  }, [partnerId, isVideo, isIncoming, addListener, removeListener, sendWs, flushPendingCandidates, notifyCallConnected, notifyCallEnded, markCallEnded, drainCallBuffer]);

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        if (mountedRef.current) setElapsed(p => p + 1);
      }, 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [callState]);

  const cleanupCall = useCallback(() => {
    InCallManager.stop();
    stopIncoming();
    stopRingback();
    stopRejected();
    Vibration.cancel();
    // Stopper tous les tracks (caméra + micro)
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t: any) => {
        try { t.enabled = false; } catch {}
        try { t.stop(); } catch {}
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (callState !== 'ended') return;
    cleanupCall();
    const delay = iInitiatedEndRef.current ? 0 : 1200;
    const t = setTimeout(() => { if (mountedRef.current) nav.goBack(); }, delay);
    return () => clearTimeout(t);
  }, [callState, cleanupCall]);

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

  const showIncomingUI = isIncoming && callState === 'ringing' && !autoAccept;

  const Avatar = () => partnerAvatar ? (
    <Image source={{ uri: partnerAvatar }} style={styles.avatarImg} />
  ) : (
    <LinearGradient colors={['#6C3AE6', '#C230A0']} style={styles.avatarImg}>
      <Text style={styles.avatarInitial}>{partnerName.charAt(0).toUpperCase()}</Text>
    </LinearGradient>
  );

  // ── INCOMING UI ────────────────────────────────────────────────────────────
  if (showIncomingUI) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <LinearGradient
          colors={['#0F0817', '#1C0D30', '#0F0817']}
          style={StyleSheet.absoluteFill}
        />

        {/* Blurred avatar background */}
        {partnerAvatar && (
          <Image
            source={{ uri: partnerAvatar }}
            style={[StyleSheet.absoluteFill, { opacity: 0.08 }]}
            blurRadius={20}
            resizeMode="cover"
          />
        )}

        <Animated.View
          style={{ flex: 1, transform: [{ translateY: swipeY }], opacity: swipeOp }}
          {...panResponder.panHandlers}
        >
          {/* Top section */}
          <View style={[styles.incomingTop, { paddingTop: insets.top + 48 }]}>
            <Text style={styles.incomingTypeLabel}>
              {isVideo ? 'Appel vidéo' : 'Appel vocal'}
            </Text>
            <Text style={styles.incomingName}>{partnerName}</Text>
            <Text style={styles.incomingSubLabel}>Appel entrant</Text>
          </View>

          {/* Avatar center with pulse */}
          <View style={styles.avatarSection}>
            <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse2Anim }] }]} />
            <Animated.View style={[styles.pulseInner, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.avatarRing}>
              <Avatar />
            </View>
          </View>

          {/* Action buttons */}
          <View style={[styles.incomingActions, { paddingBottom: insets.bottom + 48 }]}>
            {/* Decline */}
            <View style={styles.incomingBtnWrap}>
              <TouchableOpacity style={styles.declineBtn} onPress={hangup} activeOpacity={0.85}>
                <Icon name="phone-off" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.incomingBtnLabel}>Refuser</Text>
            </View>

            {/* Accept */}
            <View style={styles.incomingBtnWrap}>
              <TouchableOpacity style={styles.acceptBtn} onPress={acceptCall} activeOpacity={0.85}>
                <Icon name="phone" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.incomingBtnLabel}>Accepter</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  // ── OUTGOING / CONNECTED / ENDED UI ───────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Remote video fullscreen */}
      {isVideo && remoteStream && callState === 'connected' ? (
        <RTCView streamURL={(remoteStream as any).toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      ) : (
        <LinearGradient
          colors={['#0F0817', '#1C0D30', '#0F0817']}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Blurred avatar background (voice calls) */}
      {!isVideo && partnerAvatar && (
        <Image
          source={{ uri: partnerAvatar }}
          style={[StyleSheet.absoluteFill, { opacity: 0.07 }]}
          blurRadius={20}
          resizeMode="cover"
        />
      )}

      {/* Local video PiP */}
      {isVideo && localStream && callState === 'connected' && !isCamOff && (
        <View style={styles.localVideo}>
          <RTCView streamURL={(localStream as any).toURL()} style={{ flex: 1 }} objectFit="cover" mirror zOrder={1} />
        </View>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        {callState === 'connected' ? (
          <TouchableOpacity style={styles.minimizeBtn} onPress={minimize} activeOpacity={0.8}>
            <Icon name="chevron-down" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.topName}>{partnerName}</Text>
          <Text style={styles.topStatus}>
            {callState === 'ringing'
              ? (isIncoming ? 'Connexion en cours…' : 'Appel en cours…')
              : callState === 'connected'
              ? formatElapsed(elapsed)
              : 'Appel terminé'}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Avatar (voice ou vidéo en attente) */}
      {(!isVideo || callState !== 'connected') && (
        <View style={styles.avatarSection}>
          {callState === 'ringing' && (
            <>
              <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse2Anim }] }]} />
              <Animated.View style={[styles.pulseInner, { transform: [{ scale: pulseAnim }] }]} />
            </>
          )}
          {callState === 'connected' && (
            <Animated.View style={[styles.ripple, {
              opacity: rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              transform: [{ scale: rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
            }]} />
          )}
          <View style={styles.avatarRing}>
            <Avatar />
          </View>
          {callState === 'connected' && (
            <Text style={styles.connectedLabel}>En communication</Text>
          )}
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
        {callState === 'connected' && (
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={toggleMute}>
              <View style={[styles.controlIcon, isMuted && styles.controlIconOn]}>
                <Icon name={isMuted ? 'mic-off' : 'mic'} size={22} color="#fff" />
              </View>
              <Text style={styles.controlLabel}>{isMuted ? 'Micro coupé' : 'Micro'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={toggleSpeaker}>
              <View style={[styles.controlIcon, isSpeaker && styles.controlIconOn]}>
                <Icon name={isSpeaker ? 'volume-2' : 'volume-x'} size={22} color="#fff" />
              </View>
              <Text style={styles.controlLabel}>Haut-parleur</Text>
            </TouchableOpacity>

            {isVideo && (
              <TouchableOpacity style={styles.controlBtn} onPress={toggleCamera}>
                <View style={[styles.controlIcon, isCamOff && styles.controlIconOn]}>
                  <Icon name={isCamOff ? 'camera-off' : 'camera'} size={22} color="#fff" />
                </View>
                <Text style={styles.controlLabel}>Caméra</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {callState === 'ended' ? (
          <View style={styles.endedWrap}>
            <Text style={styles.endedText}>Appel terminé</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.hangupBtn} onPress={hangup} activeOpacity={0.85}>
            <Icon name="phone-off" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0817' },

  // ── Incoming ────────────────────────────────────────────────────────────────
  incomingTop: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  incomingTypeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  incomingName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginTop: 4,
  },
  incomingSubLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 48,
  },
  incomingBtnWrap: {
    alignItems: 'center',
    gap: 12,
  },
  incomingBtnLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  declineBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#E53935',
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  acceptBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1DB954',
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },

  // ── Avatar + pulse ───────────────────────────────────────────────────────────
  avatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    elevation: 16,
    shadowColor: '#7B3FF2',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  avatarImg: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 48, fontWeight: '700', color: '#fff',
  },
  pulseOuter: {
    position: 'absolute',
    width: AVATAR_SIZE + 100,
    height: AVATAR_SIZE + 100,
    borderRadius: (AVATAR_SIZE + 100) / 2,
    backgroundColor: 'rgba(108,58,230,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108,58,230,0.2)',
  },
  pulseInner: {
    position: 'absolute',
    width: AVATAR_SIZE + 50,
    height: AVATAR_SIZE + 50,
    borderRadius: (AVATAR_SIZE + 50) / 2,
    backgroundColor: 'rgba(108,58,230,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(108,58,230,0.3)',
  },
  ripple: {
    position: 'absolute',
    width: AVATAR_SIZE + 60,
    height: AVATAR_SIZE + 60,
    borderRadius: (AVATAR_SIZE + 60) / 2,
    backgroundColor: 'rgba(29,185,84,0.25)',
  },
  connectedLabel: {
    position: 'absolute',
    bottom: -48,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // ── Outgoing/connected top ───────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  minimizeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  topName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  topStatus: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },

  // ── Local video PiP ─────────────────────────────────────────────────────────
  localVideo: {
    position: 'absolute',
    top: 100, right: 16,
    width: 110, height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    elevation: 10,
  },

  // ── Controls ────────────────────────────────────────────────────────────────
  controls: {
    paddingHorizontal: 24,
    gap: 32,
    zIndex: 10,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
  },
  controlIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  controlIconOn: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  hangupBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#E53935',
    alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  endedWrap: {
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  endedText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
});
