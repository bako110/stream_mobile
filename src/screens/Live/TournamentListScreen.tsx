/**
 * TournamentListScreen — liste des tournois avec inscriptions ouvertes, creation
 * d'un nouveau tournoi, et inscription/desinscription.
 *
 * Carte tournoi repensee : image/gradient en haut, badges format + statut, nom,
 * ligne recompense (prize / prize_pool / frais d'entree), barre de remplissage
 * des inscriptions, et CTA pleine largeur (Rejoindre / Complet).
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar,
  RefreshControl, ActivityIndicator, Modal, TextInput, Animated, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { tournamentService } from '../../services/tournamentService';
import type { OpenTournament } from '../../services/tournamentService';
import { toastService } from '../../services';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { BackButton } from '../../components/common';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const FORMATS: Array<8 | 16 | 32 | 64> = [8, 16, 32, 64];

// Echelle de radius unique pour cet ecran
const RR = { chip: 8, media: 12, card: 16, pill: 999 } as const;

const fmtGold = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k` : String(n);

const fmtStart = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ── Carte tournoi ────────────────────────────────────────────────────────────
const TournamentRow: React.FC<{
  item: OpenTournament;
  colors: any;
  joining: boolean;
  onOpen: () => void;
  onJoin: () => void;
}> = ({ item, colors, joining, onOpen, onJoin }) => {
  const full = item.participants_count >= item.max_participants;
  const ratio = item.max_participants > 0
    ? Math.min(1, item.participants_count / item.max_participants)
    : 0;

  // Barre de remplissage animee
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: ratio, duration: 500, useNativeDriver: false }).start();
  }, [ratio]);

  const barColor = full
    ? colors.textTertiary
    : ratio >= 0.75
      ? colors.warning
      : colors.primary;

  const startLabel = fmtStart(item.scheduled_start_at);

  // Ligne recompense : prize texte > prize_pool GoGold > frais d'entree > organisateur
  const reward = item.prize
    ? { emoji: '🏆', text: item.prize }
    : item.prize_pool > 0
      ? { emoji: '🪙', text: `${fmtGold(item.prize_pool)} GoGold à gagner` }
      : item.entry_fee_gogold > 0
        ? { emoji: '🎟️', text: `${fmtGold(item.entry_fee_gogold)} GoGold pour participer` }
        : { emoji: '⚔️', text: 'Tournoi communautaire' };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* En-tete : visuel + format + statut */}
      <TouchableOpacity activeOpacity={0.9} onPress={onOpen}>
        <View style={styles.cover}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.coverTop}>
            <View style={styles.formatPill}>
              <Icon name="grid" size={10} color="#fff" />
              <Text style={styles.formatPillText}>{item.format} joueurs</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: full ? colors.textTertiary : colors.success }]}>
              <Text style={styles.statusPillText}>{full ? 'Complet' : 'Inscriptions'}</Text>
            </View>
          </View>
          <Text style={styles.coverTitle} numberOfLines={2}>{item.name}</Text>
        </View>
      </TouchableOpacity>

      {/* Corps */}
      <View style={styles.body}>
        {/* Recompense */}
        <View style={styles.rewardRow}>
          <Text style={styles.rewardEmoji}>{reward.emoji}</Text>
          <Text style={[styles.rewardText, { color: colors.textPrimary }]} numberOfLines={1}>{reward.text}</Text>
        </View>

        {/* Date de debut */}
        {startLabel && (
          <View style={styles.metaRow}>
            <Icon name="calendar" size={12} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>Début {startLabel}</Text>
          </View>
        )}

        {/* Barre de remplissage des inscriptions */}
        <View style={styles.fillBlock}>
          <View style={styles.fillLabelRow}>
            <Text style={[styles.fillLabel, { color: colors.textSecondary }]}>Inscrits</Text>
            <Text style={[styles.fillCount, { color: colors.textPrimary }]}>
              {item.participants_count}<Text style={{ color: colors.textTertiary }}> / {item.max_participants}</Text>
            </Text>
          </View>
          <View style={[styles.fillTrack, { backgroundColor: colors.backgroundSecondary }]}>
            <Animated.View
              style={[
                styles.fillBar,
                { backgroundColor: barColor, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </View>

        {/* CTA pleine largeur */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onJoin}
          disabled={joining || full}
          style={styles.ctaWrap}
        >
          {full ? (
            <View style={[styles.cta, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.ctaText, { color: colors.textTertiary }]}>Tournoi complet</Text>
            </View>
          ) : (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              {joining
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Icon name="zap" size={15} color="#fff" />
                    <Text style={[styles.ctaText, { color: '#fff' }]}>Rejoindre le tournoi</Text>
                  </>
              }
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const TournamentListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { currentUser } = useUser();

  const [tournaments, setTournaments] = useState<OpenTournament[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [joining, setJoining]         = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showCreate, setShowCreate]   = useState(false);
  const [name, setName]               = useState('');
  const [format, setFormat]           = useState<8 | 16 | 32 | 64>(8);
  const [creating, setCreating]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await tournamentService.listOpen(1);
      setTournaments(res.items);
      setPage(1);
      setHasMore(res.has_more);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await tournamentService.listOpen(nextPage);
      setTournaments(prev => [...prev, ...res.items]);
      setPage(nextPage);
      setHasMore(res.has_more);
    } catch {} finally { setLoadingMore(false); }
  }, [page, hasMore, loadingMore]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleJoin = async (t: OpenTournament) => {
    if (joining) return;
    setJoining(t.id);
    try {
      await tournamentService.join(t.id);
      await load();
    } catch (e: any) {
      toastService.error('Impossible de rejoindre', e?.message || 'Une erreur est survenue.');
    } finally {
      setJoining(null);
    }
  };

  const handleOpenBracket = (t: OpenTournament) => {
    nav.navigate('TournamentBracket', { tournamentId: t.id });
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const t = await tournamentService.create({ name: name.trim(), format });
      setShowCreate(false);
      setName('');
      await load();
      nav.navigate('TournamentBracket', { tournamentId: t.id });
    } catch (e: any) {
      toastService.error('Impossible de créer le tournoi', e?.message || 'Une erreur est survenue.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tournois ouverts</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.createBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TournamentRow
              item={item}
              colors={colors}
              joining={joining === item.id}
              onOpen={() => handleOpenBracket(item)}
              onJoin={() => handleJoin(item)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + '14' }]}>
                <Icon name="award" size={30} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Aucun tournoi ouvert</Text>
              <Text style={[styles.emptySub, { color: colors.textTertiary }]}>
                Lance le tien et invite la communauté à s'affronter.
              </Text>
              <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.85} style={{ marginTop: 6 }}>
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.emptyCta}
                >
                  <Icon name="plus" size={14} color="#fff" />
                  <Text style={styles.emptyCtaText}>Créer un tournoi</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Créer un tournoi</Text>
            <Text style={[styles.modalSub, { color: colors.textTertiary }]}>
              Choisis un nom et le nombre de participants.
            </Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom du tournoi"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
              maxLength={200}
            />

            <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>NOMBRE DE PARTICIPANTS</Text>
            <View style={styles.formatRow}>
              {FORMATS.map(f => {
                const active = format === f;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFormat(f)}
                    activeOpacity={0.8}
                    style={[
                      styles.formatChip,
                      { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '18' : colors.backgroundSecondary },
                    ]}
                  >
                    <Text style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: '800', fontSize: 15 }}>{f}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setShowCreate(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 15 }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }, !name.trim() && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Créer</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  createBtn: { width: 40, height: 40, borderRadius: RR.pill, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  list: { padding: 16, gap: 14 },

  // ── Carte ─────────────────────────────────────────────────────────────────
  card: { borderRadius: RR.card, borderWidth: 1, overflow: 'hidden' },
  cover: { height: 128, justifyContent: 'space-between', padding: 12 },
  coverTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  formatPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: RR.chip },
  formatPillText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: RR.chip },
  statusPillText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  coverTitle: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },

  body: { padding: 14, gap: 12 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardEmoji: { fontSize: 16 },
  rewardText: { flex: 1, fontSize: 14, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  metaText: { fontSize: 12, fontWeight: '500' },

  fillBlock: { gap: 6 },
  fillLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fillLabel: { fontSize: 12, fontWeight: '600' },
  fillCount: { fontSize: 13, fontWeight: '800' },
  fillTrack: { height: 8, borderRadius: RR.pill, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: RR.pill },

  ctaWrap: { marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: RR.media },
  ctaText: { fontSize: 14.5, fontWeight: '800' },

  // ── Empty ─────────────────────────────────────────────────────────────────
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 40, gap: 8 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: RR.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  emptySub: { fontSize: 13, fontWeight: '400', lineHeight: 19, textAlign: 'center', marginBottom: 8 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RR.pill, paddingHorizontal: 20, paddingVertical: 12 },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // ── Modale creation ───────────────────────────────────────────────────────
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: RR.card, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  modalSub: { fontSize: 13, fontWeight: '400', marginTop: -6, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: RR.media, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatChip: { flex: 1, borderWidth: 1.5, borderRadius: RR.media, paddingVertical: 12, alignItems: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: RR.media, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
