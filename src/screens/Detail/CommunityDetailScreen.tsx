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
import type { CommunityData, CommunityMemberData, BlockedMemberData, VerificationRequest } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
interface Props { route: { params: { communityId: string } }; }

type SettingsTab = 'info' | 'members' | 'security';

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', moderator: 'Modérateur', member: 'Membre' };
const ROLE_COLORS: Record<string, string> = { admin: '#36D9A0', moderator: '#3B82F6', member: '#9390AB' };

export const CommunityDetailScreen: React.FC<Props> = ({ route }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { communityId } = route.params;

  const [community,      setCommunity]      = useState<CommunityData | null>(null);
  const [members,        setMembers]        = useState<CommunityMemberData[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [isMember,       setIsMember]       = useState(false);
  const [myId,           setMyId]           = useState<string | null>(null);
  const [myRole,         setMyRole]         = useState<string | null>(null);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [blockedMembers, setBlockedMembers] = useState<BlockedMemberData[]>([]);
  const [isGlobalAdmin,  setIsGlobalAdmin]  = useState(false);
  const [verifyLoading,  setVerifyLoading]  = useState(false);
  const [vrStatus,       setVrStatus]       = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [vrLoading,      setVrLoading]      = useState(false);

  // Image viewer plein écran
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Panel settings
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [settingsTab,   setSettingsTab]   = useState<SettingsTab>('info');
  const [saving,        setSaving]        = useState(false);
  const pickingRef = useRef(false);

  // Onglet Info
  const [editName,    setEditName]    = useState('');
  const [editDesc,    setEditDesc]    = useState('');
  const [editAvatar,  setEditAvatar]  = useState<string | null>(null);
  const [editBanner,  setEditBanner]  = useState<string | null>(null);

  // Onglet Sécurité
  const [editPrivate,       setEditPrivate]       = useState(false);
  const [editApproval,      setEditApproval]      = useState(false);
  const [editMembersOnly,   setEditMembersOnly]   = useState(false);

  // Onglet Membres — gestion des rôles inline
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const isAdmin  = myRole === 'admin';
  const isMod    = myRole === 'moderator';
  const canBlock = isAdmin || isMod;

  const load = useCallback(async () => {
    try {
      const [c, membersList, me, role] = await Promise.all([
        communityService.getById(communityId),
        communityService.getMembers(communityId),
        authService.getMe(),
        communityService.getMyRole(communityId).catch(() => null),
      ]);
      setCommunity(c);
      setMembers(Array.isArray(membersList) ? membersList : []);
      const uid = String(me.id);
      setMyId(uid);
      setMyRole(role);
      const globalAdmin = (me as any).role === 'admin';
      setIsGlobalAdmin(globalAdmin);
      setIsMember(membersList.some((m: CommunityMemberData) => m.user_id === uid));
      if (role === 'admin' || role === 'moderator') {
        communityService.getBlockedMembers(communityId).then(setBlockedMembers).catch(() => {});
      }
      // Charger le statut de la demande de vérification (admin communauté ou admin plateforme)
      if (role === 'admin' || globalAdmin) {
        communityService.getVerificationRequest(communityId)
          .then(vr => setVrStatus(vr ? (vr.status as any) : 'none'))
          .catch(() => {});
      }
    } catch {}
    finally { setLoading(false); }
  }, [communityId]);

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
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.85 }, (resp) => {
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
        Endpoints.upload.images('communities'), fd,
      );
      return res.data?.uploaded?.[0]?.url ?? null;
    } catch { return null; }
  }

  async function handleSaveSettings() {
    if (settingsTab === 'info') {
      if (!editName.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; }
      setSaving(true);
      try {
        const [avatarUrl, bannerUrl] = await Promise.all([
          editAvatar ? uploadImage(editAvatar) : Promise.resolve(null),
          editBanner ? uploadImage(editBanner) : Promise.resolve(null),
        ]);
        await apiClient.patch(`/api/v1/communities/${communityId}`, {
          name:        editName.trim(),
          description: editDesc.trim() || null,
          ...(avatarUrl  ? { avatar_url:  avatarUrl  } : {}),
          ...(bannerUrl  ? { banner_url:  bannerUrl  } : {}),
        });
        setSettingsOpen(false);
        load();
      } catch (e: any) {
        Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder');
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
        Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder');
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
        `Donner les droits admin à ${member.display_name || member.username} ? Cette personne pourra gérer la communauté comme toi.`,
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
      Alert.alert('Erreur', e?.message ?? 'Impossible de changer le rôle');
    } finally { setRoleLoading(null); }
  }

  async function handleKick(member: CommunityMemberData) {
    Alert.alert(
      'Exclure',
      `Exclure ${member.display_name || member.username} de la communauté ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exclure', style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/v1/communities/${communityId}/members/${member.user_id}`);
              load();
            } catch { Alert.alert('Erreur', 'Impossible d\'exclure ce membre'); }
          },
        },
      ],
    );
  }

  async function handleBlock(member: CommunityMemberData) {
    if (member.user_id === myId) return;
    if (member.role === 'admin') { Alert.alert('Impossible', 'Vous ne pouvez pas bloquer un administrateur'); return; }
    Alert.alert('Bloquer', `Bloquer ${member.display_name || member.username} ? Cette personne sera exclue et ne pourra plus rejoindre.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Bloquer', style: 'destructive',
        onPress: async () => {
          try { await communityService.blockMember(communityId, member.user_id); load(); }
          catch { Alert.alert('Erreur', 'Impossible de bloquer'); }
        },
      },
    ]);
  }

  const handleUnblock = (b: BlockedMemberData) => {
    Alert.alert('Débloquer', `Débloquer ${b.display_name || b.username} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Débloquer',
        onPress: async () => {
          try { await communityService.unblockMember(communityId, b.user_id); load(); }
          catch { Alert.alert('Erreur', 'Impossible de débloquer'); }
        },
      },
    ]);
  };

  const handleJoin = async () => {
    setActionLoading(true);
    try { await communityService.join(communityId); load(); }
    catch { Alert.alert('Erreur', 'Impossible de rejoindre'); }
    finally { setActionLoading(false); }
  };

  const handleLeave = () => {
    if (isAdmin) { Alert.alert('Impossible', 'L\'admin ne peut pas quitter sa communauté. Transférez les droits d\'abord.'); return; }
    Alert.alert('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try { await communityService.leave(communityId); load(); }
          catch { Alert.alert('Erreur', 'Impossible de quitter'); }
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
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/v1/communities/${communityId}`);
              nav.goBack();
            } catch { Alert.alert('Erreur', 'Impossible de supprimer'); }
          },
        },
      ],
    );
  }

  async function handleRequestVerification() {
    if (!community) return;
    Alert.prompt(
      'Demander la vérification',
      'Expliquez brièvement pourquoi cette communauté mérite le badge officiel (optionnel)',
      async (reason) => {
        setVrLoading(true);
        try {
          await communityService.requestVerification(communityId, reason || undefined);
          setVrStatus('pending');
          Alert.alert('Demande envoyée', 'Les administrateurs de la plateforme vont examiner votre demande.');
        } catch (e: any) {
          Alert.alert('Erreur', e?.message ?? 'Impossible d\'envoyer la demande');
        } finally { setVrLoading(false); }
      },
      'plain-text',
    );
  }

  async function handleToggleVerify() {
    if (!community) return;
    const willVerify = !community.is_verified;
    Alert.alert(
      willVerify ? 'Vérifier la communauté' : 'Retirer la vérification',
      willVerify
        ? `Ajouter le badge de vérification officiel à "${community.name}" ?`
        : `Retirer le badge de vérification de "${community.name}" ?`,
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
              Alert.alert('Erreur', e?.message ?? 'Impossible de modifier la vérification');
            } finally { setVerifyLoading(false); }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </View>
    );
  }
  if (!community) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textTertiary }}>Communauté introuvable</Text>
      </View>
    );
  }

  const filteredMembers = members.filter(m => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (m.display_name || '').toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q);
  });

  // ── Contenu onglet Info ──────────────────────────────────────────────────────
  const renderTabInfo = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.sheetBody}>
        {/* Bannière */}
        <TouchableOpacity onPress={() => pickImage('banner')} activeOpacity={0.85}>
          <View style={[s.editBannerPicker, { backgroundColor: colors.backgroundSecondary }]}>
            {editBanner ? (
              <Image source={{ uri: editBanner }} style={s.editBannerImg} />
            ) : community.banner_url ? (
              <Image source={{ uri: community.banner_url }} style={s.editBannerImg} />
            ) : (
              <LinearGradient colors={['#7B3FF220', '#E0389A20']} style={s.editBannerImg}>
                <Icon name="image" size={24} color={colors.textTertiary} />
              </LinearGradient>
            )}
            <View style={s.editBadge}>
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
            <LinearGradient colors={['#7B3FF2', '#E0389A']} style={[s.editAvatar, { alignItems: 'center', justifyContent: 'center', borderColor: colors.surface }]}>
              <Icon name="users" size={24} color="#fff" />
            </LinearGradient>
          )}
          <View style={s.editAvatarBadge}>
            <Icon name="camera" size={11} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Nom */}
        <View style={[s.fieldWrap, { borderColor: colors.divider }]}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>NOM</Text>
          <TextInput
            style={[s.fieldInput, { color: colors.textPrimary }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Nom de la communauté"
            placeholderTextColor={colors.textDisabled}
            maxLength={60}
          />
        </View>

        {/* Description */}
        <View style={[s.fieldWrap, { borderColor: colors.divider, marginBottom: 32 }]}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>DESCRIPTION</Text>
          <TextInput
            style={[s.fieldInput, s.fieldMulti, { color: colors.textPrimary }]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Description (optionnel)"
            placeholderTextColor={colors.textDisabled}
            multiline
            maxLength={300}
          />
        </View>
      </View>
    </ScrollView>
  );

  // ── Contenu onglet Membres ───────────────────────────────────────────────────
  const renderTabMembers = () => (
    <View style={{ flex: 1 }}>
      {/* Barre de recherche */}
      <View style={[s.memberSearchWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
        <Icon name="search" size={15} color={colors.textTertiary} />
        <TextInput
          style={[s.memberSearchInput, { color: colors.textPrimary }]}
          placeholder="Rechercher un membre…"
          placeholderTextColor={colors.textDisabled}
          value={memberSearch}
          onChangeText={setMemberSearch}
        />
        {memberSearch.length > 0 && (
          <TouchableOpacity onPress={() => setMemberSearch('')}>
            <Icon name="x" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.memberCount, { color: colors.textTertiary }]}>
          {filteredMembers.length} membre{filteredMembers.length !== 1 ? 's' : ''}
        </Text>

        {filteredMembers.map(member => {
          const isSelf = member.user_id === myId;
          const isLoading = roleLoading === member.user_id;
          return (
            <View key={member.id} style={[s.adminMemberRow, { borderBottomColor: colors.divider }]}>
              {/* Avatar */}
              <TouchableOpacity onPress={() => nav.navigate('UserProfile', { userId: member.user_id })}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, { backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>
                      {(member.display_name || member.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Nom + rôle */}
              <View style={{ flex: 1 }}>
                <Text style={[s.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {member.display_name || member.username}
                  {isSelf ? ' (toi)' : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <View style={[s.roleDot, { backgroundColor: ROLE_COLORS[member.role as string] ?? '#9390AB' }]} />
                  <Text style={[s.memberSub, { color: colors.textTertiary }]}>
                    {ROLE_LABELS[member.role as string] ?? member.role}
                  </Text>
                </View>
              </View>

              {/* Actions rôle */}
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
              ) : isAdmin && !isSelf ? (
                <View style={s.roleActions}>
                  {member.role !== 'admin' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: '#36D9A015', borderColor: '#36D9A040' }]}
                      onPress={() => handleChangeRole(member, 'admin')}
                    >
                      <Icon name="shield" size={13} color="#36D9A0" />
                      <Text style={[s.roleBtnText, { color: '#36D9A0' }]}>Admin</Text>
                    </TouchableOpacity>
                  )}
                  {member.role !== 'moderator' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: '#3B82F615', borderColor: '#3B82F640' }]}
                      onPress={() => handleChangeRole(member, 'moderator')}
                    >
                      <Icon name="star" size={13} color="#3B82F6" />
                      <Text style={[s.roleBtnText, { color: '#3B82F6' }]}>Mod</Text>
                    </TouchableOpacity>
                  )}
                  {member.role !== 'member' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                      onPress={() => handleChangeRole(member, 'member')}
                    >
                      <Icon name="user" size={13} color={colors.textTertiary} />
                      <Text style={[s.roleBtnText, { color: colors.textTertiary }]}>Membre</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleKick(member)}
                  >
                    <Icon name="user-x" size={13} color="#EF4444" />
                    <Text style={[s.roleBtnText, { color: '#EF4444' }]}>Exclure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleBlock(member)}
                  >
                    <Icon name="slash" size={13} color="#EF4444" />
                    <Text style={[s.roleBtnText, { color: '#EF4444' }]}>Bloquer</Text>
                  </TouchableOpacity>
                </View>
              ) : isMod && !isSelf && member.role === 'member' ? (
                <View style={s.roleActions}>
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleKick(member)}
                  >
                    <Icon name="user-x" size={13} color="#EF4444" />
                    <Text style={[s.roleBtnText, { color: '#EF4444' }]}>Exclure</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Membres bloqués */}
        {isAdmin && blockedMembers.length > 0 && (
          <>
            <Text style={[s.memberCount, { color: '#EF4444', marginTop: 20 }]}>
              {blockedMembers.length} bloqué{blockedMembers.length !== 1 ? 's' : ''}
            </Text>
            {blockedMembers.map(b => (
              <View key={b.id} style={[s.adminMemberRow, { borderBottomColor: colors.divider }]}>
                {b.avatar_url ? (
                  <Image source={{ uri: b.avatar_url }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, { backgroundColor: '#EF444422', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>{(b.display_name || b.username || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, { color: colors.textPrimary }]}>{b.display_name || b.username}</Text>
                  <Text style={[s.memberSub, { color: '#EF4444' }]}>Bloqué</Text>
                </View>
                <TouchableOpacity
                  style={[s.roleBtn, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}
                  onPress={() => handleUnblock(b)}
                >
                  <Icon name="user-check" size={13} color="#10B981" />
                  <Text style={[s.roleBtnText, { color: '#10B981' }]}>Débloquer</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );

  // ── Contenu onglet Sécurité ──────────────────────────────────────────────────
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

        {/* Zone danger */}
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
            <Text style={[s.secDesc, { color: '#EF444499' }]}>Action irréversible — tous les données seront perdues</Text>
          </View>
          <Icon name="chevron-right" size={16} color="#EF444460" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.headerIcon}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{community.name}</Text>
        {isAdmin || isMod ? (
          <TouchableOpacity onPress={openSettings} style={s.headerIcon}>
            <Icon name="settings" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {/* Bannière */}
            <View style={s.bannerArea}>
              <TouchableOpacity
                activeOpacity={community.banner_url ? 0.85 : 1}
                onPress={() => community.banner_url && setViewerUrl(community.banner_url)}
              >
                {community.banner_url ? (
                  <Image source={{ uri: community.banner_url }} style={s.banner} />
                ) : (
                  <LinearGradient colors={['#7B3FF2', '#9B65F5', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner} />
                )}
              </TouchableOpacity>
              <View style={[s.avatarWrap, { borderColor: colors.background }]}>
                <TouchableOpacity
                  activeOpacity={community.avatar_url ? 0.85 : 1}
                  onPress={() => community.avatar_url && setViewerUrl(community.avatar_url)}
                >
                  {community.avatar_url ? (
                    <Image source={{ uri: community.avatar_url }} style={s.bigAvatar} />
                  ) : (
                    <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.bigAvatar}>
                      <Icon name="users" size={36} color="#fff" />
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.infoSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.name, { color: colors.textPrimary }]}>{community.name}</Text>
                {community.is_verified && (
                  <View style={s.verifiedBadge}>
                    <Icon name="check" size={11} color="#fff" />
                  </View>
                )}
              </View>
              {community.description ? (
                <Text style={[s.desc, { color: colors.textSecondary }]}>{community.description}</Text>
              ) : null}

              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: colors.textPrimary }]}>{community.members_count ?? 0}</Text>
                  <Text style={[s.statLabel, { color: colors.textTertiary }]}>Membres</Text>
                </View>
                <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
                <View style={s.stat}>
                  <View style={[s.badge, { backgroundColor: community.is_private ? '#E0389A20' : '#3B82F620' }]}>
                    <Icon name={community.is_private ? 'lock' : 'globe'} size={12} color={community.is_private ? '#E0389A' : '#3B82F6'} />
                    <Text style={[s.badgeText, { color: community.is_private ? '#E0389A' : '#3B82F6' }]}>
                      {community.is_private ? 'Privée' : 'Publique'}
                    </Text>
                  </View>
                </View>
                {myRole && (
                  <>
                    <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
                    <View style={[s.badge, { backgroundColor: (ROLE_COLORS[myRole] ?? '#9390AB') + '20' }]}>
                      <Icon name={isAdmin ? 'shield' : isMod ? 'star' : 'user'} size={12} color={ROLE_COLORS[myRole] ?? '#9390AB'} />
                      <Text style={[s.badgeText, { color: ROLE_COLORS[myRole] ?? '#9390AB' }]}>
                        {ROLE_LABELS[myRole] ?? myRole}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <View style={s.actionsRow}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: isMember ? colors.backgroundSecondary : '#7B3FF2', borderColor: isMember ? colors.divider : 'transparent', borderWidth: isMember ? 1 : 0 }]}
                  onPress={isMember ? handleLeave : handleJoin}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={isMember ? colors.textPrimary : '#fff'} />
                  ) : (
                    <>
                      <Icon name={isMember ? 'check' : 'user-plus'} size={16} color={isMember ? colors.textPrimary : '#fff'} />
                      <Text style={[s.actionText, { color: isMember ? colors.textPrimary : '#fff' }]}>
                        {isMember ? 'Membre' : 'Rejoindre'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {isMember && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#7B3FF2', flex: 1 }]}
                    onPress={() => nav.navigate('CommunityChat' as any, { communityId, communityName: community.name })}
                  >
                    <Icon name="message-circle" size={16} color="#fff" />
                    <Text style={[s.actionText, { color: '#fff' }]}>Discussion</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isGlobalAdmin && (
                <TouchableOpacity
                  style={[s.vrBtn, { backgroundColor: '#7B3FF215', borderColor: '#7B3FF240', marginBottom: 8 }]}
                  onPress={() => nav.navigate('AdminVerification' as any)}
                  activeOpacity={0.7}
                >
                  <Icon name="list" size={15} color="#7B3FF2" />
                  <Text style={[s.vrBtnText, { color: '#7B3FF2' }]}>Gérer les demandes de vérification</Text>
                </TouchableOpacity>
              )}

              {isGlobalAdmin && (
                <TouchableOpacity
                  style={[s.verifyBtn, {
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
                      <View style={[s.verifiedBadge, { backgroundColor: community.is_verified ? '#EF4444' : '#1D9BF0' }]}>
                        <Icon name="check" size={11} color="#fff" />
                      </View>
                      <Text style={[s.verifyBtnText, { color: community.is_verified ? '#EF4444' : '#1D9BF0' }]}>
                        {community.is_verified ? 'Retirer la vérification' : 'Vérifier la communauté'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Bouton demande vérification — admin communauté seulement, si pas encore vérifié */}
              {isAdmin && !isGlobalAdmin && !community.is_verified && (
                <TouchableOpacity
                  style={[s.vrBtn, {
                    backgroundColor: vrStatus === 'pending'  ? '#F59E0B15' :
                                     vrStatus === 'rejected' ? '#EF444415' : '#1D9BF015',
                    borderColor:     vrStatus === 'pending'  ? '#F59E0B40' :
                                     vrStatus === 'rejected' ? '#EF444440' : '#1D9BF040',
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
                        size={15}
                        color={vrStatus === 'pending' ? '#F59E0B' : vrStatus === 'rejected' ? '#EF4444' : '#1D9BF0'}
                      />
                      <Text style={[s.vrBtnText, {
                        color: vrStatus === 'pending'  ? '#F59E0B' :
                               vrStatus === 'rejected' ? '#EF4444' : '#1D9BF0',
                      }]}>
                        {vrStatus === 'pending'  ? 'Demande en cours d\'examen…' :
                         vrStatus === 'rejected' ? 'Refusée — Renvoyer une demande' :
                         'Demander la vérification officielle'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>MEMBRES ({members.length})</Text>
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
              <Image source={{ uri: item.avatar_url }} style={s.memberAvatar} />
            ) : (
              <View style={[s.memberAvatar, { backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {(item.display_name || item.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.textPrimary }]}>{item.display_name || item.username}</Text>
              <Text style={[s.memberSub, { color: colors.textTertiary }]}>@{item.username}</Text>
            </View>
            {item.role === 'admin' && (
              <View style={[s.roleBadge, { backgroundColor: '#36D9A022' }]}>
                <Text style={{ color: '#36D9A0', fontSize: 10, fontWeight: '700' }}>ADMIN</Text>
              </View>
            )}
            {item.role === 'moderator' && (
              <View style={[s.roleBadge, { backgroundColor: '#3B82F622' }]}>
                <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700' }}>MOD</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      {/* ── Viewer image plein écran ── */}
      <Modal
        visible={!!viewerUrl}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={s.imgViewer}>
          <StatusBar hidden />
          <TouchableOpacity
            style={s.imgViewerClose}
            onPress={() => setViewerUrl(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={s.imgViewerCloseInner}>
              <Icon name="x" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
          {viewerUrl && (
            <Image
              source={{ uri: viewerUrl }}
              style={s.imgViewerImage}
              resizeMode="contain"
            />
          )}
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
          <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => !saving && setSettingsOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={s.modalKav}
          >
            <View style={[s.sheet, { backgroundColor: colors.surface }]}>
              {/* Drag handle */}
              <View style={s.dragBar}>
                <View style={[s.drag, { backgroundColor: colors.divider }]} />
              </View>

              {/* Header */}
              <View style={[s.sheetHeader, { borderBottomColor: colors.divider }]}>
                <TouchableOpacity onPress={() => setSettingsOpen(false)} style={s.sheetNavBtn}>
                  <Icon name="x" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Gérer la communauté</Text>
                {settingsTab !== 'members' ? (
                  <TouchableOpacity onPress={handleSaveSettings} disabled={saving} style={s.sheetNavBtn}>
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Enregistrer</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={s.sheetNavBtn} />
                )}
              </View>

              {/* Onglets */}
              <View style={[s.tabBar, { borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
                {(['info', 'members', 'security'] as SettingsTab[]).map(tab => {
                  const label = tab === 'info' ? 'Info' : tab === 'members' ? 'Membres' : 'Sécurité';
                  const icon  = tab === 'info' ? 'edit-2' : tab === 'members' ? 'users' : 'shield';
                  const active = settingsTab === tab;
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[s.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                      onPress={() => setSettingsTab(tab)}
                    >
                      <Icon name={icon} size={15} color={active ? colors.primary : colors.textTertiary} />
                      <Text style={[s.tabLabel, { color: active ? colors.primary : colors.textTertiary }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Contenu onglet */}
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

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerIcon: { width: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },

  bannerArea: { position: 'relative', marginBottom: 44 },
  banner: { width: '100%', height: 130 },
  avatarWrap: {
    position: 'absolute', bottom: -40, left: 20,
    borderRadius: 44, borderWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, elevation: 6,
  },
  bigAvatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },

  infoSection: { paddingHorizontal: 16, paddingTop: 8 },
  name: { fontSize: 22, fontWeight: '800' },
  desc: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10, flexWrap: 'wrap' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: 1, height: 28 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
  },
  actionText: { fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 24, marginBottom: 8 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberSub: { fontSize: 12, marginTop: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  // Modal
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalKav: { width: '100%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%', flex: 1 },
  dragBar: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  drag: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  sheetNavBtn: { width: 90, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  sheetBody: { paddingHorizontal: 16, paddingTop: 16 },

  // Onglets
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  tabLabel: { fontSize: 13, fontWeight: '700' },

  // Edition info
  editBannerPicker: { height: 110, borderRadius: 14, overflow: 'hidden' },
  editBannerImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  editBadge: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  editAvatarWrap: { alignSelf: 'flex-start', marginTop: -28, marginLeft: 12, marginBottom: 16 },
  editAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3 },
  editAvatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  fieldWrap: { borderBottomWidth: 1, marginBottom: 16, paddingBottom: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  fieldInput: { fontSize: 15, paddingVertical: 4, fontWeight: '500' },
  fieldMulti: { minHeight: 56, textAlignVertical: 'top' },

  // Membres admin
  adminMemberRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 160 },
  roleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  roleBtnText: { fontSize: 10, fontWeight: '700' },
  memberSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  memberSearchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  memberCount: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8 },

  // Image viewer plein écran
  imgViewer: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  imgViewerImage: {
    width: '100%', height: '100%',
  },
  imgViewerClose: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
  },
  imgViewerCloseInner: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Demande de vérification
  vrBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
    marginBottom: 12,
  },
  vrBtnText: { fontSize: 13, fontWeight: '600' },

  // Verification badge (admin plateforme)
  verifiedBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#1D9BF0',
    alignItems: 'center', justifyContent: 'center',
  },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
    marginBottom: 16,
  },
  verifyBtnText: { fontSize: 13, fontWeight: '700' },

  // Sécurité
  secSection: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  secRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  secIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secLabel: { fontSize: 14, fontWeight: '600' },
  secDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },
});
