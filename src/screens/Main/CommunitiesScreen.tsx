import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonCommunities } from '../../components/common';
import { communityService } from '../../services/communityService';
import type { CommunityData, CreateCommunityPayload } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const CommunitiesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const isFocused = useIsFocused();

  const [tab, setTab] = useState<'discover' | 'mine'>('discover');
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createAvatarUri, setCreateAvatarUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pickingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = tab === 'mine'
        ? await communityService.mine()
        : await communityService.discover();
      setCommunities(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[Communities] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load, isFocused]);

  const handleJoin = async (id: string) => {
    try {
      await communityService.join(id);
      load();
    } catch { Alert.alert('Erreur', 'Impossible de rejoindre'); }
  };

  const handleLeave = async (id: string) => {
    Alert.alert('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter', style: 'destructive',
        onPress: async () => {
          try { await communityService.leave(id); load(); }
          catch { Alert.alert('Erreur', 'Impossible de quitter'); }
        },
      },
    ]);
  };

  const pickAvatar = () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 }, (resp) => {
      pickingRef.current = false;
      if (resp.didCancel || resp.errorCode || !resp.assets?.length) return;
      setCreateAvatarUri(resp.assets[0].uri ?? null);
    });
  };

  const handleCreate = async () => {
    if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; }
    setCreating(true);
    try {
      let avatarUrl: string | undefined;
      if (createAvatarUri) {
        const formData = new FormData();
        formData.append('files', {
          uri: createAvatarUri,
          name: `community_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);
        const uploadRes = await apiClient.upload<{ uploaded: { secure_url: string }[] }>(
          Endpoints.upload.images('communities'), formData,
        );
        if (uploadRes.data?.uploaded?.length) {
          avatarUrl = uploadRes.data.uploaded[0].secure_url;
        }
      }
      const payload: CreateCommunityPayload = {
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        is_private: createPrivate,
        avatar_url: avatarUrl,
      };
      await communityService.create(payload);
      setCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      setCreatePrivate(false);
      setCreateAvatarUri(null);
      setTab('mine');
      load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de créer');
    } finally { setCreating(false); }
  };

  const renderItem = ({ item }: { item: CommunityData }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}
      onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#36D9A0' + '33', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="users" size={22} color="#36D9A0" />
          </View>
        )}
        <View style={styles.cardInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.cardName, { color: colors.textPrimary }]}>{item.name}</Text>
            {item.is_private && <Icon name="lock" size={12} color={colors.textTertiary} />}
          </View>
          <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
            {item.members_count} membre{item.members_count > 1 ? 's' : ''}
            {item.creator ? ` · Créé par ${item.creator.display_name || item.creator.username}` : ''}
          </Text>
        </View>
      </View>
      {item.description && (
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      )}
      {tab === 'discover' && (
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: '#36D9A0' }]}
          onPress={() => handleJoin(item.id)}
        >
          <Icon name="user-plus" size={14} color="#fff" />
          <Text style={styles.joinText}>Rejoindre</Text>
        </TouchableOpacity>
      )}
      {tab === 'mine' && (
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, borderWidth: 1 }]}
          onPress={() => handleLeave(item.id)}
        >
          <Icon name="log-out" size={14} color={colors.textTertiary} />
          <Text style={[styles.joinText, { color: colors.textTertiary }]}>Quitter</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Communautés</Text>
        <TouchableOpacity onPress={() => setCreateOpen(true)} style={styles.addBtn}>
          <Icon name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {(['discover', 'mine'] as const).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textTertiary }]}>
              {t === 'discover' ? 'Découvrir' : 'Mes communautés'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <SkeletonCommunities />
      ) : (
        <FlatList
          data={communities}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          contentContainerStyle={communities.length === 0 ? styles.emptyContainer : { padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="users" size={52} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {tab === 'mine' ? 'Aucune communauté' : 'Aucune communauté disponible'}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                {tab === 'mine' ? 'Créez ou rejoignez une communauté' : 'Soyez le premier à créer une communauté !'}
              </Text>
              {tab === 'mine' && (
                <TouchableOpacity
                  style={[styles.createCta, { backgroundColor: colors.primary }]}
                  onPress={() => setCreateOpen(true)}
                >
                  <Icon name="plus" size={16} color="#fff" />
                  <Text style={styles.createCtaText}>Créer une communauté</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Create bottom sheet */}
      {createOpen && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBg} onPress={() => setCreateOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.handle, { backgroundColor: colors.divider }]} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Nouvelle communauté</Text>

            {/* Avatar picker */}
            <TouchableOpacity onPress={pickAvatar} style={styles.avatarPicker}>
              {createAvatarUri ? (
                <Image source={{ uri: createAvatarUri }} style={styles.avatarPreview} />
              ) : (
                <View style={[styles.avatarPreview, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="camera" size={28} color={colors.textTertiary} />
                </View>
              )}
              <Text style={[styles.avatarLabel, { color: colors.primary }]}>
                {createAvatarUri ? 'Changer la photo' : 'Ajouter une photo'}
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Nom de la communauté"
              placeholderTextColor={colors.textDisabled}
              value={createName}
              onChangeText={setCreateName}
            />
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Description (optionnel)"
              placeholderTextColor={colors.textDisabled}
              value={createDesc}
              onChangeText={setCreateDesc}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={styles.privateRow}
              onPress={() => setCreatePrivate(p => !p)}
            >
              <Icon name={createPrivate ? 'check-square' : 'square'} size={20} color={colors.primary} />
              <Text style={[styles.privateLabel, { color: colors.textPrimary }]}>Communauté privée</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>Créer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  addBtn: { width: 40, alignItems: 'flex-end' },
  title: { fontSize: 18, fontWeight: '700' },
  tabs: {
    flexDirection: 'row', borderBottomWidth: 1,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
  card: {
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  cardDesc: { fontSize: 13, marginTop: 10, lineHeight: 18 },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: 10,
  },
  joinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 12 },
  emptyDesc: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
  createCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10,
  },
  createCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end', zIndex: 100,
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 40,
  },
  sheetHandle: { alignItems: 'center', paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  avatarPicker: { alignItems: 'center', marginBottom: 20 },
  avatarPreview: { width: 80, height: 80, borderRadius: 40 },
  avatarLabel: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 12,
  },
  inputMulti: { textAlignVertical: 'top', minHeight: 80 },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  privateLabel: { fontSize: 14, fontWeight: '500' },
  submitBtn: {
    paddingVertical: 14, borderRadius: 10, alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
