import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, Modal,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Dimensions, Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityData, CreateCommunityPayload } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const { width: W } = Dimensions.get('window');
const CARD_W = W - 32;

// ─────────────────────────────────────────────────────────────────────────────
// Carte communauté — style "cover magazine"
// ─────────────────────────────────────────────────────────────────────────────
const CommunityCard = React.memo(function CommunityCard({
  item, isMine, colors, onPress, onJoin, onLeave,
}: {
  item: CommunityData;
  isMine: boolean;
  colors: any;
  onPress: () => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 12 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 12 }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, S.cardWrap]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[S.card, { backgroundColor: colors.surface }]}
      >
        {/* Bannière */}
        <View style={S.cardBanner}>
          {item.banner_url ? (
            <Image source={{ uri: item.banner_url }} style={S.cardBannerImg} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={gradientFor(item.name)}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={S.cardBannerImg}
            />
          )}
          {/* Overlay gradient bas */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={S.cardBannerGrad}
            pointerEvents="none"
          />
          {/* Badge privé */}
          {item.is_private && (
            <View style={S.privateBadge}>
              <Icon name="lock" size={10} color="#fff" />
              <Text style={S.privateBadgeText}>Privée</Text>
            </View>
          )}
          {/* Membres count */}
          <View style={S.membersBadge}>
            <Icon name="users" size={10} color="#fff" />
            <Text style={S.membersBadgeText}>{fmtCount(item.members_count ?? 0)}</Text>
          </View>
        </View>

        {/* Corps */}
        <View style={S.cardBody}>
          {/* Avatar flottant */}
          <View style={S.cardAvatarWrap}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={S.cardAvatar} />
            ) : (
              <LinearGradient colors={gradientFor(item.name)} style={S.cardAvatar}>
                <Text style={S.cardAvatarLetter}>{item.name[0].toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>

          {/* Infos */}
          <View style={S.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[S.cardName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
            </View>
            {item.creator && (
              <Text style={[S.cardCreator, { color: colors.textTertiary }]}>
                par {item.creator.display_name ?? item.creator.username}
              </Text>
            )}
            {item.description ? (
              <Text style={[S.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
            ) : null}
          </View>

          {/* Action */}
          {isMine ? (
            <View style={S.cardActions}>
              <TouchableOpacity onPress={onPress} style={[S.actionBtnPrimary, { backgroundColor: colors.primary }]}>
                <Icon name="message-circle" size={14} color="#fff" />
                <Text style={S.actionBtnPrimaryText}>Ouvrir</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onLeave} style={[S.actionBtnGhost, { borderColor: colors.divider }]}>
                <Icon name="log-out" size={13} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={onJoin} style={S.joinBtn} activeOpacity={0.85}>
              <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.joinBtnGrad}>
                <Icon name="user-plus" size={14} color="#fff" />
                <Text style={S.joinBtnText}>Rejoindre</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
const GRADIENTS = [
  ['#7B3FF2', '#E0389A'],
  ['#0EA5E9', '#6366F1'],
  ['#10B981', '#0EA5E9'],
  ['#F59E0B', '#EF4444'],
  ['#EC4899', '#8B5CF6'],
  ['#14B8A6', '#3B82F6'],
];
function gradientFor(name: string): [string, string] {
  const i = name.charCodeAt(0) % GRADIENTS.length;
  return GRADIENTS[i] as [string, string];
}

// ─────────────────────────────────────────────────────────────────────────────
// Écran principal
// ─────────────────────────────────────────────────────────────────────────────
export const CommunitiesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [tab,         setTab]         = useState<'discover' | 'mine'>('discover');
  const [all,         setAll]         = useState<CommunityData[]>([]);
  const [query,       setQuery]       = useState('');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [createOpen,  setCreateOpen]  = useState(false);

  // formulaire
  const [step,             setStep]             = useState<'info' | 'settings'>('info');
  const [createName,       setCreateName]       = useState('');
  const [createDesc,       setCreateDesc]       = useState('');
  const [createPrivate,    setCreatePrivate]    = useState(false);
  const [createInviteOnly, setCreateInviteOnly] = useState(false);
  const [createAvatarUri,  setCreateAvatarUri]  = useState<string | null>(null);
  const [createBannerUri,  setCreateBannerUri]  = useState<string | null>(null);
  const [creating,         setCreating]         = useState(false);
  const pickingRef = useRef(false);

  const resetForm = () => {
    setStep('info'); setCreateName(''); setCreateDesc('');
    setCreatePrivate(false); setCreateInviteOnly(false);
    setCreateAvatarUri(null); setCreateBannerUri(null);
  };

  const load = useCallback(async () => {
    try {
      const data = tab === 'mine' ? await communityService.mine() : await communityService.discover();
      setAll(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load, isFocused]);

  const communities = query.trim()
    ? all.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.description?.toLowerCase().includes(query.toLowerCase()))
    : all;

  const handleJoin = async (id: string) => {
    try { await communityService.join(id); load(); }
    catch { Alert.alert('Erreur', 'Impossible de rejoindre'); }
  };

  const handleLeave = (id: string) => {
    Alert.alert('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: async () => {
        try { await communityService.leave(id); load(); }
        catch { Alert.alert('Erreur', 'Impossible de quitter'); }
      }},
    ]);
  };

  const pickImage = (target: 'avatar' | 'banner') => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 }, (resp) => {
      pickingRef.current = false;
      if (resp.didCancel || resp.errorCode || !resp.assets?.length) return;
      const uri = resp.assets[0].uri ?? null;
      if (target === 'avatar') setCreateAvatarUri(uri);
      else setCreateBannerUri(uri);
    });
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', { uri, name: `community_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    try {
      const res = await apiClient.upload<{ uploaded: { url: string }[] }>(Endpoints.upload.images('communities'), fd);
      return res.data?.uploaded?.[0]?.url ?? null;
    } catch { return null; }
  };

  const handleCreate = async () => {
    if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; }
    setCreating(true);
    try {
      const [avatarUrl, bannerUrl] = await Promise.all([
        createAvatarUri ? uploadImage(createAvatarUri) : null,
        createBannerUri ? uploadImage(createBannerUri) : null,
      ]);
      const payload: CreateCommunityPayload = {
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        is_private: createPrivate,
        avatar_url: avatarUrl ?? undefined,
        banner_url: bannerUrl ?? undefined,
      };
      await communityService.create(payload);
      setCreateOpen(false); resetForm(); setTab('mine'); load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer');
    } finally { setCreating(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}>
        <View style={S.headerRow}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[S.headerTitle, { color: colors.textPrimary }]}>Communautés</Text>
          <TouchableOpacity
            onPress={() => { resetForm(); setCreateOpen(true); }}
            style={[S.createFab, { backgroundColor: colors.primary }]}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Icon name="plus" size={18} color="#fff" />
            <Text style={S.createFabText}>Créer</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[S.searchBar, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <Icon name="search" size={15} color={colors.textTertiary} />
          <TextInput
            style={[S.searchInput, { color: colors.textPrimary }]}
            placeholder="Rechercher une communauté…"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={S.tabRow}>
          {(['discover', 'mine'] as const).map(t => {
            const active = tab === t;
            return (
              <TouchableOpacity key={t} onPress={() => setTab(t)} style={S.tabBtn} activeOpacity={0.8}>
                <Text style={[S.tabText, { color: active ? colors.primary : colors.textTertiary }]}>
                  {t === 'discover' ? 'Découvrir' : 'Mes communautés'}
                </Text>
                {active && (
                  <LinearGradient
                    colors={['#7B3FF2', '#E0389A']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={S.tabUnderline}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Liste ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={c => c.id}
          contentContainerStyle={communities.length === 0
            ? { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }
            : { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 16 }
          }
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <CommunityCard
              item={item} isMine={tab === 'mine'} colors={colors}
              onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
              onJoin={() => handleJoin(item.id)}
              onLeave={() => handleLeave(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 14 }}>
              <LinearGradient colors={['#7B3FF240', '#E0389A30']} style={S.emptyIcon}>
                <Icon name="users" size={34} color="#7B3FF2" />
              </LinearGradient>
              <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>
                {tab === 'mine' ? 'Aucune communauté' : query ? 'Aucun résultat' : 'Aucune communauté'}
              </Text>
              <Text style={[S.emptySub, { color: colors.textTertiary }]}>
                {tab === 'mine'
                  ? 'Créez ou rejoignez une communauté'
                  : query ? `Aucun résultat pour "${query}"` : 'Soyez le premier à créer !'}
              </Text>
              {tab === 'mine' && (
                <TouchableOpacity onPress={() => { resetForm(); setCreateOpen(true); }} style={{ borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.emptyBtn}>
                    <Icon name="plus" size={16} color="#fff" />
                    <Text style={S.emptyBtnText}>Créer une communauté</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* ── Modal création ── */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => !creating && setCreateOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={() => !creating && setCreateOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={[S.sheet, { backgroundColor: colors.surface }]}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 6 }}>
                <View style={[S.handle, { backgroundColor: colors.divider }]} />
              </View>

              {/* Sheet header */}
              <View style={[S.sheetHeader, { borderBottomColor: colors.divider }]}>
                {step === 'settings' ? (
                  <TouchableOpacity onPress={() => setStep('info')} style={S.sheetNavBtn}>
                    <Icon name="chevron-left" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => { setCreateOpen(false); resetForm(); }} style={S.sheetNavBtn}>
                    <Icon name="x" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[S.sheetTitle, { color: colors.textPrimary }]}>
                    {step === 'info' ? 'Nouvelle communauté' : 'Paramètres'}
                  </Text>
                  <View style={S.stepDots}>
                    {[0, 1].map(i => (
                      <View key={i} style={[S.stepDot, {
                        backgroundColor: (step === 'info' ? 0 : 1) >= i ? colors.primary : colors.divider,
                        width: (step === 'info' ? 0 : 1) === i ? 16 : 6,
                      }]} />
                    ))}
                  </View>
                </View>
                {step === 'info' ? (
                  <TouchableOpacity
                    onPress={() => { if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; } setStep('settings'); }}
                    style={[S.sheetNavBtn, { alignItems: 'flex-end' }]}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Suivant →</Text>
                  </TouchableOpacity>
                ) : <View style={{ width: 60 }} />}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
                {step === 'info' ? (
                  <View style={S.sheetBody}>
                    {/* Bannière */}
                    <TouchableOpacity onPress={() => pickImage('banner')} activeOpacity={0.85} style={S.bannerPicker}>
                      {createBannerUri ? (
                        <Image source={{ uri: createBannerUri }} style={S.bannerImg} resizeMode="cover" />
                      ) : (
                        <LinearGradient colors={['#7B3FF215', '#E0389A15']} style={S.bannerImg}>
                          <Icon name="image" size={26} color={colors.textTertiary} />
                          <Text style={[{ fontSize: 12, color: colors.textTertiary, marginTop: 6, fontWeight: '500' }]}>Ajouter une bannière</Text>
                        </LinearGradient>
                      )}
                      <View style={S.bannerCameraBtn}>
                        <Icon name="camera" size={13} color="#fff" />
                      </View>
                    </TouchableOpacity>

                    {/* Avatar */}
                    <TouchableOpacity onPress={() => pickImage('avatar')} activeOpacity={0.85} style={S.avatarPicker}>
                      {createAvatarUri ? (
                        <Image source={{ uri: createAvatarUri }} style={S.avatarImg} />
                      ) : (
                        <LinearGradient colors={['#7B3FF2', '#E0389A']} style={S.avatarImg}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 28 }}>
                            {createName ? createName[0].toUpperCase() : '?'}
                          </Text>
                        </LinearGradient>
                      )}
                      <View style={S.avatarCameraBtn}>
                        <Icon name="camera" size={11} color="#fff" />
                      </View>
                    </TouchableOpacity>

                    {/* Champs */}
                    <View style={{ marginTop: 16, gap: 12 }}>
                      <View style={[S.field, { borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={[S.fieldLabel, { color: colors.textTertiary }]}>NOM</Text>
                        <TextInput
                          style={[S.fieldInput, { color: colors.textPrimary }]}
                          placeholder="Ex: Cinéma africain, Jazz, Foot…"
                          placeholderTextColor={colors.textTertiary}
                          value={createName} onChangeText={setCreateName}
                          maxLength={60} autoFocus
                        />
                      </View>
                      <View style={[S.field, { borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={[S.fieldLabel, { color: colors.textTertiary }]}>DESCRIPTION</Text>
                        <TextInput
                          style={[S.fieldInput, { color: colors.textPrimary, minHeight: 64, textAlignVertical: 'top' }]}
                          placeholder="Décrivez votre communauté…"
                          placeholderTextColor={colors.textTertiary}
                          value={createDesc} onChangeText={setCreateDesc}
                          multiline maxLength={300}
                        />
                        <Text style={[{ fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 4 }]}>{createDesc.length}/300</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={S.sheetBody}>
                    {/* Aperçu */}
                    <View style={[S.previewCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                      {createAvatarUri ? (
                        <Image source={{ uri: createAvatarUri }} style={S.previewAvatar} />
                      ) : (
                        <LinearGradient colors={gradientFor(createName)} style={S.previewAvatar}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{createName[0]?.toUpperCase()}</Text>
                        </LinearGradient>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }]}>{createName}</Text>
                        {createDesc ? <Text style={[{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>{createDesc}</Text> : null}
                      </View>
                    </View>

                    <Text style={[S.sectionLabel, { color: colors.textTertiary }]}>CONFIDENTIALITÉ</Text>

                    {[
                      { val: false, icon: 'globe',   color: '#3B82F6', label: 'Publique', sub: 'Tout le monde peut rejoindre' },
                      { val: true,  icon: 'lock',    color: '#E0389A', label: 'Privée',   sub: 'Sur invitation uniquement' },
                    ].map(opt => (
                      <TouchableOpacity key={String(opt.val)} onPress={() => setCreatePrivate(opt.val)}
                        style={[S.optRow, { backgroundColor: colors.backgroundSecondary, borderColor: createPrivate === opt.val ? opt.color : colors.divider }]}
                        activeOpacity={0.8}
                      >
                        <View style={[S.optIcon, { backgroundColor: opt.color + '20' }]}>
                          <Icon name={opt.icon} size={18} color={opt.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.optLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                          <Text style={[S.optSub, { color: colors.textTertiary }]}>{opt.sub}</Text>
                        </View>
                        <View style={[S.radio, { borderColor: createPrivate === opt.val ? opt.color : colors.divider }]}>
                          {createPrivate === opt.val && <View style={[S.radioDot, { backgroundColor: opt.color }]} />}
                        </View>
                      </TouchableOpacity>
                    ))}

                    <TouchableOpacity onPress={() => setCreateInviteOnly(v => !v)}
                      style={[S.optRow, { backgroundColor: colors.backgroundSecondary, borderColor: createInviteOnly ? '#F59E0B' : colors.divider, marginTop: 0 }]}
                      activeOpacity={0.8}
                    >
                      <View style={[S.optIcon, { backgroundColor: '#F59E0B20' }]}>
                        <Icon name="user-check" size={18} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.optLabel, { color: colors.textPrimary }]}>Approbation requise</Text>
                        <Text style={[S.optSub, { color: colors.textTertiary }]}>Vous approuvez chaque demande</Text>
                      </View>
                      <View style={[S.toggle, { backgroundColor: createInviteOnly ? '#F59E0B' : colors.divider }]}>
                        <View style={[S.toggleThumb, { transform: [{ translateX: createInviteOnly ? 18 : 2 }] }]} />
                      </View>
                    </TouchableOpacity>

                    {/* Bouton créer */}
                    <TouchableOpacity onPress={handleCreate} disabled={creating} style={{ marginTop: 24, borderRadius: 16, overflow: 'hidden', opacity: creating ? 0.75 : 1 }}>
                      <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.createBtn}>
                        {creating
                          ? <ActivityIndicator color="#fff" />
                          : <><Icon name="check-circle" size={18} color="#fff" /><Text style={S.createBtnText}>Créer la communauté</Text></>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                    <View style={{ height: 32 }} />
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

// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  createFab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  createFabText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  // Tabs
  tabRow: { flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabText: { fontSize: 13, fontWeight: '700' },
  tabUnderline: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2.5, borderRadius: 2 },

  // Card
  cardWrap: { width: CARD_W },
  card: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  cardBanner: { height: 140, position: 'relative' },
  cardBannerImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  cardBannerGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  privateBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  privateBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  membersBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  membersBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  cardBody: { padding: 14, paddingTop: 0 },
  cardAvatarWrap: { marginTop: -28, marginBottom: 10 },
  cardAvatar: { width: 56, height: 56, borderRadius: 16, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardAvatarLetter: { color: '#fff', fontWeight: '800', fontSize: 22 },
  cardInfo: { marginBottom: 12 },
  cardName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  cardCreator: { fontSize: 11, marginTop: 2 },
  cardDesc: { fontSize: 13, lineHeight: 18, marginTop: 5 },

  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtnGhost: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  joinBtn: { borderRadius: 12, overflow: 'hidden' },
  joinBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11 },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Empty
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '93%' },
  handle: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetNavBtn: { width: 60, justifyContent: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  stepDots: { flexDirection: 'row', gap: 5, marginTop: 4 },
  stepDot: { height: 4, borderRadius: 2 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 16 },

  // Banner/avatar picker
  bannerPicker: { height: 130, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  bannerImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  bannerCameraBtn: { position: 'absolute', bottom: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  avatarPicker: { marginTop: -30, marginLeft: 14, alignSelf: 'flex-start', position: 'relative' },
  avatarImg: { width: 68, height: 68, borderRadius: 18, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarCameraBtn: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  // Form fields
  field: { borderRadius: 14, borderWidth: 1, padding: 14 },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  fieldInput: { fontSize: 15, padding: 0 },

  // Preview card
  previewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  previewAvatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  // Options
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  optIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optLabel: { fontSize: 14, fontWeight: '600' },
  optSub: { fontSize: 11, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  toggle: { width: 42, height: 24, borderRadius: 12, justifyContent: 'center' },
  toggleThumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },

  // Create button
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 17, borderRadius: 16 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
