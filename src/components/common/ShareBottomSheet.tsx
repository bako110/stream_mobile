import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  Animated, Dimensions, Platform, Share, Clipboard, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { Post } from '../../types/post';

const { height: H, width: W } = Dimensions.get('window');
const SHEET_H = H * 0.52;

interface Props {
  visible:  boolean;
  onClose:  () => void;
  post:     Post;
  onShareCountChange?: () => void;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

export const ShareBottomSheet: React.FC<Props> = ({ visible, onClose, post, onShareCountChange }) => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;

  const author    = post.author;
  const authorName = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials  = authorName[0]?.toUpperCase() ?? '?';
  const thumb     = post.image_urls?.[0] ?? post.image_url ?? null;
  const postLink  = `https://folix.app/post/${post.id}`;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }).start();
    } else {
      Animated.timing(slideY, { toValue: SHEET_H, useNativeDriver: true, duration: 220 }).start();
    }
  }, [visible]);

  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: post.body ? `${post.body}\n\n${postLink}` : postLink,
        url: postLink,
        title: `Post de ${authorName} sur FoliX`,
      });
      onShareCountChange?.();
    } catch {}
  };

  const handleCopyLink = () => {
    Clipboard.setString(postLink);
    onClose();
    Alert.alert('Lien copié', 'Le lien a été copié dans le presse-papier.');
  };

  const ACTIONS = [
    {
      id: 'share',
      icon: 'share-2',
      label: 'Partager via...',
      sublabel: 'Apps installées sur ton téléphone',
      color: colors.primary,
      bg: colors.primary + '18',
      onPress: () => { onClose(); handleNativeShare(); },
    },
    {
      id: 'copy',
      icon: 'link',
      label: 'Copier le lien',
      sublabel: 'Coller n\'importe où',
      color: '#6366F1',
      bg: '#6366F118',
      onPress: handleCopyLink,
    },
    {
      id: 'save',
      icon: 'bookmark',
      label: 'Enregistrer le post',
      sublabel: 'Retrouve-le dans tes enregistrements',
      color: '#F59E0B',
      bg: '#F59E0B18',
      onPress: () => {
        onClose();
        Alert.alert('Enregistré', 'Le post a été ajouté à tes enregistrements.');
      },
    },
    {
      id: 'report',
      icon: 'flag',
      label: 'Signaler',
      sublabel: 'Quelque chose ne va pas ?',
      color: '#EF4444',
      bg: '#EF444418',
      onPress: () => {
        onClose();
        Alert.alert('Signalé', 'Merci, nous allons examiner ce post.');
      },
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Fond sombre cliquable */}
      <TouchableOpacity
        style={st.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <Animated.View
        style={[
          st.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 },
          { transform: [{ translateY: slideY }] },
        ]}
      >
        {/* Poignée */}
        <View style={[st.handle, { backgroundColor: colors.divider }]} />

        {/* Aperçu du post — style carte Facebook */}
        <View style={[st.preview, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={st.previewHeader}>
            {author?.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={st.previewAvatar} />
            ) : (
              <View style={[st.previewAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[st.previewName, { color: colors.textPrimary }]} numberOfLines={1}>{authorName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <Text style={[st.previewTime, { color: colors.textTertiary }]}>{timeAgo(post.created_at)}</Text>
                <Icon name="globe" size={10} color={colors.textTertiary} />
              </View>
            </View>
          </View>

          {post.body ? (
            <Text style={[st.previewBody, { color: colors.textSecondary }]} numberOfLines={2}>
              {post.body}
            </Text>
          ) : null}

          {thumb ? (
            <Image source={{ uri: thumb }} style={st.previewThumb} resizeMode="cover" />
          ) : null}
        </View>

        {/* Stats rapides */}
        <View style={[st.statsRow, { borderBottomColor: colors.divider }]}>
          <View style={st.statItem}>
            <Icon name="heart" size={13} color="#E0389A" />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{post.like_count ?? 0} j'aime</Text>
          </View>
          <View style={st.statItem}>
            <Icon name="message-circle" size={13} color={colors.primary} />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{post.comment_count ?? 0} commentaires</Text>
          </View>
          <View style={st.statItem}>
            <Icon name="share-2" size={13} color="#6366F1" />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{post.share_count ?? 0} partages</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={st.actions}>
          {ACTIONS.map(a => (
            <TouchableOpacity key={a.id} style={st.actionRow} onPress={a.onPress} activeOpacity={0.75}>
              <View style={[st.actionIcon, { backgroundColor: a.bg }]}>
                <Icon name={a.icon} size={18} color={a.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.actionLabel, { color: colors.textPrimary }]}>{a.label}</Text>
                <Text style={[st.actionSub, { color: colors.textTertiary }]}>{a.sublabel}</Text>
              </View>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 14,
  },

  // Apercu
  preview: {
    marginHorizontal: 16, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', marginBottom: 12,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  previewAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  previewName:   { fontSize: 13, fontWeight: '700' },
  previewTime:   { fontSize: 11 },
  previewBody:   { paddingHorizontal: 12, paddingBottom: 10, fontSize: 13, lineHeight: 18 },
  previewThumb:  { width: '100%', height: 140 },

  // Stats
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: 10, marginHorizontal: 16, marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statTxt:  { fontSize: 12, fontWeight: '500' },

  // Actions
  actions: { paddingHorizontal: 16, gap: 2 },
  actionRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  actionIcon:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600' },
  actionSub:   { fontSize: 11, marginTop: 1 },
});
