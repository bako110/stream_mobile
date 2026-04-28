import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, Platform, StatusBar,
  ActivityIndicator, KeyboardAvoidingView, Image,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, Spacing } from '../../theme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserResult {
  id:          string;
  username:    string;
  full_name?:  string;
  display?:    string;
  avatar_url?: string;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const ACCENT_COLORS = ['#7B3FF2','#FF7A2F','#E0389A','#36D9A0','#3B82F6','#9B65F5','#EF4444','#F59E0B'];
function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ACCENT_COLORS[h % ACCENT_COLORS.length]!;
}

export const NewCallScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav               = useNavigation<any>();
  const insets            = useSafeAreaInsets();

  const [query,        setQuery]        = useState('');
  const [friends,      setFriends]      = useState<UserResult[]>([]);
  const [searchResult, setSearchResult] = useState<UserResult[]>([]);
  const [loadingInit,  setLoadingInit]  = useState(true);
  const [loadingSearch,setLoadingSearch]= useState(false);
  const [empty,        setEmpty]        = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get<any>(`${Endpoints.messages.usersSearch}?q=&limit=20`);
        const data = Array.isArray(res) ? res : (res as any)?.data ?? [];
        setFriends(data);
      } catch {
        setFriends([]);
      } finally {
        setLoadingInit(false);
      }
    })();
  }, []);

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchResult([]); setEmpty(false); setLoadingSearch(false);
      return;
    }
    setLoadingSearch(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient.get<UserResult[]>(
          `${Endpoints.messages.usersSearch}?q=${encodeURIComponent(trimmed)}&limit=30`,
        );
        const data = Array.isArray(res) ? res : (res as any)?.data ?? [];
        setSearchResult(data);
        setEmpty(data.length === 0);
      } catch {
        setSearchResult([]); setEmpty(true);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
  }, []);

  const handleChange = (text: string) => { setQuery(text); doSearch(text); };

  const startCall = (user: { id: string; name: string; avatarUrl?: string }, callType: 'voice' | 'video') => {
    nav.navigate('Call', {
      partnerId:     user.id,
      partnerName:   user.name,
      partnerAvatar: user.avatarUrl,
      callType,
      isIncoming:    false,
    });
  };

  const displayed = query.trim() ? searchResult : friends;
  const isLoading = query.trim() ? loadingSearch : loadingInit;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nouvel appel</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Barre de recherche */}
        <Animated.View entering={FadeIn.duration(160)}
          style={[styles.searchBar, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary }]}
        >
          <Icon name="search" size={15} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={handleChange}
            placeholder="Rechercher par nom ou @username…"
            placeholderTextColor={colors.textDisabled}
            returnKeyType="search"
            autoFocus
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {loadingSearch && <ActivityIndicator size="small" color={colors.primary} />}
          {!loadingSearch && query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSearchResult([]); setEmpty(false); }}>
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {/* Contenu */}
      {!query.trim() && !loadingInit && friends.length > 0 && (
        <View style={[styles.sectionHeader, { borderBottomColor: colors.divider }]}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>CONTACTS SUGGÉRÉS</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={u => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={displayed.length === 0 ? styles.centerContainer : { paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              {query.trim() && empty ? (
                <>
                  <Icon name="user-x" size={54} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                    Aucun résultat pour « {query} »
                  </Text>
                </>
              ) : !query.trim() ? (
                <>
                  <Icon name="users" size={54} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Aucun contact</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                    Suivez des personnes pour les appeler rapidement
                  </Text>
                </>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 35).springify()}>
              <UserCallRow
                user={item}
                colors={colors}
                onVoiceCall={() => startCall({ id: item.id, name: item.display ?? item.full_name ?? item.username, avatarUrl: item.avatar_url }, 'voice')}
                onVideoCall={() => startCall({ id: item.id, name: item.display ?? item.full_name ?? item.username, avatarUrl: item.avatar_url }, 'video')}
              />
            </Animated.View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
};

// ── UserCallRow ───────────────────────────────────────────────────────────────

const UserCallRow: React.FC<{
  user:        UserResult;
  colors:      any;
  onVoiceCall: () => void;
  onVideoCall: () => void;
}> = ({ user, colors, onVoiceCall, onVideoCall }) => {
  const name   = user.display ?? user.full_name ?? user.username;
  const accent = accentFor(user.id);

  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: accent + '22' }]}>
          <Text style={[styles.avatarText, { color: accent }]}>{getInitials(name)}</Text>
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.rowSub, { color: colors.textTertiary }]} numberOfLines={1}>@{user.username}</Text>
      </View>
      <View style={styles.callBtns}>
        <TouchableOpacity style={[styles.callBtn, { backgroundColor: '#36D9A0' + '20' }]} onPress={onVoiceCall} activeOpacity={0.75}>
          <Icon name="phone" size={18} color="#36D9A0" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.callBtn, { backgroundColor: colors.primary + '20' }]} onPress={onVideoCall} activeOpacity={0.75}>
          <Icon name="video" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: Spacing[4],
    paddingBottom:     Spacing[2],
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    gap: Spacing[2],
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  backBtn:     { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  searchBar: {
    flexDirection:    'row',
    alignItems:       'center',
    borderRadius:     BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical:  Platform.OS === 'android' ? 6 : 10,
    gap:              8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  sectionHeader: {
    paddingHorizontal: Spacing[4],
    paddingVertical:   10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },

  centerContainer: { flexGrow: 1 },
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[6], gap: 16, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  row: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: Spacing[4],
    paddingVertical:  Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap:              Spacing[3],
  },
  avatar:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' },
  rowContent: { flex: 1, gap: 2 },
  rowName:    { fontSize: 15, fontWeight: '600' },
  rowSub:     { fontSize: 12 },

  callBtns: { flexDirection: 'row', gap: 10 },
  callBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
