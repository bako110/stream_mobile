import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Image, ScrollView, Animated, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { GoFolyXLoader, BackButton } from '../../components/common';
import { AvatarWithBadge } from '../../components/common/AvatarWithBadge';
import { communityService } from '../../services/communityService';
import type { CommunityMemberData } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type RoleFilter = 'all' | 'admin' | 'moderator' | 'member';

interface RouteParams {
  communityId: string;
  communityName: string;
  myRole?: string | null;
  membersListHiddenPublic?: boolean;
  membersListHiddenMembers?: boolean;
}
interface Props { route: { params: RouteParams }; }

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all',       label: 'Tous'        },
  { key: 'admin',     label: 'Admins'      },
  { key: 'moderator', label: 'Modérateurs' },
  { key: 'member',    label: 'Membres'     },
];

const ROLE_COLOR: Record<string, string> = {
  admin:     '#F59E0B',
  moderator: '#7B3FF2',
  member:    '#3B82F6',
};
const ROLE_LABEL: Record<string, string> = {
  admin:     'Admin',
  moderator: 'Modérateur',
  member:    'Membre',
};
const MEDAL: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };
const MEDAL_COLOR: Record<number, string> = { 1: '#F59E0B', 2: '#C0C0C0', 3: '#CD7F32' };

// ── Avatar avec photo ────────────────────────────────────────────────────────
const MemberAvatar: React.FC<{ member: CommunityMemberData; size: number; border?: string }> = ({ member, size, border }) => {
  const color = ROLE_COLOR[member.role] ?? '#3B82F6';
  const initials = ((member.display_name || member.username || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase());

  // En live : l'anneau live prend le pas sur la bordure de rôle (redondant sinon)
  if (member.is_live) {
    return (
      <AvatarWithBadge
        avatarUrl={member.avatar_url}
        initials={initials}
        size={size}
        accentColor={color}
        isLive
      />
    );
  }

  if (member.avatar_url) {
    return (
      <Image
        source={{ uri: member.avatar_url }}
        style={{
          width: size, height: size, borderRadius: size / 2,
          borderWidth: border ? 2.5 : 0, borderColor: border ?? color,
        }}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '22', borderWidth: 1.5, borderColor: color + '60',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '800', color }}>{initials}</Text>
    </View>
  );
};

// ── Barre animée ─────────────────────────────────────────────────────────────
const AnimBar: React.FC<{ progress: number; color: string }> = ({ progress, color }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: progress, duration: 700, useNativeDriver: false }).start();
  }, [progress]);
  return (
    <View style={{ width: '85%', height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
      <Animated.View style={{ height: 3, borderRadius: 2, backgroundColor: color,
        width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
};

// ── Carte podium ─────────────────────────────────────────────────────────────
const PodiumCard: React.FC<{
  member: CommunityMemberData; rank: 1 | 2 | 3;
  onPress: () => void; maxGoGold: number;
}> = ({ member, rank, onPress, maxGoGold }) => {
  const GoGold = member.gogold ?? 0;
  const mc = MEDAL_COLOR[rank];
  const gradients: Record<number, string[]> = {
    1: ['#4A2080', '#7B3FF2'], 2: ['#1C1830', '#2A2248'], 3: ['#1A1530', '#251D42'],
  };
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ flex: 1, marginTop: rank === 1 ? 0 : 20 }}>
      <LinearGradient colors={gradients[rank]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: rank === 1 ? 18 : 14, padding: rank === 1 ? 16 : 12,
          alignItems: 'center', gap: 5 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15,
          backgroundColor: mc + '22', borderWidth: 1, borderColor: mc + '55',
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14 }}>{MEDAL[rank]}</Text>
        </View>
        <MemberAvatar member={member} size={rank === 1 ? 54 : 42} border={mc} />
        <Text style={{ color: '#fff', fontSize: rank === 1 ? 13 : 12, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
          {member.display_name || member.username}
        </Text>
        {GoGold > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
            backgroundColor: '#F59E0B22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11 }}>⚡</Text>
            <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '800' }}>
              {GoGold >= 1000 ? `${(GoGold / 1000).toFixed(1)}k` : GoGold}
            </Text>
          </View>
        )}
        {GoGold > 0 && <AnimBar progress={maxGoGold > 0 ? GoGold / maxGoGold : 0} color={mc} />}
      </LinearGradient>
    </TouchableOpacity>
  );
};

// ── Carte membre ──────────────────────────────────────────────────────────────
const MemberCard: React.FC<{ member: CommunityMemberData; rank?: number; onPress: () => void; colors: any }> = ({ member, rank, onPress, colors }) => {
  const roleColor = ROLE_COLOR[member.role] ?? '#3B82F6';
  const GoGold = member.gogold ?? 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Rang */}
      {rank && (
        <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '700', width: 24, textAlign: 'center' }}>
          #{rank}
        </Text>
      )}
      <MemberAvatar member={member} size={46} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
            {member.display_name || member.username}
          </Text>
          <View style={{ backgroundColor: roleColor + '20', borderRadius: 6, borderWidth: 1,
            borderColor: roleColor + '50', paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: roleColor, fontSize: 10, fontWeight: '700' }}>
              {ROLE_LABEL[member.role] ?? member.role}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textTertiary, fontSize: 12 }}>@{member.username}</Text>
        {member.joined_at && (
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
            Depuis {new Date(member.joined_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
          </Text>
        )}
      </View>
      {GoGold > 0 && (
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '800' }}>⚡ {GoGold >= 1000 ? `${(GoGold / 1000).toFixed(1)}k` : GoGold}</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 10 }}>GoGold</Text>
        </View>
      )}
      <Icon name="chevron-right" size={15} color={colors.textTertiary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────
export default function CommunityMembersScreen({ route }: Props) {
  const {
    communityId, communityName,
    myRole = null,
    membersListHiddenPublic  = false,
    membersListHiddenMembers = false,
  } = route.params;

  const isAdmin   = myRole === 'admin';
  const isMod     = myRole === 'moderator';
  const isMember  = !!myRole; // null = non-membre

  // Contrôle d'accès
  const blockedForPublic  = !isMember && membersListHiddenPublic;
  const blockedForMembers = isMember && !isAdmin && !isMod && membersListHiddenMembers;
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [search,      setSearch]      = useState('');
  const [roleFilter,  setRoleFilter]  = useState<RoleFilter>('all');
  const [members,     setMembers]     = useState<CommunityMemberData[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await communityService.getMembers(communityId);
      setMembers(Array.isArray(data) ? data : []);
    } catch { setMembers([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const onPress = (m: CommunityMemberData) =>
    navigation.navigate('CommunityMemberProfile', {
      communityId, communityName, memberId: m.user_id,
      memberName: m.display_name || m.username || '',
    });

  const filtered = members.filter(m => {
    const matchRole = roleFilter === 'all' || m.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = q === '' ||
      (m.display_name || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  // Comptes par rôle
  const counts: Record<RoleFilter, number> = {
    all: members.length,
    admin: members.filter(m => m.role === 'admin').length,
    moderator: members.filter(m => m.role === 'moderator').length,
    member: members.filter(m => m.role === 'member').length,
  };

  // Podium — top 3 par GoGold si disponible
  const sorted = [...members].sort((a, b) => (b.gogold ?? 0) - (a.gogold ?? 0));
  const top3 = sorted.slice(0, 3);
  const maxGoGold = top3[0]?.gogold ?? 0;
  const showPodium = roleFilter === 'all' && search.trim() === '' && top3.length === 3 && maxGoGold > 0;

  if (blockedForPublic || blockedForMembers) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 }}>
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" size={28} color={colors.textTertiary} />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
          Liste privée
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          {blockedForPublic
            ? 'Rejoins la communauté pour voir les membres.'
            : "Seul l'administrateur peut consulter la liste des membres."}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
        <GoFolyXLoader />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      {/* Header */}
      <LinearGradient
        colors={[colors.surface, colors.surface]}
        style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>
            Membres · {members.length}
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
            {communityName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Search */}
      <View style={[st.searchBar, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <Icon name="search" size={15} color={colors.primary} style={{ marginRight: 8 }} />
        <TextInput
          style={{ flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: 0 }}
          placeholder="Rechercher un membre..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres avec compteurs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' }}
        style={{ flexGrow: 0, flexShrink: 0, height: 54 }}>
        {ROLE_FILTERS.map(f => {
          const active = roleFilter === f.key;
          return (
            <TouchableOpacity key={f.key} onPress={() => setRoleFilter(f.key)}
              style={[st.filterPill, active
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border }
              ]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textSecondary }}>
                {f.label}
              </Text>
              <View style={{
                backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.backgroundSecondary,
                borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: active ? '#fff' : colors.textTertiary }}>
                  {counts[f.key]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Liste */}
      <FlatList
        data={filtered}
        keyExtractor={m => m.id}
        renderItem={({ item, index }) => (
          <MemberCard
            member={item}
            rank={!showPodium && roleFilter === 'all' && search === '' ? index + 1 : undefined}
            onPress={() => onPress(item)}
            colors={colors}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          showPodium ? (
            <View style={{ marginBottom: 20, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700',
                letterSpacing: 0.9, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 12 }}>
                TOP MEMBRES
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <PodiumCard member={top3[1]} rank={2} onPress={() => onPress(top3[1])} maxGoGold={maxGoGold} />
                <PodiumCard member={top3[0]} rank={1} onPress={() => onPress(top3[0])} maxGoGold={maxGoGold} />
                <PodiumCard member={top3[2]} rank={3} onPress={() => onPress(top3[2])} maxGoGold={maxGoGold} />
              </View>
              <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700',
                letterSpacing: 0.9, textTransform: 'uppercase', paddingHorizontal: 4,
                marginTop: 24, marginBottom: 4 }}>
                TOUS LES MEMBRES
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 64, gap: 10, paddingHorizontal: 32 }}>
            <Icon name="users" size={44} color={colors.textTertiary} />
            <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>
              Aucun membre trouvé
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
              Essayez une autre recherche ou un autre filtre.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBar:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 2, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  card:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 12 },
});
