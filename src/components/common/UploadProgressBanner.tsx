/**
 * Mini chip d'upload — invisible pendant la progression.
 * Apparait uniquement quand status === 'done' ou 'error'.
 * Disparait automatiquement 3s apres.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useBackgroundUpload } from '../../hooks/useBackgroundUpload';
import type { UploadJob } from '../../services/backgroundUploadService';

function pickJob(jobs: UploadJob[]): UploadJob | null {
  if (jobs.length === 0) return null;
  const active = jobs.filter(j => j.status !== 'done' && j.status !== 'error');
  if (active.length > 0) return active[active.length - 1];
  return jobs[jobs.length - 1];
}

export const UploadProgressBar: React.FC<{ bottomOffset?: number }> = () => {
  const insets = useSafeAreaInsets();
  const { visibleJobs } = useBackgroundUpload();
  const job = pickJob(visibleJobs);

  const slideY  = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const prevStatus = useRef<string | null>(null);
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const status = job?.status ?? null;
    const shouldShow = status === 'done' || status === 'error';

    if (shouldShow && prevStatus.current !== status) {
      prevStatus.current = status;
      setMounted(true);

      if (hideTimer.current) clearTimeout(hideTimer.current);

      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, useNativeDriver: true, duration: 200 }),
      ]).start();

      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideY, { toValue: -60, useNativeDriver: true, duration: 300 }),
          Animated.timing(opacity, { toValue: 0,  useNativeDriver: true, duration: 300 }),
        ]).start(() => {
          prevStatus.current = null;
          setMounted(false);
        });
      }, 3000);
    }

    if (!job) {
      prevStatus.current = null;
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [job?.id, job?.status]);

  if (!mounted) return null;

  const isDone = job?.status === 'done';
  const accent = isDone ? '#10b981' : '#ef4444';

  return (
    <Animated.View
      style={[styles.wrapper, { top: insets.top + 8, transform: [{ translateY: slideY }], opacity }]}
      pointerEvents="none"
    >
      <View style={[styles.chip, { borderColor: accent + '50' }]}>
        <Icon name={isDone ? 'check-circle' : 'alert-circle'} size={13} color={accent} />
        <Text style={[styles.chipText, { color: '#fff' }]} numberOfLines={1}>
          {isDone ? 'Publication en ligne !' : 'Echec de la publication'}
        </Text>
      </View>
    </Animated.View>
  );
};

export const UploadProgressBanner = UploadProgressBar;

const styles = StyleSheet.create({
  wrapper: {
    position:   'absolute',
    alignSelf:  'center',
    zIndex:     9999,
    elevation:  20,
    alignItems: 'center',
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   'rgba(18,16,31,0.93)',
    borderWidth:       1,
    borderRadius:      20,
    paddingVertical:   7,
    paddingHorizontal: 14,
    shadowColor:       '#000',
    shadowOpacity:     0.3,
    shadowOffset:      { width: 0, height: 3 },
    shadowRadius:      8,
  },
  chipText: {
    fontSize:   12,
    fontWeight: '600',
  },
});
