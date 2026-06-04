import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { PageHeader } from './_shared';
import { GoFolixLoader } from '../../components/common/GoFolixLoader';
import { apiClient } from '../../api/client';
import { authService } from '../../services';

// ── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  device_name: string | null;
  platform: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}

// ── Utils ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const months = [
      'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
    ];
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return day + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' a ' + h + 'h' + m;
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'A l instant';
    if (mins < 60) return 'Il y a ' + mins + 'min';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'Il y a ' + hrs + 'h';
    const days = Math.floor(hrs / 24);
    return 'Il y a ' + days + 'j';
  } catch {
    return '';
  }
}

function platformIcon(platform: string | null): string {
  if (platform === 'ios') return 'apple';
  if (platform === 'android') return 'android';
  return 'monitor';
}

function platformLabel(platform: string | null): string {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  if (platform === 'web') return 'Web';
  return 'Inconnu';
}

function platformColor(platform: string | null): string {
  if (platform === 'ios') return '#6366F1';
  if (platform === 'android') return '#10B981';
  if (platform === 'web') return '#3B82F6';
  return '#6B7280';
}

// ── SessionCard ───────────────────────────────────────────────────────────────

interface CardProps {
  session: Session;
  onRevoke: (id: string, isCurrent: boolean) => void;
}

const SessionCard: React.FC<CardProps> = ({ session, onRevoke }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const pc = platformColor(session.platform);

  return (
    <View style={[sc.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
      <View style={sc.row}>
        <View style={[sc.iconWrap, { backgroundColor: pc + '22' }]}>
          <MCIcon name={platformIcon(session.platform)} size={24} color={pc} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={sc.titleRow}>
            <Text style={[sc.deviceName, { color: colors.textPrimary }]} numberOfLines={1}>
              {session.device_name ?? 'Cet appareil'}
            </Text>
            {session.is_current && (
              <View style={sc.currentBadge}>
                <Text style={sc.currentBadgeText}>Cet appareil</Text>
              </View>
            )}
          </View>

          <View style={sc.badgeRow}>
            <View style={[sc.platformBadge, { backgroundColor: pc + '22' }]}>
              <Text style={[sc.platformText, { color: pc }]}>{platformLabel(session.platform)}</Text>
            </View>
          </View>

          <Text style={[sc.meta, { color: colors.textSecondary }]}>
            {'Connexion : ' + formatDate(session.created_at)}
          </Text>
          <Text style={[sc.meta, { color: colors.textTertiary }]}>
            {'Derniere activite : ' + timeAgo(session.last_active_at)}
          </Text>
          {session.ip_address ? (
            <Text style={[sc.ip, { color: colors.textTertiary }]}>{session.ip_address}</Text>
          ) : null}
        </View>

        {/* Bouton supprimer — visible sur TOUS les appareils */}
        <TouchableOpacity
          style={sc.trashBtn}
          onPress={() => onRevoke(session.id, session.is_current)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const sc = StyleSheet.create({
  card:         { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  iconWrap:     { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  deviceName:   { fontSize: 14, fontWeight: '600', flex: 1 },
  currentBadge: { backgroundColor: '#10B98122', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  currentBadgeText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  badgeRow:     { flexDirection: 'row', gap: 6, marginBottom: 5 },
  platformBadge:{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  platformText: { fontSize: 11, fontWeight: '700' },
  meta:         { fontSize: 12, marginTop: 1 },
  ip:           { fontSize: 11, marginTop: 3 },
  trashBtn:     { padding: 6, marginTop: 2 },
});

// ── SettingsSecurityScreen ────────────────────────────────────────────────────

export const SettingsSecurityScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const fadeAnims = useRef<Record<string, Animated.Value>>({});

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get<Session[]>('/api/v1/auth/sessions');
      const list = Array.isArray(data) ? data : [];
      list.forEach(s => {
        if (!fadeAnims.current[s.id]) {
          fadeAnims.current[s.id] = new Animated.Value(1);
        }
      });
      setSessions(list);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleRevoke = useCallback((sessionId: string, isCurrent: boolean) => {
    const title   = isCurrent ? 'Se deconnecter ?' : 'Deconnecter cet appareil ?';
    const message = isCurrent
      ? 'Vous allez etre deconnecte de ce compte sur cet appareil.'
      : "Cette session sera terminee et l'appareil devra se reconnecter.";
    const btnText = isCurrent ? 'Se deconnecter' : 'Deconnecter';

    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: btnText,
        style: 'destructive',
        onPress: async () => {
          try {
            setRevoking(sessionId);
            // Pour la session courante on utilise /auth/logout (pas de restriction)
            if (isCurrent) {
              await apiClient.post('/api/v1/auth/logout', {});
            } else {
              await apiClient.delete('/api/v1/auth/sessions/' + sessionId);
            }
            const anim = fadeAnims.current[sessionId];
            if (anim) {
              Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
                setSessions(prev => prev.filter(s => s.id !== sessionId));
              });
            } else {
              setSessions(prev => prev.filter(s => s.id !== sessionId));
            }
            // Si c'est la session courante → déconnexion via RootNavigator
            if (isCurrent) {
              authService.forceLogout();
            }
          } catch {
            Alert.alert('Erreur', 'Impossible de terminer cette session.');
          } finally {
            setRevoking(null);
          }
        },
      },
    ]);
  }, [nav]);

  const handleRevokeAll = useCallback(() => {
    Alert.alert(
      'Deconnecter tous les autres appareils ?',
      'Toutes les sessions sauf celle-ci seront terminees.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout deconnecter',
          style: 'destructive',
          onPress: async () => {
            try {
              setRevokingAll(true);
              await apiClient.delete('/api/v1/auth/sessions');
              setSessions(prev => prev.filter(s => s.is_current));
            } catch {
              Alert.alert('Erreur', 'Impossible de revoquer les sessions.');
            } finally {
              setRevokingAll(false);
            }
          },
        },
      ],
    );
  }, []);

  const othersCount = sessions.filter(s => !s.is_current).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Appareils connectes" onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Chargement */}
        {loading ? (
          <View style={s.loadingWrap}>
            <GoFolixLoader variant="bar" color={colors.primary ?? '#7B3FF2'} />
          </View>
        ) : sessions.length === 0 ? (
          <View style={s.empty}>
            <MCIcon name="shield-check-outline" size={52} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucune session active</Text>
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>
              Vos appareils connectes apparaitront ici
            </Text>
          </View>
        ) : (
          <>
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
              {sessions.length + ' appareil' + (sessions.length > 1 ? 's' : '') + ' connecte' + (sessions.length > 1 ? 's' : '')}
            </Text>

            {sessions.map(session => {
              const anim = fadeAnims.current[session.id] ?? new Animated.Value(1);
              return (
                <Animated.View key={session.id} style={{ opacity: anim, position: 'relative' }}>
                  <SessionCard session={session} onRevoke={(id) => handleRevoke(id, session.is_current)} />
                  {revoking === session.id && (
                    <View style={s.revokingOverlay}>
                      <GoFolixLoader variant="bar" color="#EF4444" />
                    </View>
                  )}
                </Animated.View>
              );
            })}

            {othersCount > 0 && (
              <TouchableOpacity
                style={[s.revokeAllBtn, { borderColor: '#EF444440' }]}
                onPress={handleRevokeAll}
                activeOpacity={0.75}
                disabled={revokingAll}
              >
                {revokingAll ? (
                  <GoFolixLoader variant="bar" color="#EF4444" />
                ) : (
                  <>
                    <Icon name="log-out" size={16} color="#EF4444" />
                    <Text style={s.revokeAllText}>
                      {'Deconnecter tous les autres appareils (' + othersCount + ')'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  scroll:          { padding: 16, paddingTop: 12 },
  sectionLabel:    { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 2 },
  loadingWrap:     { paddingVertical: 48, alignItems: 'center' },
  empty:           { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle:      { fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptyText:       { fontSize: 13, textAlign: 'center' },
  revokingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 14 },
  revokeAllBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  revokeAllText:   { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});
