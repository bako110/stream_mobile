/**
 * LiveStreamScreen — Diffusion live concert artiste via LiveKit SDK.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, PermissionsAndroid, ActivityIndicator, TextInput, Image,
  TouchableWithoutFeedback,
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
import { useAutoHideControls } from '../../hooks/useAutoHideControls';
import { configureLiveAudioSession } from '../../utils/liveAudioSession';
import type { Concert, TicketsSold } from '../../types';
import { StageTileRow } from '../../components/live/StageTileRow';
import type { StageTile, StageBadge } from '../../components/live/StageTileRow';
import Orientation from 'react-native-orientation-locker';
import { Images } from '../../assets';

interface Props {
  concertId: string;
  onBack?: () => void;
}

/** Un concert/événement se diffuse TOUJOURS en paysage (scène large) —
 * jamais en vertical, contrairement au live simple créateur qui reste
 * toujours en portrait. On force le paysage dès l'entrée de cet écran et on
 * reverrouille le portrait à la sortie, pour ne pas perturber le reste de
 * l'app (verrouillée portrait par défaut). */
function useForceLandscape() {
  useEffect(() => {
    Orientation.lockToLandscape();
    return () => { Orientation.lockToPortrait(); };
  }, []);
}

const TIER_COLORS: Record<string, string> = {
  simple: '#3FEDB6',
  vip:    '#4FA8FF',
  vvip:   '#B07CFF',
  vvvip:  '#F59E0B',
};

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
      <View style={[styles.videoFrameFull, styles.noVideo]}>
        <Icon name="video-off" size={48} color="#666" />
      </View>
    );
  }
  return (
    <View style={styles.videoFrameFull}>
      <VideoTrack trackRef={camTrack} style={StyleSheet.absoluteFill} mirror={mirror} objectFit="cover" />
    </View>
  );
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
  useForceLandscape();
  const { controlsVisible, onTapVideo } = useAutoHideControls();
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
  // Caméra arrière par défaut — un live concert/événement filme la scène,
  // pas l'artiste/organisateur face à son téléphone (contrairement au live
  // simple créateur-à-créateur). L'utilisateur peut toujours basculer en
  // avant via le bouton Flip.
  const [cameraFront, setCameraFront] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  const [isRecording, setIsRecording] = useState(!!concert?.is_recording);
  const [recordingLoading, setRecordingLoading] = useState(false);
  useEffect(() => { setIsRecording(!!concert?.is_recording); }, [concert?.is_recording]);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Concert/événement : flux filmé en PAYSAGE (scène, public), contrairement
    // au live simple créateur-à-créateur qui reste en portrait. On force la
    // résolution de capture en 16:9 horizontal — le téléphone peut rester tenu
    // en portrait, seul le flux envoyé aux viewers est en paysage.
    localParticipant.setCameraEnabled(true, {
      facingMode: 'environment',
      resolution: { width: 1280, height: 720 },
    }).catch(() => {});
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
        resolution: { width: 1280, height: 720 },
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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Zone centrale — flux plein écran, toujours en paysage réel (écran
          verrouillé via useForceLandscape). Un tap affiche/masque les
          overlays (header, dashboard, contrôles) — comme un lecteur vidéo. */}
      <TouchableWithoutFeedback onPress={onTapVideo}>
        <View style={styles.videoZoneFull}>
          {!videoOff ? (
            <LocalCameraPreview mirror={cameraFront} />
          ) : (
            <View style={styles.videoFrameFull}>
              <Icon name="video-off" size={48} color="#666" />
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Zone du haut — overlay semi-transparent par-dessus la vidéo plein
          écran (comme TikTok/Instagram Live en paysage). Même structure que
          LiveViewerScreen : logo + titre/artiste à gauche, badges à droite.
          Masquée après quelques secondes d'inactivité. */}
      {controlsVisible && (
      <View style={[
        styles.topZone, styles.topZoneOverlay,
        { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right, paddingTop: 10 + insets.top },
      ]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleEndLive} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Image source={Images.logoDark} style={styles.headerLogo} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.concertTitle} numberOfLines={1}>{concert?.title ?? ''}</Text>
              <Text style={styles.artistText}>Toi — {formatTime(elapsed)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <LinearGradient colors={['#F0365A', '#C01942']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>EN DIRECT</Text>
            </LinearGradient>
            <View style={styles.viewerBadge}>
              <Icon name="eye" size={13} color="#fff" />
              <Text style={styles.viewerText}>{viewerCount}</Text>
            </View>
          </View>
        </View>

        {/* Mini-dashboard "ventes en temps réel" — toujours visible dès que le
            concert est payant (pas caché derrière un tap), inspiré du panneau
            web artiste : total + un chip par tier, couleur dédiée. Tap ouvre
            le détail complet (barres de progression, revenu net). */}
        {accessType === 'ticket' && ticketsSold && (
          <TouchableOpacity style={styles.salesDash} onPress={() => setShowSalesPanel(true)} activeOpacity={0.9}>
            <View style={styles.salesDashHeader}>
              <View style={styles.salesDashTotals}>
                <Text style={styles.salesDashBig}>{ticketsSold.total_sold}</Text>
                <Text style={styles.salesDashBigLabel}>vendus</Text>
              </View>
              <View style={styles.salesDashDivider} />
              <View style={styles.salesDashTotals}>
                <Text style={[styles.salesDashBig, { color: '#3FEDB6' }]}>{ticketsSold.total_revenue_eur.toFixed(0)}€</Text>
                <Text style={styles.salesDashBigLabel}>encaissés</Text>
              </View>
              <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 'auto' }} />
            </View>
            {ticketsSold.tiers.length > 0 && (
              <View style={styles.salesDashChips}>
                {ticketsSold.tiers.map(t => (
                  <View key={t.tier} style={[styles.salesChip, { borderColor: TIER_COLORS[t.tier] + '55', backgroundColor: TIER_COLORS[t.tier] + '15' }]}>
                    <View style={[styles.salesChipDot, { backgroundColor: TIER_COLORS[t.tier] }]} />
                    <Text style={[styles.salesChipText, { color: TIER_COLORS[t.tier] }]}>{t.tier.toUpperCase()} {t.sold}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
      )}

      {/* Zone du bas — overlay semi-transparent par-dessus la vidéo plein
          écran. Masquée après quelques secondes d'inactivité. */}
      {controlsVisible && (
      <View style={[
        styles.bottomZone,
        styles.bottomZoneOverlay,
        {
          paddingBottom: (Platform.OS === 'ios' ? 24 : 16) + insets.bottom,
          paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right,
        },
      ]}>
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
            <View style={[styles.controlIconWrap, muted && styles.controlIconWrapActive]}>
              <Icon name={muted ? 'mic-off' : 'mic'} size={20} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleVideo} style={styles.controlBtn}>
            <View style={[styles.controlIconWrap, videoOff && styles.controlIconWrapActive]}>
              <Icon name={videoOff ? 'video-off' : 'video'} size={20} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>{videoOff ? 'Cam On' : 'Cam Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={flipCamera} style={styles.controlBtn}>
            <View style={styles.controlIconWrap}>
              <Icon name="refresh-cw" size={20} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleRecording} disabled={recordingLoading} style={styles.controlBtn}>
            <View style={[styles.controlIconWrap, isRecording && styles.controlIconWrapRecording]}>
              {recordingLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name={isRecording ? 'check-circle' : 'video'} size={20} color="#fff" />}
            </View>
            <Text style={styles.controlLabel}>{isRecording ? 'Stop rec' : 'Enregistrer'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEndLive} style={styles.controlBtn}>
            <View style={styles.endIconWrap}>
              <Icon name="square" size={18} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>Terminer</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}

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
  salesDash: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  salesDashHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  salesDashTotals: { alignItems: 'flex-start' },
  salesDashBig: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  salesDashBigLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10.5, fontWeight: '600' },
  salesDashDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.14)' },
  salesDashChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  salesChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
  },
  salesChipDot: { width: 6, height: 6, borderRadius: 3 },
  salesChipText: { fontSize: 10.5, fontWeight: '800' },
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
  // Écran toujours en paysage (useForceLandscape) : header/contrôles en
  // overlay flottant par-dessus la vidéo plein écran, comme TikTok/Instagram
  // Live — la vidéo occupe tout l'espace, rien ne lui vole de place.
  topZone: {
    paddingBottom: 14,
    gap: 10,
  },
  topZoneOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingTop: 14, paddingBottom: 10,
  },
  bottomZoneOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 0, paddingTop: 10,
  },
  videoZoneFull: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  videoFrameFull: {
    width: '100%', height: '100%',
    backgroundColor: '#0A0A0A', overflow: 'hidden',
  },
  backBtn:   { padding: 8, alignSelf: 'flex-start' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: { width: 26, height: 26 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, gap: 5,
    shadowColor: '#F0365A', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  liveDot:   { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  liveText:  { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, gap: 5,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  concertTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  artistText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500', marginTop: 1 },
  bottomZone: {
    flex: 1,
    paddingTop: 18,
    justifyContent: 'flex-end',
  },
  controls:     { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  controlBtn:   { alignItems: 'center', gap: 6 },
  controlIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  controlIconWrapActive:    { backgroundColor: 'rgba(240,54,90,0.55)' },
  controlIconWrapRecording: { backgroundColor: 'rgba(240,54,90,0.85)' },
  endIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#F0365A', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  controlLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '600' },
});
