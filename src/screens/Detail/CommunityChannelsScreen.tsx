import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, Pressable,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityChannel, ChannelType } from '../../services/communityService';

interface RouteParams {
  communityId: string;
  communityName: string;
  myRole: string | null;
}

const CHANNEL_TYPES: { key: ChannelType; label: string; icon: string; desc: string }[] = [
  { key: 'text',         label: 'Texte',        icon: 'hash',        desc: 'Salon de discussion général' },
  { key: 'announcement', label: 'Annonces',      icon: 'bell',        desc: 'Réservé aux admins et modérateurs' },
  { key: 'voice',        label: 'Vocal',         icon: 'mic',         desc: 'Canal vocal (bientôt disponible)' },
];

const CHANNEL_EMOJIS = ['💬','📢','🎮','🎵','📚','🎨','🏆','💡','🌍','🎬','⚽','🛠️','🎤','🧵','📸'];

const TYPE_COLORS: Record<ChannelType, string> = {
  text:         '#7B3FF2',
  announcement: '#F59E0B',
  voice:        '#10B981',
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
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

  const [myRole,    setMyRole]    = useState<string | null>(myRoleParam ?? null);
  const isAdmin    = myRole === 'admin';
  const isMod      = myRole === 'moderator';
  const canManage  = isAdmin || isMod;

  const [channels,  setChannels]  = useState<CommunityChannel[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Modal création/édition
  const [createOpen,  setCreateOpen]  = useState(false);
  const [editChannel, setEditChannel] = useState<CommunityChannel | null>(null);
  const [saving,      setSaving]      = useState(false);

  // Champs du formulaire
  const [formName,      setFormName]      = useState('');
  const [formDesc,      setFormDesc]      = useState('');
  const [formType,      setFormType]      = useState<ChannelType>('text');
  const [formEmoji,     setFormEmoji]     = useState('💬');
  const [formPrivate,   setFormPrivate]   = useState(false);
  const [showEmojiPick, setShowEmojiPick] = useState(false);

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
    setCreateOpen(true);
  };

  const openEdit = (ch: CommunityChannel) => {
    setEditChannel(ch);
    setFormName(ch.name);
    setFormDesc(ch.description ?? '');
    setFormType(ch.type);
    setFormEmoji(ch.emoji ?? '💬');
    setFormPrivate(ch.is_private);
    setCreateOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) { Alert.alert('Nom requis', 'Le nom du canal ne peut pas être vide.'); return; }
    setSaving(true);
    try {
      if (editChannel) {
        const updated = await communityService.updateChannel(communityId, editChannel.id, {
          name, description: formDesc.trim() || undefined,
          type: formType, emoji: formEmoji, is_private: formPrivate,
        });
        setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await communityService.createChannel(communityId, {
          name, description: formDesc.trim() || undefined,
          type: formType, emoji: formEmoji, is_private: formPrivate,
        });
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
    nav.navigate('CommunityChannelChat', {
      communityId,
      communityName,
      channelId: ch.id,
      channelName: `${ch.emoji ?? '#'} ${ch.name}`,
      myRole,
      isAnnouncement: ch.type === 'announcement',
    });
  };

  const renderChannel = ({ item: ch }: { item: CommunityChannel }) => {
    const color = TYPE_COLORS[ch.type];
    return (
      <TouchableOpacity
        style={[S.channelRow, { borderBottomColor: colors.divider }]}
        onPress={() => openChannel(ch)}
        activeOpacity={0.75}
      >
        {/* Icone */}
        <View style={[S.channelIcon, { backgroundColor: color + '18' }]}>
          {ch.emoji ? (
            <Text style={{ fontSize: 18 }}>{ch.emoji}</Text>
          ) : (
            <Icon name={ch.type === 'announcement' ? 'bell' : ch.type === 'voice' ? 'mic' : 'hash'} size={18} color={color} />
          )}
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[S.channelName, { color: colors.textPrimary }]} numberOfLines={1}>{ch.name}</Text>
            {ch.is_private && <Icon name="lock" size={11} color={colors.textTertiary} />}
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
              {ch.last_message.content ?? '📷 Média'}
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
          {(ch.unread_count ?? 0) > 0 && (
            <View style={[S.unreadBadge, { backgroundColor: color }]}>
              <Text style={S.unreadText}>{ch.unread_count! > 99 ? '99+' : ch.unread_count}</Text>
            </View>
          )}
        </View>

        {/* Actions admin */}
        {canManage && (
          <View style={{ flexDirection: 'row', gap: 2, marginLeft: 8 }}>
            <TouchableOpacity onPress={() => openEdit(ch)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={S.actionBtn}>
              <Icon name="edit-2" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(ch)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={S.actionBtn}>
              <Icon name="trash-2" size={14} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
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
                {canManage
                  ? 'Créez des canaux pour organiser les discussions par thème.'
                  : 'Aucun canal disponible pour l\'instant.'}
              </Text>
              {canManage && (
                <TouchableOpacity
                  style={[S.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={openCreate}
                >
                  <Icon name="plus" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Créer un canal</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Modal création / édition */}
      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!saving) setCreateOpen(false); }}
      >
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
          <Pressable style={S.overlay} onPress={() => { if (!saving) setCreateOpen(false); }} />
          <View style={[S.sheet, { backgroundColor: colors.surface, zIndex: 10 }]}>
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
                  style={[S.nameInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                  placeholder="nom-du-canal"
                  placeholderTextColor={colors.textTertiary}
                  value={formName}
                  onChangeText={v => setFormName(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-àâéèêëîïôùûüç]/g, ''))}
                  maxLength={50}
                  autoCapitalize="none"
                />
              </View>

              {/* Grille emoji */}
              {showEmojiPick && (
                <View style={[S.emojiGrid, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                  {CHANNEL_EMOJIS.map(e => (
                    <TouchableOpacity key={e} onPress={() => { setFormEmoji(e); setShowEmojiPick(false); }} style={S.emojiCell}>
                      <Text style={{ fontSize: 24 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Description */}
              <Text style={[S.label, { color: colors.textSecondary }]}>Description (optionnelle)</Text>
              <TextInput
                style={[S.descInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                placeholder="À quoi sert ce canal ?"
                placeholderTextColor={colors.textTertiary}
                value={formDesc}
                onChangeText={setFormDesc}
                maxLength={200}
                multiline
              />

              {/* Privé */}
              <TouchableOpacity
                style={[S.privateRow, { borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                onPress={() => setFormPrivate(p => !p)}
                activeOpacity={0.8}
              >
                <View style={[S.privateIconBox, { backgroundColor: formPrivate ? colors.primary + '20' : colors.backgroundSecondary }]}>
                  <Icon name={formPrivate ? 'lock' : 'unlock'} size={18} color={formPrivate ? colors.primary : colors.textTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[S.privateLabel, { color: colors.textPrimary }]}>Canal privé</Text>
                  <Text style={[S.privateDesc, { color: colors.textTertiary }]}>
                    Seuls les membres ajoutés explicitement peuvent y accéder
                  </Text>
                </View>
                <View style={[S.toggle, { backgroundColor: formPrivate ? colors.primary : colors.divider }]}>
                  <View style={[S.toggleThumb, { left: formPrivate ? 18 : 2 }]} />
                </View>
              </TouchableOpacity>

              {/* Bouton enregistrer */}
              <TouchableOpacity
                style={[S.saveBtn, { backgroundColor: saving ? colors.primary + '80' : colors.primary, marginBottom: 32 }]}
                onPress={handleSave}
                disabled={saving || !formName.trim()}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Icon name={editChannel ? 'check' : 'plus'} size={18} color="#fff" />
                      <Text style={S.saveBtnText}>{editChannel ? 'Enregistrer' : 'Créer le canal'}</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const S = StyleSheet.create({
  root:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub:   { fontSize: 12, marginTop: 1 },
  addBtn:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  channelRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  channelIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  channelName: { fontSize: 15, fontWeight: '700' },
  channelLast: { fontSize: 12, marginTop: 2 },
  channelTime: { fontSize: 11 },
  typeBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  unreadBadge:   { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  emptyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetHeaderIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700' },

  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },

  typeRow:  { flexDirection: 'row', gap: 8 },
  typeCard: { flex: 1, borderWidth: 1.5, borderRadius: 14, padding: 12, alignItems: 'center', gap: 6 },
  typeCardLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  typeCardDesc:  { fontSize: 10, textAlign: 'center', lineHeight: 14 },

  nameRow:    { flexDirection: 'row', gap: 10, alignItems: 'center' },
  emojiPicker: { width: 50, height: 50, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nameInput:  { flex: 1, height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },

  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: 14, padding: 8, marginTop: 8, gap: 4 },
  emojiCell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  descInput: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 4 },

  privateRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 6 },
  privateIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  privateLabel:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  privateDesc:    { fontSize: 12, lineHeight: 16 },
  toggle:         { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb:    { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },

  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, marginTop: 16 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
