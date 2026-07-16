import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image, Modal,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BackButton, CategorySelector, CONTENT_CATEGORIES } from '../../components/common';
import { CommunityCard } from '../../components/communities/CommunityCard';
import { CommunityGridCard } from '../../components/communities/CommunityGridCard';
import { CommunitySkeletonCard } from '../../components/communities/CommunitySkeleton';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '../../styles/layout';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityData, CreateCommunityPayload } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// Icones Feather/MCIcon par template id — alignés sur CONTENT_CATEGORIES
// (voir components/common/CategorySelector.tsx et backend content_category.py)
const TEMPLATE_ICONS: Record<string, { lib: 'feather' | 'mc'; name: string }> = {
  musique:      { lib: 'feather', name: 'music' },
  sport:        { lib: 'mc',      name: 'soccer' },
  gaming:       { lib: 'mc',      name: 'controller-classic-outline' },
  humour:       { lib: 'mc',      name: 'emoticon-happy-outline' },
  danse:        { lib: 'mc',      name: 'human' },
  cuisine:      { lib: 'feather', name: 'coffee' },
  mode:         { lib: 'mc',      name: 'tshirt-crew-outline' },
  beaute:       { lib: 'mc',      name: 'lipstick' },
  tech:         { lib: 'feather', name: 'cpu' },
  education:    { lib: 'feather', name: 'book-open' },
  lifestyle:    { lib: 'feather', name: 'star' },
  art:          { lib: 'feather', name: 'image' },
  voyage:       { lib: 'feather', name: 'send' },
  business:     { lib: 'feather', name: 'briefcase' },
  actualite:    { lib: 'feather', name: 'file-text' },
  spiritualite: { lib: 'mc',      name: 'hands-pray' },
  famille:      { lib: 'mc',      name: 'home-heart' },
  sante:        { lib: 'feather', name: 'heart' },
  free:         { lib: 'feather', name: 'star' },
};

function gradientFor(_name: string): [string, string] {
  return ['#7B3FF2', '#9B65F5'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle custom (sans Switch natif)
// ─────────────────────────────────────────────────────────────────────────────
const CustomToggle: React.FC<{
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}> = ({ value, onChange, color = '#7B3FF2' }) => (
  <TouchableOpacity
    onPress={() => onChange(!value)}
    activeOpacity={0.8}
    style={[
      CS2.toggle,
      { backgroundColor: value ? color : '#2A2A3A' },
    ]}
  >
    <Animated.View
      style={[
        CS2.thumb,
        { transform: [{ translateX: value ? 18 : 2 }] },
      ]}
    />
  </TouchableOpacity>
);

const CS2 = StyleSheet.create({
  toggle: { width: 42, height: 24, borderRadius: 12, justifyContent: 'center' },
  thumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Écran principal
// ─────────────────────────────────────────────────────────────────────────────
export const CommunitiesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [mine,           setMine]           = useState<CommunityData[]>([]);
  const [query,          setQuery]          = useState('');
  const [sortBy,         setSortBy]         = useState<'recent' | 'alpha' | 'members'>('recent');
  const [sortOpen,       setSortOpen]       = useState(false);
  const [viewMode,       setViewMode]       = useState<'list' | 'grid'>('list');
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [createOpen,     setCreateOpen]     = useState(false);
  const [templateOpen,   setTemplateOpen]   = useState(false);
  const [joinOpen,       setJoinOpen]       = useState(false);
  const [joinCode,       setJoinCode]       = useState('');
  const [joining,        setJoining]        = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [templates,      setTemplates]      = useState<any[]>([]);

  // Formulaire création
  const [step,             setStep]             = useState<'info' | 'settings'>('info');
  const [createName,       setCreateName]       = useState('');
  const [createDesc,       setCreateDesc]       = useState('');
  const [createCategory,   setCreateCategory]   = useState<string | null>(null);
  const [createPrivate,    setCreatePrivate]    = useState(false);
  const [createInviteOnly,          setCreateInviteOnly]          = useState(false);
  const [createMembersHiddenPublic, setCreateMembersHiddenPublic] = useState(true);
  const [createMembersHiddenAll,    setCreateMembersHiddenAll]    = useState(true);
  const [createInviteOnlyAdmin,     setCreateInviteOnlyAdmin]     = useState(true);
  const [createPriceGoGold,          setCreatePriceGoGold]          = useState('');
  const [createAvatarUri,  setCreateAvatarUri]  = useState<string | null>(null);
  const [createBannerUri,  setCreateBannerUri]  = useState<string | null>(null);
  const [creating,         setCreating]         = useState(false);
  const pickingRef = useRef(false);

  const resetForm = () => {
    setStep('info');
    setCreateName('');
    setCreateDesc('');
    setCreateCategory(null);
    setCreatePrivate(false);
    setCreateInviteOnly(false);
    setCreateMembersHiddenPublic(true);
    setCreateMembersHiddenAll(true);
    setCreateInviteOnlyAdmin(true);
    setCreatePriceGoGold('');
    setCreateAvatarUri(null);
    setCreateBannerUri(null);
    setSelectedTemplate(null);
  };

  // Charger les templates
  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiClient.get<any[]>('/api/v1/communities/templates');
      setTemplates(res.data ?? []);
    } catch { }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Appliquer un template au formulaire — le template.id est désormais une
  // vraie valeur de CONTENT_CATEGORIES (musique, sport...), donc le choisir
  // fixe aussi la catégorie stockée (sauf "free", qui n'est pas une catégorie).
  const applyTemplate = (t: any) => {
    setSelectedTemplate(t);
    setCreatePrivate(t.default_settings?.is_private ?? false);
    setCreateInviteOnly(t.default_settings?.requires_approval ?? false);
    if (t.id !== 'free') setCreateCategory(t.id);
    if (t.suggested_description && !createDesc.trim()) setCreateDesc(t.suggested_description);
    setTemplateOpen(false);
    setCreateOpen(true);
  };

  // Rejoindre par code
  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { Alert.alert('Erreur', 'Entre un code d\'invitation.'); return; }
    setJoining(true);
    try {
      const res = await apiClient.post<any>(`/api/v1/communities/join/${code}`);
      setJoinOpen(false);
      setJoinCode('');
      load();
      if (res.data?.joined) {
        Alert.alert('Bienvenue !', `Tu as rejoint la communauté.`, [
          { text: 'OK', onPress: () => nav.navigate('CommunityDetail', { communityId: res.data.community_id, autoEnter: true }) },
        ]);
      } else if (res.data?.pending) {
        Alert.alert('Demande envoyée', 'Ta demande est en cours d\'examen. Tu seras notifié dès que l\'admin accepte.');
      } else if (res.data?.error === 'already_member') {
        Alert.alert('Déjà membre', 'Tu es déjà membre de cette communauté.');
      } else if (res.data?.error === 'already_pending') {
        Alert.alert('Demande en cours', 'Ta demande est déjà en cours d\'examen.');
      }
    } catch (e: any) {
      const detail: string = e?.response?.data?.detail ?? '';
      const status: number = e?.response?.status ?? 0;
      if (status === 404) {
        Alert.alert('Code invalide', 'Ce code d\'invitation n\'existe pas ou a expiré.');
      } else if (status === 402 || detail.toLowerCase().includes('gogold')) {
        Alert.alert('GoGold insuffisants', 'Tu n\'as pas assez de GoGold pour rejoindre cette communauté.');
      } else if (status === 403) {
        Alert.alert('Accès refusé', detail || 'Tu n\'as pas accès à cette communauté.');
      } else {
        Alert.alert('Erreur', detail || 'Impossible de rejoindre avec ce code.');
      }
    } finally { setJoining(false); }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await communityService.mine();
      setMine(Array.isArray(data) ? data : []);
    } catch { /**/ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh silencieux au retour sur l'écran (pas de skeleton)
  useEffect(() => { if (isFocused) load(true); }, [isFocused]);

  const searched = query.trim()
    ? mine.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : mine;

  const communities = [...searched].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name);
    if (sortBy === 'members') return (b.members_count ?? 0) - (a.members_count ?? 0);
    // 'recent' — l'API /me retourne déjà les communautés triées par adhésion récente
    return 0;
  });

  const handleCategoryPress = (categoryValue: string | null) => {
    nav.navigate('CommunitiesDiscover', { initialCategory: categoryValue });
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLeave = (id: string) => {
    Alert.alert('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: async () => {
          try { await communityService.leave(id); load(); }
          catch { Alert.alert('Erreur', 'Impossible de quitter.'); }
        },
      },
    ]);
  };

  const pickImage = (target: 'avatar' | 'banner') => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 1 }, (resp) => {
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
      const res = await apiClient.upload<{ uploaded: { url: string }[] }>(
        Endpoints.upload.images('communities'),
        fd,
      );
      return res.data?.uploaded?.[0]?.url ?? null;
    } catch { return null; }
  };

  const handleCreate = async () => {
    if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis.'); return; }
    setCreating(true);
    try {
      const [avatarUrl, bannerUrl] = await Promise.all([
        createAvatarUri ? uploadImage(createAvatarUri) : null,
        createBannerUri ? uploadImage(createBannerUri) : null,
      ]);
      const payload: CreateCommunityPayload & { template?: string } = {
        name:                        createName.trim(),
        description:                 createDesc.trim() || undefined,
        category:                    createCategory ?? undefined,
        is_private:                  createPrivate,
        requires_approval:           createInviteOnly,
        members_list_hidden_public:  createMembersHiddenPublic,
        members_list_hidden_members: createMembersHiddenAll,
        invite_only_admin:           createInviteOnlyAdmin,
        entry_price_gogold:           parseInt(createPriceGoGold, 10) || 0,
        avatar_url:                  avatarUrl ?? undefined,
        banner_url:                  bannerUrl ?? undefined,
        template:                    selectedTemplate?.id,
      };
      const created = await communityService.create(payload);
      setCreateOpen(false);
      resetForm();
      load();
      nav.navigate('CommunityDetail', { communityId: created.id, autoEnter: true });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer la communauté.');
    } finally { setCreating(false); }
  };

  // ── Hero banner ───────────────────────────────────────────────────────────
  const renderHero = () => (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={S.hero}
    >
      <View style={S.heroCircle1} />
      <View style={S.heroCircle2} />
      <View style={S.heroContent}>
        <Text style={S.heroTitle}>Rejoins ta communauté</Text>
        <Text style={S.heroSub}>
          Découvre des espaces qui te ressemblent — musique, sport, culture et plus encore.
        </Text>
        <View style={S.heroActions}>
          <TouchableOpacity
            onPress={() => { resetForm(); setCreateOpen(true); }}
            style={S.heroBtnPrimary}
            activeOpacity={0.85}
          >
            <Icon name="plus" size={14} color="#7B3FF2" />
            <Text style={S.heroBtnPrimaryText}>Créer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setJoinOpen(true)}
            style={S.heroBtnSecondary}
            activeOpacity={0.85}
          >
            <Icon name="key" size={14} color="#fff" />
            <Text style={S.heroBtnSecondaryText}>Code d'invitation</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );

  // ── Catégories populaires — toujours visible, navigue vers Découvrir ───────
  const renderCategories = () => (
    <View style={{ marginBottom: 8 }}>
      <View style={S.categoriesHeaderRow}>
        <Text style={[S.categoriesTitle, { color: colors.textPrimary }]}>Catégories populaires</Text>
        <TouchableOpacity onPress={() => handleCategoryPress(null)} style={S.seeAllBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={[S.seeAllText, { color: colors.primary }]}>Voir tout</Text>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.categoriesScroll} contentContainerStyle={S.categoriesRow}>
        {CONTENT_CATEGORIES.filter(c => c.value !== 'autre').map(cat => (
          <TouchableOpacity
            key={cat.value}
            onPress={() => handleCategoryPress(cat.value)}
            activeOpacity={0.8}
            style={S.categoryItem}
          >
            <View style={[S.categoryIconWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              <Text style={S.categoryEmoji}>{cat.emoji}</Text>
            </View>
            <Text style={[S.categoryLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ── En-tête section "Mes communautés" — tri + vue ──────────────────────────
  const SORT_LABELS: Record<typeof sortBy, string> = {
    recent: 'Récentes', alpha: 'Alphabétique', members: 'Popularité',
  };
  const renderSectionHeader = () => (
    <View style={S.sectionHeader}>
      <View style={S.sectionTitleRow}>
        <Text style={[S.sectionTitle, { color: colors.textPrimary }]}>Mes communautés</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setSortOpen(v => !v)}
            style={[S.sortBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
            activeOpacity={0.8}
          >
            <Text style={[S.sortBtnText, { color: colors.textSecondary }]}>{SORT_LABELS[sortBy]}</Text>
            <Icon name={sortOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode(v => (v === 'list' ? 'grid' : 'list'))}
            style={[S.viewBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
            activeOpacity={0.8}
          >
            <Icon name={viewMode === 'list' ? 'grid' : 'list'} size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {sortOpen && (
        <View style={[S.sortMenu, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {(['recent', 'alpha', 'members'] as const).map(opt => (
            <TouchableOpacity
              key={opt}
              onPress={() => { setSortBy(opt); setSortOpen(false); }}
              style={S.sortMenuItem}
              activeOpacity={0.8}
            >
              <Text style={{ color: sortBy === opt ? colors.primary : colors.textSecondary, fontWeight: sortBy === opt ? '800' : '600', fontSize: 13 }}>
                {SORT_LABELS[opt]}
              </Text>
              {sortBy === opt && <Icon name="check" size={14} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // ── Rendu empty state "Mes communautés" ─────────────────────────────────────
  const renderEmpty = () => (
    <View style={{ alignItems: 'center', gap: 16, paddingTop: 24 }}>
      <LinearGradient colors={['#7B3FF230', '#E0389A20']} style={S.emptyIcon}>
        <Icon name="users" size={36} color="#7B3FF2" />
      </LinearGradient>
      <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>
        {query ? 'Aucun résultat' : 'Aucune communauté'}
      </Text>
      <Text style={[S.emptySub, { color: colors.textTertiary }]}>
        {query
          ? `Aucun résultat pour "${query}"`
          : 'Soyez le premier à créer ou rejoindre une communauté !'}
      </Text>
      {!query && (
        <>
          <TouchableOpacity
            onPress={() => { resetForm(); setCreateOpen(true); }}
            style={{ borderRadius: 14, overflow: 'hidden', marginTop: 4 }}
          >
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={S.emptyBtn}
            >
              <Icon name="plus" size={16} color="#fff" />
              <Text style={S.emptyBtnText}>Créer une communauté</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setJoinOpen(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={[S.emptyLinkText, { color: colors.primary }]}>Utiliser un code d'invitation</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  // ── Rendu liste — un seul ScrollView vertical, tout empilé simplement ────────
  const renderList = () => {
    if (loading && mine.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <CommunitySkeletonCard />
          <CommunitySkeletonCard />
          <CommunitySkeletonCard />
        </ScrollView>
      );
    }

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
      >
        {renderHero()}
        {renderCategories()}
        {renderSectionHeader()}

        {communities.length === 0 ? (
          renderEmpty()
        ) : viewMode === 'grid' ? (
          <View style={S.gridWrap}>
            {communities.map(item => (
              <CommunityGridCard
                key={item.id}
                item={item}
                colors={colors}
                onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
              />
            ))}
          </View>
        ) : (
          communities.map(item => (
            <CommunityCard
              key={item.id}
              item={item}
              isMine
              colors={colors}
              onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
              onJoin={() => {}}
              onLeave={() => handleLeave(item.id)}
              onCancelRequest={() => {}}
            />
          ))
        )}
      </ScrollView>
    );
  };

  // ── Modal création — Étape 1 ──────────────────────────────────────────────
  const renderStepInfo = () => (
    <View style={S.sheetBody}>
      {/* Bannière picker */}
      <TouchableOpacity onPress={() => pickImage('banner')} activeOpacity={0.85} style={S.bannerPicker}>
        {createBannerUri ? (
          <Image source={{ uri: createBannerUri }} style={S.bannerPickerImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#7B3FF215', '#E0389A15']} style={S.bannerPickerImg}>
            <Icon name="image" size={26} color={colors.textTertiary} />
            <Text style={[S.bannerPlaceholderTxt, { color: colors.textTertiary }]}>
              Ajouter une bannière
            </Text>
          </LinearGradient>
        )}
        <View style={S.camBadge}>
          <Icon name="camera" size={13} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* Avatar picker superposé */}
      <TouchableOpacity onPress={() => pickImage('avatar')} activeOpacity={0.85} style={S.avatarPickerWrap}>
        {createAvatarUri ? (
          <Image source={{ uri: createAvatarUri }} style={S.avatarPickerImg} />
        ) : (
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={S.avatarPickerImg}>
            <Text style={S.avatarPickerLetter}>
              {createName ? createName[0].toUpperCase() : '?'}
            </Text>
          </LinearGradient>
        )}
        <View style={S.avatarCam}>
          <Icon name="camera" size={11} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* Sélecteur de type — scroll horizontal */}
      {templates.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={[S.fieldLabel, { color: colors.textTertiary }]}>TYPE DE COMMUNAUTÉ</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          >
            {/* Option "Libre" */}
            <TouchableOpacity
              onPress={() => setSelectedTemplate(null)}
              activeOpacity={0.8}
              style={[S.typeChip, {
                backgroundColor: !selectedTemplate ? colors.primary + '18' : colors.surface,
                borderColor: !selectedTemplate ? colors.primary : colors.border,
              }]}
            >
              <Icon name="star" size={15} color={!selectedTemplate ? colors.primary : colors.textTertiary} />
              <Text style={[S.typeChipLabel, { color: !selectedTemplate ? colors.primary : colors.textSecondary }]}>
                Libre
              </Text>
            </TouchableOpacity>

            {templates.map(t => {
              const active = selectedTemplate?.id === t.id;
              const chipColor = t.color ?? colors.primary;
              const iconInfo = TEMPLATE_ICONS[t.id as keyof typeof TEMPLATE_ICONS] ?? { lib: 'feather', name: 'users' };
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setSelectedTemplate(active ? null : t);
                    if (!active) {
                      if (t.default_settings?.is_private !== undefined) setCreatePrivate(t.default_settings.is_private);
                      if (t.default_settings?.requires_approval !== undefined) setCreateInviteOnly(t.default_settings.requires_approval);
                      if (t.id !== 'free') setCreateCategory(t.id);
                      if (t.suggested_description && !createDesc.trim()) setCreateDesc(t.suggested_description);
                    } else {
                      setCreateCategory(null);
                    }
                  }}
                  activeOpacity={0.8}
                  style={[S.typeChip, {
                    backgroundColor: active ? chipColor + '18' : colors.surface,
                    borderColor: active ? chipColor : colors.border,
                  }]}
                >
                  {iconInfo.lib === 'mc'
                    ? <MCIcon name={iconInfo.name} size={16} color={active ? chipColor : colors.textTertiary} />
                    : <Icon name={iconInfo.name} size={15} color={active ? chipColor : colors.textTertiary} />
                  }
                  <Text style={[S.typeChipLabel, { color: active ? chipColor : colors.textSecondary }]}>
                    {t.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Champs */}
      <View style={{ marginTop: 14, gap: 14 }}>
        <View>
          <Text style={[S.fieldLabel, { color: colors.textTertiary }]}>NOM *</Text>
          <View style={[S.fieldBox, {
            backgroundColor: colors.surface,
            borderColor: createName.length > 0 ? colors.primary + '60' : colors.border,
          }]}>
            <TextInput
              style={[S.fieldInput, { color: colors.textPrimary }]}
              placeholder="Ex : Cinéma africain, Jazz, Foot…"
              placeholderTextColor={colors.textTertiary}
              value={createName}
              onChangeText={setCreateName}
              maxLength={60}
              autoFocus
            />
          </View>
        </View>

        <View>
          <Text style={[S.fieldLabel, { color: colors.textTertiary }]}>DESCRIPTION</Text>
          <View style={[S.fieldBox, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            minHeight: 80,
          }]}>
            <TextInput
              style={[S.fieldInput, { color: colors.textPrimary, textAlignVertical: 'top' }]}
              placeholder="Décrivez votre communauté…"
              placeholderTextColor={colors.textTertiary}
              value={createDesc}
              onChangeText={setCreateDesc}
              multiline
              maxLength={300}
            />
          </View>
          <Text style={[S.counter, { color: colors.textTertiary }]}>
            {createDesc.length}/300
          </Text>
        </View>

        <View>
          <CategorySelector value={createCategory} onChange={setCreateCategory} label="Catégorie (optionnel)" />
        </View>
      </View>

      {/* Footer étape 1 */}
      <View style={S.footerRow}>
        <TouchableOpacity
          onPress={() => { setCreateOpen(false); resetForm(); }}
          style={[S.footerBtnSecondary, { borderColor: colors.divider }]}
          activeOpacity={0.7}
        >
          <Text style={[S.footerBtnSecondaryTxt, { color: colors.textSecondary }]}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (!createName.trim()) { Alert.alert('Erreur', 'Le nom est requis.'); return; }
            setStep('settings');
          }}
          style={{ flex: 1, borderRadius: 14, overflow: 'hidden' }}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={S.footerBtnPrimary}
          >
            <Text style={S.footerBtnPrimaryTxt}>Suivant</Text>
            <Icon name="arrow-right" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={{ height: 16 }} />
    </View>
  );

  // ── Modal création — Étape 2 ──────────────────────────────────────────────
  const renderStepSettings = () => (
    <View style={S.sheetBody}>
      {/* Aperçu mini */}
      <View style={[S.previewRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {createAvatarUri ? (
          <Image source={{ uri: createAvatarUri }} style={S.previewAvatar} />
        ) : (
          <LinearGradient colors={gradientFor(createName)} style={S.previewAvatar}>
            <Text style={S.previewLetter}>{(createName[0] ?? '?').toUpperCase()}</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
            {createName}
          </Text>
          {createDesc ? (
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
              {createDesc}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Confidentialité */}
      <Text style={[S.sectionLbl, { color: colors.textTertiary }]}>CONFIDENTIALITÉ</Text>
      {[
        {
          val: false,
          icon: 'globe',
          color: colors.info,
          label: 'Publique',
          sub: 'Tout le monde peut voir et rejoindre',
        },
        {
          val: true,
          icon: 'lock',
          color: colors.gradientEnd,
          label: 'Privée',
          sub: 'Visible uniquement par les membres',
        },
      ].map(opt => (
        <TouchableOpacity
          key={String(opt.val)}
          onPress={() => setCreatePrivate(opt.val)}
          style={[S.optRow, {
            backgroundColor: colors.surface,
            borderColor: createPrivate === opt.val ? opt.color + '80' : colors.border,
          }]}
          activeOpacity={0.8}
        >
          <View style={[S.optIcon, { backgroundColor: opt.color + '20' }]}>
            <Icon name={opt.icon} size={18} color={opt.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[S.optLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
            <Text style={[S.optSub, { color: colors.textTertiary }]}>{opt.sub}</Text>
          </View>
          <View style={[S.radio, { borderColor: createPrivate === opt.val ? opt.color : colors.border }]}>
            {createPrivate === opt.val && (
              <View style={[S.radioDot, { backgroundColor: opt.color }]} />
            )}
          </View>
        </TouchableOpacity>
      ))}

      {/* Approbation */}
      <TouchableOpacity
        onPress={() => setCreateInviteOnly(v => !v)}
        style={[S.optRow, {
          backgroundColor: colors.surface,
          borderColor: createInviteOnly ? '#F59E0B80' : colors.border,
        }]}
        activeOpacity={0.8}
      >
        <View style={[S.optIcon, { backgroundColor: '#F59E0B20' }]}>
          <Icon name="user-check" size={18} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.optLabel, { color: colors.textPrimary }]}>Approbation requise</Text>
          <Text style={[S.optSub, { color: colors.textTertiary }]}>
            Vous approuvez manuellement chaque demande
          </Text>
        </View>
        <CustomToggle
          value={createInviteOnly}
          onChange={setCreateInviteOnly}
          color="#F59E0B"
        />
      </TouchableOpacity>

      {/* Accès payant */}
      <Text style={[S.sectionLbl, { color: colors.textTertiary, marginTop: 6 }]}>
        ACCÈS PAYANT (optionnel)
      </Text>
      <View style={[S.optRow, {
        backgroundColor: colors.surface,
        borderColor: (parseInt(createPriceGoGold, 10) || 0) > 0 ? '#F59E0B80' : colors.border,
        alignItems: 'center',
      }]}>
        <View style={[S.optIcon, { backgroundColor: '#F59E0B20' }]}>
          <Icon name="zap" size={18} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.optLabel, { color: colors.textPrimary }]}>GoGold requis</Text>
          <Text style={[S.optSub, { color: colors.textTertiary }]}>0 = accès gratuit</Text>
        </View>
        <TextInput
          style={[S.goGoldInput, {
            color: colors.textPrimary,
            borderColor: (parseInt(createPriceGoGold, 10) || 0) > 0 ? colors.warning : colors.border,
            backgroundColor: colors.backgroundSecondary,
          }]}
          value={createPriceGoGold}
          onChangeText={v => setCreatePriceGoGold(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      {/* Visibilité des membres */}
      <Text style={[S.sectionLbl, { color: colors.textTertiary, marginTop: 6 }]}>MEMBRES</Text>

      <TouchableOpacity
        onPress={() => setCreateMembersHiddenPublic(v => !v)}
        style={[S.optRow, { backgroundColor: colors.surface, borderColor: createMembersHiddenPublic ? '#7B3FF280' : colors.border }]}
        activeOpacity={0.8}
      >
        <View style={[S.optIcon, { backgroundColor: '#7B3FF220' }]}>
          <Icon name="eye-off" size={18} color="#7B3FF2" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.optLabel, { color: colors.textPrimary }]}>Masqué aux non-membres</Text>
          <Text style={[S.optSub, { color: colors.textTertiary }]}>
            Les personnes extérieures ne voient pas la liste des membres
          </Text>
        </View>
        <CustomToggle value={createMembersHiddenPublic} onChange={setCreateMembersHiddenPublic} color="#7B3FF2" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setCreateMembersHiddenAll(v => !v)}
        style={[S.optRow, { backgroundColor: colors.surface, borderColor: createMembersHiddenAll ? '#E0389A80' : colors.border }]}
        activeOpacity={0.8}
      >
        <View style={[S.optIcon, { backgroundColor: '#E0389A20' }]}>
          <Icon name="users" size={18} color="#E0389A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.optLabel, { color: colors.textPrimary }]}>Masqué aux membres</Text>
          <Text style={[S.optSub, { color: colors.textTertiary }]}>
            Même les membres ne voient pas les autres — seul l'admin voit tout
          </Text>
        </View>
        <CustomToggle value={createMembersHiddenAll} onChange={setCreateMembersHiddenAll} color="#E0389A" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setCreateInviteOnlyAdmin(v => !v)}
        style={[S.optRow, { backgroundColor: colors.surface, borderColor: createInviteOnlyAdmin ? '#10B98180' : colors.border }]}
        activeOpacity={0.8}
      >
        <View style={[S.optIcon, { backgroundColor: '#10B98120' }]}>
          <Icon name="user-plus" size={18} color="#10B981" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.optLabel, { color: colors.textPrimary }]}>Ajout par admin uniquement</Text>
          <Text style={[S.optSub, { color: colors.textTertiary }]}>
            Seul l'admin peut inviter de nouveaux membres
          </Text>
        </View>
        <CustomToggle value={createInviteOnlyAdmin} onChange={setCreateInviteOnlyAdmin} color="#10B981" />
      </TouchableOpacity>

      {/* Footer étape 2 */}
      <View style={[S.footerRow, { marginTop: 24 }]}>
        <TouchableOpacity
          onPress={() => setStep('info')}
          style={[S.footerBtnSecondary, { borderColor: colors.divider }]}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={15} color={colors.textSecondary} />
          <Text style={[S.footerBtnSecondaryTxt, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating}
          style={{ flex: 1, borderRadius: 14, overflow: 'hidden', opacity: creating ? 0.72 : 1 }}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={S.footerBtnPrimary}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="check-circle" size={16} color="#fff" />
                <Text style={S.footerBtnPrimaryTxt}>Créer</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={{ height: 24 }} />
    </View>
  );

  // ── Rendu principal ──────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[S.header, {
        backgroundColor: colors.surface,
        paddingTop: insets.top + 10,
        borderBottomColor: colors.divider,
      }]}>
        {/* Titre + sous-titre + bouton créer */}
        <View style={S.headerRow}>
          <BackButton onPress={() => nav.goBack()} />
          <View style={{ flex: 1 }}>
            <Text style={[S.headerTitle, { color: colors.textPrimary }]}>Communautés</Text>
            <Text style={[S.headerSubtitle, { color: colors.textTertiary }]}>
              Connecte-toi, partage et grandis ensemble
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { resetForm(); setCreateOpen(true); }}
            style={[S.createBtn, { backgroundColor: colors.primary }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Barre de recherche + filtre */}
        <View style={[S.searchWrap, {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.divider,
        }]}>
          <Icon name="search" size={15} color={colors.primary} />
          <TextInput
            style={[S.searchInput, { color: colors.textPrimary }]}
            placeholder="Rechercher une communauté…"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => nav.navigate('CommunitiesDiscover', undefined)}
              style={[S.filterBtn, { backgroundColor: colors.background }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Icon name="sliders" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Corps ── */}
      {renderList()}

      {/* ── Modal création ── */}
      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !creating && setCreateOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            style={S.overlay}
            activeOpacity={1}
            onPress={() => !creating && setCreateOpen(false)}
          />
          <View style={[S.sheet, { backgroundColor: colors.background }]}>
            {/* Handle */}
            <View style={S.handleWrap}>
              <View style={[S.handle, { backgroundColor: colors.divider }]} />
            </View>

            {/* Header modal */}
            <View style={[S.sheetHeader, { borderBottomColor: colors.divider }]}>
              {step === 'settings' ? (
                <TouchableOpacity onPress={() => setStep('info')} style={S.sheetNavBtn}>
                  <Icon name="chevron-left" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => { setCreateOpen(false); resetForm(); }}
                  style={S.sheetNavBtn}
                >
                  <Icon name="x" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              )}

              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[S.sheetTitle, { color: colors.textPrimary }]}>
                  {step === 'info' ? 'Nouvelle communauté' : 'Configuration'}
                </Text>
                <View style={S.stepDots}>
                  {[0, 1].map(i => {
                    const cur = step === 'info' ? 0 : 1;
                    return (
                      <View
                        key={i}
                        style={[S.stepDot, {
                          backgroundColor: cur >= i ? colors.primary : colors.divider,
                          width: cur === i ? 20 : 6,
                        }]}
                      />
                    );
                  })}
                </View>
              </View>

              <View style={{ width: 72 }} />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {step === 'info' ? renderStepInfo() : renderStepSettings()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal : choisir un template ── */}
      <Modal visible={templateOpen} transparent animationType="slide" onRequestClose={() => setTemplateOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setTemplateOpen(false)} />
        <View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background, maxHeight: '80%' }]}>
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.divider }} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center', paddingVertical: 14 }}>
            Quel type de communauté ?
          </Text>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
            {templates.map(t => (
              <TouchableOpacity key={t.id} onPress={() => applyTemplate(t)} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: colors.surface, borderRadius: 16, padding: 14,
                  borderWidth: 1.5, borderColor: colors.divider }}>
                <View style={{ width: 48, height: 48, borderRadius: 24,
                  backgroundColor: t.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{t.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15 }}>{t.name}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {t.description}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal : rejoindre par code ── */}
      <Modal visible={joinOpen} transparent animationType="slide" onRequestClose={() => setJoinOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setJoinOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background, padding: 24, gap: 16 }}>
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.divider }} />
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
              Rejoindre par code
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center' }}>
              Entre le code d'invitation que tu as reçu (ex: GOFOLIX-A3K9F)
            </Text>
            <TextInput
              style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 14, borderWidth: 1,
                borderColor: joinCode ? colors.primary : colors.divider,
                paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: 3,
                color: colors.textPrimary }}
              value={joinCode}
              onChangeText={v => setJoinCode(v.toUpperCase())}
              placeholder="GOFOLIX-XXXXX"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoFocus
              maxLength={20}
            />
            <TouchableOpacity onPress={handleJoinByCode} disabled={joining}
              activeOpacity={0.85} style={{ borderRadius: 14, overflow: 'hidden' }}>
              <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 14 }}>
                {joining ? <ActivityIndicator color="#fff" size="small" /> : (
                  <><Icon name="log-in" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Rejoindre</Text></>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setJoinOpen(false); setJoinCode(''); }} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles écran principal
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  headerSubtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filterBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Catégories populaires
  categoriesHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 10,
  },
  categoriesTitle: { fontSize: 15, fontWeight: '800' },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '700' },
  categoriesScroll: { height: 88 },
  categoriesRow: { paddingHorizontal: 16, gap: 14 },
  categoryItem: { alignItems: 'center', width: 60, gap: 6 },
  categoryIconWrap: {
    width: 52, height: 52, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryEmoji: { fontSize: 22 },
  categoryLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // Hero banner
  hero: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 148,
  },
  heroCircle1: {
    position: 'absolute', top: -30, right: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCircle2: {
    position: 'absolute', bottom: -20, left: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroContent: { padding: 20, zIndex: 1 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  heroActions: { flexDirection: 'row', gap: 10 },
  heroBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 11,
  },
  heroBtnPrimaryText: { color: '#7B3FF2', fontWeight: '700', fontSize: 13 },
  heroBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBtnSecondaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Section header — Mes communautés (tri + vue)
  sectionHeader: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  sortBtnText: { fontSize: 12, fontWeight: '700' },
  viewBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortMenu: {
    marginTop: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4, alignSelf: 'flex-end',
  },
  sortMenuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20,
    paddingHorizontal: 14, paddingVertical: 10,
  },

  // Grille "Mes communautés" (viewMode grid)
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 8 },

  // Empty
  emptyIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyLinkText: { fontSize: 14, fontWeight: '700', marginTop: 4 },

  // Modal
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%' },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetNavBtn: { width: 72, justifyContent: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  stepDots: { flexDirection: 'row', gap: 5, marginTop: 5 },
  stepDot: { height: 4, borderRadius: 2 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 18 },

  // Banner/avatar picker dans modal
  bannerPicker: { height: 120, borderRadius: 16, overflow: 'hidden' },
  bannerPickerImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerPlaceholderTxt: { fontSize: 12, fontWeight: '500', marginTop: 6 },
  camBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPickerWrap: {
    marginTop: -30,
    marginLeft: 14,
    alignSelf: 'flex-start',
  },
  avatarPickerImg: {
    width: 68,
    height: 68,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPickerLetter: { color: '#fff', fontWeight: '800', fontSize: 26 },
  avatarCam: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#7B3FF2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Type chips
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
  },
  typeChipLabel: { fontSize: 13, fontWeight: '700' },

  // Form
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 7 },
  fieldBox: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  fieldInput: { fontSize: 15, padding: 0 },
  counter: { fontSize: 10, textAlign: 'right', marginTop: 4 },

  // Preview
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  previewAvatar: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },

  // Section label
  sectionLbl: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10 },

  // Options (modal)
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  optIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optLabel: { fontSize: 14, fontWeight: '600' },
  optSub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  goGoldInput: {
    width: 64,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },

  // Footer boutons modal
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  footerBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  footerBtnSecondaryTxt: { fontWeight: '600', fontSize: 14 },
  footerBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  footerBtnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

