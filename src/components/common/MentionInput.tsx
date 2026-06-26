import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, TextInput, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { AppColors } from '../../theme/colors';

interface MentionUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

// Users selected so far — exposed to parent for mention_ids payload
export interface MentionRef {
  getText: () => string;
  setText: (t: string) => void;
  getMentionIds: () => string[];
}

interface Props {
  value: string;
  onChangeText: (text: string, mentionIds: string[]) => void;
  colors: AppColors;
  placeholder?: string;
  maxLength?: number;
  inputStyle?: any;
  onSubmit?: () => void;
}

const DEBOUNCE_MS = 280;

export const MentionInput: React.FC<Props> = ({
  value,
  onChangeText,
  colors,
  placeholder = 'Quoi de neuf ?',
  maxLength = 2000,
  inputStyle,
  onSubmit,
}) => {
  const inputRef = useRef<TextInput>(null);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [loading, setLoading]   = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  // Map username → id for all users mentioned so far in this session
  const mentionMap = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getMentionIds = useCallback((): string[] => {
    const ids = new Set<string>();
    const re = /@([\w.]+)/g;
    for (const m of value.matchAll(re)) {
      const id = mentionMap.current[m[1].toLowerCase()];
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [value]);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await apiClient.get<MentionUser[]>(`${Endpoints.users.search}?q=${encodeURIComponent(q)}&limit=8`);
      setSuggestions((res as any).data ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = useCallback((text: string) => {
    // Detect active @mention: find last unfinished @word before cursor
    const atIdx = text.lastIndexOf('@');
    if (atIdx >= 0) {
      const afterAt = text.slice(atIdx + 1);
      // Only trigger if no space after the @
      if (!/\s/.test(afterAt)) {
        setMentionStart(atIdx);
        setMentionQuery(afterAt);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(afterAt), DEBOUNCE_MS);
        onChangeText(text, getMentionIds());
        return;
      }
    }
    // No active mention
    setMentionStart(null);
    setMentionQuery('');
    setSuggestions([]);
    onChangeText(text, getMentionIds());
  }, [fetchSuggestions, getMentionIds, onChangeText]);

  const handlePickUser = useCallback((user: MentionUser) => {
    if (mentionStart === null) return;
    const before = value.slice(0, mentionStart);
    const after  = value.slice(mentionStart + 1 + mentionQuery.length);
    const inserted = `@${user.username} `;
    const next = before + inserted + after;
    // Store username → id mapping
    mentionMap.current[user.username.toLowerCase()] = user.id;
    setMentionStart(null);
    setMentionQuery('');
    setSuggestions([]);
    onChangeText(next, getMentionIds());
    // Re-focus + move cursor to end
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [mentionStart, mentionQuery, value, getMentionIds, onChangeText]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const showDropdown = suggestions.length > 0 || loading;

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: colors.textPrimary }, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={maxLength}
        value={value}
        onChangeText={handleChange}
        returnKeyType={onSubmit ? 'send' : 'default'}
        blurOnSubmit={false}
        onSubmitEditing={onSubmit}
      />

      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {loading && suggestions.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={u => u.id}
              keyboardShouldPersistTaps="always"
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.suggestRow, { borderBottomColor: colors.divider }]}
                  onPress={() => handlePickUser(item)}
                  activeOpacity={0.75}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary + '30' }]}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>
                        {(item.display_name || item.username || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.suggestInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.suggestName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                      {item.is_verified && (
                        <View style={[styles.verifiedDot, { backgroundColor: colors.primary }]}>
                          <Icon name="check" size={7} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.suggestUsername, { color: colors.textTertiary }]} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1 },
  input:        { fontSize: 18, lineHeight: 26, textAlignVertical: 'top', flex: 1 },
  dropdown: {
    position:   'absolute',
    top:        0,
    left:       0,
    right:      0,
    zIndex:     999,
    borderWidth: 1,
    borderRadius: 12,
    overflow:   'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation:  8,
  },
  loadingRow:   { paddingVertical: 16, alignItems: 'center' },
  suggestRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:       { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  suggestInfo:  { flex: 1 },
  suggestName:  { fontSize: 14, fontWeight: '700' },
  suggestUsername: { fontSize: 12, marginTop: 1 },
  verifiedDot:  { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});
