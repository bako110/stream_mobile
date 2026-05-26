import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Modal, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService, type PostLiker } from '../../services/postService';
import { userService } from '../../services/userService';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.75);
const AVATAR_SIZE = 46;

const AVATAR_COLORS = ['#6366F1', '#E0389A', '#10B981', '#F97316', '#3B82F6', '#7B3FF2', '#EF4444'];

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getDisplayName(u: PostLiker): string {
  return u.display_name ?? u.username ?? 'Utilisateur';
}

function getInitials(u: PostLiker): string {
  const n = getDisplayName(u);
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtCount(n: number): string {
  return n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── LikerRow ──────────────────────────────────────────────────────────────────
const LikerRow: React.FC<{
  user: PostLiker;
  isMe: boolean;
  onFollowToggle: (userId: string, following: boolean) => void;
  onPress: (userId: string) => void;
}> = ({ user, isMe, onFollowToggle, onPress }) => {
  const { theme: { colors } } = useTheme();
  const [following, setFollowing] = useState(!!user.is_following);
  const [loading,   setLoading]   = useState(false);
  const color = avatarColor(user.id);

  const handleFollow = useCallback(async () => {
    if (loading) return;
    const next = !following;
    setFollowing(next);
    setLoading(true);
    try {
      if (next) {
        await userService.follow(user.id);
      } else {
        await userService.unfollow(user.id);
      }
      onFollowToggle(user.id, next);
    } catch {
      setFollowing(!next);
    } finally {
      setLoading(false);
    }
  }, [following, loading, user.id, onFollowToggle]);

  return (
    <TouchableOpacity
      style={[ls.row, { borderBottomColor: colors.divider }]}
      activeOpacity={0.7}
      onPress={() => onPress(user.id)}
    >
      {/* Avatar */}
      <View style={[ls.avatarWrap, { backgroundColor: color + '22' }]}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={ls.avatar} />
        ) : (
          <Text style={[ls.initials, { color }]}>{getInitials(user)}</Text>
        )}
        {user.is_verified && (
          <View style={ls.verifiedBadge}>
            <Icon name="check" size={8} color="#fff" />
          </View>
        )}
      </View>

      {/* Infos */}
      <View style={ls.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[ls.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {getDisplayName(user)}
          </Text>
          {user.is_verified && (
            <Icon name="check-circle" size={12} color="#1D9BF0" />
          )}
        </View>
        {user.username ? (
          <Text style={[ls.userHandle, { color: colors.textTertiary }]} numberOfLines={1}>
            @{user.username}
          </Text>
        ) : null}
        {user.bio ? (
          <Text style={[ls.bio, { color: colors.textSecondary }]} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}
      </View>

      {/* Bouton follow */}
      {!isMe && (
        following ? (
          <TouchableOpacity
            onPress={handleFollow}
            activeOpacity={0.8}
            disabled={loading}
            style={[ls.btnFollowing, { borderColor: colors.divider }]}
          >
            {loading
              ? <ActivityIndicator size="small" color={colors.textTertiary} />
              : <Text style={[ls.btnFollowingTxt, { color: colors.textSecondary }]}>Abonné</Text>
            }
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleFollow} activeOpacity={0.85} disabled={loading}>
            <LinearGradient
              colors={['#6366F1', '#4F46E5']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={ls.btnFollow}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={ls.btnFollowTxt}>Suivre</Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        )
      )}
    </TouchableOpacity>
  );
};

// ── Skeleton rows ─────────────────────────────────────────────────────────────
const SkeletonRow: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={[ls.row, { borderBottomColor: colors.divider }]}>
    <View style={[ls.avatarWrap, { backgroundColor: colors.backgroundSecondary }]} />
    <View style={{ flex: 1, gap: 7 }}>
      <View style={{ width: '46%', height: 13, borderRadius: 6, backgroundColor: colors.backgroundSecondary }} />
      <View style={{ width: '30%', height: 10, borderRadius: 5, backgroundColor: colors.backgroundSecondary }} />
    </View>
    <View style={{ width: 68, height: 32, borderRadius: 16, backgroundColor: colors.backgroundSecondary }} />
  </View>
);

// ── LikersBottomSheet ─────────────────────────────────────────────────────────
interface Props {
  visible:              boolean;
  onClose:              () => void;
  postId:               string;
  likeCount:            number;
  onNavigateToProfile?: (userId: string) => void;
  /** Override the default fetch (postService.getLikers). Called with (page, limit). */
  fetchLikers?:         (page: number, limit: number) => Promise<PostLiker[]>;
}

export const LikersBottomSheet: React.FC<Props> = ({
  visible, onClose, postId, likeCount, onNavigateToProfile, fetchLikers,
}) => {
  const { theme: { colors } } = useTheme();
  const { currentUser } = useUser();
  const insets = useSafeAreaInsets();

  const [likers,  setLikers]  = useState<PostLiker[]>([]);
  const [loading, setLoading] = useState(false);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  // Reset + fetch au moment où la sheet s'ouvre
  useEffect(() => {
    if (!visible) return;
    setLikers([]);
    setPage(1);
    setHasMore(true);
    fetch(1, true);
  }, [visible, postId]);

  const fetch = useCallback(async (p: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = fetchLikers
        ? await fetchLikers(p, 30)
        : await postService.getLikers(postId, p, 30);
      if (data.length < 30) setHasMore(false);
      setLikers(prev => reset ? data : [...prev, ...data]);
      setPage(p + 1);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [postId, fetchLikers]);

  const handleEndReached = useCallback(() => {
    if (!loading && hasMore) fetch(page);
  }, [loading, hasMore, page, fetch]);

  const handleFollowToggle = useCallback((userId: string, following: boolean) => {
    setLikers(prev => prev.map(u => u.id === userId ? { ...u, is_following: following } : u));
  }, []);

  const handleProfilePress = useCallback((userId: string) => {
    onClose();
    setTimeout(() => onNavigateToProfile?.(userId), 300);
  }, [onClose, onNavigateToProfile]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Fond sombre — tap pour fermer */}
      <TouchableOpacity
        style={ls.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet */}
      <View style={[ls.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>

        {/* Handle */}
        <View style={[ls.handle, { backgroundColor: colors.divider }]} />

        {/* Header */}
        <View style={[ls.header, { borderBottomColor: colors.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={ls.heartWrap}>
              <Icon name="heart" size={17} color="#E0389A" />
            </View>
            <View>
              <Text style={[ls.headerTitle, { color: colors.textPrimary }]}>
                {likeCount > 0 ? `${fmtCount(likeCount)} ` : ''}J'adore
              </Text>
              {likers.length > 0 && (
                <Text style={[ls.headerSub, { color: colors.textTertiary }]}>
                  {likers.length} personne{likers.length > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[ls.closeBtn, { backgroundColor: colors.backgroundSecondary }]}
          >
            <Icon name="x" size={15} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Contenu */}
        {loading && likers.length === 0 ? (
          // Skeleton
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonRow key={i} colors={colors} />
            ))}
          </>
        ) : likers.length === 0 ? (
          // Vide
          <View style={ls.empty}>
            <View style={[ls.emptyIconWrap, { backgroundColor: '#E0389A12' }]}>
              <Icon name="heart" size={34} color="#E0389A" />
            </View>
            <Text style={[ls.emptyTitle, { color: colors.textPrimary }]}>Aucun j'adore</Text>
            <Text style={[ls.emptySub, { color: colors.textTertiary }]}>
              Sois le premier à adorer ce post
            </Text>
          </View>
        ) : (
          <FlatList
            data={likers}
            keyExtractor={u => u.id}
            showsVerticalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            renderItem={({ item }) => (
              <LikerRow
                user={item}
                isMe={!!(currentUser && String(currentUser.id) === String(item.id))}
                onFollowToggle={handleFollowToggle}
                onPress={handleProfilePress}
              />
            )}
            ListFooterComponent={
              loading
                ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
                : !hasMore && likers.length >= 30
                  ? <Text style={[ls.endTxt, { color: colors.textTertiary }]}>— Fin —</Text>
                  : null
            }
          />
        )}
      </View>
    </Modal>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    height:               SHEET_H,
    borderTopLeftRadius:  22,
    borderTopRightRadius: 22,
    overflow:             'hidden',
    shadowColor:          '#000',
    shadowOpacity:        0.2,
    shadowRadius:         16,
    shadowOffset:         { width: 0, height: -4 },
    elevation:            16,
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },
  header: {
    flexDirection:      'row',
    alignItems:         'center',
    justifyContent:     'space-between',
    paddingHorizontal:  16,
    paddingVertical:    14,
    borderBottomWidth:  StyleSheet.hairlineWidth,
  },
  heartWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#E0389A15',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub:   { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },

  // Ligne
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingHorizontal: 16,
    paddingVertical:   11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  initials: { fontSize: 16, fontWeight: '800' },
  verifiedBadge: {
    position:        'absolute',
    bottom:          0,
    right:           0,
    width:           16,
    height:          16,
    borderRadius:    8,
    backgroundColor: '#1D9BF0',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1.5,
    borderColor:     '#fff',
  },
  info:       { flex: 1, gap: 2 },
  name:       { fontSize: 14, fontWeight: '700' },
  userHandle: { fontSize: 12 },
  bio:        { fontSize: 12, marginTop: 1 },

  // Boutons follow
  btnFollow: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderRadius:      20,
    alignItems:        'center',
    justifyContent:    'center',
    minWidth:          70,
  },
  btnFollowTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnFollowing: {
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      20,
    borderWidth:       StyleSheet.hairlineWidth,
    alignItems:        'center',
    justifyContent:    'center',
    minWidth:          70,
  },
  btnFollowingTxt: { fontSize: 13, fontWeight: '600' },

  // Empty
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { fontSize: 17, fontWeight: '800' },
  emptySub:     { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

  endTxt: { textAlign: 'center', fontSize: 12, paddingVertical: 20 },
});
