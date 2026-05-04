import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, Modal,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonCommunities } from '../../components/common';
import { communityService } from '../../services/communityService';
import type { CommunityData, CreateCommunityPayload } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Carte communauté ──────────────────────────────────────────────────────────
function CommunityCard({
  item, tab, colors,
  onPress, onJoin, onLeave,
}: {
  item: CommunityData;
  tab: 'discover' | 'mine';
  colors: any;
  onPress: () => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={s.cardTop}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={s.cardAvatar} />
        ) : (
          <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.cardAvatarGrad}>
            <Icon name="users" size={22} color="#fff" />
          </LinearGradient>
        )}
        <View style={s.cardInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[s.cardName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
            {item.is_private && <Icon name="lock" size={11} color={colors.textTertiary} />}
          </View>
          <Text style={[s.cardMeta, { color: colors.textTertiary }]}>
            {(item.members_count ?? 0).toLocaleString()} membre{(item.members_count ?? 0) !== 1 ? 's' : ''}
            {item.creator ? ` · ${item.creator.display_name ?? item.creator.username}` : ''}
          </Text>
        </View>
        {tab === 'discover' ? (
          <TouchableOpacity
            onPress={onJoin}
            style={[s.chipBtn, { backgroundColor: '#7B3FF2' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="user-plus" size={13} color="#fff" />
            <Text style={[s.chipText, { color: '#fff' }]}>Rejoindre</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onLeave}
            style={[s.chipBtn, { backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.divider }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="log-out" size={13} color={colors.textTertiary} />
            <Text style={[s.chipText, { color: colors.textTertiary }]}>Quitter</Text>
          </TouchableOpacity>
        )}
      </View>
      {item.description ? (
        <Text style={[s.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Écran principal ───────────────────────────────────────────────────────────
export const CommunitiesScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<'discover' | 'mine'>('discover');
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // ── Formulaire création ──
  const [step, setStep] = useState<'info' | 'settings'>('info');
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createInviteOnly, setCreateInviteOnly] = useState(false);
  const [createAvatarUri, setCreateAvatarUri] = useState<string | null>(null);
  const [createBannerUri, setCreateBannerUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pickingRef = useRef(false);

  const resetForm = () => {
    setStep('info');
    setCreateName('');
    setCreateDesc('');
    setCreatePrivate(false);
    setCreateInviteOnly(false);
    setCreateAvatarUri(null);
    setCreateBannerUri(null);
  };

  const load = useCallback(async () => {
    try {
      const data = tab === 'mine'
        ? await communityService.mine()
        : await communityService.discover();
      setCommunities(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load, isFocused]);

  const handleJoin = async (id: string) => {
    try { await communityService.join(id); load(); }
    catch { Alert.alert('Erreur', 'Impossible de rejoindre'); }
  };

  const handleLeave = (id: string) => {
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

  async function pickImage(target: 'avatar' | 'banner') {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary(
      { mediaType: 'photo', selectionLimit: 1, quality: 0.85 },
      (resp) => {
        pickingRef.current = false;
        if (resp.didCancel || resp.errorCode || !resp.assets?.length) return;
        const uri = resp.assets[0].uri ?? null;
        if (target === 'avatar') setCreateAvatarUri(uri);
        else setCreateBannerUri(uri);
      },
    );
  }

  async function uploadImage(uri: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', { uri, name: `community_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    try {
      const res = await apiClient.upload<{ uploaded: { url: string }[] }>(
        Endpoints.upload.images('communities'), fd,
      );
      return res.data?.uploaded?.[0]?.url ?? null;
    } catch { return null; }
  }

  const handleCreate = async () => {
    if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; }
    setCreating(true);
    try {
      const [avatarUrl, bannerUrl] = await Promise.all([
        createAvatarUri ? uploadImage(createAvatarUri) : Promise.resolve(null),
        createBannerUri ? uploadImage(createBannerUri) : Promise.resolve(null),
      ]);
      const payload: CreateCommunityPayload = {
        name:        createName.trim(),
        description: createDesc.trim() || undefined,
        is_private:  createPrivate,
        avatar_url:  avatarUrl ?? undefined,
        banner_url:  bannerUrl ?? undefined,
      };
      await communityService.create(payload);
      setCreateOpen(false);
      resetForm();
      setTab('mine');
      load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer');
    } finally { setCreating(false); }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.headerIcon}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Communautés</Text>
        <TouchableOpacity onPress={() => { resetForm(); setCreateOpen(true); }} style={s.headerIcon}>
          <Icon name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {(['discover', 'mine'] as const).map(t => (
          <TouchableOpacity
            key={t} onPress={() => setTab(t)}
            style={[s.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[s.tabText, { color: tab === t ? colors.primary : colors.textTertiary }]}>
              {t === 'discover' ? 'Découvrir' : 'Mes communautés'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <SkeletonCommunities />
      ) : (
        <FlatList
          data={communities}
          keyExtractor={c => c.id}
          contentContainerStyle={communities.length === 0
            ? { flex: 1, justifyContent: 'center', alignItems: 'center' }
            : { padding: 16, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <CommunityCard
              item={item} tab={tab} colors={colors}
              onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
              onJoin={() => handleJoin(item.id)}
              onLeave={() => handleLeave(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <LinearGradient colors={['#7B3FF240', '#E0389A30']} style={s.emptyIcon}>
                <Icon name="users" size={36} color="#7B3FF2" />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {tab === 'mine' ? 'Aucune communauté' : 'Aucune communauté disponible'}
              </Text>
              <Text style={[s.emptyDesc, { color: colors.textTertiary }]}>
                {tab === 'mine'
                  ? 'Créez ou rejoignez une communauté pour commencer'
                  : 'Soyez le premier à créer une communauté !'}
              </Text>
              {tab === 'mine' && (
                <TouchableOpacity
                  style={s.emptyCta}
                  onPress={() => { resetForm(); setCreateOpen(true); }}
                >
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.emptyCtaGrad}>
                    <Icon name="plus" size={16} color="#fff" />
                    <Text style={s.emptyCtaText}>Créer une communauté</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* ── Modal Créer une communauté ── */}
      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !creating && setCreateOpen(false)}
      >
        <View style={s.modalRoot}>
          <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => !creating && setCreateOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={s.modalKav}
          >
            <View style={[s.sheet, { backgroundColor: colors.surface }]}>
              {/* Drag handle */}
              <View style={s.dragBar}>
                <View style={[s.drag, { backgroundColor: colors.divider }]} />
              </View>

              {/* Header sheet */}
              <View style={[s.sheetHeader, { borderBottomColor: colors.divider }]}>
                {step === 'settings' ? (
                  <TouchableOpacity onPress={() => setStep('info')} style={s.sheetNavBtn}>
                    <Icon name="arrow-left" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setCreateOpen(false)} style={s.sheetNavBtn}>
                    <Icon name="x" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                )}
                <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
                  {step === 'info' ? 'Nouvelle communauté' : 'Paramètres'}
                </Text>
                {step === 'info' ? (
                  <TouchableOpacity
                    onPress={() => { if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; } setStep('settings'); }}
                    style={s.sheetNavBtn}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Suite</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 44 }} />
                )}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {step === 'info' ? (
                  /* ── Étape 1 : infos de base ── */
                  <View style={s.sheetBody}>

                    {/* Bannière */}
                    <TouchableOpacity onPress={() => pickImage('banner')} activeOpacity={0.85}>
                      <View style={[s.bannerPicker, { backgroundColor: colors.backgroundSecondary }]}>
                        {createBannerUri ? (
                          <Image source={{ uri: createBannerUri }} style={s.bannerPreview} />
                        ) : (
                          <LinearGradient colors={['#7B3FF220', '#E0389A20']} style={s.bannerPreview}>
                            <Icon name="image" size={28} color={colors.textTertiary} />
                            <Text style={[s.pickerLabel, { color: colors.textTertiary }]}>Ajouter une bannière</Text>
                          </LinearGradient>
                        )}
                        <View style={s.bannerEditBadge}>
                          <Icon name="camera" size={12} color="#fff" />
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Photo profil */}
                    <TouchableOpacity onPress={() => pickImage('avatar')} style={s.avatarPickerWrap} activeOpacity={0.85}>
                      <View style={[s.avatarPicker, { borderColor: colors.surface }]}>
                        {createAvatarUri ? (
                          <Image source={{ uri: createAvatarUri }} style={s.avatarPreview} />
                        ) : (
                          <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.avatarPreview}>
                            <Icon name="users" size={28} color="#fff" />
                          </LinearGradient>
                        )}
                        <View style={s.avatarEditBadge}>
                          <Icon name="camera" size={11} color="#fff" />
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Nom */}
                    <View style={[s.fieldWrap, { borderColor: colors.divider }]}>
                      <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>NOM DE LA COMMUNAUTÉ</Text>
                      <TextInput
                        style={[s.fieldInput, { color: colors.textPrimary }]}
                        placeholder="Ex: Fans de cinéma africain"
                        placeholderTextColor={colors.textDisabled}
                        value={createName}
                        onChangeText={setCreateName}
                        maxLength={60}
                        autoFocus
                      />
                    </View>

                    {/* Description */}
                    <View style={[s.fieldWrap, { borderColor: colors.divider }]}>
                      <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>DESCRIPTION</Text>
                      <TextInput
                        style={[s.fieldInput, s.fieldMulti, { color: colors.textPrimary }]}
                        placeholder="Décrivez votre communauté..."
                        placeholderTextColor={colors.textDisabled}
                        value={createDesc}
                        onChangeText={setCreateDesc}
                        multiline
                        maxLength={300}
                        numberOfLines={3}
                      />
                      <Text style={[s.charCount, { color: colors.textTertiary }]}>{createDesc.length}/300</Text>
                    </View>
                  </View>
                ) : (
                  /* ── Étape 2 : paramètres ── */
                  <View style={s.sheetBody}>

                    {/* Récap rapide */}
                    <View style={[s.recapRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                      {createAvatarUri ? (
                        <Image source={{ uri: createAvatarUri }} style={s.recapAvatar} />
                      ) : (
                        <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.recapAvatar}>
                          <Icon name="users" size={16} color="#fff" />
                        </LinearGradient>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.recapName, { color: colors.textPrimary }]}>{createName}</Text>
                        {createDesc ? <Text style={[s.recapDesc, { color: colors.textTertiary }]} numberOfLines={1}>{createDesc}</Text> : null}
                      </View>
                    </View>

                    <Text style={[s.settingsSection, { color: colors.textTertiary }]}>CONFIDENTIALITÉ</Text>

                    <TouchableOpacity
                      onPress={() => setCreatePrivate(false)}
                      style={[s.settingRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                      activeOpacity={0.7}
                    >
                      <View style={[s.settingIcon, { backgroundColor: '#3B82F620' }]}>
                        <Icon name="globe" size={18} color="#3B82F6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Publique</Text>
                        <Text style={[s.settingDesc, { color: colors.textTertiary }]}>Tout le monde peut rejoindre et voir les messages</Text>
                      </View>
                      <View style={[s.radio, { borderColor: colors.primary }]}>
                        {!createPrivate && <View style={[s.radioDot, { backgroundColor: colors.primary }]} />}
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setCreatePrivate(true)}
                      style={[s.settingRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, marginTop: 8 }]}
                      activeOpacity={0.7}
                    >
                      <View style={[s.settingIcon, { backgroundColor: '#E0389A20' }]}>
                        <Icon name="lock" size={18} color="#E0389A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Privée</Text>
                        <Text style={[s.settingDesc, { color: colors.textTertiary }]}>Seuls les membres invités peuvent rejoindre</Text>
                      </View>
                      <View style={[s.radio, { borderColor: colors.primary }]}>
                        {createPrivate && <View style={[s.radioDot, { backgroundColor: colors.primary }]} />}
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setCreateInviteOnly(v => !v)}
                      style={[s.settingRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, marginTop: 8 }]}
                      activeOpacity={0.7}
                    >
                      <View style={[s.settingIcon, { backgroundColor: '#F59E0B20' }]}>
                        <Icon name="user-check" size={18} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Approbation requise</Text>
                        <Text style={[s.settingDesc, { color: colors.textTertiary }]}>Vous approuvez chaque demande d'adhésion</Text>
                      </View>
                      <View style={[s.toggle, { backgroundColor: createInviteOnly ? colors.primary : colors.divider }]}>
                        <View style={[s.toggleThumb, { left: createInviteOnly ? 18 : 2 }]} />
                      </View>
                    </TouchableOpacity>

                    {/* Bouton créer */}
                    <TouchableOpacity
                      onPress={handleCreate}
                      disabled={creating}
                      style={{ marginTop: 28, borderRadius: 14, overflow: 'hidden', opacity: creating ? 0.7 : 1 }}
                    >
                      <LinearGradient
                        colors={['#7B3FF2', '#E0389A']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={s.createBtn}
                      >
                        {creating ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Icon name="check" size={18} color="#fff" />
                            <Text style={s.createBtnText}>Créer la communauté</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>

                    <View style={{ height: 24 }} />
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerIcon: { width: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },

  // Card
  card: { borderRadius: 16, padding: 14, borderWidth: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardAvatar: { width: 52, height: 52, borderRadius: 26 },
  cardAvatarGrad: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 11, marginTop: 2 },
  cardDesc: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  chipText: { fontSize: 12, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyCta: { marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  emptyCtaGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalKav: { width: '100%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  dragBar: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  drag: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  sheetNavBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetBody: { paddingHorizontal: 16, paddingTop: 16 },

  // Bannière + avatar pickers
  bannerPicker: { height: 120, borderRadius: 12, overflow: 'hidden', marginBottom: 0 },
  bannerPreview: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  bannerEditBadge: {
    position: 'absolute', bottom: 8, right: 8,
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerLabel: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  avatarPickerWrap: { alignItems: 'flex-start', marginTop: -28, marginLeft: 16, marginBottom: 12 },
  avatarPicker: { position: 'relative' },
  avatarPreview: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  // Champs
  fieldWrap: { borderBottomWidth: 1, marginBottom: 16, paddingBottom: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  fieldInput: { fontSize: 15, paddingVertical: 4, fontWeight: '500' },
  fieldMulti: { minHeight: 60, textAlignVertical: 'top' },
  charCount: { fontSize: 10, textAlign: 'right', marginTop: 4 },

  // Récap
  recapRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 24,
  },
  recapAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  recapName: { fontSize: 15, fontWeight: '700' },
  recapDesc: { fontSize: 12, marginTop: 2 },

  // Paramètres
  settingsSection: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  settingIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 14, fontWeight: '600' },
  settingDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  toggle: { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },

  // Bouton créer
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 14 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
