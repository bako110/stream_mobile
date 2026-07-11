/**
 * Cartes partagees entre LiveOneVsOneScreen et LiveTournamentsScreen — grille
 * 2 colonnes, cartes carrees a l'image pleine (façon "Decouvrir les lives" de
 * GoLiveScreen), infos essentielles superposees en bas, details complets
 * disponibles en cliquant "Regarder"/"Voir" (ouvre l'ecran complet).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
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
  registration: 'Inscriptions',
  ongoing:      'En cours',
  completed:    'Terminé',
  cancelled:    'Annulé',
};

// ── Carte Battle 1 vs 1 — grille 2 colonnes, carree ───────────────────────────

export const BattleCard: React.FC<{ battle: ActiveBattle; onWatch: () => void }> = ({ battle, onWatch }) => {
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
    <Animated.View entering={FadeIn.duration(300)} style={s.gridItem}>
      <TouchableOpacity style={s.battleCard} onPress={onWatch} activeOpacity={0.9}>
        {/* Duel photos plein cadre — chaque moitie = un host */}
        <View style={s.battleDuelRow}>
          <View style={s.battleDuelHalf}>
            {battle.host_a_avatar
              ? <Image source={{ uri: battle.host_a_avatar }} style={s.battleDuelPhoto} />
              : <LinearGradient colors={['#9B65F5', '#6D3FC4']} style={s.battleDuelPhoto} />}
          </View>
          <View style={s.battleDuelHalf}>
            {battle.host_b_avatar
              ? <Image source={{ uri: battle.host_b_avatar }} style={s.battleDuelPhoto} />
              : <LinearGradient colors={['#F0365A', '#9B1C3F']} style={s.battleDuelPhoto} />}
          </View>
        </View>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={s.battleDuelGrad} />

        {/* VS central */}
        <View style={s.battleVsWrap} pointerEvents="none">
          <LinearGradient colors={['#9B65F5', '#F0365A']} style={s.battleVsBadge}>
            <Text style={s.battleVsText}>VS</Text>
          </LinearGradient>
        </View>

        {/* Badge EN DIRECT + temps restant */}
        <View style={s.battleLiveBadge}>
          <View style={s.battleLiveDot} />
          <Text style={s.battleLiveBadgeText}>DIRECT</Text>
        </View>
        <View style={s.battleTimerWrap}>
          <Icon name="clock" size={10} color="#fff" />
          <Text style={s.battleTimerText}>{formatRemaining(battle.started_at, battle.duration_seconds)}</Text>
        </View>

        {/* Bas : noms + barre de score + viewers */}
        <View style={s.battleBottom}>
          <View style={s.battleNamesRow}>
            <View style={s.battleNameCol}>
              <Text style={s.battleName} numberOfLines={1}>{battle.host_a_name ?? 'Créateur'}</Text>
              {battle.host_a_verified && <VerifiedBadge size={10} />}
            </View>
            <View style={[s.battleNameCol, s.battleNameColRight]}>
              {battle.host_b_verified && <VerifiedBadge size={10} />}
              <Text style={[s.battleName, s.battleNameRight]} numberOfLines={1}>{battle.host_b_name ?? 'Créateur'}</Text>
            </View>
          </View>

          <View style={s.battleScoreBarTrack}>
            <View style={[s.battleScoreBarFill, { width: `${pctA}%` }]} />
          </View>

          <View style={s.battleFooterRow}>
            <View style={s.battleViewersChip}>
              <Icon name="eye" size={10} color="rgba(255,255,255,0.85)" />
              <Text style={s.battleViewersText}>{formatCount(battle.viewer_count)}</Text>
            </View>
            <View style={s.battleGogoldChip}>
              <Text style={s.battleGogoldText}>🪙 {formatCount(battle.score_a + battle.score_b)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Carte Tournoi — grille 2 colonnes, carree ─────────────────────────────────

export const TournamentCard: React.FC<{ tournament: ActiveTournament; onView: () => void }> = ({ tournament, onView }) => {
  const statusColor = tournament.status === 'ongoing' ? '#10B981' : '#F59E0B';

  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.gridItem}>
      <TouchableOpacity style={s.tourCard} onPress={onView} activeOpacity={0.9}>
        {tournament.image_url
          ? <Image source={{ uri: tournament.image_url }} style={s.tourImage} />
          : <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={s.tourImage}>
              <Icon name="award" size={40} color="rgba(255,255,255,0.85)" />
            </LinearGradient>}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={s.tourGrad} />

        <View style={[s.tourStatusBadge, { backgroundColor: statusColor }]}>
          <Text style={s.tourStatusText}>{TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}</Text>
        </View>
        <View style={s.tourFormatBadge}>
          <Text style={s.tourFormatText}>{tournament.format} joueurs</Text>
        </View>

        <View style={s.tourBottom}>
          <Text style={s.tourName} numberOfLines={2}>{tournament.name}</Text>

          {tournament.prize ? (
            <View style={s.tourPrizeRow}>
              <Text style={s.tourPrizeEmoji}>🏆</Text>
              <Text style={s.tourPrizeText} numberOfLines={1}>{tournament.prize}</Text>
            </View>
          ) : (
            <View style={s.tourOrganizerRow}>
              {tournament.organizer_avatar
                ? <Image source={{ uri: tournament.organizer_avatar }} style={s.tourOrganizerAvatar} />
                : <View style={[s.tourOrganizerAvatar, s.tourOrganizerAvatarFallback]}><Icon name="user" size={9} color="#fff" /></View>}
              <Text style={s.tourOrganizerText} numberOfLines={1}>{tournament.organizer_name ?? 'Organisateur'}</Text>
            </View>
          )}

          <View style={s.tourFooterRow}>
            <View style={s.tourStatChip}>
              <Icon name="users" size={10} color="rgba(255,255,255,0.85)" />
              <Text style={s.tourStatText}>{tournament.participants_count}/{tournament.max_participants}</Text>
            </View>
            <View style={s.tourStatChip}>
              <Icon name="eye" size={10} color="rgba(255,255,255,0.85)" />
              <Text style={s.tourStatText}>{formatCount(tournament.spectator_count)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const s = StyleSheet.create({
  // ── Grille commune ─────────────────────────────────────────────────────────
  gridItem: { width: '50%', padding: 6 },

  // ── Carte battle 1v1 ──────────────────────────────────────────────────────
  battleCard: { aspectRatio: 0.82, borderRadius: 20, overflow: 'hidden', backgroundColor: '#14101f' },
  battleDuelRow: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  battleDuelHalf: { flex: 1, overflow: 'hidden' },
  battleDuelPhoto: { width: '100%', height: '100%' },
  battleDuelGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },

  battleVsWrap: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', marginTop: -14 },
  battleVsBadge: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#9B65F5', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 8,
  },
  battleVsText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  battleLiveBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0365A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  battleLiveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  battleLiveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  battleTimerWrap: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  battleTimerText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  battleBottom: { position: 'absolute', left: 10, right: 10, bottom: 10, gap: 6 },
  battleNamesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  battleNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  battleNameColRight: { justifyContent: 'flex-end' },
  battleName: { color: '#fff', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  battleNameRight: { textAlign: 'right' },

  battleScoreBarTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(240,54,90,0.5)', overflow: 'hidden' },
  battleScoreBarFill: { height: '100%', backgroundColor: '#9B65F5', borderRadius: 2 },

  battleFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  battleViewersChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  battleViewersText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
  battleGogoldChip: { flexDirection: 'row', alignItems: 'center' },
  battleGogoldText: { color: '#FFD700', fontSize: 10, fontWeight: '800' },

  // ── Carte tournoi ─────────────────────────────────────────────────────────
  tourCard: { aspectRatio: 0.82, borderRadius: 20, overflow: 'hidden', backgroundColor: '#14101f' },
  tourImage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  tourGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },

  tourStatusBadge: { position: 'absolute', top: 8, left: 8, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tourStatusText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  tourFormatBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tourFormatText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  tourBottom: { position: 'absolute', left: 10, right: 10, bottom: 10, gap: 6 },
  tourName: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  tourPrizeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tourPrizeEmoji: { fontSize: 11 },
  tourPrizeText: { color: '#FFD700', fontSize: 10, fontWeight: '700', flexShrink: 1 },
  tourOrganizerRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tourOrganizerAvatar: { width: 14, height: 14, borderRadius: 7 },
  tourOrganizerAvatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },
  tourOrganizerText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600', flexShrink: 1 },

  tourFooterRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  tourStatChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tourStatText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
});
