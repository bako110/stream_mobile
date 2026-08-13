import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  Animated, Dimensions, ActivityIndicator, TextInput, FlatList, Linking,
  ScrollView,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/Feather';
import BrandIcon from 'react-native-vector-icons/FontAwesome6';
import MailIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNBlobUtil from 'react-native-blob-util';
import RNShare from 'react-native-share';
import { useTheme } from '../../hooks/useTheme';
import { encodeId } from '../../utils/slugId';
import { socialService } from '../../services/socialService';
import { toastService } from '../../services/toastService';
import { messageService, type ConversationSummary } from '../../services/messageService';
import type { Post } from '../../types/post';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Reel } from '../../types/reel';
import type { FilmItem } from '../../screens/Main/FilmsScreen';

const { height: H } = Dimensions.get('window');
const SHEET_H = H * 0.72;

// Types acceptés par le backend pour le partage interne (message type=share) —
// "film"/"serie" ne sont qu'un seul share_type "content" côté backend.
const INTERNAL_SHARE_TYPE: Record<string, string | undefined> = {
  post: 'post', event: 'event', concert: 'concert', reel: 'reel',
  film: 'content', serie: 'content',
};

const APP_DOMAIN = 'https://gofolyx.com';

type ContentType = 'post' | 'event' | 'concert' | 'reel' | 'film' | 'serie';

interface BaseProps {
  visible:  boolean;
  onClose:  () => void;
  onShareCountChange?: () => void;
}

interface PostProps    extends BaseProps { type: 'post';    post:    Post;     event?: never; concert?: never; reel?: never; film?: never; }
interface EventProps   extends BaseProps { type: 'event';   event:   Event;    post?: never;  concert?: never; reel?: never; film?: never; }
interface ConcertProps extends BaseProps { type: 'concert'; concert: Concert;  post?: never;  event?: never;   reel?: never; film?: never; }
interface ReelProps    extends BaseProps { type: 'reel';    reel:    Reel;     post?: never;  event?: never;   concert?: never; film?: never; }
interface FilmProps    extends BaseProps { type: 'film' | 'serie'; film: FilmItem; post?: never; event?: never; concert?: never; reel?: never; }

type Props = PostProps | EventProps | ConcertProps | ReelProps | FilmProps;

function timeAgo(iso: string) {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} j`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function getShareUrl(type: ContentType, id: string): string {
  const slug = encodeId(id);
  if (type === 'post')    return `${APP_DOMAIN}/posts/${slug}`;
  if (type === 'event')   return `${APP_DOMAIN}/events/${slug}`;
  if (type === 'concert') return `${APP_DOMAIN}/concerts/${slug}`;
  if (type === 'reel')    return `${APP_DOMAIN}/reels?id=${slug}`;
  if (type === 'serie')   return `${APP_DOMAIN}/series/${slug}`;
  if (type === 'film')    return `${APP_DOMAIN}/films/${slug}`;
  return APP_DOMAIN;
}

function getDisplayUrl(type: ContentType, id: string): string {
  const slug = encodeId(id);
  if (type === 'post')    return `gofolyx.com/posts/${slug}`;
  if (type === 'event')   return `gofolyx.com/events/${slug}`;
  if (type === 'concert') return `gofolyx.com/concerts/${slug}`;
  if (type === 'reel')    return `gofolyx.com/reels?id=${slug}`;
  if (type === 'serie')   return `gofolyx.com/series/${slug}`;
  if (type === 'film')    return `gofolyx.com/films/${slug}`;
  return 'gofolyx.com';
}

export const ShareBottomSheet: React.FC<Props> = (props) => {
  const { visible, onClose, onShareCountChange } = props;
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;

  const type = props.type;
  let id: string;
  let authorName: string;
  let authorAvatar: string | null;
  let initials: string;
  let title: string;
  let subtitle: string | null = null;
  let thumb: string | null = null;
  let videoUrl: string | null = null;
  let createdAt: string;
  let likeCount = 0;
  let commentCount = 0;
  let shareCount = 0;

  if (type === 'post') {
    const p = props.post;
    id           = p.id;
    const author = p.author;
    authorName   = author?.display_name ?? author?.username ?? 'Utilisateur';
    authorAvatar = author?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = p.body ? (p.body.length > 80 ? p.body.slice(0, 80) + '…' : p.body) : 'Post GoFolyX';
    thumb        = p.image_urls?.[0] ?? p.image_url ?? null;
    videoUrl     = p.video_url ?? null;
    createdAt    = p.created_at;
    likeCount    = p.like_count ?? 0;
    commentCount = p.comment_count ?? 0;
    shareCount   = p.share_count ?? 0;
  } else if (type === 'event') {
    const e = props.event as any;
    id           = e.id;
    const org    = e.organizer;
    authorName   = org?.display_name ?? org?.username ?? 'Organisateur';
    authorAvatar = org?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = e.title ?? 'Événement GoFolyX';
    subtitle     = e.venue_city
      ? `${e.venue_city}${e.starts_at ? ' · ' + new Date(e.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}`
      : null;
    thumb        = e.thumbnail_url ?? e.banner_url ?? null;
    videoUrl     = e.video_url ?? null;
    createdAt    = e.created_at;
    likeCount    = e.like_count ?? 0;
    commentCount = e.comment_count ?? 0;
    shareCount   = e.share_count ?? 0;
  } else if (type === 'concert') {
    const c = props.concert as any;
    id           = c.id;
    const artist = c.artist;
    authorName   = artist?.display_name ?? artist?.username ?? 'Artiste';
    authorAvatar = artist?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = c.title ?? 'Concert GoFolyX';
    subtitle     = c.venue_city
      ? `${c.venue_city}${c.scheduled_at ? ' · ' + new Date(c.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}`
      : null;
    thumb        = c.thumbnail_url ?? c.banner_url ?? null;
    videoUrl     = c.video_url ?? null;
    createdAt    = c.created_at;
    likeCount    = c.like_count ?? 0;
    commentCount = c.comment_count ?? 0;
    shareCount   = c.share_count ?? 0;
  } else if (type === 'reel') {
    const r = props.reel as Reel;
    id           = r.id;
    const author = r.author;
    authorName   = author?.display_name ?? author?.username ?? 'Utilisateur';
    authorAvatar = author?.avatar_url ?? null;
    initials     = authorName[0]?.toUpperCase() ?? '?';
    title        = r.caption ? (r.caption.length > 80 ? r.caption.slice(0, 80) + '…' : r.caption) : 'Reel GoFolyX';
    subtitle     = null;
    thumb        = r.thumbnail_url ?? null;
    videoUrl     = r.hls_url ?? null;
    createdAt    = r.created_at;
    likeCount    = r.like_count ?? 0;
    commentCount = r.comment_count ?? 0;
    shareCount   = r.share_count ?? 0;
  } else {
    const f = props.film as FilmItem;
    id           = f.id;
    authorName   = 'GoFolyX';
    authorAvatar = null;
    initials     = 'G';
    title        = f.title ?? 'Contenu GoFolyX';
    subtitle     = f.year ? String(f.year) : null;
    thumb        = f.thumbnail_url ?? f.banner_url ?? null;
    videoUrl     = null;
    createdAt    = new Date().toISOString();
    likeCount    = 0;
    commentCount = 0;
    shareCount   = 0;
  }

  const shareUrl   = getShareUrl(type, id);
  const displayUrl = getDisplayUrl(type, id);

  const [sharing, setSharing] = useState(false);

  // ── Envoi interne à un contact (comme Instagram/Facebook) ──────────────────
  const shareTypeInternal = INTERNAL_SHARE_TYPE[type];
  const [conversations,  setConversations]  = useState<ConversationSummary[]>([]);
  const [loadingConvos,  setLoadingConvos]  = useState(false);
  const [contactSearch,  setContactSearch]  = useState('');
  const [sendingTo,      setSendingTo]      = useState<Set<string>>(new Set());
  const [sentTo,         setSentTo]         = useState<Set<string>>(new Set());
  const fetchedConvos = useRef(false);

  useEffect(() => {
    if (!visible || !shareTypeInternal || fetchedConvos.current) return;
    fetchedConvos.current = true;
    setLoadingConvos(true);
    messageService.getConversations()
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoadingConvos(false));
  }, [visible, shareTypeInternal]);

  useEffect(() => {
    if (!visible) { setSentTo(new Set()); setSendingTo(new Set()); setContactSearch(''); }
  }, [visible]);

  const filteredConvos = contactSearch.trim()
    ? conversations.filter(c =>
        (c.partner.full_name ?? '').toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.partner.username ?? '').toLowerCase().includes(contactSearch.toLowerCase()))
    : conversations;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }).start();
    } else {
      Animated.timing(slideY, { toValue: SHEET_H, useNativeDriver: true, duration: 220 }).start();
    }
  }, [visible]);

  const recordShare = (platform: string) => {
    const payload: Record<string, string> = { platform };
    if (type === 'post')    payload.post_id    = id;
    if (type === 'event')   payload.event_id   = id;
    if (type === 'concert') payload.concert_id = id;
    if (type === 'reel')    payload.reel_id    = id;
    if (type === 'film')    payload.content_id = id;
    socialService.share(payload as any).catch(() => {});
  };

  const sendToContact = useCallback(async (partnerId: string) => {
    if (!shareTypeInternal || sendingTo.has(partnerId) || sentTo.has(partnerId)) return;
    setSendingTo(prev => new Set(prev).add(partnerId));
    try {
      await messageService.sendMessage(partnerId, '', 'share', undefined, {
        share_type: shareTypeInternal, share_id: id,
      } as any);
      setSentTo(prev => new Set(prev).add(partnerId));
      recordShare('external');
      onShareCountChange?.();
    } catch (e: any) {
      const detail = (e?.data as any)?.detail;
      const code = detail && typeof detail === 'object' ? detail.code : undefined;
      const message = detail && typeof detail === 'object' ? detail.message
        : typeof detail === 'string' ? detail
        : undefined;
      if (code === 'conversation_blocked') {
        toastService.error('Erreur', 'Cette personne a bloqué la conversation.');
      } else if (code === 'pending_limit') {
        toastService.error('Erreur', 'Vous avez déjà envoyé un message — attendez une réponse.');
      } else {
        toastService.error('Erreur', message ?? "Impossible d'envoyer ce contenu.");
      }
    } finally {
      setSendingTo(prev => { const n = new Set(prev); n.delete(partnerId); return n; });
    }
  }, [shareTypeInternal, id, sendingTo, sentTo]);

  // Réseaux sociaux — même liste et mêmes URLs d'intent que le web
  // (ShareModal.tsx), via Linking.openURL au lieu de window.open : sur
  // mobile ça ouvre directement l'app installée (WhatsApp/Telegram/
  // Messenger) plutôt qu'une page web, quand elle est présente.
  const encodedUrl   = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  function openPlatform(platform: string, url: string) {
    onClose();
    recordShare(platform);
    onShareCountChange?.();
    Linking.openURL(url).catch(() => {
      toastService.error('Erreur', "Impossible d'ouvrir l'application.");
    });
  }

  const PLATFORMS: { id: string; label: string; icon: React.ReactNode; bg: string; onPress: () => void }[] = [
    {
      id: 'facebook', label: 'Facebook', bg: '#1877F215',
      icon: <BrandIcon name="facebook" size={22} color="#1877F2" />,
      onPress: () => openPlatform('facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`),
    },
    {
      id: 'whatsapp', label: 'WhatsApp', bg: '#25D36615',
      icon: <BrandIcon name="whatsapp" size={22} color="#25D366" />,
      onPress: () => openPlatform('whatsapp', `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`),
    },
    {
      id: 'twitter', label: 'X (Twitter)', bg: colors.backgroundSecondary,
      icon: <BrandIcon name="x-twitter" size={20} color={colors.textPrimary} />,
      onPress: () => openPlatform('twitter', `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`),
    },
    {
      id: 'telegram', label: 'Telegram', bg: '#26A5E415',
      icon: <BrandIcon name="telegram" size={22} color="#26A5E4" />,
      onPress: () => openPlatform('external', `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`),
    },
    {
      id: 'messenger', label: 'Messenger', bg: '#0084FF15',
      icon: <BrandIcon name="facebook-messenger" size={22} color="#0084FF" />,
      onPress: () => openPlatform('external', `https://www.facebook.com/dialog/send?link=${encodedUrl}&redirect_uri=${encodedUrl}&app_id=966242223397117`),
    },
    {
      id: 'email', label: 'E-mail', bg: colors.backgroundSecondary,
      icon: <MailIcon name="email-outline" size={22} color={colors.textSecondary} />,
      onPress: () => openPlatform('external', `mailto:?subject=${encodedTitle}&body=${encodedUrl}`),
    },
  ];

  const handleNativeShare = async () => {
    setSharing(true);
    try {
      const caption = type === 'post' && props.post.body
        ? `${props.post.body}\n\n${shareUrl}`
        : `${title}${subtitle ? ' — ' + subtitle : ''}\n\n${shareUrl}`;

      // Pour les reels, hls_url n'est pas partageable — on utilise la thumbnail
      const shareableVideo = type === 'reel' ? null : videoUrl;
      const mediaUrl = shareableVideo ?? thumb;
      if (mediaUrl) {
        try {
          const isVideo = !!shareableVideo;
          const ext  = isVideo ? 'mp4' : (mediaUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg');
          const mime = isVideo ? 'video/mp4' : (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
          const dest = `${RNBlobUtil.fs.dirs.CacheDir}/share_${id.replace(/-/g, '')}.${ext}`;

          await RNBlobUtil.config({ path: dest, overwrite: true }).fetch('GET', mediaUrl);

          // file:// URI — seul format accepté par WhatsApp/Instagram/TikTok sur Android
          await RNShare.open({
            url: `file://${dest}`,
            type: mime,
            message: caption,
            failOnCancel: false,
          });
          recordShare('external');
          onShareCountChange?.();
          return;

        } catch (e: any) {
          if (e?.error === 'User did not share' || e?.dismissedAction) return;
          // téléchargement raté → fallback lien seul
        }
      }

      // Fallback sans image : lien seul
      await RNShare.open({
        message: caption,
        failOnCancel: false,
      });
      recordShare('external');
      onShareCountChange?.();
    } catch {
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = () => {
    Clipboard.setString(shareUrl);
    recordShare('external');
    onShareCountChange?.();
    onClose();
    toastService.success('Lien copié', `gofolyx.com — le lien a été copié dans le presse-papier.`);
  };

  const ACTIONS = [
    {
      id: 'share',
      icon: 'share-2',
      label: 'Partager',
      sublabel: videoUrl ? 'Vidéo + lien — WhatsApp, Instagram, TikTok…' : thumb ? 'Image + lien — WhatsApp, Instagram, TikTok…' : 'Lien — WhatsApp, Telegram…',
      onPress: () => { onClose(); handleNativeShare(); },
    },
    {
      id: 'copy',
      icon: 'link',
      label: 'Copier le lien',
      sublabel: displayUrl,
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

      <Animated.View style={[st.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }, { transform: [{ translateY: slideY }] }]}>
        <View style={[st.handle, { backgroundColor: colors.divider }]} />

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Aperçu */}
        {type === 'reel' ? (
          /* ── Reel preview style TikTok ── */
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={st.reelCard}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="video" size={32} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              {/* Gradient bas */}
              <View style={st.reelGradient} />
              {/* Play centré */}
              <View style={st.reelPlayBtn}>
                <Icon name="play" size={22} color="#fff" />
              </View>
              {/* Auteur en bas */}
              <View style={st.reelAuthorRow}>
                {authorAvatar ? (
                  <Image source={{ uri: authorAvatar }} style={st.reelAvatar} />
                ) : (
                  <View style={[st.reelAvatar, { backgroundColor: colors.primary + '55', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>{initials}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={st.reelAuthorName} numberOfLines={1}>{authorName}</Text>
                  {title ? <Text style={st.reelCaption} numberOfLines={1}>{title}</Text> : null}
                </View>
              </View>
            </View>
          </View>
        ) : (
          /* ── Aperçu standard (post / event / concert) ── */
          <View style={[st.preview, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
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
            <Text style={[st.previewBody, { color: colors.textSecondary }]} numberOfLines={2}>{title}</Text>
            {subtitle ? (
              <Text style={[st.previewSub, { color: colors.textTertiary }]} numberOfLines={1}>{subtitle}</Text>
            ) : null}
            {thumb ? (
              <Image source={{ uri: thumb }} style={st.previewThumb} resizeMode="cover" />
            ) : null}
          </View>
        )}

        {/* Envoyer à — contacts internes, comme Instagram/Facebook */}
        {shareTypeInternal && (
          <View style={{ marginBottom: 10 }}>
            <View style={[st.contactSearchWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="search" size={13} color={colors.textTertiary} />
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                placeholder="Rechercher un contact…"
                placeholderTextColor={colors.textTertiary}
                style={[st.contactSearchInput, { color: colors.textPrimary }]}
              />
            </View>
            {loadingConvos ? (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredConvos.length === 0 ? (
              <Text style={[st.noContacts, { color: colors.textTertiary }]}>
                {contactSearch ? 'Aucun contact trouvé' : 'Aucune conversation récente'}
              </Text>
            ) : (
              <FlatList
                data={filteredConvos}
                keyExtractor={c => c.partner.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
                renderItem={({ item: c }) => {
                  const sending = sendingTo.has(c.partner.id);
                  const sent = sentTo.has(c.partner.id);
                  const name = c.partner.full_name ?? c.partner.username ?? 'Utilisateur';
                  return (
                    <TouchableOpacity
                      onPress={() => sendToContact(c.partner.id)}
                      disabled={sending}
                      style={st.contactItem}
                      activeOpacity={0.75}
                    >
                      <View style={st.contactAvatarWrap}>
                        {c.partner.avatar_url ? (
                          <Image source={{ uri: c.partner.avatar_url }} style={[st.contactAvatar, sent && { opacity: 0.5 }]} />
                        ) : (
                          <View style={[st.contactAvatar, { backgroundColor: colors.primary + '55', alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{name[0]?.toUpperCase() ?? '?'}</Text>
                          </View>
                        )}
                        {sending && (
                          <View style={st.contactOverlay}><ActivityIndicator size="small" color="#fff" /></View>
                        )}
                        {sent && (
                          <View style={st.contactOverlay}><Icon name="check" size={18} color="#fff" /></View>
                        )}
                      </View>
                      <Text numberOfLines={1} style={[st.contactName, { color: colors.textSecondary }]}>{name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}

        {/* Réseaux sociaux — même liste que le web (ShareModal.tsx) */}
        <View style={st.platformsGrid}>
          {PLATFORMS.map(p => (
            <TouchableOpacity key={p.id} onPress={p.onPress} style={st.platformItem} activeOpacity={0.75}>
              <View style={[st.platformIconWrap, { backgroundColor: p.bg }]}>
                {p.icon}
              </View>
              <Text style={[st.platformLabel, { color: colors.textSecondary }]} numberOfLines={1}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats */}
        <View style={[st.statsRow, { borderBottomColor: colors.divider }]}>
          <View style={st.statItem}>
            <Icon name="heart" size={13} color={colors.gradientEnd} />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{likeCount.toLocaleString('fr')} j'aime</Text>
          </View>
          <View style={st.statItem}>
            <Icon name="message-circle" size={13} color={colors.primary} />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{commentCount.toLocaleString('fr')} commentaires</Text>
          </View>
          <View style={st.statItem}>
            <Icon name="share-2" size={13} color={colors.primary} />
            <Text style={[st.statTxt, { color: colors.textTertiary }]}>{shareCount.toLocaleString('fr')} partages</Text>
          </View>
        </View>

        {/* URL affichée */}
        <View style={[st.urlRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Icon name="globe" size={13} color={colors.primary} />
          <Text style={[st.urlText, { color: colors.textSecondary }]} numberOfLines={1}>{displayUrl}</Text>
        </View>

        {/* Actions */}
        <View style={st.actions}>
          {ACTIONS.map((a, i) => (
            <TouchableOpacity
              key={a.id}
              style={[st.actionRow, i < ACTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, sharing && a.id === 'share' && { opacity: 0.6 }]}
              onPress={sharing && a.id === 'share' ? undefined : a.onPress}
              activeOpacity={0.75}
            >
              <View style={[st.actionIcon, { backgroundColor: colors.primary + '18' }]}>
                {a.id === 'share' && sharing
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Icon name={a.icon} size={18} color={colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.actionLabel, { color: colors.textPrimary }]}>{a.label}</Text>
                <Text style={[st.actionSub, { color: colors.textTertiary }]}>{a.sublabel}</Text>
              </View>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop:      { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: SHEET_H,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
  },
  handle:        { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },

  /* Reel TikTok-style */
  reelCard: {
    width: 130, height: 210, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#111',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  reelGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reelPlayBtn: {
    position: 'absolute', top: '50%', left: '50%',
    marginTop: -24, marginLeft: -24,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  reelAuthorRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8,
  },
  reelAvatar:     { width: 24, height: 24, borderRadius: 12, overflow: 'hidden' },
  reelAuthorName: { color: '#fff', fontSize: 11, fontWeight: '700' },
  reelCaption:    { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 1 },
  preview: {
    marginHorizontal: 16, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', marginBottom: 10,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  previewAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  previewName:   { fontSize: 13, fontWeight: '700' },
  previewTime:   { fontSize: 11 },
  previewBody:   { paddingHorizontal: 12, paddingBottom: 4, fontSize: 13, lineHeight: 18 },
  previewSub:    { paddingHorizontal: 12, paddingBottom: 10, fontSize: 11 },
  previewThumb:  { width: '100%', height: 140 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: 10, marginHorizontal: 16, marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statTxt:   { fontSize: 12, fontWeight: '500' },
  urlRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  urlText:      { fontSize: 12, flex: 1, fontWeight: '500' },
  actions:      { paddingHorizontal: 16 },
  actionRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  actionIcon:   { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 14, fontWeight: '600' },
  actionSub:    { fontSize: 11, marginTop: 1 },

  contactSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  contactSearchInput: { flex: 1, fontSize: 13, padding: 0 },
  noContacts:      { fontSize: 12, textAlign: 'center', paddingVertical: 14 },
  contactItem:     { alignItems: 'center', width: 60, gap: 5 },
  contactAvatarWrap: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
  contactAvatar:   { width: 52, height: 52, borderRadius: 26 },
  contactOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  contactName:     { fontSize: 10, textAlign: 'center' },

  platformsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingBottom: 14, gap: 14,
  },
  platformItem:     { alignItems: 'center', gap: 6, width: 62 },
  platformIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  platformLabel:    { fontSize: 10, fontWeight: '500', textAlign: 'center' },
});
