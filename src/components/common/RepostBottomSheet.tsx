/**
 * RepostBottomSheet — confirmation avant republication (post/event/concert).
 * Affiche un aperçu du contenu (auteur original, titre/texte, média) et un
 * bouton de confirmation explicite — avant ça, un tap sur l'icône repeat
 * republiait instantanément sans aucun aperçu ni confirmation, quel que
 * soit le type de contenu.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  Animated, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { GofolyxLoader } from './FolixLoader';

type RepostKind = 'post' | 'event' | 'concert';

interface RepostAuthor {
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
}

interface Props {
  visible:   boolean;
  kind:      RepostKind;
  author:    RepostAuthor | null | undefined;
  title?:    string | null;   // titre (event/concert) — absent pour un post
  body?:     string | null;   // texte (post) — absent pour event/concert
  thumb?:    string | null;
  reposting: boolean;
  onConfirm: () => void;
  onClose:   () => void;
}

const { height: H } = Dimensions.get('window');
const SHEET_H = H * 0.6;

const KIND_LABEL: Record<RepostKind, string> = {
  post: 'ce post', event: 'cet événement', concert: 'ce concert',
};

export const RepostBottomSheet: React.FC<Props> = ({ visible, kind, author, title, body, thumb, reposting, onConfirm, onClose }) => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }).start();
    } else {
      Animated.timing(slideY, { toValue: SHEET_H, useNativeDriver: true, duration: 220 }).start();
    }
  }, [visible]);

  const authorName = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = authorName[0]?.toUpperCase() ?? '?';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[st.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }, { transform: [{ translateY: slideY }] }]}>
        <View style={[st.handle, { backgroundColor: colors.divider }]} />

        <Text style={[st.title, { color: colors.textPrimary }]}>Republier {KIND_LABEL[kind]}</Text>
        <Text style={[st.subtitle, { color: colors.textTertiary }]}>
          Visible sur ton profil avec la mention de l'auteur original.
        </Text>

        {/* Aperçu du contenu à republier */}
        <View style={[st.preview, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={st.authorRow}>
            {author?.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={st.avatar} />
            ) : (
              <View style={[st.avatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[st.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{authorName}</Text>
                {author?.is_verified && (
                  <Icon name="check-circle" size={13} color={colors.primary} />
                )}
              </View>
              <Text style={[st.authorHint, { color: colors.textTertiary }]}>Auteur original</Text>
            </View>
          </View>

          {thumb ? (
            <Image source={{ uri: thumb }} style={st.thumb} resizeMode="cover" />
          ) : null}

          {title ? (
            <Text style={[st.contentTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {title}
            </Text>
          ) : null}

          {body ? (
            <Text style={[st.body, { color: colors.textSecondary }]} numberOfLines={4}>
              {body}
            </Text>
          ) : null}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[st.confirmBtn, { backgroundColor: colors.primary, opacity: reposting ? 0.7 : 1 }]}
          onPress={onConfirm}
          disabled={reposting}
          activeOpacity={0.85}
        >
          {reposting ? (
            <GofolyxLoader variant="bar" color="#fff" />
          ) : (
            <>
              <Icon name="repeat" size={16} color="#fff" />
              <Text style={st.confirmBtnText}>Republier</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={st.cancelBtn} onPress={onClose} disabled={reposting}>
          <Text style={[st.cancelBtnText, { color: colors.textSecondary }]}>Annuler</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: SHEET_H,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16, lineHeight: 18 },

  preview: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, marginBottom: 18 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  authorName: { fontSize: 14, fontWeight: '700' },
  authorHint: { fontSize: 11, marginTop: 1 },
  thumb: { width: '100%', aspectRatio: 1.5, borderRadius: 12 },
  contentTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  body: { fontSize: 13, lineHeight: 19 },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14, marginBottom: 8,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
