import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, Pressable,
  Image, ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { CommunityChannel, CommunityChannelMember, CommunityMemberData, ChannelType, UpdateChannelPayload } from '../../services/communityService';

interface RouteParams {
  communityId: string;
  communityName: string;
  channelId: string;
  channelName: string;
  myRole: string | null;
}

const CHANNEL_TYPES: { key: ChannelType; label: string; icon: string }[] = [
  { key: 'text',         label: 'Texte',    icon: 'hash' },
  { key: 'announcement', label: 'Annonces', icon: 'bell' },
  { key: 'voice',        label: 'Vocal',    icon: 'mic'  },
];

const TYPE_COLORS: Record<ChannelType, string> = {
  text: '#7B3FF2', announcement: '#F59E0B', voice: '#10B981',
};

const ROLE_LABELS: Record<string, string> = {
  member: 'Membre', moderator: 'Modérateur', banned: 'Banni',
};
const ROLE_COLORS: Record<string, string> = {
  member: '#9390AB', moderator: '#3B82F6', banned: '#EF4444',
};

export const CommunityChannelSettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName, channelId, myRole } = route.params as RouteParams;

  const isAdmin  = myRole === 'admin';
  const isMod    = myRole === 'moderator';
  const canManage = isAdmin || isMod;

  const [channel,  setChannel]  = useState<CommunityChannel | null>(null);
  const [members,  setMembers]  = useState<CommunityChannelMember[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [tab,      setTab]      = useState<'info' | 'members'>('info');

  // Champs édition
  const [formName,     setFormName]     = useState('');
  const [formDesc,     setFormDesc]     = useState('');
  const [formType,     setFormType]     = useState<ChannelType>('text');
  const [formPrivate,  setFormPrivate]  = useState(false);
  const [formPassword, setFormPassword] = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [removePwd,    setRemovePwd]    = useState(false);
  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Menu membre
  const [menuMember, setMenuMember] = useState<CommunityChannelMember | null>(null);

  // Picker ajouter membre
  const [showAddSheet,    setShowAddSheet]    = useState(false);
  const [communityMembers, setCommunityMembers] = useState<CommunityMemberData[]>([]);
  const [addSearch,       setAddSearch]       = useState('');
  const [addingUser,      setAddingUser]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, chs] = await Promise.all([
        communityService.getChannelMembers(communityId, channelId).catch(() => []),
        communityService.getChannels(communityId).catch(() => []),
      ]);
      const ch = chs.find(c => c.id === channelId) ?? null;
      setChannel(ch);
      setMembers(list);
      if (ch) {
        setFormName(ch.name);
        setFormDesc(ch.description ?? '');
        setFormType(ch.type);
        setFormPrivate(ch.is_private);
        setAvatarUrl(ch.avatar_url);
      }
    } finally { setLoading(false); }
  }, [communityId, channelId]);

  useEffect(() => { load(); }, [load]);

  const handlePickAvatar = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, async (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      const asset = resp.assets[0];
      if (!asset.uri) return;
      setAvatarLoading(true);
      try {
        const fd = new FormData();
        fd.append('file', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: 'image/jpeg' } as any);
        const res = await apiClient.upload<{ uploaded: { url: string }[] }>(Endpoints.upload.images('communities'), fd);
        const url = res.data?.uploaded?.[0]?.url;
        if (url) setAvatarUrl(url);
      } catch { Alert.alert('Erreur', 'Impossible de télécharger la photo.'); }
      finally { setAvatarLoading(false); }
    });
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) { Alert.alert('Nom requis'); return; }
    setSaving(true);
    try {
      const payload: UpdateChannelPayload = {
        name,
        description: formDesc.trim() || undefined,
        type: formType,
        is_private: formPrivate,
        avatar_url: avatarUrl ?? undefined,
        remove_password: removePwd,
      };
      if (!removePwd && formPassword.trim()) payload.password = formPassword.trim();
      const updated = await communityService.updateChannel(communityId, channelId, payload);
      setChannel(updated);
      setFormPassword('');
      setRemovePwd(false);
      Alert.alert('Succès', 'Canal mis à jour.');
    } catch { Alert.alert('Erreur', 'Impossible de sauvegarder.'); }
    finally { setSaving(false); }
  };

  const handleDeleteChannel = () => {
    Alert.alert('Supprimer le canal', `Supprimer "${channel?.name}" ? Cette action est irréversible.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await communityService.deleteChannel(communityId, channelId);
          nav.goBack();
        } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  };

  const openAddSheet = async () => {
    setAddSearch('');
    setShowAddSheet(true);
    try {
      const all = await communityService.getMembers(communityId);
      const channelUserIds = new Set(members.map(m => m.user_id));
      setCommunityMembers(all.filter(m => !channelUserIds.has(m.user_id)));
    } catch { setCommunityMembers([]); }
  };

  const handleAddMember = async (m: CommunityMemberData) => {
    setAddingUser(m.user_id);
    try {
      const added = await communityService.addChannelMember(communityId, channelId, m.user_id);
      setMembers(prev => [...prev, added]);
      setCommunityMembers(prev => prev.filter(x => x.user_id !== m.user_id));
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible d\'ajouter ce membre.');
    } finally { setAddingUser(null); }
  };

  const handleRemoveMember = (m: CommunityChannelMember) => {
    setMenuMember(null);
    Alert.alert('Retirer', `Retirer ${m.display_name || m.username} du canal ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: async () => {
        try {
          await communityService.removeChannelMember(communityId, channelId, m.user_id);
          setMembers(prev => prev.filter(x => x.user_id !== m.user_id));
        } catch { Alert.alert('Erreur'); }
      }},
    ]);
  };

  const handleSetRole = async (m: CommunityChannelMember, role: 'member' | 'moderator' | 'banned') => {
    setMenuMember(null);
    try {
      const updated = await communityService.updateChannelMemberRole(communityId, channelId, m.user_id, role);
      setMembers(prev => prev.map(x => x.user_id === m.user_id ? updated : x));
    } catch { Alert.alert('Erreur', 'Impossible de modifier le rôle.'); }
  };

  const renderMember = ({ item: m }: { item: CommunityChannelMember }) => (
    <TouchableOpacity
      style={[S.memberRow, { borderBottomColor: colors.divider }]}
      onPress={() => canManage ? setMenuMember(m) : nav.navigate('UserProfile', { userId: m.user_id })}
      activeOpacity={0.75}
    >
      {m.avatar_url
        ? <Image source={{ uri: m.avatar_url }} style={S.memberAvatar} />
        : <View style={[S.memberAvatarPlaceholder, { backgroundColor: colors.primary + '25' }]}>
            <Text style={[S.memberAvatarLetter, { color: colors.primary }]}>
              {(m.display_name || m.username || '?')[0].toUpperCase()}
            </Text>
          </View>
      }
      <View style={{ flex: 1 }}>
        <Text style={[S.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
          {m.display_name || m.username}
        </Text>
        {m.username && m.display_name && (
          <Text style={[S.memberUsername, { color: colors.textTertiary }]}>@{m.username}</Text>
        )}
      </View>
      <View style={[S.roleBadge, { backgroundColor: (ROLE_COLORS[m.role] ?? '#9390AB') + '20' }]}>
        <Text style={[S.roleText, { color: ROLE_COLORS[m.role] ?? '#9390AB' }]}>
          {ROLE_LABELS[m.role] ?? m.role}
        </Text>
      </View>
      {canManage && <Icon name="more-horizontal" size={16} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[S.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={[colors.surface, colors.surface]}
        style={[S.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}
      >
        <TouchableOpacity onPress={() => nav.goBack()} style={S.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[S.headerTitle, { color: colors.textPrimary }]}>Paramètres du canal</Text>
          <Text style={[S.headerSub, { color: colors.textTertiary }]}>{communityName}</Text>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={[S.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {(['info', 'members'] as const).map(t => (
          <TouchableOpacity key={t} style={[S.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Icon name={t === 'info' ? 'settings' : 'users'} size={15} color={tab === t ? colors.primary : colors.textTertiary} />
            <Text style={[S.tabText, { color: tab === t ? colors.primary : colors.textTertiary }]}>
              {t === 'info' ? 'Informations' : `Membres (${members.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bouton + ajouter membre (onglet membres, admin/mod seulement) */}
      {tab === 'members' && canManage && (
        <TouchableOpacity
          style={[S.addMemberBtn, { backgroundColor: colors.primary }]}
          onPress={openAddSheet}
          activeOpacity={0.85}
        >
          <Icon name="user-plus" size={16} color="#fff" />
          <Text style={S.addMemberBtnText}>Ajouter un membre</Text>
        </TouchableOpacity>
      )}

      {tab === 'info' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Avatar */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <TouchableOpacity onPress={handlePickAvatar} disabled={avatarLoading || !canManage} activeOpacity={0.8}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={S.avatarLarge} />
                  : <View style={[S.avatarLarge, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.divider, borderStyle: 'dashed' }]}>
                      {avatarLoading
                        ? <ActivityIndicator color={colors.primary} />
                        : <Icon name="camera" size={30} color={colors.textTertiary} />
                      }
                    </View>
                }
                {canManage && (
                  <View style={[S.avatarEditBadge, { backgroundColor: colors.primary }]}>
                    <Icon name="camera" size={13} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              {avatarUrl && canManage && (
                <TouchableOpacity onPress={() => setAvatarUrl(null)} style={{ marginTop: 8 }}>
                  <Text style={{ color: '#EF4444', fontSize: 12 }}>Supprimer la photo</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Nom */}
            <Text style={[S.label, { color: colors.textSecondary }]}>Nom du canal</Text>
            <TextInput
              style={[S.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, color: colors.textPrimary }]}
              value={formName}
              onChangeText={setFormName}
              placeholder="Nom du canal"
              placeholderTextColor={colors.textTertiary}
              maxLength={50}
              editable={canManage}
            />

            {/* Description */}
            <Text style={[S.label, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[S.inputMulti, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, color: colors.textPrimary }]}
              value={formDesc}
              onChangeText={setFormDesc}
              placeholder="Description du canal…"
              placeholderTextColor={colors.textTertiary}
              multiline maxLength={200}
              editable={canManage}
            />

            {/* Type */}
            <Text style={[S.label, { color: colors.textSecondary }]}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {CHANNEL_TYPES.map(t => {
                const active = formType === t.key;
                const col = TYPE_COLORS[t.key];
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[S.typeChip, { borderColor: active ? col : colors.divider, backgroundColor: active ? col + '15' : colors.backgroundSecondary }]}
                    onPress={() => canManage && setFormType(t.key)}
                    activeOpacity={0.8}
                  >
                    <Icon name={t.icon} size={14} color={active ? col : colors.textTertiary} />
                    <Text style={[S.typeChipText, { color: active ? col : colors.textSecondary }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Privé */}
            <TouchableOpacity
              style={[S.toggleRow, { borderColor: colors.divider }]}
              onPress={() => canManage && setFormPrivate(p => !p)}
              activeOpacity={0.8}
            >
              <View style={[S.toggleIcon, { backgroundColor: formPrivate ? colors.primary + '20' : colors.backgroundSecondary }]}>
                <Icon name="lock" size={16} color={formPrivate ? colors.primary : colors.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }]}>Canal privé</Text>
                <Text style={[{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }]}>Visible uniquement sur invitation</Text>
              </View>
              <View style={[S.checkBox, { backgroundColor: formPrivate ? colors.primary : colors.backgroundSecondary, borderColor: formPrivate ? colors.primary : colors.divider }]}>
                {formPrivate && <Icon name="check" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>

            {/* Mot de passe */}
            <Text style={[S.label, { color: colors.textSecondary }]}>Mot de passe d'accès</Text>
            {channel?.has_password && !removePwd ? (
              <View style={{ gap: 8, marginBottom: 8 }}>
                <View style={[S.pwdStatus, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                  <Icon name="key" size={14} color="#F59E0B" />
                  <Text style={{ flex: 1, color: '#D97706', fontSize: 13, fontWeight: '600' }}>Mot de passe actif</Text>
                </View>
                {canManage && (
                  <TouchableOpacity style={[S.pwdStatus, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]} onPress={() => setRemovePwd(true)}>
                    <Icon name="trash-2" size={14} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Supprimer le mot de passe</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : removePwd ? (
              <View style={[S.pwdStatus, { backgroundColor: '#EF444415', borderColor: '#EF444440', marginBottom: 8 }]}>
                <Icon name="trash-2" size={14} color="#EF4444" />
                <Text style={{ flex: 1, color: '#EF4444', fontSize: 13 }}>Supprimé à la sauvegarde</Text>
                <TouchableOpacity onPress={() => setRemovePwd(false)}>
                  <Icon name="x" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : null}
            {canManage && (
              <View style={[S.pwdRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                <Icon name="key" size={15} color={colors.textTertiary} />
                <TextInput
                  style={[{ flex: 1, color: colors.textPrimary, fontSize: 14, marginLeft: 8 }]}
                  value={formPassword}
                  onChangeText={setFormPassword}
                  placeholder={channel?.has_password ? 'Nouveau mot de passe…' : 'Définir un mot de passe…'}
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry={!showPwd}
                  maxLength={50}
                />
                <TouchableOpacity onPress={() => setShowPwd(p => !p)}>
                  <Icon name={showPwd ? 'eye-off' : 'eye'} size={15} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            {canManage && (
              <>
                <TouchableOpacity
                  style={[S.saveBtn, { opacity: saving || avatarLoading ? 0.6 : 1, marginTop: 24 }]}
                  onPress={handleSave}
                  disabled={saving || avatarLoading}
                >
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} style={S.saveBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.saveBtnText}>Enregistrer</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={[S.deleteBtn, { borderColor: '#EF444440' }]} onPress={handleDeleteChannel}>
                  <Icon name="trash-2" size={16} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Supprimer le canal</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <FlatList
          data={members}
          keyExtractor={m => m.id}
          renderItem={renderMember}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <Icon name="users" size={36} color={colors.textTertiary} />
              <Text style={[{ fontSize: 16, fontWeight: '700', marginTop: 14, color: colors.textPrimary }]}>Aucun membre</Text>
              <Text style={[{ fontSize: 13, color: colors.textTertiary, marginTop: 6, textAlign: 'center' }]}>
                Les membres rejoignent le canal depuis la liste des canaux.
              </Text>
            </View>
          }
        />
      )}

      {/* Menu action membre */}
      <Modal visible={!!menuMember} transparent animationType="fade" onRequestClose={() => setMenuMember(null)}>
        <Pressable style={S.overlay} onPress={() => setMenuMember(null)}>
          <View style={[S.menuSheet, { backgroundColor: colors.surface }]}>
            {/* Apercu */}
            <View style={[S.menuPreview, { borderBottomColor: colors.divider }]}>
              {menuMember?.avatar_url
                ? <Image source={{ uri: menuMember.avatar_url }} style={{ width: 40, height: 40, borderRadius: 12 }} />
                : <View style={[{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '25', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>
                      {(menuMember?.display_name || menuMember?.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
              }
              <View style={{ flex: 1 }}>
                <Text style={[{ fontWeight: '700', color: colors.textPrimary, fontSize: 15 }]} numberOfLines={1}>
                  {menuMember?.display_name || menuMember?.username}
                </Text>
                <View style={[S.roleBadge, { backgroundColor: (ROLE_COLORS[menuMember?.role ?? 'member'] ?? '#9390AB') + '20', alignSelf: 'flex-start', marginTop: 3 }]}>
                  <Text style={[S.roleText, { color: ROLE_COLORS[menuMember?.role ?? 'member'] ?? '#9390AB' }]}>
                    {ROLE_LABELS[menuMember?.role ?? 'member'] ?? menuMember?.role}
                  </Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            {[
              { icon: 'user', label: 'Voir le profil', color: colors.textPrimary,
                onPress: () => { setMenuMember(null); nav.navigate('UserProfile', { userId: menuMember!.user_id }); } },
              menuMember?.role !== 'moderator' && { icon: 'shield', label: 'Promouvoir modérateur', color: '#3B82F6',
                onPress: () => handleSetRole(menuMember!, 'moderator') },
              menuMember?.role === 'moderator' && { icon: 'shield-off', label: 'Rétrograder membre', color: '#9390AB',
                onPress: () => handleSetRole(menuMember!, 'member') },
              menuMember?.role !== 'banned' && { icon: 'slash', label: 'Bannir du canal', color: '#F59E0B',
                onPress: () => handleSetRole(menuMember!, 'banned') },
              menuMember?.role === 'banned' && { icon: 'check-circle', label: 'Lever le bannissement', color: '#10B981',
                onPress: () => handleSetRole(menuMember!, 'member') },
              { icon: 'user-x', label: 'Retirer du canal', color: '#EF4444',
                onPress: () => handleRemoveMember(menuMember!) },
            ].filter(Boolean).map((a: any, i) => (
              <TouchableOpacity key={i} style={[S.menuItem, { borderTopColor: i === 0 ? 'transparent' : colors.divider }]} onPress={a.onPress}>
                <View style={[S.menuItemIcon, { backgroundColor: a.color + '18' }]}>
                  <Icon name={a.icon} size={16} color={a.color} />
                </View>
                <Text style={[S.menuItemText, { color: a.color }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[S.menuItem, { borderTopColor: colors.divider, justifyContent: 'center' }]} onPress={() => setMenuMember(null)}>
              <Text style={[S.menuItemText, { color: colors.textTertiary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Bottom sheet — ajouter un membre */}
      <Modal visible={showAddSheet} transparent animationType="slide" onRequestClose={() => setShowAddSheet(false)}>
        <Pressable style={S.overlay} onPress={() => setShowAddSheet(false)}>
          <Pressable style={[S.addSheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[S.addSheetHandle, { backgroundColor: colors.divider }]} />
            <Text style={[S.addSheetTitle, { color: colors.textPrimary }]}>Ajouter un membre</Text>

            {/* Recherche */}
            <View style={[S.addSearch, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              <Icon name="search" size={15} color={colors.textTertiary} />
              <TextInput
                style={[{ flex: 1, color: colors.textPrimary, fontSize: 14, marginLeft: 8 }]}
                placeholder="Rechercher…"
                placeholderTextColor={colors.textTertiary}
                value={addSearch}
                onChangeText={setAddSearch}
                autoCorrect={false}
              />
              {addSearch.length > 0 && (
                <TouchableOpacity onPress={() => setAddSearch('')}>
                  <Icon name="x" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={communityMembers.filter(m => {
                if (!addSearch.trim()) return true;
                const q = addSearch.toLowerCase();
                return (m.display_name ?? '').toLowerCase().includes(q) || (m.username ?? '').toLowerCase().includes(q);
              })}
              keyExtractor={m => m.user_id}
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: m }) => (
                <TouchableOpacity
                  style={[S.addMemberRow, { borderBottomColor: colors.divider }]}
                  onPress={() => handleAddMember(m)}
                  disabled={addingUser === m.user_id}
                  activeOpacity={0.75}
                >
                  {m.avatar_url
                    ? <Image source={{ uri: m.avatar_url }} style={S.memberAvatar} />
                    : <View style={[S.memberAvatarPlaceholder, { backgroundColor: colors.primary + '25' }]}>
                        <Text style={[S.memberAvatarLetter, { color: colors.primary }]}>
                          {(m.display_name || m.username || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={[S.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {m.display_name || m.username}
                    </Text>
                    {m.username && <Text style={[S.memberUsername, { color: colors.textTertiary }]}>@{m.username}</Text>}
                  </View>
                  {addingUser === m.user_id
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Icon name="plus-circle" size={20} color={colors.primary} />
                  }
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <Text style={{ color: colors.textTertiary, fontSize: 14 }}>
                    {communityMembers.length === 0 ? 'Tous les membres sont déjà dans ce canal' : 'Aucun résultat'}
                  </Text>
                </View>
              }
            />

            <TouchableOpacity
              style={[S.menuItem, { justifyContent: 'center', borderTopColor: colors.divider, borderTopWidth: StyleSheet.hairlineWidth }]}
              onPress={() => setShowAddSheet(false)}
            >
              <Text style={[S.menuItemText, { color: colors.textTertiary }]}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const S = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub:   { fontSize: 12, marginTop: 1 },

  tabs:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13 },
  tabText: { fontSize: 13, fontWeight: '600' },

  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
  input:     { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, marginBottom: 4 },
  inputMulti: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginBottom: 4 },

  typeChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  typeChipText: { fontSize: 13, fontWeight: '600' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  toggleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkBox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  pwdStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  pwdRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginTop: 8 },

  avatarLarge:     { width: 100, height: 100, borderRadius: 24 },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  saveBtn:     { borderRadius: 14, overflow: 'hidden', height: 52 },
  saveBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  deleteBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },

  memberRow:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  memberAvatar:          { width: 44, height: 44, borderRadius: 13 },
  memberAvatarPlaceholder: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  memberAvatarLetter:    { fontSize: 17, fontWeight: '800' },
  memberName:            { fontSize: 14, fontWeight: '700' },
  memberUsername:        { fontSize: 12, marginTop: 1 },
  roleBadge:             { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  roleText:              { fontSize: 11, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  addMemberBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, marginBottom: 0, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center' },
  addMemberBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  addSheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  addSheetHandle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  addSheetTitle:    { fontSize: 16, fontWeight: '800', paddingHorizontal: 18, paddingVertical: 10 },
  addSearch:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  addMemberRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },

  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  menuPreview:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  menuItemIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuItemText: { fontSize: 15, fontWeight: '500' },
});
