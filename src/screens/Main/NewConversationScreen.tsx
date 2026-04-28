/**
 * NewConversationScreen — Rechercher un utilisateur pour démarrer une conversation.
 * Fonctionne comme la recherche de destinataire dans Facebook Messenger.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, Platform, StatusBar,
  ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, Spacing } from '../../theme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';

interface UserResult {
  id:          string;
  username:    string;
  full_name?:  string;
  display?:    string;   // champ calculé côté backend
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

export const NewConversationScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav               = useNavigation<any>();

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [empty,   setEmpty]   = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setEmpty(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient.get<UserResult[]>(
          `${Endpoints.messages.usersSearch}?q=${encodeURIComponent(trimmed)}&limit=30`,
        );
        const data = Array.isArray(res) ? res : (res as any)?.data ?? [];
        setResults(data);
        setEmpty(data.length === 0);
      } catch {
        setResults([]);
        setEmpty(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    search(text);
  };

  const openChat = (user: UserResult) => {
    nav.navigate('Chat', {
      partnerId:   user.id,
      partnerName: user.display ?? user.full_name ?? user.username,
      avatarUrl:   user.avatar_url,
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nouvelle conversation</Text>
        </View>

        {/* Champ de recherche */}
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary }]}>
          <Icon name="search" size={15} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={handleChange}
            placeholder="Rechercher par nom ou @username…"
            placeholderTextColor={colors.textDisabled}
            autoFocus
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
          {!loading && query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setEmpty(false); }}>
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Résultats */}
      <FlatList
        data={results}
        keyExtractor={u => u.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={results.length === 0 ? styles.centerContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {!query.trim() ? (
              <>
                <Icon name="users" size={54} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  À qui voulez-vous écrire ?
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                  Tapez un nom ou un @username pour trouver quelqu'un
                </Text>
              </>
            ) : !loading && empty ? (
              <>
                <Icon name="user-x" size={54} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Aucun résultat pour «&nbsp;{query}&nbsp;»
                </Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
            <UserRow user={item} colors={colors} onPress={() => openChat(item)} />
          </Animated.View>
        )}
      />
    </KeyboardAvoidingView>
  );
};

// ── UserRow ───────────────────────────────────────────────────────────────────

const UserRow: React.FC<{ user: UserResult; colors: any; onPress: () => void }> = ({ user, colors, onPress }) => {
  const name   = user.display ?? user.full_name ?? user.username;
  const accent = accentFor(user.id);
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.divider }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { backgroundColor: accent + '22' }]}>
        <Text style={[styles.avatarText, { color: accent }]}>{getInitials(name)}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.rowUsername, { color: colors.textTertiary }]} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  backBtn:   { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Platform.OS === 'android' ? 6 : 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  centerContainer: { flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[6], gap: 12, marginTop: 60 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing[3],
  },
  avatar:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' },
  rowContent: { flex: 1 },
  rowName:     { fontSize: 15, fontWeight: '600' },
  rowUsername: { fontSize: 13, marginTop: 2 },
});
