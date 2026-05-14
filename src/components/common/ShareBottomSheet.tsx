import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  Animated, Dimensions, Platform, Share, Clipboard, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { Post } from '../../types/post';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';

const { height: H } = Dimensions.get('window');
const SHEET_H = H * 0.52;

type ContentType = 'post' | 'event' | 'concert';

interface BaseProps {
  visible:  boolean;
  onClose:  () => void;
  onShareCountChange?: () => void;
}

interface PostProps extends BaseProps   { type: 'post';    post:    Post;    event?: never; concert?: never; }
interface EventProps extends BaseProps  { type: 'event';   event:   Event;   post?: never;  concert?: never; }
interface ConcertProps extends BaseProps { type: 'concert'; concert: Concert; post?: never;  event?: never; }

type Props = PostProps | EventProps | ConcertProps;

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

function getDeepLink(type: ContentType, id: string): string {
  if (type === 'post')    return `folix://post/${id}`;
  if (type === 'event')   return `folix://event/${id}`;
  if (type === 'concert') return `folix://concert/${id}`;
  return 'folix://';
}

export const ShareBottomSheet: React.FC<Props> = (props) => {
  const { visible, onClose, onShareCountChange } = props;
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;

  // Extraire les métadonnées selon le type
  const type = props.type;
  let id: string;
  let authorName: string;
  let authorAvatar: string | null;
  let initials: string;
  let title: string;
  let subtitle: string | null = null;
  let thumb: string | null = null;
  let createdAt: string;
  let likeCount = 0;
  let commentCount = 0;
  let shareCount = 0;

  if (type === 'post') {
    const p = props.post;
    id = p.id;
    const author = p.author;
    authorName   = author?.display_name ?? author?.username ?? 'Utilisateur';
    authorAvatar = author?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = p.body ? (p.body.length > 80 ? p.body.slice(0, 80) + '…' : p.body) : 'Post FoliX';
    thumb        = p.image_urls?.[0] ?? p.image_url ?? null;
    createdAt    = p.created_at;
    likeCount    = p.like_count ?? 0;
    commentCount = p.comment_count ?? 0;
    shareCount   = p.share_count ?? 0;
  } else if (type === 'event') {
    const e = props.event as any;
    id = e.id;
    const organizer = e.organizer;
    authorName   = organizer?.display_name ?? organizer?.username ?? 'Organisateur';
    authorAvatar = organizer?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = e.title ?? 'Événement FoliX';
    subtitle     = e.venue_city ? `${e.venue_city}${e.starts_at ? ' · ' + new Date(e.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}` : null;
    thumb        = e.thumbnail_url ?? e.banner_url ?? null;
    createdAt    = e.created_at;
    likeCount    = e.like_count ?? 0;
    commentCount = e.comment_count ?? 0;
    shareCount   = e.share_count ?? 0;
  } else {
    const c = props.concert as any;
    id = c.id;
    const artist = c.artist;
    authorName   = artist?.display_name ?? artist?.username ?? 'Artiste';
    authorAvatar = artist?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = c.title ?? 'Concert FoliX';
    subtitle     = c.venue_city ? `${c.venue_city}${c.scheduled_at ? ' · ' + new Date(c.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}` : null;
    thumb        = c.thumbnail_url ?? c.banner_url ?? null;
    createdAt    = c.created_at;
    likeCount    = c.like_count ?? 0;
    commentCount = c.comment_count ?? 0;
    shareCount   = c.share_count ?? 0;
  }

  const deepLink = getDeepLink(type, id);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }).start();
    } else {
      Animated.timing(slideY, { toValue: SHEET_H, useNativeDriver: true, duration: 220 }).start();
    }
  }, [visible]);

  const handleNativeShare = async () => {
    try {
      const shareMessage = type === 'post'
        ? (props.post.body ? `${props.post.body}\n\n${deepLink}` : deepLink)
        : `${title}${subtitle ? ' — ' + subtitle : ''}\n\n${deepLink}`;

      await Share.share({
        message: shareMessage,
        url: deepLink,
        title: `${title} sur FoliX`,
      });
      onShareCountChange?.();
    } catch {}
  };

  const handleCopyLink = () => {
    Clipboard.setString(deepLink);
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
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        style={[
          st.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 },
          { transform: [{ translateY: slideY }] },
        ]}
      >
        <View style={[st.handle, { backgroundColor: colors.divider }]} />

        {/* Aperçu */}
        <View style={[st.preview, { backgroundColor: colors.backgroundSecondary ?? colors.surface, borderColor: colors.divider }]}>
          <View style={st.previewHeader}>
            {authorAvatar ? (
              <Image source={{ uri: authorAvatar }} style={st.previewAvatar} />
            ) : (
              <View style={[st.previewAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[st.previewName, { color: colors.textPrimary }]} numberOfLines={1}>{authorName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <Text style={[st.previewTime, { color: colors.textTertiary }]}>{timeAgo(createdAt)}</Text>
                <Icon name="globe" size={10} color={colors.textTertiary} />
              </View>
            </View>
          </View>

          <Text style={[st.previewBody, { color: colors.textSecondary }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[st.previewSub, { color: colors.textTertiary }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}

          {thumb ? (
            <Image source={{ uri: thumb }} style={st.previewThumb} resizeMode="cover" />
          ) : null}
        </View>

        {/* Stats */}
        <View style={[st.statsRow, { borderBottomColor: colors.divider }]}>
          <View style={st.statItem}>
            <Icon name="heart" size={13} color="#E0389A" />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{likeCount} j'aime</Text>
          </View>
          <View style={st.statItem}>
            <Icon name="message-circle" size={13} color={colors.primary} />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{commentCount} commentaires</Text>
          </View>
          <View style={st.statItem}>
            <Icon name="share-2" size={13} color="#6366F1" />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{shareCount} partages</Text>
          </View>
        </View>

        {/* Lien affiché */}
        <View style={[st.linkRow, { borderBottomColor: colors.divider }]}>
          <Icon name="link-2" size={13} color={colors.textTertiary} />
          <Text style={[st.linkText, { color: colors.textTertiary }]} numberOfLines={1}>{deepLink}</Text>
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
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
  preview: {
    marginHorizontal: 16, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', marginBottom: 12,
  },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  previewAvatar:  { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  previewName:    { fontSize: 13, fontWeight: '700' },
  previewTime:    { fontSize: 11 },
  previewBody:    { paddingHorizontal: 12, paddingBottom: 4, fontSize: 13, lineHeight: 18 },
  previewSub:     { paddingHorizontal: 12, paddingBottom: 10, fontSize: 11 },
  previewThumb:   { width: '100%', height: 140 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: 10, marginHorizontal: 16, marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statTxt:  { fontSize: 12, fontWeight: '500' },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  linkText: { fontSize: 11, flex: 1 },
  actions:     { paddingHorizontal: 16, gap: 2 },
  actionRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  actionIcon:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600' },
  actionSub:   { fontSize: 11, marginTop: 1 },
});
