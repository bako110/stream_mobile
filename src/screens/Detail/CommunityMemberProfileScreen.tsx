import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityMemberProfile } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteParams {
  communityId: string;
  communityName: string;
  memberId: string;
  memberName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_GRADIENT: Record<string, string[]> = {
  admin:     ['#22C55E', '#15803D', '#052E16'],
  moderator: ['#3B82F6', '#1D4ED8', '#0A1628'],
  member:    ['#7B3FF2', '#4F1BBD', '#1A0A3D'],
};

const ROLE_COLOR: Record<string, string> = {
  admin:     '#22C55E',
  moderator: '#3B82F6',
  member:    '#7B3FF2',
};

const ROLE_LABEL: Record<string, string> = {
  admin:     'Admin',
  moderator: 'Modérateur',
  member:    'Membre',
};

const BADGE_META: Record<string, { emoji: string; label: string; desc: string }> = {
  founder:         { emoji: '👑', label: 'Fondateur',        desc: 'A créé cette communauté'              },
  top_contributor: { emoji: '🔥', label: 'Top Contributeur', desc: 'Parmi les plus actifs du groupe'      },
  verified:        { emoji: '✅', label: 'Vérifié',          desc: 'Identité vérifiée par la plateforme'  },
  moderator:       { emoji: '🛡️', label: 'Modérateur',       desc: "Aide à maintenir l'ordre"             },
  helpful:         { emoji: '💡', label: 'Utile',            desc: 'Réponses très appréciées par la cmt'  },
  early_bird:      { emoji: '🐦', label: 'Early Bird',       desc: 'Membre parmi les premiers inscrits'   },
  event_master:    { emoji: '🎪', label: 'Event Master',     desc: 'Présent à de nombreux events'         },
  newcomer:        { emoji: '🌱', label: 'Nouveau',          desc: 'Vient de rejoindre la communauté'     },
};

const XP_THRESHOLDS = [0, 500, 1000, 2000, 3500, 6000, 9999];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatLastSeen(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "Il y a moins d'une minute";
  if (diff < 60) return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getXpProgress(xp: number, level: number) {
  const idx = Math.min(level - 1, XP_THRESHOLDS.length - 2);
  const low  = XP_THRESHOLDS[idx]     ?? 0;
  const high = XP_THRESHOLDS[idx + 1] ?? 9999;
  const xpForLevel = high - low;
  const xpToNext = Math.max(0, high - xp);
  const progress = Math.min((xp - low) / (high - low), 1);
  return { progress, xpToNext, xpForLevel };
}

// ---------------------------------------------------------------------------
// Animated XP bar
// ---------------------------------------------------------------------------

interface AnimatedXpBarProps { progress: number; color: string; height?: number }

function AnimatedXpBar({ progress, color, height = 8 }: AnimatedXpBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: progress, duration: 900, useNativeDriver: false }).start();
  }, [progress]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.xpTrack, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.xpFill, { width, height, borderRadius: height / 2, backgroundColor: color }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface Props {
  route: { params: RouteParams };
}

export function CommunityMemberProfileScreen({ route }: Props) {
  const { communityId, communityName, memberId, memberName } = route.params;
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [member, setMember] = useState<CommunityMemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await communityService.getMemberProfile(communityId, memberId);
      setMember(data);
    } catch {
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, [communityId, memberId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!member) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <TouchableOpacity style={styles.backBtnInner} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Icon name="user-x" size={44} color={colors.textTertiary} />
        <Text style={[{ color: colors.textTertiary, marginTop: 12, fontSize: 15 }]}>
          Profil introuvable
        </Text>
      </View>
    );
  }

  const gradientColors = ROLE_GRADIENT[member.role] ?? ROLE_GRADIENT.member;
  const roleColor      = ROLE_COLOR[member.role] ?? '#7B3FF2';
  const { progress, xpToNext, xpForLevel } = getXpProgress(member.xp ?? 0, member.level ?? 1);
  const xpDone = xpForLevel - xpToNext;

  const handleViewFullProfile = () => {
    navigation.navigate('UserProfile', { userId: member.user_id });
  };

  const handleSendMessage = () => {
    Alert.alert(
      'Message privé',
      `Ouvrir une conversation avec ${member.display_name || member.username} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer un message',
          onPress: () => navigation.navigate('Chat', {
            partnerId:   member.user_id,
            partnerName: member.display_name || member.username || memberName,
          }),
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* Hero gradient */}
        <LinearGradient
          colors={gradientColors as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 8 }]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.backBtnInner}>
              <Icon name="arrow-left" size={20} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.communityPill}>
            <Icon name="users" size={11} color="rgba(255,255,255,0.8)" />
            <Text style={styles.communityPillText} numberOfLines={1}>{communityName}</Text>
          </View>

          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatarBorder, { borderColor: '#fff' }]}>
              {member.avatar_url ? (
                <Image source={{ uri: member.avatar_url }} style={styles.avatarInner} />
              ) : (
                <View style={[styles.avatarInner, { backgroundColor: roleColor + '33', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[styles.avatarInitials, { color: '#fff' }]}>
                    {getInitials(member.display_name || member.username || memberName)}
                  </Text>
                </View>
              )}
            </View>
            {member.is_online && <View style={styles.onlineDot} />}
          </View>

          <Text style={styles.heroName}>{member.display_name || member.username || memberName}</Text>
          <Text style={styles.heroUsername}>@{member.username}</Text>

          <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.4)' }]}>
            <Text style={styles.roleBadgeText}>{ROLE_LABEL[member.role] ?? member.role}</Text>
          </View>
        </LinearGradient>

        {/* Body */}
        <View style={styles.body}>

          {/* Bio */}
          {!!member.bio && (
            <View style={[styles.bioCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.bioText, { color: colors.textSecondary }]}>{member.bio}</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.statItem}>
              <Icon name="file-text" size={16} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{member.posts_count ?? 0}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Posts</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Icon name="zap" size={16} color="#F59E0B" />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{(member.xp ?? 0).toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>XP</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Icon name="calendar" size={16} color="#22C55E" />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{member.events_attended ?? 0}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Events</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Icon name="heart" size={16} color="#E0389A" />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{(member.reactions_given ?? 0).toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Réactions</Text>
            </View>
          </View>

          {/* XP progression */}
          {(member.xp !== undefined || member.level !== undefined) && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.xpHeader}>
                <View style={styles.xpTitleRow}>
                  <View style={[styles.xpLevelBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
                    <Text style={[styles.xpLevelText, { color: colors.primary }]}>Niv. {member.level ?? 1}</Text>
                  </View>
                  <Text style={[styles.xpTitle, { color: colors.textPrimary }]}>Progression XP</Text>
                </View>
                <Text style={[styles.xpNextLabel, { color: colors.textTertiary }]}>
                  {xpToNext > 0 ? `${xpToNext} XP avant niveau ${(member.level ?? 1) + 1}` : 'Niveau max !'}
                </Text>
              </View>

              <AnimatedXpBar progress={progress} color={colors.primary} height={10} />

              <View style={styles.xpFooter}>
                <Text style={[styles.xpCountText, { color: colors.textTertiary }]}>
                  {xpDone} / {xpForLevel} XP
                </Text>
                <Text style={[styles.xpPercentText, { color: colors.primary }]}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>
            </View>
          )}

          {/* Badges */}
          {member.badges && member.badges.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>BADGES</Text>
              <View style={styles.badgesGrid}>
                {member.badges.map(badgeKey => {
                  const meta = BADGE_META[badgeKey];
                  if (!meta) return null;
                  return (
                    <View
                      key={badgeKey}
                      style={[styles.badgeCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                    >
                      <Text style={styles.badgeEmoji}>{meta.emoji}</Text>
                      <Text style={[styles.badgeLabel, { color: colors.textPrimary }]}>{meta.label}</Text>
                      <Text style={[styles.badgeDesc, { color: colors.textTertiary }]} numberOfLines={2}>
                        {meta.desc}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Historique */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>HISTORIQUE</Text>

            {member.joined_at && (
              <View style={styles.historyRow}>
                <View style={[styles.historyIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name="log-in" size={15} color={colors.primary} />
                </View>
                <View style={styles.historyContent}>
                  <Text style={[styles.historyLabel, { color: colors.textSecondary }]}>A rejoint la communauté</Text>
                  <Text style={[styles.historyValue, { color: colors.textPrimary }]}>
                    {formatDate(member.joined_at)}
                  </Text>
                </View>
              </View>
            )}

            {member.joined_at && <View style={[styles.historyDivider, { backgroundColor: colors.border }]} />}

            <View style={styles.historyRow}>
              <View style={[styles.historyIconWrap, { backgroundColor: member.is_online ? '#22C55E18' : colors.backgroundSecondary }]}>
                <Icon
                  name={member.is_online ? 'radio' : 'clock'}
                  size={15}
                  color={member.is_online ? '#22C55E' : colors.textTertiary}
                />
              </View>
              <View style={styles.historyContent}>
                <Text style={[styles.historyLabel, { color: colors.textSecondary }]}>
                  {member.is_online ? 'Statut' : 'Dernière activité'}
                </Text>
                <Text style={[styles.historyValue, { color: member.is_online ? '#22C55E' : colors.textPrimary }]}>
                  {member.is_online
                    ? 'En ligne maintenant'
                    : member.last_seen
                    ? formatLastSeen(member.last_seen)
                    : 'Inconnu'}
                </Text>
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
              onPress={handleViewFullProfile}
              activeOpacity={0.75}
            >
              <Icon name="user" size={16} color={colors.primary} />
              <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>
                Voir le profil complet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnFill, { backgroundColor: colors.primary }]}
              onPress={handleSendMessage}
              activeOpacity={0.8}
            >
              <Icon name="message-circle" size={16} color="#fff" />
              <Text style={styles.actionBtnFillText}>Envoyer un message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export default CommunityMemberProfileScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },

  hero: {
    alignItems: 'center',
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  backBtn: {
    position: 'absolute',
    top: 0,
    left: 16,
    zIndex: 10,
  },
  backBtnInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 20,
    alignSelf: 'center',
  },
  communityPillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarBorder: {
    borderWidth: 4,
    borderRadius: 48,
    padding: 2,
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    borderWidth: 3,
    borderColor: '#fff',
  },
  heroName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  heroUsername: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    marginTop: 3,
    marginBottom: 12,
  },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  bioCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 36,
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 14,
  },

  xpHeader: { marginBottom: 12, gap: 4 },
  xpTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  xpLevelBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  xpLevelText: { fontSize: 12, fontWeight: '800' },
  xpTitle: { fontSize: 15, fontWeight: '700' },
  xpNextLabel: { fontSize: 12, marginTop: 2 },
  xpTrack: { backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  xpFill: { position: 'absolute', left: 0, top: 0 },
  xpFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  xpCountText: { fontSize: 11, fontWeight: '500' },
  xpPercentText: { fontSize: 12, fontWeight: '700' },

  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    width: '30%',
    flexGrow: 1,
    gap: 4,
  },
  badgeEmoji: { fontSize: 24, marginBottom: 2 },
  badgeLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  badgeDesc: { fontSize: 10, textAlign: 'center', lineHeight: 13 },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  historyIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyContent: { flex: 1, gap: 2 },
  historyLabel: { fontSize: 11, fontWeight: '500' },
  historyValue: { fontSize: 14, fontWeight: '700' },
  historyDivider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },

  actionsRow: { gap: 10, marginTop: 4 },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  actionBtnOutlineText: { fontSize: 15, fontWeight: '700' },
  actionBtnFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnFillText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
