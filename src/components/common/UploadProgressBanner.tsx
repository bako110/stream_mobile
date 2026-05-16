/**
 * Barre d'envoi globale — style WhatsApp/Facebook.
 * Affichée en bas, au-dessus de la tab bar, pendant qu'un upload tourne.
 * Reste visible 3s après la fin pour confirmer "En ligne !".
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useBackgroundUpload } from '../../hooks/useBackgroundUpload';
import type { UploadJob } from '../../services/backgroundUploadService';

const TYPE_ICON: Record<string, string> = {
  reel:    'film',
  post:    'image',
  event:   'calendar',
  concert: 'music',
};

const STATUS_LABEL: Record<UploadJob['status'], string> = {
  queued:      'En attente…',
  compressing: 'Compression vidéo…',
  uploading:   'Envoi en cours…',
  done:        'Publication en ligne !',
  error:       'Échec de la publication',
};

// ── Un seul job affiché (le plus récent actif, sinon le plus récent done/error)
function pickJob(jobs: UploadJob[]): UploadJob | null {
  if (jobs.length === 0) return null;
  const active = jobs.filter(j => j.status !== 'done' && j.status !== 'error');
  if (active.length > 0) return active[active.length - 1];
  return jobs[jobs.length - 1];
}

// ── Composant barre
const BAR_H = 58;

export const UploadProgressBar: React.FC<{ bottomOffset?: number }> = ({ bottomOffset = 0 }) => {
  const insets = useSafeAreaInsets();
  const { visibleJobs } = useBackgroundUpload();
  const job = pickJob(visibleJobs);

  const slideY = useRef(new Animated.Value(BAR_H + 20)).current;
  const prevJobId = useRef<string | null>(null);

  useEffect(() => {
    if (job && job.id !== prevJobId.current) {
      prevJobId.current = job.id;
      Animated.spring(slideY, {
        toValue:  0,
        useNativeDriver: true,
        friction: 9,
        tension:  60,
      }).start();
    }
    if (!job) {
      Animated.timing(slideY, {
        toValue:  BAR_H + 20,
        useNativeDriver: true,
        duration: 250,
      }).start(() => { prevJobId.current = null; });
    }
  }, [job?.id, !!job]);

  if (!job && prevJobId.current === null) return null;

  const isDone   = job?.status === 'done';
  const isError  = job?.status === 'error';
  const progress = job?.progress ?? 0;
  const accent   = isError ? '#ef4444' : isDone ? '#10b981' : '#7B3FF2';
  const icon     = TYPE_ICON[job?.type ?? 'post'] ?? 'upload-cloud';

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          bottom: bottomOffset + insets.bottom + 60,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, { borderColor: accent + '40' }]}>
        {/* Icône type */}
        <View style={[styles.iconBox, { backgroundColor: accent + '22' }]}>
          <Icon name={isDone ? 'check-circle' : isError ? 'alert-circle' : icon} size={17} color={accent} />
        </View>

        {/* Texte */}
        <View style={styles.textBox}>
          <Text style={styles.label} numberOfLines={1}>
            {job?.label ?? ''}
          </Text>
          <Text style={[styles.statusTxt, { color: accent }]}>
            {job ? STATUS_LABEL[job.status] : ''}
            {!isDone && !isError && progress > 0 ? `  ${progress}%` : ''}
          </Text>
        </View>

        {/* Indicateur droit */}
        {isDone && <Icon name="check" size={16} color="#10b981" />}
        {isError && (
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="refresh-cw" size={15} color="#ef4444" />
          </TouchableOpacity>
        )}
        {!isDone && !isError && (
          <Text style={[styles.pct, { color: accent }]}>{progress}%</Text>
        )}
      </View>

      {/* Track de progression */}
      {!isDone && !isError && (
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: accent,
                width: `${progress}%` as any,
              },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
};

// Alias pour rétrocompatibilité
export const UploadProgressBanner = UploadProgressBar;

const styles = StyleSheet.create({
  wrapper: {
    position:  'absolute',
    left:      12,
    right:     12,
    zIndex:    9999,
    elevation: 20,
  },
  card: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    backgroundColor:  '#12101F',
    borderWidth:      1,
    borderRadius:     16,
    paddingVertical:  11,
    paddingHorizontal: 13,
    shadowColor:      '#000',
    shadowOpacity:    0.35,
    shadowOffset:     { width: 0, height: 6 },
    shadowRadius:     14,
  },
  iconBox: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  textBox: {
    flex: 1,
    gap:  2,
  },
  label: {
    color:      '#F0EFF8',
    fontSize:   13,
    fontWeight: '700',
  },
  statusTxt: {
    fontSize:   11,
    fontWeight: '600',
  },
  pct: {
    fontSize:   13,
    fontWeight: '800',
    minWidth:   36,
    textAlign:  'right',
  },
  track: {
    height:           3,
    backgroundColor:  '#2A2840',
    borderRadius:     2,
    marginTop:        5,
    marginHorizontal: 2,
    overflow:         'hidden',
  },
  fill: {
    height:       3,
    borderRadius: 2,
  },
});
