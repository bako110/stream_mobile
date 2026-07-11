/**
 * Cartes partagees entre LiveOneVsOneScreen et LiveTournamentsScreen — extraites
 * de l'ancien LiveMatchesScreen (onglets fusionnes en deux ecrans dedies).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { VerifiedBadge } from '../common';
import type { ActiveBattle } from '../../services/battleService';
import type { ActiveTournament } from '../../services/tournamentService';

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRemaining(startedAt: string | null, durationSeconds: number): string {
  if (!startedAt) return formatCountdown(durationSeconds);
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return formatCountdown(Math.max(0, durationSeconds - elapsed));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  registration: 'Inscriptions ouvertes',
  ongoing:      'En cours',
  completed:    'Terminé',
  cancelled:    'Annulé',
};

// ── Carte Battle 1 vs 1 ───────────────────────────────────────────────────────

export const BattleCard: React.FC<{ battle: ActiveBattle; onWatch: () => void }> = ({ battle, onWatch }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const total = battle.score_a + battle.score_b;
  const pctA = total > 0 ? (battle.score_a / total) * 100 : 50;

  // Tick local chaque seconde — sans ca le "temps restant" ne bougeait qu'au
  // prochain rafraichissement de la liste, au lieu de defiler naturellement
  // comme un vrai chronometre.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={[s.battleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <LinearGradient colors={['#9B65F512', '#F0365A0C']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      <View style={s.battleHeader}>
        <View style={s.battleLiveBadge}>
          <View style={s.battleLiveDot} />
          <Text style={s.battleLiveBadgeText}>EN DIRECT</Text>
        </View>
        <View style={s.battleTimerWrap}>
          <Icon name="clock" size={11} color="rgba(255,255,255,0.7)" />
          <Text style={s.battleTimerText}>{formatRemaining(battle.started_at, battle.duration_seconds)}</Text>
        </View>
      </View>

      {/* Photos + noms des deux créateurs */}
      <View style={s.battleHostsRow}>
        <View style={s.battleHostCol}>
          {battle.host_a_avatar
            ? <Image source={{ uri: battle.host_a_avatar }} style={s.battleAvatar} />
            : <View style={[s.battleAvatar, s.battleAvatarFallback]}><Icon name="user" size={20} color="#fff" /></View>}
          <View style={s.battleHostNameRow}>
            <Text style={[s.battleHostName, { color: colors.textPrimary }]} numberOfLines={1}>{battle.host_a_name ?? 'Créateur'}</Text>
            {battle.host_a_verified && <VerifiedBadge size={12} />}
          </View>
        </View>

        <View style={s.battleVsWrap}>
          <LinearGradient colors={['#9B65F5', '#F0365A']} style={s.battleVsBadge}>
            <Text style={s.battleVsText}>VS</Text>
          </LinearGradient>
        </View>

        <View style={s.battleHostCol}>
          {battle.host_b_avatar
            ? <Image source={{ uri: battle.host_b_avatar }} style={s.battleAvatar} />
            : <View style={[s.battleAvatar, s.battleAvatarFallback]}><Icon name="user" size={20} color="#fff" /></View>}
          <View style={s.battleHostNameRow}>
            <Text style={[s.battleHostName, { color: colors.textPrimary }]} numberOfLines={1}>{battle.host_b_name ?? 'Créateur'}</Text>
            {battle.host_b_verified && <VerifiedBadge size={12} />}
          </View>
        </View>
      </View>

      {/* Score + barre de progression */}
      <View style={s.battleScoreRow}>
        <Text style={s.battleScoreText}>{battle.score_a}</Text>
        <View style={s.battleScoreBarTrack}>
          <Animated.View layout={LinearTransition.springify()} style={[s.battleScoreBarFill, { width: `${pctA}%` }]} />
        </View>
        <Text style={s.battleScoreText}>{battle.score_b}</Text>
      </View>

      {/* Stats : viewers / gogold / cadeaux / supporters */}
      <View style={[s.battleStatsRow, { borderTopColor: colors.divider }]}>
        <View style={s.battleStat}>
          <Icon name="eye" size={12} color={colors.textTertiary} />
          <Text style={[s.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.viewer_count)}</Text>
        </View>
        <View style={s.battleStat}>
          <Text style={s.battleStatEmoji}>🪙</Text>
          <Text style={[s.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.score_a + battle.score_b)}</Text>
        </View>
        <View style={s.battleStat}>
          <Icon name="gift" size={12} color={colors.textTertiary} />
          <Text style={[s.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.gifts_count)}</Text>
        </View>
        <View style={s.battleStat}>
          <Icon name="heart" size={12} color={colors.textTertiary} />
          <Text style={[s.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.supporters_count)}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={onWatch} activeOpacity={0.88}>
        <LinearGradient colors={['#9B65F5', '#F0365A']} style={s.watchBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Icon name="play" size={14} color="#fff" />
          <Text style={s.watchBtnText}>Regarder</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Carte Tournoi ─────────────────────────────────────────────────────────────

export const TournamentCard: React.FC<{ tournament: ActiveTournament; onView: () => void }> = ({ tournament, onView }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const statusColor = tournament.status === 'ongoing' ? '#10B981' : '#F59E0B';

  return (
    <Animated.View entering={FadeIn.duration(300)} style={[s.tourCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.tourImageWrap}>
        {tournament.image_url
          ? <Image source={{ uri: tournament.image_url }} style={s.tourImage} />
          : <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={s.tourImage}>
              <Icon name="award" size={34} color="rgba(255,255,255,0.85)" />
            </LinearGradient>}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={s.tourImageGrad} />
        <View style={[s.tourStatusBadge, { backgroundColor: statusColor }]}>
          <Text style={s.tourStatusText}>{TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}</Text>
        </View>
        <View style={s.tourFormatBadge}>
          <Text style={s.tourFormatText}>{tournament.format} joueurs</Text>
        </View>
      </View>

      <View style={s.tourBody}>
        <Text style={[s.tourName, { color: colors.textPrimary }]} numberOfLines={1}>{tournament.name}</Text>

        <View style={s.tourOrganizerRow}>
          {tournament.organizer_avatar
            ? <Image source={{ uri: tournament.organizer_avatar }} style={s.tourOrganizerAvatar} />
            : <View style={[s.tourOrganizerAvatar, s.tourOrganizerAvatarFallback]}><Icon name="user" size={10} color="#fff" /></View>}
          <Text style={[s.tourOrganizerText, { color: colors.textSecondary }]} numberOfLines={1}>
            Par {tournament.organizer_name ?? 'Organisateur'}
          </Text>
        </View>

        {tournament.prize && (
          <View style={s.tourPrizeRow}>
            <Text style={s.tourPrizeEmoji}>🏆</Text>
            <Text style={s.tourPrizeText} numberOfLines={1}>{tournament.prize}</Text>
          </View>
        )}

        <View style={[s.tourStatsRow, { borderTopColor: colors.divider }]}>
          <View style={s.tourStat}>
            <Icon name="users" size={12} color={colors.textTertiary} />
            <Text style={[s.tourStatText, { color: colors.textSecondary }]}>
              {tournament.participants_count}/{tournament.max_participants}
            </Text>
          </View>
          <View style={s.tourStat}>
            <Icon name="eye" size={12} color={colors.textTertiary} />
            <Text style={[s.tourStatText, { color: colors.textSecondary }]}>{formatCount(tournament.spectator_count)}</Text>
          </View>
        </View>

        <View style={s.tourDatesRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.tourDateLabel, { color: colors.textTertiary }]}>Début</Text>
            <Text style={[s.tourDateValue, { color: colors.textSecondary }]}>{formatDate(tournament.started_at ?? tournament.created_at)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.tourDateLabel, { color: colors.textTertiary }]}>Fin</Text>
            <Text style={[s.tourDateValue, { color: colors.textSecondary }]}>{tournament.ended_at ? formatDate(tournament.ended_at) : '—'}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onView} activeOpacity={0.88}>
          <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={s.watchBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Icon name="eye" size={14} color="#fff" />
            <Text style={s.watchBtnText}>Voir</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export const s = StyleSheet.create({
  watchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, height: 44, marginTop: 12 },
  watchBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // ── Carte battle 1v1 ──────────────────────────────────────────────────────
  battleCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 14 },
  battleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  battleLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0365A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  battleLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  battleLiveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  battleTimerWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  battleTimerText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  battleHostsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  battleHostCol: { flex: 1, alignItems: 'center', gap: 6 },
  battleAvatar: { width: 56, height: 56, borderRadius: 28 },
  battleAvatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },
  battleHostNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  battleHostName: { fontSize: 13, fontWeight: '700', maxWidth: 100 },
  battleVsWrap: { width: 48, alignItems: 'center' },
  battleVsBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  battleVsText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  battleScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  battleScoreText: { fontSize: 15, fontWeight: '800', color: '#FFD700', width: 36, textAlign: 'center' },
  battleScoreBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(155,101,245,0.15)', overflow: 'hidden' },
  battleScoreBarFill: { height: '100%', backgroundColor: '#9B65F5', borderRadius: 3 },

  battleStatsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  battleStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  battleStatEmoji: { fontSize: 11 },
  battleStatText: { fontSize: 11, fontWeight: '700' },

  // ── Carte tournoi ─────────────────────────────────────────────────────────
  tourCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  tourImageWrap: { width: '100%', height: 130, position: 'relative' },
  tourImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  tourImageGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  tourStatusBadge: { position: 'absolute', top: 10, left: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tourStatusText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tourFormatBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tourFormatText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  tourBody: { padding: 14, gap: 8 },
  tourName: { fontSize: 16, fontWeight: '800' },
  tourOrganizerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tourOrganizerAvatar: { width: 18, height: 18, borderRadius: 9 },
  tourOrganizerAvatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },
  tourOrganizerText: { fontSize: 12, fontWeight: '600' },
  tourPrizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  tourPrizeEmoji: { fontSize: 13 },
  tourPrizeText: { color: '#F59E0B', fontSize: 12, fontWeight: '700' },

  tourStatsRow: { flexDirection: 'row', gap: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  tourStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tourStatText: { fontSize: 12, fontWeight: '700' },

  tourDatesRow: { flexDirection: 'row', gap: 12 },
  tourDateLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  tourDateValue: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
