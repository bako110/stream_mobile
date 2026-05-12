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
import type { CommunityData, CreateCommunityPayload, JoinStatus } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const { width: W } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const GRADIENTS: [string, string][] = [
  ['#7B3FF2', '#E0389A'],
  ['#0EA5E9', '#6366F1'],
  ['#10B981', '#0EA5E9'],
  ['#F59E0B', '#EF4444'],
  ['#EC4899', '#8B5CF6'],
];

function gradientFor(name: string): [string, string] {
  const i = (name?.charCodeAt(0) ?? 0) % GRADIENTS.length;
  return GRADIENTS[i];
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonPulse — bloc gris animé
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonPulse: React.FC<{ style?: object }> = ({ style }) => {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[{ backgroundColor: '#2A2A3A', borderRadius: 10, opacity: anim }, style]}
    />
  );
};

const SkeletonCard: React.FC = () => (
  <View style={SK.card}>
    <SkeletonPulse style={SK.banner} />
    <View style={SK.body}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <SkeletonPulse style={SK.avatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonPulse style={SK.line1} />
          <SkeletonPulse style={SK.line2} />
        </View>
      </View>
      <SkeletonPulse style={SK.btn} />
    </View>
  </View>
);

const SK = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  banner: { height: 120, borderRadius: 0 },
  body: { padding: 14 },
  avatar: { width: 52, height: 52, borderRadius: 14 },
  line1: { height: 14, width: '60%' },
  line2: { height: 11, width: '40%' },
  btn: { height: 40, borderRadius: 12 },
});

// ─────────────────────────────────────────────────────────────────────────────
// CommunityCard
// ─────────────────────────────────────────────────────────────────────────────
const CommunityCard = React.memo(function CommunityCard({
  item,
  isMine,
  colors,
  onPress,
  onJoin,
  onLeave,
  onCancelRequest,
}: {
  item: CommunityData;
  isMine: boolean;
  colors: any;
  onPress: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onCancelRequest: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, tension: 220, friction: 14 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 220, friction: 14 }).start();

  const joinStatus: JoinStatus = isMine ? 'member' : (item.join_status ?? 'none');
  const isPrivateOrApproval = item.is_private || item.requires_approval;

  const renderAction = () => {
    if (joinStatus === 'member') {
      return (
        <View style={CS.actRow}>
          <TouchableOpacity
            onPress={onPress}
            style={[CS.actPrimary, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Icon name="message-circle" size={14} color="#fff" />
            <Text style={CS.actPrimaryText}>Discussion</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLeave}
            style={[CS.actGhost, { borderColor: colors.divider }]}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="log-out" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      );
    }

    if (joinStatus === 'pending') {
      return (
        <TouchableOpacity
          onPress={onCancelRequest}
          activeOpacity={0.85}
          style={CS.pendingWrap}
        >
          <View style={CS.pendingInner}>
            <Icon name="clock" size={13} color="#F59E0B" />
            <Text style={CS.pendingText}>En attente</Text>
            <View style={CS.pendingSep} />
            <Icon name="x" size={12} color="#F59E0B" />
            <Text style={CS.pendingCancel}>Annuler</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity onPress={onJoin} activeOpacity={0.85} style={CS.joinWrap}>
        <LinearGradient
          colors={isPrivateOrApproval ? ['#7B3FF2', '#6D28D9'] : ['#7B3FF2', '#E0389A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={CS.joinGrad}
        >
          <Icon name={isPrivateOrApproval ? 'send' : 'user-plus'} size={14} color="#fff" />
          <Text style={CS.joinText}>
            {isPrivateOrApproval ? 'Demander' : 'Rejoindre'}
          </Text>
          {(item.entry_price_coins ?? 0) > 0 && (
            <View style={CS.priceChip}>
              <Text style={CS.priceChipNum}>{item.entry_price_coins}</Text>
              <Icon name="zap" size={10} color="#F59E0B" />
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // Type badge label
  let typeBadgeLabel = '';
  let typeBadgeColor = '#3B82F6';
  if (item.is_private) {
    typeBadgeLabel = 'Privée';
    typeBadgeColor = '#E0389A';
  } else if (item.requires_approval) {
    typeBadgeLabel = 'Approbation';
    typeBadgeColor = '#F59E0B';
  } else {
    typeBadgeLabel = 'Publique';
    typeBadgeColor = '#10B981';
  }

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 14 }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[CS.card, { backgroundColor: colors.surface }]}
      >
        {/* ── Bannière 120px ── */}
        <View style={CS.bannerWrap}>
          {item.banner_url ? (
            <Image source={{ uri: item.banner_url }} style={CS.bannerImg} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={gradientFor(item.name)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={CS.bannerImg}
            />
          )}
          {/* Overlay gradient bas */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={CS.bannerOverlay}
            pointerEvents="none"
          />

          {/* Badge type — haut droite */}
          <View style={[CS.badgeTopRight, { backgroundColor: typeBadgeColor + 'CC' }]}>
            <Icon
              name={item.is_private ? 'lock' : item.requires_approval ? 'user-check' : 'globe'}
              size={9}
              color="#fff"
            />
            <Text style={CS.badgeText}>{typeBadgeLabel}</Text>
          </View>

          {/* Prix coins — haut gauche si payant */}
          {(item.entry_price_coins ?? 0) > 0 && joinStatus !== 'member' && (
            <View style={CS.coinsBadge}>
              <Icon name="zap" size={10} color="#F59E0B" />
              <Text style={CS.coinsNum}>{item.entry_price_coins}</Text>
            </View>
          )}

          {/* Avatar 56px superposé bas-gauche */}
          <View style={CS.avatarWrap}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={CS.avatar} />
            ) : (
              <LinearGradient colors={gradientFor(item.name)} style={CS.avatarGrad}>
                <Text style={CS.avatarLetter}>{(item.name[0] ?? '?').toUpperCase()}</Text>
              </LinearGradient>
            )}
            {item.is_verified && (
              <View style={CS.verifiedDot}>
                <Icon name="check" size={8} color="#fff" />
              </View>
            )}
          </View>
        </View>

        {/* ── Corps ── */}
        <View style={CS.body}>
          {/* Nom */}
          <View style={CS.nameRow}>
            <Text style={[CS.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
          </View>

          {/* Créateur */}
          {item.creator ? (
            <Text style={[CS.creator, { color: colors.textTertiary }]} numberOfLines={1}>
              par {item.creator.display_name ?? item.creator.username}
            </Text>
          ) : null}

          {/* Description */}
          {item.description ? (
            <Text style={[CS.desc, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Stats row */}
          <View style={CS.statsRow}>
            <Icon name="users" size={11} color={colors.textTertiary} />
            <Text style={[CS.statTxt, { color: colors.textTertiary }]}>
              {fmtCount(item.members_count ?? 0)}
            </Text>
            <View style={[CS.dot, { backgroundColor: colors.textTertiary }]} />
            <Icon
              name={item.is_private ? 'lock' : 'globe'}
              size={11}
              color={colors.textTertiary}
            />
            <Text style={[CS.statTxt, { color: colors.textTertiary }]}>
              {item.is_private ? 'Privée' : 'Publique'}
            </Text>
            {(item.entry_price_coins ?? 0) > 0 && (
              <>
                <View style={[CS.dot, { backgroundColor: colors.textTertiary }]} />
                <Icon name="zap" size={11} color="#F59E0B" />
                <Text style={[CS.statTxt, { color: '#F59E0B' }]}>
                  {item.entry_price_coins} coins
                </Text>
              </>
            )}
          </View>

          {/* Bouton action */}
          {renderAction()}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

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

  const [tab,            setTab]            = useState<'discover' | 'mine'>('discover');
  const [all,            setAll]            = useState<CommunityData[]>([]);
  const [query,          setQuery]          = useState('');
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [createOpen,     setCreateOpen]     = useState(false);

  // Formulaire création
  const [step,             setStep]             = useState<'info' | 'settings'>('info');
  const [createName,       setCreateName]       = useState('');
  const [createDesc,       setCreateDesc]       = useState('');
  const [createPrivate,    setCreatePrivate]    = useState(false);
  const [createInviteOnly, setCreateInviteOnly] = useState(false);
  const [createPriceCoins, setCreatePriceCoins] = useState('');
  const [createAvatarUri,  setCreateAvatarUri]  = useState<string | null>(null);
  const [createBannerUri,  setCreateBannerUri]  = useState<string | null>(null);
  const [creating,         setCreating]         = useState(false);
  const pickingRef = useRef(false);

  const resetForm = () => {
    setStep('info');
    setCreateName('');
    setCreateDesc('');
    setCreatePrivate(false);
    setCreateInviteOnly(false);
    setCreatePriceCoins('');
    setCreateAvatarUri(null);
    setCreateBannerUri(null);
  };

  const load = useCallback(async () => {
    try {
      const data = tab === 'mine'
        ? await communityService.mine()
        : await communityService.discover();
      setAll(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load, isFocused]);

  const communities = query.trim()
    ? all.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : all;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleJoin = (item: CommunityData) => {
    const price = item.entry_price_coins ?? 0;
    const needsApproval = item.is_private || item.requires_approval;
    if (price > 0) {
      const label = `${price} coin${price > 1 ? 's' : ''}`;
      const note = needsApproval
        ? '\n\nVotre demande sera examinée par l\'admin. Les coins sont remboursés en cas de refus.'
        : '';
      Alert.alert('Accès payant', `Rejoindre "${item.name}" coûte ${label}.${note}`, [
        { text: 'Annuler', style: 'cancel' },
        { text: `Payer ${label}`, onPress: () => _doJoin(item) },
      ]);
      return;
    }
    _doJoin(item);
  };

  const _doJoin = async (item: CommunityData) => {
    try {
      const res = await communityService.join(item.id);
      if (res.pending) {
        Alert.alert(
          'Demande envoyée',
          `Votre demande pour rejoindre "${item.name}" est en attente d'approbation.`,
        );
      }
      load();
    } catch (e: any) {
      const msg = (e?.response?.data?.detail ?? '').toLowerCase();
      if (msg.includes('insufficient') || msg.includes('coins')) {
        Alert.alert('Coins insuffisants', 'Vous n\'avez pas assez de coins pour rejoindre cette communauté.');
      } else if (msg.includes('blocked')) {
        Alert.alert('Accès refusé', 'Vous avez été bloqué de cette communauté.');
      } else {
        Alert.alert('Erreur', 'Impossible de rejoindre cette communauté.');
      }
    }
  };

  const handleCancelRequest = (item: CommunityData) => {
    Alert.alert('Annuler la demande', `Annuler votre demande pour "${item.name}" ?`, [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler la demande',
        style: 'destructive',
        onPress: async () => {
          try { await communityService.cancelJoinRequest(item.id); load(); }
          catch { Alert.alert('Erreur', 'Impossible d\'annuler la demande.'); }
        },
      },
    ]);
  };

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
      const payload: CreateCommunityPayload = {
        name:              createName.trim(),
        description:       createDesc.trim() || undefined,
        is_private:        createPrivate,
        requires_approval: createInviteOnly,
        entry_price_coins: parseInt(createPriceCoins, 10) || 0,
        avatar_url:        avatarUrl ?? undefined,
        banner_url:        bannerUrl ?? undefined,
      };
      await communityService.create(payload);
      setCreateOpen(false);
      resetForm();
      setTab('mine');
      load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer la communauté.');
    } finally { setCreating(false); }
  };

  // ── Rendu liste ──────────────────────────────────────────────────────────────
  const renderList = () => {
    if (loading) {
      return (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      );
    }

    return (
      <FlatList
        data={communities}
        keyExtractor={c => c.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          communities.length === 0
            ? S.emptyContainer
            : { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <CommunityCard
            item={item}
            isMine={tab === 'mine' || item.join_status === 'member'}
            colors={colors}
            onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
            onJoin={() => handleJoin(item)}
            onLeave={() => handleLeave(item.id)}
            onCancelRequest={() => handleCancelRequest(item)}
          />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', gap: 16 }}>
            <LinearGradient
              colors={['#7B3FF230', '#E0389A20']}
              style={S.emptyIcon}
            >
              <Icon name="users" size={36} color="#7B3FF2" />
            </LinearGradient>
            <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>
              {tab === 'mine'
                ? 'Aucune communauté'
                : query
                ? 'Aucun résultat'
                : 'Aucune communauté'}
            </Text>
            <Text style={[S.emptySub, { color: colors.textTertiary }]}>
              {tab === 'mine'
                ? 'Créez ou rejoignez une communauté pour commencer'
                : query
                ? `Aucun résultat pour "${query}"`
                : 'Soyez le premier à créer une communauté !'}
            </Text>
            {tab === 'mine' && (
              <TouchableOpacity
                onPress={() => { resetForm(); setCreateOpen(true); }}
                style={{ borderRadius: 14, overflow: 'hidden', marginTop: 4 }}
              >
                <LinearGradient
                  colors={['#7B3FF2', '#E0389A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={S.emptyBtn}
                >
                  <Icon name="plus" size={16} color="#fff" />
                  <Text style={S.emptyBtnText}>Créer une communauté</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        }
      />
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
          <LinearGradient colors={['#7B3FF2', '#E0389A']} style={S.avatarPickerImg}>
            <Text style={S.avatarPickerLetter}>
              {createName ? createName[0].toUpperCase() : '?'}
            </Text>
          </LinearGradient>
        )}
        <View style={S.avatarCam}>
          <Icon name="camera" size={11} color="#fff" />
        </View>
      </TouchableOpacity>

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
            colors={['#7B3FF2', '#E0389A']}
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
          color: '#3B82F6',
          label: 'Publique',
          sub: 'Tout le monde peut voir et rejoindre',
        },
        {
          val: true,
          icon: 'lock',
          color: '#E0389A',
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
        borderColor: (parseInt(createPriceCoins, 10) || 0) > 0 ? '#F59E0B80' : colors.border,
        alignItems: 'center',
      }]}>
        <View style={[S.optIcon, { backgroundColor: '#F59E0B20' }]}>
          <Icon name="zap" size={18} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.optLabel, { color: colors.textPrimary }]}>Coins requis</Text>
          <Text style={[S.optSub, { color: colors.textTertiary }]}>0 = accès gratuit</Text>
        </View>
        <TextInput
          style={[S.coinsInput, {
            color: colors.textPrimary,
            borderColor: (parseInt(createPriceCoins, 10) || 0) > 0 ? '#F59E0B' : colors.border,
            backgroundColor: colors.backgroundSecondary,
          }]}
          value={createPriceCoins}
          onChangeText={v => setCreatePriceCoins(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

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
            colors={['#7B3FF2', '#E0389A']}
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
        {/* Titre + bouton + */}
        <View style={S.headerRow}>
          <TouchableOpacity
            onPress={() => nav.goBack()}
            style={S.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[S.headerTitle, { color: colors.textPrimary }]}>Communautés</Text>
          <TouchableOpacity
            onPress={() => { resetForm(); setCreateOpen(true); }}
            style={[S.createBtn, { backgroundColor: colors.primary }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Barre de recherche */}
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
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Onglets pills */}
        <View style={S.tabRow}>
          {(['discover', 'mine'] as const).map(t => {
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => { setTab(t); setLoading(true); }}
                activeOpacity={0.8}
                style={[
                  S.pill,
                  active
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
                ]}
              >
                <Text style={[S.pillText, { color: active ? '#fff' : colors.textTertiary }]}>
                  {t === 'discover' ? 'Découvrir' : 'Mes communautés'}
                </Text>
              </TouchableOpacity>
            );
          })}
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
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={S.overlay}
            activeOpacity={1}
            onPress={() => !creating && setCreateOpen(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
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
                  {/* Indicateur étapes */}
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
              >
                {step === 'info' ? renderStepInfo() : renderStepSettings()}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles écran principal
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1 },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 60,
  },

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
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  // Tabs pills
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: { fontSize: 13, fontWeight: '700' },

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
  coinsInput: {
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

// ─────────────────────────────────────────────────────────────────────────────
// Styles card communauté
// ─────────────────────────────────────────────────────────────────────────────
const CS = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },

  // Bannière
  bannerWrap: { height: 120, position: 'relative' },
  bannerImg: { width: '100%', height: '100%' },
  bannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },

  // Badges bannière
  badgeTopRight: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  coinsBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F59E0B50',
  },
  coinsNum: { color: '#F59E0B', fontSize: 11, fontWeight: '800' },

  // Avatar superposé
  avatarWrap: {
    position: 'absolute',
    bottom: -24,
    left: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  avatarGrad: {
    width: 56,
    height: 56,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 22 },
  verifiedDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1D9BF0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Corps
  body: { paddingHorizontal: 14, paddingTop: 32, paddingBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  creator: { fontSize: 11, marginBottom: 5 },
  desc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  statTxt: { fontSize: 11, fontWeight: '500' },
  dot: { width: 3, height: 3, borderRadius: 2, opacity: 0.5 },

  // Actions
  actRow: { flexDirection: 'row', gap: 8 },
  actPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 13,
  },
  actPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actGhost: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  joinWrap: { borderRadius: 13, overflow: 'hidden' },
  joinGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
  },
  joinText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  priceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priceChipNum: { color: '#F59E0B', fontWeight: '800', fontSize: 11 },

  pendingWrap: {
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    overflow: 'hidden',
  },
  pendingInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: '#F59E0B12',
  },
  pendingText: { color: '#F59E0B', fontWeight: '700', fontSize: 13 },
  pendingSep: { width: 1, height: 14, backgroundColor: '#F59E0B40' },
  pendingCancel: { color: '#F59E0B', fontWeight: '600', fontSize: 12 },
});
