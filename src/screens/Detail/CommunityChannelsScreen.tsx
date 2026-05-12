import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { apiClient, Endpoints } from '../../api';
import type { CommunityChannel, ChannelType } from '../../services/communityService';

interface RouteParams {
  communityId: string;
  communityName: string;
  myRole: string | null;
}

const CHANNEL_TYPES: { key: ChannelType; label: string; icon: string; desc: string }[] = [
  { key: 'text',         label: 'Texte',    icon: 'hash', desc: 'Salon de discussion général' },
  { key: 'announcement', label: 'Annonces', icon: 'bell', desc: 'Réservé aux admins et modérateurs' },
  { key: 'voice',        label: 'Vocal',    icon: 'mic',  desc: 'Canal vocal (bientôt disponible)' },
];

const CHANNEL_EMOJIS = ['💬','📢','🎮','🎵','📚','🎨','🏆','💡','🌍','🎬','⚽','🛠️','🎤','🧵','📸'];

const TYPE_COLORS: Record<ChannelType, string> = {
  text:         '#7B3FF2',
  announcement: '#F59E0B',
  voice:        '#10B981',
};

function fmtTime(iso: string) {
  const d = new Date(iso), now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'maintenant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `il y a ${diffH}h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const CommunityChannelsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName, myRole: myRoleParam } = route.params as RouteParams;

  const [myRole,   setMyRole]   = useState<string | null>(myRoleParam ?? null);
  const isAdmin    = myRole === 'admin';
  const isMod      = myRole === 'moderator';
  const canManage  = isAdmin || isMod;

  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Modal création/édition
  const [createOpen,  setCreateOpen]  = useState(false);
  const [editChannel, setEditChannel] = useState<CommunityChannel | null>(null);
  const [saving,      setSaving]      = useState(false);

  // Champs formulaire
  const [formName,      setFormName]      = useState('');
  const [formDesc,      setFormDesc]      = useState('');
  const [formType,      setFormType]      = useState<ChannelType>('text');
  const [formEmoji,     setFormEmoji]     = useState('💬');
  const [formPrivate,   setFormPrivate]   = useState(false);
  const [formPassword,  setFormPassword]  = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [removePassword, setRemovePassword] = useState(false);
  const [formAvatar,    setFormAvatar]    = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showEmojiPick, setShowEmojiPick] = useState(false);

  // Modal mot de passe pour rejoindre
  const [joinChannel,   setJoinChannel]   = useState<CommunityChannel | null>(null);
  const [joinPassword,  setJoinPassword]  = useState('');
  const [joining,       setJoining]       = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, role] = await Promise.all([
        communityService.getChannels(communityId).catch(() => []),
        communityService.getMyRole(communityId).catch(() => null),
      ]);
      setChannels(Array.isArray(list) ? list : []);
      setMyRole(role);
    } finally { setLoading(false); }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditChannel(null);
    setFormName(''); setFormDesc(''); setFormType('text');
    setFormEmoji('💬'); setFormPrivate(false);
    setFormPassword(''); setRemovePassword(false); setFormAvatar(null);
    setCreateOpen(true);
  };

  const openEdit = (ch: CommunityChannel) => {
    setEditChannel(ch);
    setFormName(ch.name);
    setFormDesc(ch.description ?? '');
    setFormType(ch.type);
    setFormEmoji(ch.emoji ?? '💬');
    setFormPrivate(ch.is_private);
    setFormPassword('');
    setRemovePassword(false);
    setFormAvatar(ch.avatar_url);
    setCreateOpen(true);
  };

  const handlePickAvatar = async () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, async (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      const asset = resp.assets[0];
      if (!asset.uri) return;
      setAvatarUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: 'image/jpeg' } as any);
        const res = await apiClient.upload<{ uploaded: { url: string }[] }>(Endpoints.upload.images('communities'), fd);
        const url = res.data?.uploaded?.[0]?.url;
        if (url) setFormAvatar(url);
      } catch { Alert.alert('Erreur', 'Impossible de télécharger la photo.'); }
      finally { setAvatarUploading(false); }
    });
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) { Alert.alert('Nom requis', 'Le nom du canal ne peut pas être vide.'); return; }
    setSaving(true);
    try {
      const payload: any = {
        name,
        description: formDesc.trim() || undefined,
        type: formType,
        emoji: formEmoji,
        avatar_url: formAvatar ?? undefined,
        is_private: formPrivate,
      };
      if (editChannel) {
        payload.remove_password = removePassword;
        if (!removePassword && formPassword.trim()) payload.password = formPassword.trim();
        const updated = await communityService.updateChannel(communityId, editChannel.id, payload);
        setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        if (formPassword.trim()) payload.password = formPassword.trim();
        const created = await communityService.createChannel(communityId, payload);
        setChannels(prev => [...prev, created]);
      }
      setCreateOpen(false);
    } catch { Alert.alert('Erreur', editChannel ? 'Impossible de modifier le canal.' : 'Impossible de créer le canal.'); }
    finally { setSaving(false); }
  };

  const handleDelete = (ch: CommunityChannel) => {
    Alert.alert(
      'Supprimer le canal',
      `Supprimer "${ch.name}" ? Tous les messages seront perdus.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await communityService.deleteChannel(communityId, ch.id);
            setChannels(prev => prev.filter(c => c.id !== ch.id));
          } catch { Alert.alert('Erreur', 'Impossible de supprimer le canal.'); }
        }},
      ],
    );
  };

  const openChannel = (ch: CommunityChannel) => {
    if (ch.type === 'voice') {
      Alert.alert('Bientôt disponible', 'Les canaux vocaux arrivent prochainement !');
      return;
    }
    if (ch.has_password && !canManage) {
      setJoinChannel(ch);
      setJoinPassword('');
      return;
    }
    nav.navigate('CommunityChannelChat', {
      communityId, communityName,
      channelId: ch.id,
      channelName: ch.name,
      channelAvatar: ch.avatar_url,
      myRole,
      isAnnouncement: ch.type === 'announcement',
    });
  };

  const handleJoinWithPassword = async () => {
    if (!joinChannel) return;
    setJoining(true);
    try {
      await communityService.joinChannel(communityId, joinChannel.id, joinPassword.trim());
      const ch = joinChannel;
      setJoinChannel(null);
      nav.navigate('CommunityChannelChat', {
        communityId, communityName,
        channelId: ch.id,
        channelName: ch.name,
        channelAvatar: ch.avatar_url,
        myRole,
        isAnnouncement: ch.type === 'announcement',
      });
    } catch (e: any) {
      Alert.alert('Accès refusé', e?.response?.data?.detail ?? 'Mot de passe incorrect.');
    } finally { setJoining(false); }
  };

  const renderChannel = ({ item: ch }: { item: CommunityChannel }) => {
    const color = TYPE_COLORS[ch.type];
    return (
      <TouchableOpacity
        style={[S.channelRow, { borderBottomColor: colors.divider }]}
        onPress={() => openChannel(ch)}
        activeOpacity={0.75}
      >
        {/* Avatar ou icone */}
        {ch.avatar_url ? (
          <Image source={{ uri: ch.avatar_url }} style={[S.channelAvatar, { borderColor: colors.divider }]} />
        ) : (
          <View style={[S.channelIcon, { backgroundColor: color + '18' }]}>
            {ch.emoji
              ? <Text style={{ fontSize: 20 }}>{ch.emoji}</Text>
              : <Icon name={ch.type === 'announcement' ? 'bell' : ch.type === 'voice' ? 'mic' : 'hash'} size={20} color={color} />
            }
          </View>
        )}

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[S.channelName, { color: colors.textPrimary }]} numberOfLines={1}>{ch.name}</Text>
            {ch.is_private && <Icon name="lock" size={11} color={colors.textTertiary} />}
            {ch.has_password && <Icon name="key" size={11} color="#F59E0B" />}
            {ch.type === 'announcement' && (
              <View style={[S.typeBadge, { backgroundColor: '#F59E0B20' }]}>
                <Text style={[S.typeBadgeText, { color: '#D97706' }]}>Annonces</Text>
              </View>
            )}
            {ch.type === 'voice' && (
              <View style={[S.typeBadge, { backgroundColor: '#10B98120' }]}>
                <Text style={[S.typeBadgeText, { color: '#059669' }]}>Vocal</Text>
              </View>
            )}
          </View>
          {ch.last_message ? (
            <Text style={[S.channelLast, { color: colors.textTertiary }]} numberOfLines={1}>
              {ch.last_message.sender_display_name ? `${ch.last_message.sender_display_name}: ` : ''}
              {ch.last_message.content ?? 'Média'}
            </Text>
          ) : ch.description ? (
            <Text style={[S.channelLast, { color: colors.textTertiary }]} numberOfLines={1}>{ch.description}</Text>
          ) : null}
        </View>

        {/* Droite */}
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {ch.last_message && (
            <Text style={[S.channelTime, { color: colors.textTertiary }]}>{fmtTime(ch.last_message.created_at)}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {ch.unread_count ? (
              <View style={[S.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={S.unreadText}>{ch.unread_count > 99 ? '99+' : ch.unread_count}</Text>
              </View>
            ) : null}
            {canManage && (
              <TouchableOpacity
                style={S.actionBtn}
                onPress={() => nav.navigate('CommunityChannelSettings', {
                  communityId, communityName, channelId: ch.id, channelName: ch.name, myRole,
                })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="settings" size={15} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.surface, colors.surface]}
        style={[S.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}
      >
        <TouchableOpacity onPress={() => nav.goBack()} style={S.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[S.headerTitle, { color: colors.textPrimary }]}>Canaux</Text>
          <Text style={[S.headerSub, { color: colors.textTertiary }]}>{communityName}</Text>
        </View>
        {canManage && (
          <TouchableOpacity onPress={openCreate} style={[S.addBtn, { backgroundColor: colors.primary }]}>
            <Icon name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Liste */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={c => c.id}
          renderItem={renderChannel}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.empty}>
              <View style={[S.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="hash" size={30} color={colors.textTertiary} />
              </View>
              <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>Aucun canal</Text>
              <Text style={[S.emptySub, { color: colors.textTertiary }]}>
                {canManage ? 'Créez des canaux pour organiser les discussions.' : 'Aucun canal disponible.'}
              </Text>
              {canManage && (
                <TouchableOpacity style={[S.emptyBtn, { backgroundColor: colors.primary }]} onPress={openCreate}>
                  <Icon name="plus" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Créer un canal</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* ── Modal création / édition ── */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => { if (!saving) setCreateOpen(false); }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={S.overlay} onPress={() => { if (!saving) setCreateOpen(false); }} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[S.sheet, { backgroundColor: colors.surface }]}>
              <View style={[S.sheetHandle, { backgroundColor: colors.divider }]} />

              {/* Header modal */}
              <View style={[S.sheetHeader, { borderBottomColor: colors.divider }]}>
                <View style={[S.sheetHeaderIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Icon name={editChannel ? 'edit-2' : 'plus'} size={16} color={colors.primary} />
                </View>
                <Text style={[S.sheetTitle, { color: colors.textPrimary }]}>
                  {editChannel ? 'Modifier le canal' : 'Nouveau canal'}
                </Text>
                <TouchableOpacity onPress={() => setCreateOpen(false)} disabled={saving}>
                  <Icon name="x" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* Photo de profil */}
                <Text style={[S.label, { color: colors.textSecondary }]}>Photo du canal</Text>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <TouchableOpacity onPress={handlePickAvatar} disabled={avatarUploading} activeOpacity={0.8}>
                    {formAvatar ? (
                      <Image source={{ uri: formAvatar }} style={S.avatarPicker} />
                    ) : (
                      <View style={[S.avatarPicker, { backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.divider, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }]}>
                        {avatarUploading
                          ? <ActivityIndicator color={colors.primary} />
                          : <Icon name="camera" size={26} color={colors.textTertiary} />
                        }
                      </View>
                    )}
                    <View style={[S.avatarEditBadge, { backgroundColor: colors.primary }]}>
                      <Icon name={avatarUploading ? 'loader' : 'camera'} size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  {formAvatar && (
                    <TouchableOpacity onPress={() => setFormAvatar(null)} style={{ marginTop: 6 }}>
                      <Text style={{ color: '#EF4444', fontSize: 12 }}>Supprimer la photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Type */}
                <Text style={[S.label, { color: colors.textSecondary }]}>Type de canal</Text>
                <View style={S.typeRow}>
                  {CHANNEL_TYPES.map(t => {
                    const active = formType === t.key;
                    const col = TYPE_COLORS[t.key];
                    return (
                      <TouchableOpacity
                        key={t.key}
                        style={[S.typeCard, { borderColor: active ? col : colors.divider, backgroundColor: active ? col + '12' : colors.backgroundSecondary }]}
                        onPress={() => setFormType(t.key)}
                        activeOpacity={0.8}
                      >
                        <Icon name={t.icon} size={20} color={active ? col : colors.textTertiary} />
                        <Text style={[S.typeCardLabel, { color: active ? col : colors.textPrimary }]}>{t.label}</Text>
                        <Text style={[S.typeCardDesc, { color: colors.textTertiary }]} numberOfLines={2}>{t.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Emoji + Nom */}
                <Text style={[S.label, { color: colors.textSecondary }]}>Nom & icône</Text>
                <View style={S.nameRow}>
                  <TouchableOpacity
                    style={[S.emojiPicker, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                    onPress={() => setShowEmojiPick(p => !p)}
                  >
                    <Text style={{ fontSize: 22 }}>{formEmoji}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[S.nameInput, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, color: colors.textPrimary }]}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="Nom du canal"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={50}
                  />
                </View>
                {showEmojiPick && (
                  <View style={[S.emojiGrid, { backgroundColor: colors.backgroundSecondary }]}>
                    {CHANNEL_EMOJIS.map(e => (
                      <TouchableOpacity key={e} onPress={() => { setFormEmoji(e); setShowEmojiPick(false); }} style={S.emojiGridBtn}>
                        <Text style={{ fontSize: 22 }}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Description */}
                <Text style={[S.label, { color: colors.textSecondary }]}>Description (optionnel)</Text>
                <TextInput
                  style={[S.descInput, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, color: colors.textPrimary }]}
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Décrivez ce canal…"
                  placeholderTextColor={colors.textTertiary}
                  multiline maxLength={200}
                />

                {/* Privé */}
                <TouchableOpacity
                  style={[S.toggleRow, { borderColor: colors.divider }]}
                  onPress={() => setFormPrivate(p => !p)}
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
                <Text style={[S.label, { color: colors.textSecondary }]}>Mot de passe d'accès (optionnel)</Text>
                {editChannel?.has_password && !removePassword ? (
                  <View style={{ gap: 8, marginBottom: 12 }}>
                    <View style={[S.passwordRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                      <Icon name="key" size={16} color="#F59E0B" />
                      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>Mot de passe actif</Text>
                    </View>
                    <TouchableOpacity
                      style={[S.toggleRow, { borderColor: '#EF444440' }]}
                      onPress={() => setRemovePassword(true)}
                      activeOpacity={0.8}
                    >
                      <Icon name="trash-2" size={15} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600', marginLeft: 8 }}>Supprimer le mot de passe</Text>
                    </TouchableOpacity>
                    <Text style={{ color: colors.textTertiary, fontSize: 12 }}>Ou définissez un nouveau :</Text>
                  </View>
                ) : removePassword ? (
                  <View style={[S.passwordRow, { backgroundColor: '#EF444415', borderColor: '#EF444440', marginBottom: 12 }]}>
                    <Icon name="trash-2" size={14} color="#EF4444" />
                    <Text style={{ flex: 1, color: '#EF4444', fontSize: 13 }}>Mot de passe supprimé à la sauvegarde</Text>
                    <TouchableOpacity onPress={() => setRemovePassword(false)}>
                      <Icon name="x" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <View style={[S.passwordRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, marginBottom: 16 }]}>
                  <Icon name="key" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[{ flex: 1, color: colors.textPrimary, fontSize: 14, marginLeft: 8 }]}
                    value={formPassword}
                    onChangeText={setFormPassword}
                    placeholder={editChannel?.has_password ? 'Nouveau mot de passe…' : 'Définir un mot de passe…'}
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry={!showPassword}
                    maxLength={50}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>

                {/* Bouton sauvegarder */}
                <TouchableOpacity
                  style={[S.saveBtn, { opacity: saving || avatarUploading ? 0.6 : 1 }]}
                  onPress={handleSave}
                  disabled={saving || avatarUploading}
                >
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} style={S.saveBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    {saving ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.saveBtnText}>{editChannel ? 'Enregistrer' : 'Créer le canal'}</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal mot de passe pour rejoindre ── */}
      <Modal visible={!!joinChannel} transparent animationType="fade" onRequestClose={() => setJoinChannel(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}>
          <View style={[S.joinSheet, { backgroundColor: colors.surface }]}>
            <View style={[{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B20', marginBottom: 14, alignSelf: 'center' }]}>
              <Icon name="key" size={24} color="#F59E0B" />
            </View>
            <Text style={[{ fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 }]}>
              Canal protégé
            </Text>
            <Text style={[{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', marginBottom: 20 }]}>
              Ce canal est protégé par un mot de passe.
            </Text>
            <View style={[S.passwordRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, marginBottom: 16 }]}>
              <Icon name="key" size={16} color={colors.textTertiary} />
              <TextInput
                style={[{ flex: 1, color: colors.textPrimary, fontSize: 14, marginLeft: 8 }]}
                value={joinPassword}
                onChangeText={setJoinPassword}
                placeholder="Mot de passe…"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoFocus
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[S.joinCancelBtn, { borderColor: colors.divider }]}
                onPress={() => setJoinChannel(null)}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.joinConfirmBtn, { opacity: joining ? 0.7 : 1 }]}
                onPress={handleJoinWithPassword}
                disabled={joining}
              >
                {joining
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Entrer</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const S = StyleSheet.create({
  root:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub:   { fontSize: 12, marginTop: 1 },
  addBtn:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  channelRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  channelAvatar: { width: 46, height: 46, borderRadius: 14, borderWidth: 1 },
  channelIcon:  { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  channelName:  { fontSize: 15, fontWeight: '700' },
  channelLast:  { fontSize: 12, marginTop: 2 },
  channelTime:  { fontSize: 11 },
  typeBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  unreadBadge:   { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionBtn:     { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyIcon:  { width: 70, height: 70, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  emptyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 8 },
  sheetHandle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetHeaderIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetTitle:      { flex: 1, fontSize: 16, fontWeight: '700' },

  label:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
  typeRow:  { flexDirection: 'row', gap: 8, marginBottom: 4 },
  typeCard: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: 'center', gap: 5 },
  typeCardLabel: { fontSize: 12, fontWeight: '700' },
  typeCardDesc:  { fontSize: 10, textAlign: 'center' },

  nameRow:    { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 },
  emojiPicker: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nameInput:  { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  emojiGrid:  { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, padding: 8, marginBottom: 4, gap: 4 },
  emojiGridBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  descInput:  { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginBottom: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  toggleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkBox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, gap: 8 },

  avatarPicker:   { width: 90, height: 90, borderRadius: 22 },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  saveBtn:     { marginTop: 8, borderRadius: 14, overflow: 'hidden', height: 52 },
  saveBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  joinSheet:      { borderRadius: 20, padding: 24, width: '100%' },
  joinCancelBtn:  { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  joinConfirmBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
});
