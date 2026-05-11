import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, Modal,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Switch,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { authService } from '../../services/authService';
import { apiClient, Endpoints } from '../../api';
import type {
  CommunityData,
  CommunityMemberData,
  BlockedMemberData,
} from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { useWs } from '../../context/WebSocketContext';

type Nav = NativeStackNavigationProp<MainStackParamList>;
interface Props { route: { params: { communityId: string } }; }

type SettingsTab = 'info' | 'members' | 'security';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Modérateur',
  member: 'Membre',
};
const ROLE_COLORS: Record<string, string> = {
  admin: '#36D9A0',
  moderator: '#3B82F6',
  member: '#9390AB',
};

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
export const CommunityDetailScreen: React.FC<Props> = ({ route }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { communityId } = route.params;

  const [community,      setCommunity]      = useState<CommunityData | null>(null);
  const [members,        setMembers]        = useState<CommunityMemberData[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [joinStatus,     setJoinStatus]     = useState<'none' | 'pending' | 'member'>('none');
  const [myId,           setMyId]           = useState<string | null>(null);
  const [myRole,         setMyRole]         = useState<string | null>(null);
  const [myCoins,        setMyCoins]        = useState<number | null>(null);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [blockedMembers, setBlockedMembers] = useState<BlockedMemberData[]>([]);
  const [isGlobalAdmin,  setIsGlobalAdmin]  = useState(false);
  const [verifyLoading,  setVerifyLoading]  = useState(false);
  const [vrStatus,       setVrStatus]       = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [vrLoading,      setVrLoading]      = useState(false);
  const [vrModalOpen,    setVrModalOpen]    = useState(false);
  const [vrReason,       setVrReason]       = useState('');
  const [pendingCount,   setPendingCount]   = useState(0);
  const [viewerUrl,      setViewerUrl]      = useState<string | null>(null);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<SettingsTab>('info');
  const [saving,       setSaving]       = useState(false);
  const pickingRef  = useRef(false);
  const joiningRef  = useRef(false);

  // Onglet Info
  const [editName,   setEditName]   = useState('');
  const [editDesc,   setEditDesc]   = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editBanner, setEditBanner] = useState<string | null>(null);

  // Onglet Sécurité
  const [editPrivate,     setEditPrivate]     = useState(false);
  const [editApproval,    setEditApproval]    = useState(false);
  const [editMembersOnly, setEditMembersOnly] = useState(false);

  // Onglet Membres
  const [roleLoading,   setRoleLoading]   = useState<string | null>(null);
  const [memberSearch,  setMemberSearch]  = useState('');

  const isAdmin  = myRole === 'admin';
  const isMod    = myRole === 'moderator';

  const { addListener, removeListener } = useWs();
  const loadRef      = useRef<() => void>(() => {});
  const communityRef = useRef<CommunityData | null>(null);

  useEffect(() => { communityRef.current = community; }, [community]);

  useEffect(() => {
    const handler = (payload: { type: string; community_id?: string; community_name?: string }) => {
      if (payload.type === 'community_join_approved' && payload.community_id === communityId) {
        loadRef.current();
        nav.replace('CommunityChat', {
          communityId,
          communityName: payload.community_name ?? communityRef.current?.name ?? '',
        });
      }
      if (payload.type === 'community_join_request' && payload.community_id === communityId) {
        setPendingCount(prev => prev + 1);
      }
    };
    addListener(handler as any);
    return () => removeListener(handler as any);
  }, [addListener, removeListener, communityId, nav]);

  const load = useCallback(async () => {
    try {
      const [c, me, role] = await Promise.all([
        communityService.getById(communityId),
        authService.getMe(),
        communityService.getMyRole(communityId).catch(() => null),
      ]);
      setCommunity(c);
      const uid = String(me.id);
      setMyId(uid);
      setMyRole(role);
      const globalAdmin = (me as any).role === 'admin';
      setIsGlobalAdmin(globalAdmin);
      const js = (c as any).join_status ?? (role ? 'member' : 'none');
      setJoinStatus(js);
      const canSeeMembers = !c.is_private || js === 'member' || role === 'admin' || role === 'moderator' || globalAdmin;
      if (canSeeMembers) {
        communityService.getMembers(communityId)
          .then(list => setMembers(Array.isArray(list) ? list : []))
          .catch(() => {});
      } else {
        setMembers([]);
      }
      if ((c.entry_price_coins ?? 0) > 0 && js !== 'member') {
        apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance)
          .then(r => setMyCoins(r.data?.coins_balance ?? 0))
          .catch(() => setMyCoins(null));
      }
      if (role === 'admin' || role === 'moderator') {
        communityService.getBlockedMembers(communityId).then(setBlockedMembers).catch(() => {});
      }
      if (role === 'admin' || role === 'moderator' || globalAdmin) {
        communityService.getJoinRequests(communityId)
          .then(reqs => setPendingCount(Array.isArray(reqs) ? reqs.length : 0))
          .catch(() => {});
      }
      if (role === 'admin' || globalAdmin) {
        communityService.getVerificationRequest(communityId)
          .then(vr => setVrStatus(vr ? (vr.status as any) : 'none'))
          .catch(() => {});
      }
    } catch {}
    finally { setLoading(false); }
  }, [communityId]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { load(); }, [load]);

  function openSettings() {
    if (!community) return;
    setEditName(community.name);
    setEditDesc(community.description ?? '');
    setEditAvatar(null);
    setEditBanner(null);
    setEditPrivate(community.is_private);
    setEditApproval(!!(community as any).requires_approval);
    setEditMembersOnly(!!(community as any).members_only_chat);
    setSettingsTab('info');
    setSettingsOpen(true);
  }

  async function pickImage(target: 'avatar' | 'banner') {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 1 }, (resp) => {
      pickingRef.current = false;
      if (resp.didCancel || resp.errorCode || !resp.assets?.length) return;
      const uri = resp.assets[0].uri ?? null;
      if (target === 'avatar') setEditAvatar(uri);
      else setEditBanner(uri);
    });
  }

  async function uploadImage(uri: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', { uri, name: `community_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    try {
      const res = await apiClient.upload<{ uploaded: { url: string }[] }>(
        Endpoints.upload.images('communities'),
        fd,
      );
      return res.data?.uploaded?.[0]?.url ?? null;
    } catch { return null; }
  }

  async function handleSaveSettings() {
    if (settingsTab === 'info') {
      if (!editName.trim()) { Alert.alert('Erreur', 'Le nom est requis.'); return; }
      setSaving(true);
      try {
        const [avatarUrl, bannerUrl] = await Promise.all([
          editAvatar ? uploadImage(editAvatar) : Promise.resolve(null),
          editBanner ? uploadImage(editBanner) : Promise.resolve(null),
        ]);
        await apiClient.patch(`/api/v1/communities/${communityId}`, {
          name:        editName.trim(),
          description: editDesc.trim() || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          ...(bannerUrl ? { banner_url: bannerUrl } : {}),
        });
        setSettingsOpen(false);
        load();
      } catch (e: any) {
        Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder.');
      } finally { setSaving(false); }
    } else if (settingsTab === 'security') {
      setSaving(true);
      try {
        await apiClient.patch(`/api/v1/communities/${communityId}`, {
          is_private:        editPrivate,
          requires_approval: editApproval,
          members_only_chat: editMembersOnly,
        });
        setSettingsOpen(false);
        load();
      } catch (e: any) {
        Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder.');
      } finally { setSaving(false); }
    }
  }

  async function handleChangeRole(member: CommunityMemberData, newRole: 'admin' | 'moderator' | 'member') {
    if (member.user_id === myId && newRole !== 'admin') {
      Alert.alert(
        'Se rétrograder ?',
        'Tu vas perdre les droits d\'administration. Continuer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', style: 'destructive', onPress: () => doChangeRole(member.user_id, newRole) },
        ],
      );
      return;
    }
    if (newRole === 'admin' && member.user_id !== myId) {
      Alert.alert(
        'Nommer admin',
        `Donner les droits admin à ${member.display_name || member.username} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: () => doChangeRole(member.user_id, newRole) },
        ],
      );
      return;
    }
    doChangeRole(member.user_id, newRole);
  }

  async function doChangeRole(userId: string, role: string) {
    setRoleLoading(userId);
    try {
      await apiClient.put(`/api/v1/communities/${communityId}/members/${userId}/role`, { role });
      await load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de changer le rôle.');
    } finally { setRoleLoading(null); }
  }

  async function handleKick(member: CommunityMemberData) {
    Alert.alert(
      'Exclure',
      `Exclure ${member.display_name || member.username} de la communauté ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exclure',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/v1/communities/${communityId}/members/${member.user_id}`);
              load();
            } catch { Alert.alert('Erreur', 'Impossible d\'exclure ce membre.'); }
          },
        },
      ],
    );
  }

  async function handleBlock(member: CommunityMemberData) {
    if (member.user_id === myId) return;
    if (member.role === 'admin') {
      Alert.alert('Impossible', 'Vous ne pouvez pas bloquer un administrateur.');
      return;
    }
    Alert.alert(
      'Bloquer',
      `Bloquer ${member.display_name || member.username} ? Cette personne sera exclue et ne pourra plus rejoindre.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            try { await communityService.blockMember(communityId, member.user_id); load(); }
            catch { Alert.alert('Erreur', 'Impossible de bloquer.'); }
          },
        },
      ],
    );
  }

  function handleUnblock(b: BlockedMemberData) {
    Alert.alert('Débloquer', `Débloquer ${b.display_name || b.username} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Débloquer',
        onPress: async () => {
          try { await communityService.unblockMember(communityId, b.user_id); load(); }
          catch { Alert.alert('Erreur', 'Impossible de débloquer.'); }
        },
      },
    ]);
  }

  const handleJoin = async () => {
    if (!community) return;
    if (joiningRef.current || actionLoading || joinStatus !== 'none') return;
    const price         = community.entry_price_coins ?? 0;
    const needsApproval = community.is_private || community.requires_approval;
    const priceLabel    = (n: number) => `${n} coin${n > 1 ? 's' : ''}`;

    if (price > 0 && myCoins !== null && myCoins < price) {
      const manque = price - myCoins;
      Alert.alert(
        'Solde insuffisant',
        `Vous avez ${myCoins} coin${myCoins > 1 ? 's' : ''} mais il en faut ${price}.\nIl vous manque ${priceLabel(manque)}.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Recharger', onPress: () => nav.navigate('BuyCoins') },
        ],
      );
      return;
    }

    const doJoin = async () => {
      if (joiningRef.current) return;
      joiningRef.current = true;
      setActionLoading(true);
      try {
        const res = await communityService.join(communityId);
        if (res.pending) {
          setJoinStatus('pending');
          if (myCoins !== null) setMyCoins(prev => (prev ?? 0) - price);
          const debitLine = price > 0
            ? `\n\n${price} coin${price > 1 ? 's' : ''} ont été déduits de votre solde et enregistrés dans votre historique.`
            : '';
          Alert.alert(
            price > 0 ? 'Paiement effectué — Demande envoyée' : 'Demande envoyée',
            needsApproval
              ? `Votre demande pour rejoindre "${community.name}" est en cours d'examen.${debitLine}\n\nVous serez redirigé automatiquement dès l'acceptation.`
              : `Votre demande est en attente.${debitLine}`,
          );
          load();
        } else if (res.joined) {
          setJoinStatus('member');
          if (price > 0 && myCoins !== null) setMyCoins(prev => (prev ?? 0) - price);
          load();
          nav.replace('CommunityChat', { communityId, communityName: community.name });
        }
      } catch (e: any) {
        const detail = (e?.response?.data?.detail ?? '').toLowerCase();
        if (detail.includes('insufficient') || detail.includes('coins')) {
          const walletRes = await apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance).catch(() => null);
          const realBalance = walletRes?.data?.coins_balance ?? 0;
          setMyCoins(realBalance);
          Alert.alert(
            'Solde insuffisant',
            `Votre solde est de ${realBalance} coin${realBalance !== 1 ? 's' : ''}. Il vous manque ${priceLabel(price - realBalance)}.`,
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Recharger', onPress: () => nav.navigate('BuyCoins') },
            ],
          );
        } else if (detail.includes('blocked')) {
          Alert.alert('Accès refusé', 'Vous avez été bloqué de cette communauté.');
        } else {
          Alert.alert('Erreur', 'Impossible de rejoindre cette communauté.');
        }
      } finally {
        joiningRef.current = false;
        setActionLoading(false);
      }
    };

    if (price > 0) {
      const soldeApres = myCoins !== null ? myCoins - price : null;
      const soldeInfo  = myCoins !== null
        ? `\nVotre solde : ${myCoins} coin${myCoins !== 1 ? 's' : ''} → ${soldeApres} coin${(soldeApres ?? 0) !== 1 ? 's' : ''} après déduction.`
        : '';
      const approvalNote = needsApproval
        ? '\n\nCes coins seront remboursés automatiquement en cas de refus de votre demande.'
        : '';
      const debitNote = needsApproval
        ? `${price} coin${price > 1 ? 's' : ''} seront immédiatement déduits de votre solde et consignés dans votre historique de transactions.`
        : `${price} coin${price > 1 ? 's' : ''} seront déduits de votre solde.`;
      Alert.alert(
        `Adhésion payante — ${price} coins`,
        `${debitNote}${soldeInfo}${approvalNote}`,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => { joiningRef.current = false; } },
          { text: `Confirmer — ${priceLabel(price)}`, onPress: doJoin },
        ],
      );
    } else {
      doJoin();
    }
  };

  const handleLeave = () => {
    if (isAdmin) {
      Alert.alert('Impossible', 'L\'admin ne peut pas quitter sa communauté. Transférez les droits d\'abord.');
      return;
    }
    Alert.alert('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try { await communityService.leave(communityId); load(); }
          catch { Alert.alert('Erreur', 'Impossible de quitter.'); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  async function handleDeleteCommunity() {
    Alert.alert(
      'Supprimer la communauté',
      'Action irréversible. Tous les membres et messages seront perdus.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/v1/communities/${communityId}`);
              nav.goBack();
            } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
          },
        },
      ],
    );
  }

  function handleRequestVerification() {
    setVrReason('');
    setVrModalOpen(true);
  }

  async function handleSubmitVerificationRequest() {
    setVrLoading(true);
    try {
      await communityService.requestVerification(communityId, vrReason.trim() || undefined);
      setVrStatus('pending');
      setVrModalOpen(false);
      Alert.alert('Demande envoyée', 'Les administrateurs vont examiner votre demande.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d\'envoyer la demande.');
    } finally { setVrLoading(false); }
  }

  async function handleToggleVerify() {
    if (!community) return;
    const willVerify = !community.is_verified;
    Alert.alert(
      willVerify ? 'Vérifier la communauté' : 'Retirer la vérification',
      willVerify
        ? `Ajouter le badge officiel à "${community.name}" ?`
        : `Retirer le badge de "${community.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: willVerify ? 'Vérifier' : 'Retirer',
          onPress: async () => {
            setVerifyLoading(true);
            try {
              const updated = willVerify
                ? await communityService.verify(communityId)
                : await communityService.unverify(communityId);
              setCommunity(updated);
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible de modifier.');
            } finally { setVerifyLoading(false); }
          },
        },
      ],
    );
  }

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!community) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="alert-circle" size={40} color={colors.textTertiary} />
        <Text style={[{ color: colors.textTertiary, marginTop: 12, fontSize: 15 }]}>
          Communauté introuvable
        </Text>
      </View>
    );
  }

  const filteredMembers = members.filter(m => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      (m.display_name || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q)
    );
  });

  const previewMembers = members.slice(0, 5);
  const isLocked = community.is_private && joinStatus !== 'member' && !isAdmin && !isMod && !isGlobalAdmin;

  // ── Onglet Info (settings) ───────────────────────────────────────────────────
  const renderTabInfo = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.sheetBody}>
        {/* Bannière */}
        <TouchableOpacity onPress={() => pickImage('banner')} activeOpacity={0.85}>
          <View style={[s.editBanner, { backgroundColor: colors.backgroundSecondary }]}>
            {editBanner ? (
              <Image source={{ uri: editBanner }} style={s.editBannerImg} resizeMode="cover" />
            ) : community.banner_url ? (
              <Image source={{ uri: community.banner_url }} style={s.editBannerImg} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#7B3FF220', '#E0389A20']} style={s.editBannerImg}>
                <Icon name="image" size={22} color={colors.textTertiary} />
              </LinearGradient>
            )}
            <View style={s.editCamBadge}>
              <Icon name="camera" size={12} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Bannière</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity onPress={() => pickImage('avatar')} style={s.editAvatarWrap} activeOpacity={0.85}>
          {editAvatar ? (
            <Image source={{ uri: editAvatar }} style={[s.editAvatar, { borderColor: colors.surface }]} />
          ) : community.avatar_url ? (
            <Image source={{ uri: community.avatar_url }} style={[s.editAvatar, { borderColor: colors.surface }]} />
          ) : (
            <LinearGradient
              colors={['#7B3FF2', '#E0389A']}
              style={[s.editAvatar, { borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}
            >
              <Icon name="users" size={22} color="#fff" />
            </LinearGradient>
          )}
          <View style={s.editAvatarCam}>
            <Icon name="camera" size={11} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Nom */}
        <View style={{ marginTop: 16 }}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>NOM</Text>
          <View style={[s.fieldBox, { borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}>
            <TextInput
              style={[s.fieldInput, { color: colors.textPrimary }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nom de la communauté"
              placeholderTextColor={colors.textTertiary}
              maxLength={60}
            />
          </View>
        </View>

        {/* Description */}
        <View style={{ marginTop: 14, marginBottom: 32 }}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>DESCRIPTION</Text>
          <View style={[s.fieldBox, {
            borderColor: colors.divider,
            backgroundColor: colors.backgroundSecondary,
            minHeight: 80,
          }]}>
            <TextInput
              style={[s.fieldInput, { color: colors.textPrimary, textAlignVertical: 'top' }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Description (optionnel)"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={300}
            />
          </View>
          <Text style={[{ fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 4 }]}>
            {editDesc.length}/300
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  // ── Onglet Membres (settings) ────────────────────────────────────────────────
  const renderTabMembers = () => (
    <View style={{ flex: 1 }}>
      <View style={[s.memberSearchBar, {
        backgroundColor: colors.backgroundSecondary,
        borderColor: colors.divider,
      }]}>
        <Icon name="search" size={14} color={colors.textTertiary} />
        <TextInput
          style={[s.memberSearchInput, { color: colors.textPrimary }]}
          placeholder="Rechercher un membre…"
          placeholderTextColor={colors.textTertiary}
          value={memberSearch}
          onChangeText={setMemberSearch}
        />
        {memberSearch.length > 0 && (
          <TouchableOpacity onPress={() => setMemberSearch('')}>
            <Icon name="x" size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.memberCountLbl, { color: colors.textTertiary }]}>
          {filteredMembers.length} membre{filteredMembers.length !== 1 ? 's' : ''}
        </Text>
        {filteredMembers.map(member => {
          const isSelf    = member.user_id === myId;
          const isLoading = roleLoading === member.user_id;
          return (
            <View key={member.id} style={[s.adminMemberRow, { borderBottomColor: colors.divider }]}>
              <TouchableOpacity onPress={() => nav.navigate('UserProfile', { userId: member.user_id })}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, {
                    backgroundColor: colors.primary + '22',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }]}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>
                      {(member.display_name || member.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[s.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {member.display_name || member.username}{isSelf ? ' (toi)' : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <View style={[s.roleDot, { backgroundColor: ROLE_COLORS[member.role as string] ?? '#9390AB' }]} />
                  <Text style={[s.memberSub, { color: colors.textTertiary }]}>
                    {ROLE_LABELS[member.role as string] ?? member.role}
                  </Text>
                </View>
              </View>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
              ) : isAdmin && !isSelf ? (
                <View style={s.roleActions}>
                  {member.role !== 'admin' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: '#36D9A015', borderColor: '#36D9A040' }]}
                      onPress={() => handleChangeRole(member, 'admin')}
                    >
                      <Icon name="shield" size={12} color="#36D9A0" />
                      <Text style={[s.roleBtnTxt, { color: '#36D9A0' }]}>Admin</Text>
                    </TouchableOpacity>
                  )}
                  {member.role !== 'moderator' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: '#3B82F615', borderColor: '#3B82F640' }]}
                      onPress={() => handleChangeRole(member, 'moderator')}
                    >
                      <Icon name="star" size={12} color="#3B82F6" />
                      <Text style={[s.roleBtnTxt, { color: '#3B82F6' }]}>Mod</Text>
                    </TouchableOpacity>
                  )}
                  {member.role !== 'member' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                      onPress={() => handleChangeRole(member, 'member')}
                    >
                      <Icon name="user" size={12} color={colors.textTertiary} />
                      <Text style={[s.roleBtnTxt, { color: colors.textTertiary }]}>Membre</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleKick(member)}
                  >
                    <Icon name="user-x" size={12} color="#EF4444" />
                    <Text style={[s.roleBtnTxt, { color: '#EF4444' }]}>Exclure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleBlock(member)}
                  >
                    <Icon name="slash" size={12} color="#EF4444" />
                    <Text style={[s.roleBtnTxt, { color: '#EF4444' }]}>Bloquer</Text>
                  </TouchableOpacity>
                </View>
              ) : isMod && !isSelf && member.role === 'member' ? (
                <View style={s.roleActions}>
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleKick(member)}
                  >
                    <Icon name="user-x" size={12} color="#EF4444" />
                    <Text style={[s.roleBtnTxt, { color: '#EF4444' }]}>Exclure</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Membres bloqués */}
        {isAdmin && blockedMembers.length > 0 && (
          <>
            <Text style={[s.memberCountLbl, { color: '#EF4444', marginTop: 20 }]}>
              {blockedMembers.length} bloqué{blockedMembers.length !== 1 ? 's' : ''}
            </Text>
            {blockedMembers.map(b => (
              <View key={b.id} style={[s.adminMemberRow, { borderBottomColor: colors.divider }]}>
                {b.avatar_url ? (
                  <Image source={{ uri: b.avatar_url }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, {
                    backgroundColor: '#EF444420',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }]}>
                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>
                      {(b.display_name || b.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, { color: colors.textPrimary }]}>
                    {b.display_name || b.username}
                  </Text>
                  <Text style={[s.memberSub, { color: '#EF4444' }]}>Bloqué</Text>
                </View>
                <TouchableOpacity
                  style={[s.roleBtn, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}
                  onPress={() => handleUnblock(b)}
                >
                  <Icon name="user-check" size={12} color="#10B981" />
                  <Text style={[s.roleBtnTxt, { color: '#10B981' }]}>Débloquer</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );

  // ── Onglet Sécurité (settings) ───────────────────────────────────────────────
  const renderTabSecurity = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.sheetBody}>
        <Text style={[s.secSection, { color: colors.textTertiary }]}>VISIBILITÉ</Text>
        <View style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={[s.secIcon, { backgroundColor: editPrivate ? '#E0389A20' : '#3B82F620' }]}>
            <Icon name={editPrivate ? 'lock' : 'globe'} size={18} color={editPrivate ? '#E0389A' : '#3B82F6'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>
              {editPrivate ? 'Communauté privée' : 'Communauté publique'}
            </Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              {editPrivate
                ? 'Seuls les membres invités peuvent rejoindre'
                : 'Tout le monde peut découvrir et rejoindre'}
            </Text>
          </View>
          <Switch
            value={editPrivate}
            onValueChange={setEditPrivate}
            trackColor={{ false: colors.divider, true: '#E0389A55' }}
            thumbColor={editPrivate ? '#E0389A' : colors.textTertiary}
          />
        </View>

        <Text style={[s.secSection, { color: colors.textTertiary, marginTop: 20 }]}>ADHÉSION</Text>
        <View style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={[s.secIcon, { backgroundColor: '#F59E0B20' }]}>
            <Icon name="user-check" size={18} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Approbation requise</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              Les nouvelles demandes nécessitent une approbation admin
            </Text>
          </View>
          <Switch
            value={editApproval}
            onValueChange={setEditApproval}
            trackColor={{ false: colors.divider, true: '#F59E0B55' }}
            thumbColor={editApproval ? '#F59E0B' : colors.textTertiary}
          />
        </View>

        <Text style={[s.secSection, { color: colors.textTertiary, marginTop: 20 }]}>CHAT</Text>
        <View style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={[s.secIcon, { backgroundColor: '#7B3FF220' }]}>
            <Icon name="message-circle" size={18} color="#7B3FF2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Chat membres uniquement</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              Seuls les membres peuvent envoyer des messages dans le groupe
            </Text>
          </View>
          <Switch
            value={editMembersOnly}
            onValueChange={setEditMembersOnly}
            trackColor={{ false: colors.divider, true: '#7B3FF255' }}
            thumbColor={editMembersOnly ? '#7B3FF2' : colors.textTertiary}
          />
        </View>

        <Text style={[s.secSection, { color: '#EF4444', marginTop: 28 }]}>ZONE DE DANGER</Text>
        <TouchableOpacity
          onPress={handleDeleteCommunity}
          style={[s.secRow, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}
          activeOpacity={0.7}
        >
          <View style={[s.secIcon, { backgroundColor: '#EF444420' }]}>
            <Icon name="trash-2" size={18} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: '#EF4444' }]}>Supprimer la communauté</Text>
            <Text style={[s.secDesc, { color: '#EF444499' }]}>
              Action irréversible — toutes les données seront perdues
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color="#EF444460" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ── Header fixe ── */}
      <View style={[s.header, {
        paddingTop: insets.top + 8,
        backgroundColor: colors.surface,
        borderBottomColor: colors.divider,
      }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.headerIcon}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {community.name}
        </Text>
        {(isAdmin || isMod) ? (
          <TouchableOpacity onPress={openSettings} style={s.headerIcon}>
            <Icon name="settings" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* ── Contenu principal ── */}
      <FlatList
        data={isLocked ? [] : previewMembers}
        keyExtractor={m => m.id}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* ── Bannière 160px ── */}
            <View style={s.bannerArea}>
              <TouchableOpacity
                activeOpacity={community.banner_url ? 0.85 : 1}
                onPress={() => community.banner_url && setViewerUrl(community.banner_url)}
              >
                {community.banner_url ? (
                  <Image source={{ uri: community.banner_url }} style={s.banner} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={['#7B3FF2', '#9B65F5', '#E0389A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.banner}
                  />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.45)']}
                  style={s.bannerGrad}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Avatar 72px centré en bas de la bannière */}
              <View style={s.avatarFrame}>
                <TouchableOpacity
                  activeOpacity={community.avatar_url ? 0.85 : 1}
                  onPress={() => community.avatar_url && setViewerUrl(community.avatar_url)}
                  style={[s.avatarBorder, { borderColor: colors.background }]}
                >
                  {community.avatar_url ? (
                    <Image source={{ uri: community.avatar_url }} style={s.bigAvatar} />
                  ) : (
                    <LinearGradient
                      colors={gradientFor(community.name)}
                      style={s.bigAvatar}
                    >
                      <Icon name="users" size={32} color="#fff" />
                    </LinearGradient>
                  )}
                </TouchableOpacity>
                {community.is_verified && (
                  <View style={s.verifiedBadge}>
                    <Icon name="check" size={10} color="#fff" />
                  </View>
                )}
              </View>
            </View>

            {/* ── Infos ── */}
            <View style={s.infoBlock}>
              {/* Nom + badge vérifié */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Text style={[s.communityName, { color: colors.textPrimary }]}>
                  {community.name}
                </Text>
              </View>

              {/* Description */}
              {community.description ? (
                <Text style={[s.communityDesc, { color: colors.textSecondary }]} numberOfLines={3}>
                  {community.description}
                </Text>
              ) : null}

              {/* Stats row */}
              <View style={s.statsRow}>
                <Text style={[s.statItem, { color: colors.textSecondary }]}>
                  {fmtCount(community.members_count ?? 0)} membres
                </Text>
                <View style={[s.statSep, { backgroundColor: colors.divider }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon
                    name={community.is_private ? 'lock' : 'globe'}
                    size={12}
                    color={colors.textTertiary}
                  />
                  <Text style={[s.statItem, { color: colors.textTertiary }]}>
                    {community.is_private ? 'Privée' : 'Publique'}
                  </Text>
                </View>
                <View style={[s.statSep, { backgroundColor: colors.divider }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={s.activeDot} />
                  <Text style={[s.statItem, { color: '#36D9A0' }]}>Actif</Text>
                </View>
              </View>

              {/* Badge de rôle */}
              {myRole && (
                <View style={s.roleRow}>
                  <View style={[s.roleChip, { backgroundColor: (ROLE_COLORS[myRole] ?? '#9390AB') + '20' }]}>
                    <Icon
                      name={isAdmin ? 'shield' : isMod ? 'star' : 'user'}
                      size={12}
                      color={ROLE_COLORS[myRole] ?? '#9390AB'}
                    />
                    <Text style={[s.roleChipText, { color: ROLE_COLORS[myRole] ?? '#9390AB' }]}>
                      {ROLE_LABELS[myRole] ?? myRole}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Boutons action ── */}
              <View style={s.actionsRow}>
                {joinStatus === 'member' ? (
                  <>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                      onPress={() => (nav as any).navigate('CommunityChat', { communityId, communityName: community.name })}
                      activeOpacity={0.85}
                    >
                      <Icon name="message-circle" size={16} color="#fff" />
                      <Text style={[s.actionTxt, { color: '#fff' }]}>Discussion</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, {
                        borderWidth: 1.5,
                        borderColor: colors.primary,
                        flex: 0,
                        paddingHorizontal: 16,
                      }]}
                      onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name })}
                      activeOpacity={0.8}
                    >
                      <Icon name="users" size={15} color={colors.primary} />
                      <Text style={[s.actionTxt, { color: colors.primary }]}>Membres</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, {
                        borderWidth: 1,
                        borderColor: colors.divider,
                        flex: 0,
                        paddingHorizontal: 14,
                      }]}
                      onPress={handleLeave}
                      disabled={actionLoading}
                      activeOpacity={0.7}
                    >
                      <Icon name="log-out" size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                ) : joinStatus === 'pending' ? (
                  <TouchableOpacity
                    style={[s.actionBtn, {
                      flex: 1,
                      backgroundColor: '#F59E0B15',
                      borderColor: '#F59E0B',
                      borderWidth: 1.5,
                    }]}
                    onPress={() => {
                      Alert.alert(
                        'Demande en attente',
                        'Votre demande est en cours d\'examen. Vous serez automatiquement redirigé vers le chat dès qu\'elle sera acceptée.',
                        [
                          {
                            text: 'Annuler la demande',
                            style: 'destructive',
                            onPress: async () => {
                              try { await communityService.cancelJoinRequest(communityId); load(); }
                              catch { Alert.alert('Erreur', 'Impossible d\'annuler la demande.'); }
                            },
                          },
                          { text: 'Fermer', style: 'cancel' },
                        ],
                      );
                    }}
                    disabled={actionLoading}
                    activeOpacity={0.85}
                  >
                    <Icon name="clock" size={15} color="#F59E0B" />
                    <Text style={[s.actionTxt, { color: '#F59E0B' }]}>En attente d'approbation</Text>
                    <Icon name="x" size={13} color="#F59E0B80" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[s.actionBtn, { flex: 1, overflow: 'hidden', padding: 0 }]}
                    onPress={handleJoin}
                    disabled={actionLoading}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#7B3FF2', '#E0389A']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 }}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Icon
                            name={(community.is_private || community.requires_approval) ? 'send' : 'user-plus'}
                            size={15}
                            color="#fff"
                          />
                          <Text style={[s.actionTxt, { color: '#fff' }]}>
                            {(community.is_private || community.requires_approval) ? 'Demander à rejoindre' : 'Rejoindre'}
                          </Text>
                          {(community.entry_price_coins ?? 0) > 0 && (
                            <View style={s.coinPill}>
                              <Text style={s.coinPillTxt}>{community.entry_price_coins}</Text>
                              <Icon name="zap" size={10} color="#F59E0B" />
                            </View>
                          )}
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Barre wallet si accès payant ── */}
              {joinStatus === 'none' && (community.entry_price_coins ?? 0) > 0 && (() => {
                const price     = community.entry_price_coins!;
                const isLow     = myCoins !== null && myCoins < price;
                const hasEnough = myCoins !== null && myCoins >= price;
                return (
                  <View style={[s.walletBar, {
                    borderColor: isLow ? '#EF444440' : '#F59E0B40',
                    backgroundColor: isLow ? '#EF444408' : '#F59E0B08',
                  }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                      <Icon name="zap" size={14} color={isLow ? '#EF4444' : '#F59E0B'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.walletTitle, { color: isLow ? '#EF4444' : '#F59E0B' }]}>
                          {price} coin{price > 1 ? 's' : ''} requis pour accéder
                        </Text>
                        {myCoins !== null && (
                          <Text style={[s.walletSub, { color: isLow ? '#EF4444' : colors.textTertiary }]}>
                            {isLow
                              ? `Solde insuffisant — vous avez ${myCoins} coin${myCoins !== 1 ? 's' : ''} (manque ${price - myCoins})`
                              : `Votre solde : ${myCoins} coin${myCoins !== 1 ? 's' : ''}`}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isLow && (
                      <TouchableOpacity
                        onPress={() => nav.navigate('BuyCoins')}
                        style={s.rechargeBtn}
                      >
                        <Text style={s.rechargeTxt}>Recharger</Text>
                      </TouchableOpacity>
                    )}
                    {hasEnough && <Icon name="check-circle" size={16} color="#10B981" />}
                  </View>
                );
              })()}

              {/* Message approbation */}
              {joinStatus === 'none' && (community.is_private || community.requires_approval) && (
                <View style={s.infoBar}>
                  <Icon name="lock" size={12} color={colors.textTertiary} />
                  <Text style={[s.infoBarTxt, { color: colors.textTertiary }]}>
                    {community.is_private
                      ? 'Communauté privée — accès sur approbation de l\'admin'
                      : 'Approbation requise — l\'admin examine chaque demande'}
                  </Text>
                </View>
              )}

              {/* Admin global — boutons vérification */}
              {isGlobalAdmin && (
                <>
                  <TouchableOpacity
                    style={[s.vrBtn, { backgroundColor: '#7B3FF215', borderColor: '#7B3FF240' }]}
                    onPress={() => (nav as any).navigate('AdminVerification')}
                    activeOpacity={0.7}
                  >
                    <Icon name="list" size={14} color="#7B3FF2" />
                    <Text style={[s.vrBtnTxt, { color: '#7B3FF2' }]}>
                      Gérer les demandes de vérification
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.vrBtn, {
                      backgroundColor: community.is_verified ? '#EF444415' : '#1D9BF015',
                      borderColor: community.is_verified ? '#EF444440' : '#1D9BF040',
                    }]}
                    onPress={handleToggleVerify}
                    disabled={verifyLoading}
                    activeOpacity={0.7}
                  >
                    {verifyLoading ? (
                      <ActivityIndicator size="small" color={community.is_verified ? '#EF4444' : '#1D9BF0'} />
                    ) : (
                      <>
                        <View style={[s.verifiedBadgeMini, {
                          backgroundColor: community.is_verified ? '#EF4444' : '#1D9BF0',
                        }]}>
                          <Icon name="check" size={9} color="#fff" />
                        </View>
                        <Text style={[s.vrBtnTxt, {
                          color: community.is_verified ? '#EF4444' : '#1D9BF0',
                        }]}>
                          {community.is_verified ? 'Retirer la vérification' : 'Vérifier la communauté'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Admin communauté — demande de vérification */}
              {isAdmin && !isGlobalAdmin && !community.is_verified && (
                <TouchableOpacity
                  style={[s.vrBtn, {
                    backgroundColor: vrStatus === 'pending'  ? '#F59E0B15'
                                   : vrStatus === 'rejected' ? '#EF444415' : '#1D9BF015',
                    borderColor:     vrStatus === 'pending'  ? '#F59E0B40'
                                   : vrStatus === 'rejected' ? '#EF444440' : '#1D9BF040',
                  }]}
                  onPress={vrStatus === 'none' || vrStatus === 'rejected' ? handleRequestVerification : undefined}
                  disabled={vrLoading || vrStatus === 'pending'}
                  activeOpacity={vrStatus === 'pending' ? 1 : 0.7}
                >
                  {vrLoading ? (
                    <ActivityIndicator size="small" color="#1D9BF0" />
                  ) : (
                    <>
                      <Icon
                        name={vrStatus === 'pending' ? 'clock' : vrStatus === 'rejected' ? 'x-circle' : 'shield'}
                        size={14}
                        color={vrStatus === 'pending' ? '#F59E0B' : vrStatus === 'rejected' ? '#EF4444' : '#1D9BF0'}
                      />
                      <Text style={[s.vrBtnTxt, {
                        color: vrStatus === 'pending'  ? '#F59E0B'
                             : vrStatus === 'rejected' ? '#EF4444' : '#1D9BF0',
                      }]}>
                        {vrStatus === 'pending'  ? 'Demande en cours d\'examen…'
                        : vrStatus === 'rejected' ? 'Refusée — Renvoyer une demande'
                        : 'Demander la vérification officielle'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* ── Grille navigation + section membres (membres seulement pour communautés privées) ── */}
              {isLocked ? (
                <View style={[s.lockedBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Icon name="lock" size={28} color={colors.textTertiary} />
                  <Text style={[s.lockedTitle, { color: colors.textPrimary }]}>
                    Contenu réservé aux membres
                  </Text>
                  <Text style={[s.lockedSub, { color: colors.textTertiary }]}>
                    Rejoignez cette communauté pour accéder aux événements, au classement, à l'annuaire des membres et aux statistiques.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={s.navGrid}>
                    <TouchableOpacity
                      style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => (nav as any).navigate('CommunityEvents', { communityId, communityName: community.name })}
                      activeOpacity={0.75}
                    >
                      <View style={[s.navIcon, { backgroundColor: '#FF7A2F20' }]}>
                        <Icon name="calendar" size={20} color="#FF7A2F" />
                      </View>
                      <Text style={[s.navLabel, { color: colors.textPrimary }]}>Événements</Text>
                      <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => (nav as any).navigate('CommunityLeaderboard', { communityId, communityName: community.name })}
                      activeOpacity={0.75}
                    >
                      <View style={[s.navIcon, { backgroundColor: '#F59E0B20' }]}>
                        <Icon name="award" size={20} color="#F59E0B" />
                      </View>
                      <Text style={[s.navLabel, { color: colors.textPrimary }]}>Classement</Text>
                      <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name })}
                      activeOpacity={0.75}
                    >
                      <View style={[s.navIcon, { backgroundColor: '#3B82F620' }]}>
                        <Icon name="users" size={20} color="#3B82F6" />
                      </View>
                      <Text style={[s.navLabel, { color: colors.textPrimary }]}>Annuaire</Text>
                      <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {(isAdmin || isMod) && (
                      <TouchableOpacity
                        style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                        onPress={() => (nav as any).navigate('CommunityStats', { communityId, communityName: community.name })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.navIcon, { backgroundColor: '#36D9A020' }]}>
                          <Icon name="bar-chart-2" size={20} color="#36D9A0" />
                        </View>
                        <Text style={[s.navLabel, { color: colors.textPrimary }]}>Statistiques</Text>
                        <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                    {(isAdmin || isMod || isGlobalAdmin) && (
                      <TouchableOpacity
                        style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                        onPress={() => (nav as any).navigate('CommunityJoinRequests', { communityId, communityName: community.name })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.navIcon, { backgroundColor: '#7B3FF220' }]}>
                          <Icon name="user-check" size={20} color="#7B3FF2" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.navLabel, { color: colors.textPrimary }]}>Demandes</Text>
                        </View>
                        {pendingCount > 0 && (
                          <View style={[s.pendingBadge, { backgroundColor: '#7B3FF2' }]}>
                            <Text style={s.pendingBadgeTxt}>{pendingCount}</Text>
                          </View>
                        )}
                        <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* ── Section membres rapide ── */}
                  <View style={s.membersSectionHeader}>
                    <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>
                      MEMBRES ({fmtCount(community.members_count ?? 0)})
                    </Text>
                    {members.length > 5 && (
                      <TouchableOpacity
                        onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name })}
                      >
                        <Text style={[s.seeAll, { color: colors.primary }]}>Voir tous</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.memberRow, { borderBottomColor: colors.divider }]}
            onPress={() => nav.navigate('UserProfile', { userId: item.user_id })}
            activeOpacity={0.7}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={s.memberAvatarSm} />
            ) : (
              <View style={[s.memberAvatarSm, {
                backgroundColor: colors.primary + '22',
                alignItems: 'center',
                justifyContent: 'center',
              }]}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                  {(item.display_name || item.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.textPrimary }]}>
                {item.display_name || item.username}
              </Text>
              <Text style={[s.memberSub, { color: colors.textTertiary }]}>@{item.username}</Text>
            </View>
            {item.role === 'admin' && (
              <View style={[s.rolePill, { backgroundColor: '#36D9A022' }]}>
                <Text style={{ color: '#36D9A0', fontSize: 10, fontWeight: '700' }}>ADMIN</Text>
              </View>
            )}
            {item.role === 'moderator' && (
              <View style={[s.rolePill, { backgroundColor: '#3B82F622' }]}>
                <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700' }}>MOD</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          members.length > 5 ? (
            <TouchableOpacity
              style={[s.seeAllRow, { borderTopColor: colors.divider }]}
              onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name })}
              activeOpacity={0.7}
            >
              <Text style={[s.seeAllTxt, { color: colors.primary }]}>
                Voir tous les {fmtCount(community.members_count ?? 0)} membres
              </Text>
              <Icon name="chevron-right" size={15} color={colors.primary} />
            </TouchableOpacity>
          ) : null
        }
      />

      {/* ── Viewer image plein écran ── */}
      <Modal
        visible={!!viewerUrl}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={s.viewer}>
          <StatusBar hidden />
          <TouchableOpacity
            style={s.viewerClose}
            onPress={() => setViewerUrl(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={s.viewerCloseInner}>
              <Icon name="x" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={s.viewerImg} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* ── Modal demande de vérification ── */}
      <Modal
        visible={vrModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !vrLoading && setVrModalOpen(false)}
      >
        <View style={s.modalRoot}>
          <TouchableOpacity
            style={s.modalBg}
            activeOpacity={1}
            onPress={() => !vrLoading && setVrModalOpen(false)}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={[s.vrBox, { backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1D9BF020', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="shield" size={18} color="#1D9BF0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }]}>
                    Demander la vérification
                  </Text>
                  <Text style={[{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }]}>
                    {community.name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setVrModalOpen(false)} disabled={vrLoading}>
                  <Icon name="x" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <Text style={[s.fieldLabel, { color: colors.textTertiary, marginBottom: 8 }]}>
                POURQUOI CETTE COMMUNAUTÉ MÉRITE-T-ELLE CE BADGE ? (optionnel)
              </Text>
              <TextInput
                style={[s.fieldInput, {
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundSecondary,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  minHeight: 72,
                  textAlignVertical: 'top',
                }]}
                placeholder="Ex : communauté active, contenu de qualité…"
                placeholderTextColor={colors.textTertiary}
                value={vrReason}
                onChangeText={setVrReason}
                multiline
                maxLength={300}
                autoFocus
              />
              <Text style={[{ fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 4 }]}>
                {vrReason.length}/300
              </Text>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#1D9BF0', marginTop: 14 }]}
                onPress={handleSubmitVerificationRequest}
                disabled={vrLoading}
                activeOpacity={0.8}
              >
                {vrLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name="send" size={16} color="#fff" />
                    <Text style={[s.actionTxt, { color: '#fff' }]}>Envoyer la demande</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Panel Paramètres ── */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setSettingsOpen(false)}
      >
        <View style={s.modalRoot}>
          <TouchableOpacity
            style={s.modalBg}
            activeOpacity={1}
            onPress={() => !saving && setSettingsOpen(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
            <View style={[s.settingsSheet, { backgroundColor: colors.background }]}>
              {/* Handle */}
              <View style={s.handleWrap}>
                <View style={[s.handle, { backgroundColor: colors.divider }]} />
              </View>

              {/* Header settings */}
              <View style={[s.settingsHeader, { borderBottomColor: colors.divider }]}>
                <TouchableOpacity onPress={() => setSettingsOpen(false)} style={s.settingsNavBtn}>
                  <Icon name="x" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[s.settingsTitle, { color: colors.textPrimary }]}>
                  Gérer la communauté
                </Text>
                {settingsTab !== 'members' ? (
                  <TouchableOpacity
                    onPress={handleSaveSettings}
                    disabled={saving}
                    style={[s.settingsNavBtn, { alignItems: 'flex-end' }]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                        Enregistrer
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={s.settingsNavBtn} />
                )}
              </View>

              {/* Onglets */}
              <View style={[s.tabBar, { borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
                {(['info', 'members', 'security'] as SettingsTab[]).map(tab => {
                  const label  = tab === 'info' ? 'Info' : tab === 'members' ? 'Membres' : 'Sécurité';
                  const icon   = tab === 'info' ? 'edit-2' : tab === 'members' ? 'users' : 'shield';
                  const active = settingsTab === tab;
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[s.tabBtn, active && {
                        borderBottomWidth: 2,
                        borderBottomColor: colors.primary,
                      }]}
                      onPress={() => setSettingsTab(tab)}
                    >
                      <Icon name={icon} size={14} color={active ? colors.primary : colors.textTertiary} />
                      <Text style={[s.tabLabel, { color: active ? colors.primary : colors.textTertiary }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Contenu */}
              <View style={{ flex: 1 }}>
                {settingsTab === 'info'     && renderTabInfo()}
                {settingsTab === 'members'  && renderTabMembers()}
                {settingsTab === 'security' && renderTabSecurity()}
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },

  // Bannière + avatar
  bannerArea: { position: 'relative', marginBottom: 44 },
  banner: { width: '100%', height: 160 },
  bannerGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  avatarFrame: {
    position: 'absolute',
    bottom: -36,
    alignSelf: 'center',
  },
  avatarBorder: {
    borderWidth: 4,
    borderRadius: 42,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    overflow: 'hidden',
  },
  bigAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1D9BF0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  verifiedBadgeMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Infos
  infoBlock: { paddingHorizontal: 16, paddingTop: 6 },
  communityName: { fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  communityDesc: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  statItem: { fontSize: 13, fontWeight: '500' },
  statSep: { width: 1, height: 14 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#36D9A0' },

  // Rôle chip
  roleRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleChipText: { fontSize: 12, fontWeight: '700' },

  // Boutons action
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  actionTxt: { fontWeight: '700', fontSize: 14 },

  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
  },
  coinPillTxt: { color: '#F59E0B', fontWeight: '800', fontSize: 11 },

  // Wallet bar
  walletBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  walletTitle: { fontSize: 13, fontWeight: '700' },
  walletSub: { fontSize: 11, marginTop: 2 },
  rechargeBtn: { backgroundColor: '#EF444420', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  rechargeTxt: { color: '#EF4444', fontWeight: '700', fontSize: 12 },

  // Info bar
  infoBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 6, marginBottom: 4 },
  infoBarTxt: { flex: 1, fontSize: 12, lineHeight: 17 },

  // VR buttons
  vrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  vrBtnTxt: { fontSize: 13, fontWeight: '600' },

  // Locked content placeholder
  lockedBox: {
    marginTop: 24,
    marginHorizontal: 0,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  lockedSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  pendingBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  pendingBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Nav grid 2 colonnes
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    width: '47.5%',
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: { flex: 1, fontSize: 13, fontWeight: '600' },

  // Section membres
  membersSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  seeAll: { fontSize: 13, fontWeight: '600' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  memberAvatarSm: { width: 42, height: 42, borderRadius: 21 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberSub: { fontSize: 12, marginTop: 1 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seeAllTxt: { fontSize: 14, fontWeight: '600' },

  // Viewer
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 52, right: 20, zIndex: 10 },
  viewerCloseInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal base
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },

  // VR box
  vrBox: { marginHorizontal: 20, borderRadius: 22, padding: 20 },

  // Settings sheet
  settingsSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '94%',
    flex: 1,
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  settingsNavBtn: { width: 90, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },

  // Onglets settings
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 13, fontWeight: '700' },

  // Contenu settings
  sheetBody: { paddingHorizontal: 16, paddingTop: 16 },

  // Bannière/avatar edit
  editBanner: { height: 110, borderRadius: 14, overflow: 'hidden' },
  editBannerImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  editCamBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  editAvatarWrap: { alignSelf: 'flex-start', marginTop: -28, marginLeft: 12, marginBottom: 16 },
  editAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, overflow: 'hidden' },
  editAvatarCam: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7B3FF2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Champs form
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 },
  fieldBox: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  fieldInput: { fontSize: 15, padding: 0 },

  // Membres (settings)
  memberSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberSearchInput: { flex: 1, fontSize: 14, padding: 0 },
  memberCountLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8 },
  adminMemberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 165 },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBtnTxt: { fontSize: 10, fontWeight: '700' },

  // Sécurité
  secSection: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  secIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secLabel: { fontSize: 14, fontWeight: '600' },
  secDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },
});
