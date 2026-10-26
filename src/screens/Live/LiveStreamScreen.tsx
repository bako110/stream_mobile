/**
 * LiveStreamScreen — Diffusion live concert artiste via LiveKit SDK.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, PermissionsAndroid, ActivityIndicator, Animated, TextInput,
} from 'react-native';
import {
  LiveKitRoom,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track, VideoPresets } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { concertService, liveService, toastService, showConfirm } from '../../services';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { configureLiveAudioSession } from '../../utils/liveAudioSession';
import type { Concert, TicketsSold } from '../../types';
import { StageTileRow } from '../../components/live/StageTileRow';
import type { StageTile, StageBadge } from '../../components/live/StageTileRow';

interface Props {
  concertId: string;
  onBack?: () => void;
}

// Participants déjà autorisés à publier (invités sur scène) — identifiés via
// leur permission LiveKit can_publish plutôt qu'un state serveur séparé, pour
// rester cohérent instantanément avec invite_participant côté backend.
function useOnStageIdentities(): Set<string> {
  const remoteParticipants = useRemoteParticipants();
  return new Set(
    remoteParticipants.filter(p => p.permissions?.canPublish).map(p => p.identity),
  );
}

// ── LiveKit quality config ─────────────────────────────────────────────────────

const CREATOR_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    videoCodec: 'h264' as const,
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h720],
    videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
  },
};

// ── Aperçu caméra locale ──────────────────────────────────────────────────────
// Composant séparé pour que useTracks déclenche son propre re-render
// dès que setCameraEnabled(true) publie le track local.

const LocalCameraPreview: React.FC<{ mirror: boolean }> = ({ mirror }) => {
  const allTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const camTrack = allTracks.find(t => t.participant.isLocal) ?? null;

  if (!camTrack) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.noVideo]}>
        <Icon name="video-off" size={48} color="#666" />
      </View>
    );
  }
  return <VideoTrack trackRef={camTrack} style={StyleSheet.absoluteFill} mirror={mirror} />;
};

// ── Contrôles live ─────────────────────────────────────────────────────────────

const StreamControls: React.FC<{
  concert: Concert | null;
  concertId: string;
  liveId: string | null;
  onEnd: () => void;
}> = ({ concert, concertId, liveId, onEnd }) => {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const onStageIdentities = useOnStageIdentities();
  const allCamTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [showInvite, setShowInvite] = useState(false);
  const [showMonetize, setShowMonetize] = useState(false);
  const [ticketPriceInput, setTicketPriceInput] = useState('');
  const [monetizing, setMonetizing] = useState(false);
  const [accessType, setAccessType] = useState(concert?.access_type ?? 'free');
  useEffect(() => { setAccessType(concert?.access_type ?? 'free'); }, [concert?.access_type]);
  const [ticketsSold, setTicketsSold] = useState<TicketsSold | null>(null);
  const [showSalesPanel, setShowSalesPanel] = useState(false);
  useEffect(() => {
    if (accessType !== 'ticket') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await concertService.getTicketsSold(concertId);
        if (!cancelled) setTicketsSold(data);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [accessType, concertId]);
  const insets = useSafeAreaInsets();
  const [muted,       setMuted]       = useState(false);
  const [videoOff,    setVideoOff]    = useState(false);
  const [cameraFront, setCameraFront] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  const [isRecording, setIsRecording] = useState(!!concert?.is_recording);
  const [recordingLoading, setRecordingLoading] = useState(false);
  useEffect(() => { setIsRecording(!!concert?.is_recording); }, [concert?.is_recording]);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannerY     = useRef(new Animated.Value(-80)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Banner de lancement — slide down, disparaît après 4s
  useEffect(() => {
    Animated.spring(bannerY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
    bannerTimer.current = setTimeout(() => {
      Animated.timing(bannerY, { toValue: -80, duration: 350, useNativeDriver: true }).start();
    }, 4000);
    return () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); };
  }, []);

  useEffect(() => {
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});

    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    pollRef.current = setInterval(async () => {
      try {
        const s = await concertService.getStreamStatus(concertId);
        setViewerCount(s.current_viewers ?? 0);
      } catch {}
    }, 10_000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current)  clearInterval(pollRef.current);
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    };
  }, [localParticipant, concertId]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localParticipant.setMicrophoneEnabled(!next).catch(() => {});
    setMuted(next);
  }, [muted, localParticipant]);

  const toggleVideo = useCallback(() => {
    const next = !videoOff;
    localParticipant.setCameraEnabled(!next).catch(() => {});
    setVideoOff(next);
  }, [videoOff, localParticipant]);

  // Flip caméra : setCameraEnabled(false) + republier avec facingMode inversé
  const flipCamera = useCallback(async () => {
    const next = !cameraFront;
    setCameraFront(next);
    try {
      await localParticipant.setCameraEnabled(false);
      await localParticipant.setCameraEnabled(true, {
        facingMode: next ? 'user' : 'environment',
      });
    } catch {}
  }, [cameraFront, localParticipant]);

  const toggleRecording = useCallback(async () => {
    if (recordingLoading) return;
    setRecordingLoading(true);
    const next = !isRecording;
    try {
      const r = await concertService.toggleRecording(concertId, next);
      setIsRecording(r.recording);
      toastService.success(r.recording ? 'Enregistrement démarré' : 'Enregistrement arrêté');
    } catch {
      toastService.error("Impossible de modifier l'enregistrement pour le moment");
    } finally {
      setRecordingLoading(false);
    }
  }, [concertId, isRecording, recordingLoading]);

  const handleEndLive = useCallback(() => {
    showConfirm('Terminer le live ?', 'Tous les viewers seront déconnectés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: onEnd },
    ]);
  }, [onEnd]);

  const handleInvite = useCallback(async (identity: string) => {
    if (!liveId) return;
    try {
      await liveService.invite(liveId, identity);
      toastService.success('Invité ajouté sur scène');
    } catch {
      toastService.error('Impossible d\'inviter ce participant');
    } finally {
      setShowInvite(false);
    }
  }, [liveId]);

  const handleMonetize = useCallback(async () => {
    const price = parseFloat(ticketPriceInput.replace(',', '.'));
    if (!price || price <= 0) {
      toastService.error('Entre un prix valide');
      return;
    }
    setMonetizing(true);
    try {
      await concertService.monetize(concertId, price);
      setAccessType('ticket');
      toastService.success(`Billetterie activée à ${price}€`);
      setShowMonetize(false);
      setTicketPriceInput('');
    } catch (e: any) {
      toastService.error('Erreur', e?.response?.data?.detail ?? 'Impossible d\'activer la billetterie');
    } finally {
      setMonetizing(false);
    }
  }, [concertId, ticketPriceInput]);

  const invitableParticipants = remoteParticipants.filter(p => !onStageIdentities.has(p.identity));

  const stageTiles: StageTile[] = allCamTracks
    .filter(t => !t.participant.isLocal && onStageIdentities.has(t.participant.identity))
    .map(t => ({
      identity: t.participant.identity,
      name:     t.participant.name || t.participant.identity,
      track:    t,
      camOn:    !t.publication?.isMuted,
      badge:    'star' as StageBadge,
      micOn:    !t.publication?.isMuted,
    }));

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {!videoOff ? (
        <LocalCameraPreview mirror={cameraFront} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noVideo]}>
          <Icon name="video-off" size={48} color="#666" />
        </View>
      )}

      {/* Banner lancement — slide down, auto-dismiss 4s */}
      <Animated.View style={[styles.launchBanner, { transform: [{ translateY: bannerY }] }]}>
        <View style={styles.launchDot} />
        <Text style={styles.launchTxt}>🎙 Live lancé · tu es en direct !</Text>
      </Animated.View>

      {/* Top overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={styles.topOverlay}>
        <TouchableOpacity onPress={handleEndLive} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
        </View>
        <View style={styles.viewerBadge}>
          <Icon name="eye" size={14} color="#fff" />
          <Text style={styles.viewerText}>{viewerCount}</Text>
        </View>
      </LinearGradient>

      {concert && (
        <View style={styles.titleBar}>
          <Text style={styles.concertTitle} numberOfLines={1}>{concert.title}</Text>
        </View>
      )}

      {/* Carte compacte "ventes en temps réel" — visible uniquement si le
          concert est payant, ouvre le détail par tier au tap. */}
      {accessType === 'ticket' && ticketsSold && (
        <TouchableOpacity style={styles.salesCard} onPress={() => setShowSalesPanel(true)} activeOpacity={0.85}>
          <Icon name="tag" size={14} color="#3FEDB6" />
          <Text style={styles.salesCardText}>
            {ticketsSold.total_sold} billet{ticketsSold.total_sold > 1 ? 's' : ''} vendu{ticketsSold.total_sold > 1 ? 's' : ''} — {ticketsSold.total_revenue_eur.toFixed(0)}€
          </Text>
          <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      )}

      {/* Bottom controls */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={[styles.bottomOverlay, { paddingBottom: (Platform.OS === 'ios' ? 40 : 24) + insets.bottom }]}>
        {stageTiles.length > 0 && (
          <View style={styles.stageRowWrap}>
            <StageTileRow tiles={stageTiles} onInvite={liveId ? () => setShowInvite(true) : undefined} />
          </View>
        )}
        <View style={styles.quickActionsRow}>
          {stageTiles.length === 0 && !!liveId && (
            <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.inviteStandaloneBtn}>
              <Icon name="user-plus" size={16} color="#fff" />
              <Text style={styles.inviteStandaloneText}>Inviter sur scène</Text>
            </TouchableOpacity>
          )}
          {accessType === 'free' && (
            <TouchableOpacity onPress={() => setShowMonetize(true)} style={styles.monetizeBtn}>
              <Icon name="tag" size={16} color="#fff" />
              <Text style={styles.inviteStandaloneText}>Vendre des billets</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.controls}>
          <TouchableOpacity onPress={toggleMute} style={styles.controlBtn}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
            <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleVideo} style={styles.controlBtn}>
            <Icon name={videoOff ? 'video-off' : 'video'} size={22} color="#fff" />
            <Text style={styles.controlLabel}>{videoOff ? 'Cam On' : 'Cam Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={flipCamera} style={styles.controlBtn}>
            <Icon name="refresh-cw" size={22} color="#fff" />
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleRecording} disabled={recordingLoading} style={styles.controlBtn}>
            {recordingLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Icon name={isRecording ? 'check-circle' : 'video'} size={22} color={isRecording ? '#F0365A' : '#fff'} />}
            <Text style={styles.controlLabel}>{isRecording ? 'Stop rec' : 'Enregistrer'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEndLive} style={[styles.controlBtn, styles.endBtn]}>
            <Icon name="square" size={22} color="#fff" />
            <Text style={styles.controlLabel}>End</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Inviter un participant connecté sur scène — liste simple, pas de demande
          payante préalable requise (invite_participant accepte un identity libre). */}
      {showInvite && (
        <View style={styles.inviteOverlay}>
          <View style={styles.inviteSheet}>
            <View style={styles.inviteSheetHeader}>
              <Text style={styles.inviteSheetTitle}>Inviter sur scène</Text>
              <TouchableOpacity onPress={() => setShowInvite(false)}>
                <Icon name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {invitableParticipants.length === 0 ? (
              <Text style={styles.inviteEmptyText}>Aucun spectateur connecté pour l'instant.</Text>
            ) : (
              invitableParticipants.map(p => (
                <TouchableOpacity key={p.identity} style={styles.inviteRow} onPress={() => handleInvite(p.identity)}>
                  <Icon name="user" size={16} color="#fff" />
                  <Text style={styles.inviteRowText} numberOfLines={1}>{p.name || p.identity}</Text>
                  <Icon name="plus-circle" size={18} color="#3FEDB6" />
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      )}

      {/* Commercialiser l'accès en plein live — bascule l'event/concert gratuit
          en payant (PATCH .../monetize), les nouveaux viewers devront payer. */}
      {showMonetize && (
        <View style={styles.inviteOverlay}>
          <View style={styles.inviteSheet}>
            <View style={styles.inviteSheetHeader}>
              <Text style={styles.inviteSheetTitle}>Vendre des billets</Text>
              <TouchableOpacity onPress={() => setShowMonetize(false)}>
                <Icon name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.monetizeHint}>
              Les spectateurs déjà connectés restent gratuitement. Les nouveaux devront acheter un billet.
            </Text>
            <View style={styles.monetizeInputRow}>
              <Text style={styles.monetizeCurrency}>€</Text>
              <TextInput
                value={ticketPriceInput}
                onChangeText={setTicketPriceInput}
                placeholder="Prix du billet"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                style={styles.monetizeInput}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[styles.monetizeConfirmBtn, monetizing && styles.disabledBtn]}
              onPress={handleMonetize}
              disabled={monetizing}
            >
              {monetizing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.monetizeConfirmText}>Activer la vente</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Panneau détaillé des ventes — ouvert depuis la carte compacte. */}
      {showSalesPanel && ticketsSold && (
        <View style={styles.inviteOverlay}>
          <View style={styles.inviteSheet}>
            <View style={styles.inviteSheetHeader}>
              <Text style={styles.inviteSheetTitle}>Vente de billets</Text>
              <TouchableOpacity onPress={() => setShowSalesPanel(false)}>
                <Icon name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.salesSummaryRow}>
              <View style={styles.salesSummaryBox}>
                <Text style={styles.salesSummaryValue}>{ticketsSold.total_sold}</Text>
                <Text style={styles.salesSummaryLabel}>Billets vendus</Text>
              </View>
              <View style={styles.salesSummaryBox}>
                <Text style={[styles.salesSummaryValue, { color: '#3FEDB6' }]}>{ticketsSold.total_revenue_eur.toFixed(0)}€</Text>
                <Text style={styles.salesSummaryLabel}>Revenu brut</Text>
              </View>
            </View>
            {ticketsSold.tiers.map(t => {
              const max = ticketsSold.max_attendees;
              const pct = max ? Math.min(100, Math.round((t.sold / max) * 100)) : null;
              return (
                <View key={t.tier} style={styles.tierRow}>
                  <View style={styles.tierRowHeader}>
                    <Text style={styles.tierRowLabel}>{t.tier.toUpperCase()} — {t.price_eur}€</Text>
                    <Text style={styles.tierRowCount}>{t.sold}{max ? ` / ${max}` : ''}</Text>
                  </View>
                  {pct !== null && (
                    <View style={styles.tierProgressTrack}>
                      <View style={[styles.tierProgressFill, { width: `${pct}%` }]} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const LiveStreamScreen: React.FC<Props> = ({ concertId, onBack }) => {
  useKeepAwake();
  useEffect(() => { configureLiveAudioSession(); }, []);
  const nav = useNavigation();
  const [concert,  setConcert]  = useState<Concert | null>(null);
  const [token,    setToken]    = useState<string | null>(null);
  const [wsUrl,    setWsUrl]    = useState<string | null>(null);
  const [liveId,   setLiveId]   = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [isLive,   setIsLive]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await concertService.getById(concertId);
        setConcert(data);
        if (data.status === 'live') {
          // Préférer le nouveau chemin unifié (Live) quand le concert en a un —
          // seul lui permet la scène/cadeaux (room "live-{id}"). Fallback sur
          // l'ancien streaming.py pour les concerts créés avant cette bascule.
          if (data.live_id) {
            const result = await liveService.getToken(data.live_id).catch(() => null);
            if (result) { setToken(result.token); setWsUrl(result.livekit_url); setLiveId(data.live_id); setIsLive(true); }
          } else {
            const result = await concertService.getStreamToken(concertId).catch(() => null);
            if (result) { setToken(result.token); setWsUrl(result.livekit_url); setIsLive(true); }
          }
        }
      } catch {}
    })();
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]).catch(() => {});
    }
  }, [concertId]);

  const handleStartLive = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (concert?.live_id) {
        const result = await liveService.goLive(concert.live_id);
        setToken(result.token);
        setWsUrl(result.livekit_url);
        setLiveId(concert.live_id);
        setIsLive(true);
      } else {
        const result = await concertService.startLive(concertId);
        setToken(result.token);
        setWsUrl(result.livekit_url);
        setIsLive(true);
      }
    } catch (e: any) {
      toastService.error('Erreur', e?.response?.data?.detail || 'Impossible de démarrer le live');
    } finally {
      setStarting(false);
    }
  }, [concertId, concert?.live_id, starting]);

  const handleEnd = useCallback(async () => {
    try {
      if (liveId) await liveService.stopLive(liveId);
      else await concertService.endLive(concertId);
    } catch {}
    setIsLive(false);
    setToken(null);
    if (onBack) onBack(); else nav.goBack();
  }, [concertId, liveId, nav, onBack]);

  if (isLive && token && wsUrl) {
    return (
      <LiveKitRoom serverUrl={wsUrl} token={token} connect options={CREATOR_ROOM_OPTIONS}>
        <StreamControls concert={concert} concertId={concertId} liveId={liveId} onEnd={handleEnd} />
      </LiveKitRoom>
    );
  }

  return (
    <View style={[styles.container, styles.preLive]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Icon name="radio" size={56} color="#E53E3E" />
      <Text style={styles.preTitle}>{concert?.title ?? 'Concert'}</Text>
      <Text style={styles.preSub}>Prêt à démarrer le live ?</Text>
      <TouchableOpacity
        style={[styles.goLiveBtn, starting && styles.disabledBtn]}
        onPress={handleStartLive}
        disabled={starting}
      >
        {starting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Icon name="radio" size={20} color="#fff" />
            <Text style={styles.goLiveBtnText}>Go Live</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => onBack ? onBack() : nav.goBack()}>
        <Text style={styles.cancelText}>Annuler</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  stageRowWrap: { marginBottom: 14 },
  quickActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  inviteStandaloneBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  monetizeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(63,237,182,0.22)', borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  inviteStandaloneText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  monetizeHint: { color: '#999', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  monetizeInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16,
  },
  monetizeCurrency: { color: '#fff', fontSize: 18, fontWeight: '700' },
  monetizeInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 12 },
  monetizeConfirmBtn: {
    backgroundColor: '#3FEDB6', borderRadius: 24,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  monetizeConfirmText: { color: '#0A0A0A', fontSize: 15, fontWeight: '800' },
  salesCard: {
    position: 'absolute', top: Platform.OS === 'ios' ? 128 : 108, left: 16, right: 16, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(20,16,31,0.75)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(63,237,182,0.35)',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  salesCardText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },
  salesSummaryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  salesSummaryBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', gap: 2,
  },
  salesSummaryValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  salesSummaryLabel: { color: '#999', fontSize: 11, fontWeight: '600' },
  tierRow: { marginBottom: 14 },
  tierRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tierRowLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tierRowCount: { color: '#999', fontSize: 13, fontWeight: '600' },
  tierProgressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  tierProgressFill: { height: '100%', borderRadius: 3, backgroundColor: '#3FEDB6' },
  inviteOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', zIndex: 30,
  },
  inviteSheet: {
    backgroundColor: '#161221', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, maxHeight: '60%',
  },
  inviteSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  inviteSheetTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  inviteEmptyText: { color: '#999', fontSize: 14, paddingVertical: 12 },
  inviteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  inviteRowText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  preLive:   { justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 },
  preTitle:  { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  preSub:    { color: '#999', fontSize: 15 },
  goLiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E53E3E', borderRadius: 30,
    paddingVertical: 14, paddingHorizontal: 40, gap: 8, marginTop: 8,
  },
  goLiveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledBtn:   { opacity: 0.6 },
  cancelBtn:     { marginTop: 4 },
  cancelText:    { color: '#999', fontSize: 15 },
  noVideo: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 10,
  },
  backBtn:   { padding: 8 },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E53E3E', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 5 },
  liveText:  { color: '#fff', fontWeight: '700', fontSize: 12 },
  timerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  titleBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 16, right: 16, zIndex: 10,
  },
  concertTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 40, paddingHorizontal: 16, zIndex: 10,
  },
  controls:     { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  controlBtn:   { alignItems: 'center', gap: 4 },
  controlLabel: { color: '#fff', fontSize: 11 },
  endBtn:       { backgroundColor: '#E53E3E', borderRadius: 24, padding: 12 },
  launchBanner: {
    position: 'absolute', top: Platform.OS === 'ios' ? 54 : 36,
    left: 20, right: 20, zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(229,62,62,0.92)',
    borderRadius: 14, paddingVertical: 11, paddingHorizontal: 16,
    shadowColor: '#E53E3E', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  launchDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff' },
  launchTxt: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
});
