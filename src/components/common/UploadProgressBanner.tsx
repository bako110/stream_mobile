/**
 * Indicateur de publication — pill flottante en haut de l'écran.
 *
 *   • pendant l'envoi (queued / compressing / uploading) : "Publication en cours…"
 *     avec un petit spinner et, si connu, le pourcentage
 *   • à la fin : "Publié ✓" (vert) ou "Échec de la publication" (rouge), puis
 *     disparaît tout seul après 3 s
 *
 * Universel : posts, événements, concerts, reels, messages — tout ce qui passe
 * par backgroundUploadService (enqueueVideo / enqueueImages / track).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useBackgroundUpload } from '../../hooks/useBackgroundUpload';
import type { UploadJob, UploadJobType } from '../../services/backgroundUploadService';

// Job affiché en priorité : un job actif (le plus récent), sinon le dernier
// terminé (pour montrer le "✓" / "✗" un court instant).
function pickJob(jobs: UploadJob[]): UploadJob | null {
  if (jobs.length === 0) return null;
  const active = jobs.filter(j => j.status !== 'done' && j.status !== 'error');
  if (active.length > 0) return active[active.length - 1];
  return jobs[jobs.length - 1];
}

const NOUN: Record<UploadJobType, string> = {
  post:    'Publication',
  reel:    'Reel',
  event:   'Événement',
  concert: 'Concert',
  message: 'Message',
};

export const UploadProgressBar: React.FC<{ bottomOffset?: number }> = () => {
  const insets = useSafeAreaInsets();
  const { theme: { colors } } = useTheme();
  const { visibleJobs } = useBackgroundUpload();
  const job = pickJob(visibleJobs);

  const slideY  = useRef(new Animated.Value(-70)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown]     = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = job?.status ?? null;
  const isActive   = status === 'queued' || status === 'compressing' || status === 'uploading';
  const isDone     = status === 'done';
  const isError    = status === 'error';
  const shouldShow = isActive || isDone || isError;

  useEffect(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }

    if (shouldShow) {
      setShown(true);
      Animated.parallel([
        Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, friction: 11, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, useNativeDriver: true, duration: 180 }),
      ]).start();

      // Auto-masquage uniquement une fois terminé
      if (isDone || isError) {
        hideTimer.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(slideY,  { toValue: -70, useNativeDriver: true, duration: 260 }),
            Animated.timing(opacity, { toValue: 0,   useNativeDriver: true, duration: 260 }),
          ]).start(() => setShown(false));
        }, 3000);
      }
    } else if (!job) {
      Animated.timing(opacity, { toValue: 0, useNativeDriver: true, duration: 200 }).start(() => setShown(false));
    }

    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // slideY / opacity sont des refs stables ; job n'est lu que pour son id/status
    // déjà en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, status, shouldShow, isDone, isError]);

  if (!shown || !job) return null;

  const noun = NOUN[job.type] ?? 'Publication';
  const accent = isError ? colors.error : isDone ? colors.success : colors.primary;
  const label  = isError
    ? `Échec — ${noun.toLowerCase()} non publié`
    : isDone
      ? `${noun} publié${noun === 'Publication' ? 'e' : ''} ✓`
      : `${noun} en cours d'envoi…`;

  const pct = isActive && job.progress > 0 && job.progress < 100 ? `${Math.round(job.progress)} %` : null;

  return (
    <Animated.View
      style={[st.wrap, { top: insets.top + 8, transform: [{ translateY: slideY }], opacity }]}
      pointerEvents="none"
    >
      <View style={[st.pill, { backgroundColor: colors.surface, borderColor: accent + '55' }]}>
        {isActive ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <View style={[st.iconDot, { backgroundColor: accent + '1F' }]}>
            <Icon name={isError ? 'alert-triangle' : 'check'} size={12} color={accent} />
          </View>
        )}
        <Text style={[st.label, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
        {pct && <Text style={[st.pct, { color: colors.textTertiary }]}>{pct}</Text>}
      </View>

      {/* Barre de progression fine sous la pill pendant l'envoi */}
      {isActive && (
        <View style={[st.track, { backgroundColor: colors.divider }]}>
          <View style={[st.fill, { backgroundColor: accent, width: `${Math.max(8, Math.min(100, job.progress))}%` }]} />
        </View>
      )}
    </Animated.View>
  );
};

export const UploadProgressBanner = UploadProgressBar;

const st = StyleSheet.create({
  wrap: {
    position:   'absolute',
    alignSelf:  'center',
    zIndex:     9999,
    elevation:  20,
    alignItems: 'center',
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    borderWidth:       1,
    borderRadius:      999,
    paddingVertical:   8,
    paddingHorizontal: 14,
    maxWidth:          320,
    shadowColor:       '#000',
    shadowOpacity:     0.16,
    shadowOffset:      { width: 0, height: 4 },
    shadowRadius:      12,
  },
  iconDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  pct:     { fontSize: 11, fontWeight: '600', marginLeft: 2 },
  track:   { height: 3, width: 200, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 2 },
});
