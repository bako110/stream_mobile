import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { notificationService } from '../../services/notificationService';
import { useWs, type WsPayload } from '../../context/WebSocketContext';

export type AiContentType = 'reel' | 'post' | 'event' | 'concert';
type Verdict = 'cleared' | 'limited' | 'removed' | null;

const CONTENT_LABEL: Record<AiContentType, string> = {
  reel: 'reel', post: 'publication', event: 'événement', concert: 'concert',
};

const VERDICT_FROM_TYPE: Record<string, Verdict> = {
  reel_analysis_cleared: 'cleared',
  reel_analysis_limited: 'limited',
  reel_analysis_removed: 'removed',
};

interface Props {
  contentType: AiContentType;
  contentId: string;
  initialStatus?: 'pending' | 'done' | null;
  onBack: () => void;
}

export const AiAnalysisStatusScreen: React.FC<Props> = ({ contentType, contentId, initialStatus, onBack }) => {
  const { theme: { colors, isDark } } = useTheme();
  const insets = useSafeAreaInsets();
  const { addListener, removeListener } = useWs();

  const [status, setStatus] = useState<'pending' | 'done' | null | undefined>(initialStatus);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialStatus == null) return; // pas de media, pas d'analyse a chercher

    let cancelled = false;
    setLoading(true);
    notificationService.getByRefId(contentId)
      .then(list => {
        if (cancelled) return;
        const hit = list.find(n => n.notification_type in VERDICT_FROM_TYPE);
        if (hit) {
          setStatus('done');
          setVerdict(VERDICT_FROM_TYPE[hit.notification_type]);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [contentId, initialStatus]);

  useEffect(() => {
    const handler = (p: WsPayload) => {
      if (
        p.type === 'notification' &&
        p.ref_id === contentId &&
        typeof p.notification_type === 'string' &&
        p.notification_type in VERDICT_FROM_TYPE
      ) {
        setStatus('done');
        setVerdict(VERDICT_FROM_TYPE[p.notification_type]);
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [contentId, addListener, removeListener]);

  const label = CONTENT_LABEL[contentType];

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={[s.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={onBack} />
        <Text style={[s.topTitle, { color: colors.textPrimary }]}>Vérification automatique</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.content}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : status == null ? (
          <>
            <Icon name="help-circle" size={48} color={colors.textTertiary} />
            <Text style={[s.title, { color: colors.textPrimary }]}>Aucune analyse nécessaire</Text>
            <Text style={[s.subtitle, { color: colors.textTertiary }]}>
              Ce {label} ne contient pas de média à vérifier.
            </Text>
          </>
        ) : status === 'pending' ? (
          <>
            <ActivityIndicator size="large" color={colors.textTertiary} />
            <Text style={[s.title, { color: colors.textPrimary }]}>Analyse en cours…</Text>
            <Text style={[s.subtitle, { color: colors.textTertiary }]}>
              Votre {label} est vérifié automatiquement. Cette page se mettra à jour toute seule.
            </Text>
          </>
        ) : verdict === 'cleared' ? (
          <>
            <Icon name="check-circle" size={48} color="#10B981" />
            <Text style={[s.title, { color: colors.textPrimary }]}>Tout est en ordre</Text>
            <Text style={[s.subtitle, { color: colors.textTertiary }]}>
              Votre {label} a été vérifié automatiquement, aucun problème détecté.
            </Text>
          </>
        ) : verdict === 'limited' ? (
          <>
            <Icon name="alert-circle" size={48} color="#F59E0B" />
            <Text style={[s.title, { color: colors.textPrimary }]}>Diffusion limitée</Text>
            <Text style={[s.subtitle, { color: colors.textTertiary }]}>
              Votre {label} a été signalé par notre système et est en cours de revue par un modérateur.
              Il reste visible sur votre profil mais n'apparaît pas dans les recommandations pour le moment.
            </Text>
          </>
        ) : verdict === 'removed' ? (
          <>
            <Icon name="alert-triangle" size={48} color="#EF4444" />
            <Text style={[s.title, { color: colors.textPrimary }]}>Retiré automatiquement</Text>
            <Text style={[s.subtitle, { color: colors.textTertiary }]}>
              Votre {label} a été retiré suite à une vérification de contenu. Vous pouvez contester cette décision depuis le support.
            </Text>
          </>
        ) : (
          <>
            <Icon name="check-circle" size={48} color="#10B981" />
            <Text style={[s.title, { color: colors.textPrimary }]}>Analyse terminée</Text>
          </>
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
