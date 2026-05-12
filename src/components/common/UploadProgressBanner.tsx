import React from 'react';
import {
  View, Text, StyleSheet, Platform,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useBackgroundUpload } from '../../hooks/useBackgroundUpload';
import type { UploadJob } from '../../services/backgroundUploadService';

const STATUS_LABEL: Record<UploadJob['status'], string> = {
  queued:      'En attente…',
  compressing: 'Compression…',
  uploading:   'Envoi…',
  done:        'En ligne !',
  error:       'Erreur',
};

const JobRow: React.FC<{ job: UploadJob; colors: any }> = ({ job, colors }) => {
  const isDone  = job.status === 'done';
  const isError = job.status === 'error';
  const accent  = isDone ? '#36D9A0' : isError ? '#FF4444' : colors.primary;

  return (
    <View style={[row.wrap, { backgroundColor: colors.surface, borderLeftColor: accent }]}>
      <View style={row.info}>
        <Text style={[row.label, { color: colors.textPrimary }]} numberOfLines={1}>
          {job.label}
        </Text>
        <Text style={[row.status, { color: accent }]}>
          {STATUS_LABEL[job.status]}
          {!isDone && !isError && job.progress > 0 ? ` ${job.progress}%` : ''}
        </Text>
      </View>

      {isDone ? (
        <Icon name="check-circle" size={18} color="#36D9A0" />
      ) : isError ? (
        <Icon name="alert-circle" size={18} color="#FF4444" />
      ) : (
        <View style={[row.barWrap, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[row.barFill, { width: `${job.progress}%` as any, backgroundColor: colors.primary }]} />
        </View>
      )}
    </View>
  );
};

const row = StyleSheet.create({
  wrap:    {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderLeftWidth: 3, marginHorizontal: 12, marginBottom: 6,
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4,
  },
  info:   { flex: 1 },
  label:  { fontSize: 13, fontWeight: '600' },
  status: { fontSize: 11, marginTop: 1 },
  barWrap:{ height: 4, width: 60, borderRadius: 2, overflow: 'hidden' },
  barFill:{ height: 4, borderRadius: 2 },
});

export const UploadProgressBanner: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { activeJobs } = useBackgroundUpload();

  if (activeJobs.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      exiting={FadeOutUp.duration(200)}
      style={[banner.container, { top: Platform.OS === 'android' ? 56 : 100 }]}
      pointerEvents="none"
    >
      {activeJobs.map(job => (
        <JobRow key={job.id} job={job} colors={colors} />
      ))}
    </Animated.View>
  );
};

const banner = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
  },
});
