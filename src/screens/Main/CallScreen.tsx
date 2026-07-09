/**
 * CallScreen — Appel vocal / vidéo
 * Design professionnel type FaceTime/WhatsApp
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Vibration, Animated, Easing, PermissionsAndroid,
  Image, Dimensions, PanResponder, TextInput, FlatList, KeyboardAvoidingView,
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
import { callConnectionService } from '../../services/callConnectionService';

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
  const [isFrontCam,   setIsFrontCam]   = useState(true);
  const [isLocked,     setIsLocked]     = useState(false);
  const [showUnlockHint, setShowUnlockHint] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'medium' | 'poor' | 'unknown'>('unknown');
  const [connIssue,    setConnIssue]    = useState<'reconnecting' | 'lost' | null>(null);
  const [chatOpen,      setChatOpen]     = useState(false);
  const [chatMessages,  setChatMessages] = useState<{ id: string; text: string; fromMe: boolean; at: number }[]>([]);
  const [chatDraft,     setChatDraft]    = useState('');
  const [unreadChat,    setUnreadChat]   = useState(0);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef          = useRef<CallState>('ringing');
  const pendingCandidates = useRef<any[]>([]);
  const remoteStreamRef   = useRef<MediaStream | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const mountedRef        = useRef(true);
  const connectedAtRef    = useRef<number | null>(null);
  const iInitiatedEndRef  = useRef(false);
  const statsIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBytesRef      = useRef<{ bytes: number; at: number } | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // sendWs gere deja le retry en interne (WebSocketContext)

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
        ? [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.CAMERA]
        : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
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
      if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
      if (mountedRef.current) setConnIssue(null);
      if (stateRef.current !== 'connected') {
        connectedAtRef.current = Date.now();
        notifyCallConnected(partnerId);
        startCall({ partnerId, partnerName, partnerAvatar, callType });
        callConnectionService.reportCallActive(partnerId);
        if (mountedRef.current) setCallState('connected');
      }
    };

    const onIceTrouble = (s: string) => {
      if (stateRef.current !== 'connected') return;
      if (s === 'disconnected') {
        if (mountedRef.current) setConnIssue('reconnecting');
        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setConnIssue('lost');
          hangupRef.current?.();
        }, 15_000);
      } else if (s === 'failed') {
        try { (pc as any).restartIce?.(); } catch {}
        if (mountedRef.current) setConnIssue('lost');
        hangupRef.current?.();
      }
    };

    (pc as any).oniceconnectionstatechange = () => {
      const s = (pc as any).iceConnectionState as string;
      if (s === 'connected' || s === 'completed') onConnected();
      else if (s === 'disconnected' || s === 'failed') onIceTrouble(s);
    };
    (pc as any).onconnectionstatechange = () => {
      const s = (pc as any).connectionState as string;
      if (s === 'connected') onConnected();
      else if (s === 'disconnected' || s === 'failed') onIceTrouble(s);
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
        const answerPayload = (answer as any).toJSON ? (answer as any).toJSON() : { type: answer.type, sdp: answer.sdp };
        console.log('[CALL] sending call_answer to=', partnerId);
        sendWs({ type: 'call_answer', to: partnerId, sdp: answerPayload });
      }
    } catch (e) { console.log('[CALL] acceptCall error', e); hangupRef.current?.(); }
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
    callConnectionService.endCallLocal(partnerId);
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
          callConnectionService.reportOutgoingCall(partnerId, partnerName);
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
          const sdpPayload = (offerDesc as any).toJSON ? (offerDesc as any).toJSON() : { type: offerDesc.type, sdp: offerDesc.sdp };
          console.log('[CALL] sending call_offer to=', partnerId, 'sdp type=', sdpPayload.type);
          sendWs({ type: 'call_offer', to: partnerId, to_name: partnerName, to_avatar: partnerAvatar ?? null, call_type: callType, sdp: sdpPayload });
        } catch (e) { console.log('[CALL] outgoing start error', e); }
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
            const ans2 = (answer as any).toJSON ? (answer as any).toJSON() : { type: answer.type, sdp: answer.sdp };
            sendWs({ type: 'call_answer', to: partnerId, sdp: ans2 });
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
          const ans3 = (answer as any).toJSON ? (answer as any).toJSON() : { type: answer.type, sdp: answer.sdp };
          sendWs({ type: 'call_answer', to: partnerId, sdp: ans3 });
        } catch (e) { console.log('[CALL] re-offer answer error', e); }
        return;
      }

      if (payload.type === 'call_hangup') {
        const wasConnected = !!connectedAtRef.current;
        if (!wasConnected && !isIncoming) playRejected();
        notifyCallEnded(partnerId);
        markCallEnded(partnerId);
        callConnectionService.endCall(partnerId);
        if (mountedRef.current) setCallState('ended');
        return;
      }

      if (payload.type === 'call_chat') {
        const text = String(payload.text ?? '').slice(0, 500);
        if (!text || !mountedRef.current) return;
        setChatMessages(prev => [...prev, { id: `${Date.now()}-r`, text, fromMe: false, at: Date.now() }]);
        setUnreadChat(n => n + 1);
        return;
      }

      if (payload.type === 'call_reaction') {
        const emoji = String(payload.emoji ?? '').slice(0, 8);
        if (!emoji || !mountedRef.current) return;
        const id = `${Date.now()}-${Math.random()}`;
        const x = 20 + Math.random() * 60;
        setFloatingReactions(prev => [...prev, { id, emoji, x }]);
        setTimeout(() => { if (mountedRef.current) setFloatingReactions(prev => prev.filter(r => r.id !== id)); }, 2200);
      }
    };

    addListener(handler);
    drainCallBuffer(partnerId).forEach(p => handler(p));
    return () => removeListener(handler);
  }, [partnerId, isVideo, isIncoming, addListener, removeListener, sendWs, flushPendingCandidates, notifyCallConnected, notifyCallEnded, markCallEnded, drainCallBuffer]);

  // ── Qualité réseau (stats WebRTC) ─────────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'connected') {
      if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }
      lastBytesRef.current = null;
      return;
    }
    statsIntervalRef.current = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const report = await (pc as any).getStats();
        let packetsLost = 0, packetsReceived = 0, bytesReceived = 0, rtt: number | null = null;
        report.forEach((stat: any) => {
          if (stat.type === 'inbound-rtp' && (stat.kind === 'audio' || stat.kind === 'video')) {
            packetsLost     += stat.packetsLost ?? 0;
            packetsReceived += stat.packetsReceived ?? 0;
            bytesReceived   += stat.bytesReceived ?? 0;
          }
          if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.currentRoundTripTime != null) {
            rtt = stat.currentRoundTripTime * 1000;
          }
        });
        const lossRatio = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;
        let quality: typeof networkQuality = 'good';
        if (lossRatio > 0.08 || (rtt !== null && rtt > 400)) quality = 'poor';
        else if (lossRatio > 0.02 || (rtt !== null && rtt > 200)) quality = 'medium';
        if (mountedRef.current) setNetworkQuality(quality);
      } catch { /* stats indisponibles sur ce device */ }
    }, 3000);
    return () => { if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; } };
  }, [callState]);

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
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
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

  const switchCamera = useCallback(() => {
    const t = localStreamRef.current?.getVideoTracks()[0] as any;
    if (t?._switchCamera) { t._switchCamera(); setIsFrontCam(v => !v); }
  }, []);

  const toggleLock = useCallback(() => {
    setIsLocked(v => {
      const next = !v;
      if (next) { setShowUnlockHint(true); setTimeout(() => setShowUnlockHint(false), 1800); }
      return next;
    });
  }, []);

  const sendChatMessage = useCallback(() => {
    const text = chatDraft.trim().slice(0, 500);
    if (!text) return;
    sendWs({ type: 'call_chat', to: partnerId, text });
    setChatMessages(prev => [...prev, { id: `${Date.now()}-m`, text, fromMe: true, at: Date.now() }]);
    setChatDraft('');
  }, [chatDraft, partnerId, sendWs]);

  const sendReaction = useCallback((emoji: string) => {
    sendWs({ type: 'call_reaction', to: partnerId, emoji });
    const id = `${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60;
    setFloatingReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2200);
  }, [partnerId, sendWs]);

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
        {callState === 'connected' && !isLocked ? (
          <TouchableOpacity style={styles.minimizeBtn} onPress={minimize} activeOpacity={0.8}>
            <Icon name="chevron-down" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.topName}>{partnerName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.topStatus}>
              {connIssue === 'reconnecting'
                ? 'Reconnexion…'
                : callState === 'ringing'
                ? (isIncoming ? 'Connexion en cours…' : 'Appel en cours…')
                : callState === 'connected'
                ? formatElapsed(elapsed)
                : 'Appel terminé'}
            </Text>
            {callState === 'connected' && !connIssue && <NetworkBadge quality={networkQuality} />}
          </View>
        </View>
        {callState === 'connected' && !isLocked ? (
          <TouchableOpacity style={styles.minimizeBtn} onPress={toggleLock} activeOpacity={0.8}>
            <Icon name="unlock" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
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

      {/* Réactions flottantes */}
      {floatingReactions.map(r => (
        <FloatingReaction key={r.id} emoji={r.emoji} x={r.x} bottom={insets.bottom + 160} />
      ))}

      {/* Écran verrouillé */}
      {isLocked && callState === 'connected' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => { setShowUnlockHint(true); setTimeout(() => setShowUnlockHint(false), 1400); }}
          >
            <View style={styles.lockIconTop}>
              <Icon name="lock" size={20} color="rgba(255,255,255,0.5)" />
            </View>
          </TouchableOpacity>
          {showUnlockHint && (
            <Text style={[styles.lockHint, { bottom: insets.bottom + 100 }]}>
              Touchez et maintenez pour déverrouiller
            </Text>
          )}
          <TouchableOpacity
            style={[styles.unlockBtn, { bottom: insets.bottom + 32 }]}
            onLongPress={toggleLock}
            delayLongPress={500}
            activeOpacity={0.8}
          >
            <Icon name="unlock" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Controls */}
      {!isLocked && (
        <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
          {callState === 'connected' && (
            <>
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

                {isVideo && !isCamOff && (
                  <TouchableOpacity style={styles.controlBtn} onPress={switchCamera}>
                    <View style={styles.controlIcon}>
                      <Icon name="refresh-cw" size={20} color="#fff" />
                    </View>
                    <Text style={styles.controlLabel}>Basculer</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.controlRow}>
                <TouchableOpacity style={styles.controlBtn} onPress={() => { setChatOpen(true); setUnreadChat(0); }}>
                  <View style={styles.controlIcon}>
                    <Icon name="message-circle" size={20} color="#fff" />
                    {unreadChat > 0 && (
                      <View style={styles.unreadDot}><Text style={styles.unreadDotText}>{unreadChat > 9 ? '9+' : unreadChat}</Text></View>
                    )}
                  </View>
                  <Text style={styles.controlLabel}>Chat</Text>
                </TouchableOpacity>

                <View style={styles.controlBtn}>
                  <View style={styles.reactionRow}>
                    {['❤️', '😂', '👍', '🔥'].map(e => (
                      <TouchableOpacity key={e} onPress={() => sendReaction(e)} style={styles.reactionBtn}>
                        <Text style={styles.reactionEmoji}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.controlLabel}>Réagir</Text>
                </View>

                <TouchableOpacity style={styles.controlBtn} onPress={toggleLock}>
                  <View style={styles.controlIcon}>
                    <Icon name="lock" size={19} color="#fff" />
                  </View>
                  <Text style={styles.controlLabel}>Verrouiller</Text>
                </TouchableOpacity>
              </View>
            </>
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
      )}

      {/* Chat pendant l'appel */}
      {chatOpen && (
        <CallChatPanel
          messages={chatMessages}
          draft={chatDraft}
          onChangeDraft={setChatDraft}
          onSend={sendChatMessage}
          onClose={() => setChatOpen(false)}
          insetsBottom={insets.bottom}
        />
      )}
    </View>
  );
};

function NetworkBadge({ quality }: { quality: 'good' | 'medium' | 'poor' | 'unknown' }) {
  if (quality === 'unknown') return null;
  const bars = quality === 'good' ? 3 : quality === 'medium' ? 2 : 1;
  const color = quality === 'good' ? '#3FEDB6' : quality === 'medium' ? '#F5A623' : '#E53935';
  return (
    <View style={styles.netBadge}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.netBar, { height: 4 + i * 3, backgroundColor: i < bars ? color : 'rgba(255,255,255,0.2)' }]} />
      ))}
    </View>
  );
}

function FloatingReaction({ emoji, x, bottom }: { emoji: string; x: number; bottom: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.Text
      style={[
        styles.floatingEmoji,
        {
          left: `${x}%`,
          bottom,
          opacity: anim.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -180] }) },
            { scale: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 1] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

function CallChatPanel({
  messages, draft, onChangeDraft, onSend, onClose, insetsBottom,
}: {
  messages: { id: string; text: string; fromMe: boolean; at: number }[];
  draft: string;
  onChangeDraft: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  insetsBottom: number;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.chatPanel}
    >
      <View style={styles.chatHeader}>
        <Text style={styles.chatHeaderTitle}>Messages</Text>
        <TouchableOpacity onPress={onClose} style={styles.chatCloseBtn}>
          <Icon name="chevron-down" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={m => m.id}
        style={styles.chatList}
        inverted
        renderItem={({ item }) => (
          <View style={[styles.chatBubble, item.fromMe ? styles.chatBubbleMe : styles.chatBubbleThem]}>
            <Text style={styles.chatBubbleText}>{item.text}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.chatEmpty}>Envoie un message sans quitter l'appel</Text>}
      />
      <View style={[styles.chatInputRow, { paddingBottom: insetsBottom + 10 }]}>
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="Message…"
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={styles.chatInput}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={onSend} style={styles.chatSendBtn}>
          <Icon name="send" size={17} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

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
    backgroundColor: '#3FEDB6',
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: '#3FEDB6',
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
    marginTop: 20,
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
    gap: 22,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
    minWidth: 64,
  },
  controlIcon: {
    width: 52, height: 52, borderRadius: 26,
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

  // ── Qualité réseau ────────────────────────────────────────────────────────────
  netBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingBottom: 1,
  },
  netBar: {
    width: 3,
    borderRadius: 1,
  },

  // ── Verrouillage ──────────────────────────────────────────────────────────────
  lockIconTop: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 100,
  },
  lockHint: {
    position: 'absolute',
    left: 24,
    right: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignSelf: 'center',
  },
  unlockBtn: {
    position: 'absolute',
    alignSelf: 'center',
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Réactions ─────────────────────────────────────────────────────────────────
  reactionRow: {
    flexDirection: 'row',
    gap: 4,
  },
  reactionBtn: {
    width: 26, height: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 18,
  },
  floatingEmoji: {
    position: 'absolute',
    fontSize: 32,
    zIndex: 30,
  },
  unreadDot: {
    position: 'absolute',
    top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#E53935',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadDotText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Chat pendant l'appel ──────────────────────────────────────────────────────
  chatPanel: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '55%',
    backgroundColor: 'rgba(15,8,23,0.97)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 40,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  chatCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  chatList: {
    flex: 1,
    paddingHorizontal: 14,
  },
  chatEmpty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
    transform: [{ scaleY: -1 }],
  },
  chatBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    marginVertical: 4,
  },
  chatBubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#7B3FF2',
  },
  chatBubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chatBubbleText: {
    color: '#fff',
    fontSize: 14,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chatSendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
  },
});
