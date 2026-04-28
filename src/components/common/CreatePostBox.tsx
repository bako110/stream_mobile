import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import type { User } from '../../types/user';
import type { Post } from '../../types/post';
import { postService } from '../../services/postService';
import { uploadMessageImage } from '../../services/uploadService';

const FEELINGS = ['😊 Content', '😢 Triste', '😂 Heureux', '🔥 Motivé', '🎉 Excité', '😎 Cool', '🤔 Pensif', '💪 Fier'];

interface Props {
  currentUser: User | null;
  colors: AppColors;
  onPostCreated: (post: Post) => void;
}

export const CreatePostBox: React.FC<Props> = ({ currentUser, colors, onPostCreated }) => {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const [feeling, setFeeling] = useState<string | undefined>();
  const [localImageUri, setLocalImageUri] = useState<string | undefined>();
  const [showFeelings, setShowFeelings] = useState(false);
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials = displayName ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';
  const firstName = displayName.split(' ')[0];

  const reset = () => {
    setBody('');
    setFeeling(undefined);
    setLocalImageUri(undefined);
    setShowFeelings(false);
    setExpanded(false);
  };

  const handlePost = async () => {
    if (!body.trim() && !localImageUri) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      if (localImageUri) {
        const uploaded = await uploadMessageImage(localImageUri);
        imageUrl = uploaded?.url;
      }
      const post = await postService.create({
        body: body.trim() || undefined,
        image_url: imageUrl,
        feeling,
      });
      onPostCreated(post);
      reset();
    } catch {
      Alert.alert('Erreur', 'Impossible de publier.');
    } finally {
      setPosting(false);
    }
  };

  const handlePickImage = () => {
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.85 as any }, (response) => {
      if (response.didCancel || response.errorCode) return;
      const uri = response.assets?.[0]?.uri;
      if (uri) setLocalImageUri(uri);
    });
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[box.collapsed, { backgroundColor: colors.surface, borderColor: colors.border }]}
        activeOpacity={0.85}
        onPress={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 100); }}
      >
        <AvatarMini user={currentUser} initials={initials} colors={colors} />
        <Text style={[box.placeholder, { color: colors.textTertiary }]}>
          {firstName ? `Quoi de neuf, ${firstName} ?` : 'Quoi de neuf ?'}
        </Text>
        <View style={[box.photoBtn, { borderColor: colors.primary + '55' }]}>
          <Icon name="image" size={16} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[box.expanded, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={box.header}>
        <AvatarMini user={currentUser} initials={initials} colors={colors} />
        <View style={{ flex: 1 }}>
          <Text style={[box.authorName, { color: colors.textPrimary }]}>{displayName}</Text>
          {feeling ? (
            <Text style={[box.feelingTag, { color: colors.primary }]}>se sent {feeling}</Text>
          ) : (
            <Text style={[box.audience, { color: colors.textTertiary }]}>Public</Text>
          )}
        </View>
        <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Input */}
      <TextInput
        ref={inputRef}
        style={[box.input, { color: colors.textPrimary }]}
        placeholder={firstName ? `Quoi de neuf, ${firstName} ?` : 'Quoi de neuf ?'}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={2000}
        value={body}
        onChangeText={setBody}
      />

      {/* Image preview */}
      {localImageUri ? (
        <View style={box.imagePreviewWrap}>
          <Image source={{ uri: localImageUri }} style={box.imagePreview} resizeMode="cover" />
          <TouchableOpacity style={box.imageRemoveBtn} onPress={() => setLocalImageUri(undefined)}>
            <Icon name="x-circle" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Feelings picker */}
      {showFeelings && (
        <View style={[box.feelingsGrid, { borderTopColor: colors.divider }]}>
          {FEELINGS.map(f => (
            <TouchableOpacity
              key={f}
              style={[
                box.feelingChip,
                {
                  backgroundColor: feeling === f ? colors.primary + '22' : colors.backgroundSecondary,
                  borderColor: feeling === f ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { setFeeling(feeling === f ? undefined : f); setShowFeelings(false); }}
            >
              <Text style={{ fontSize: 13, color: feeling === f ? colors.primary : colors.textPrimary }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action bar */}
      <View style={[box.actionBar, { borderTopColor: colors.divider }]}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={box.actionChip} onPress={handlePickImage}>
            <Icon name="image" size={18} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[box.actionChip, showFeelings && { backgroundColor: colors.primary + '18' }]}
            onPress={() => setShowFeelings(v => !v)}
          >
            <Text style={{ fontSize: 16 }}>😊</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            box.publishBtn,
            { backgroundColor: (!body.trim() && !localImageUri) ? colors.primary + '55' : colors.primary },
          ]}
          onPress={handlePost}
          disabled={(!body.trim() && !localImageUri) || posting}
          activeOpacity={0.8}
        >
          {posting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={box.publishBtnText}>Publier</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
};

const AvatarMini: React.FC<{ user: User | null; initials: string; colors: AppColors }> = ({ user, initials, colors }) => (
  user?.avatar_url ? (
    <Image source={{ uri: user.avatar_url }} style={box.avatar} />
  ) : (
    <View style={[box.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
    </View>
  )
);

const box = StyleSheet.create({
  collapsed:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginHorizontal: 12, marginBottom: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  expanded:         { marginHorizontal: 12, marginBottom: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header:           { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar:           { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  placeholder:      { flex: 1, fontSize: 15 },
  photoBtn:         { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  authorName:       { fontSize: 14, fontWeight: '700' },
  audience:         { fontSize: 12, marginTop: 1 },
  feelingTag:       { fontSize: 12, marginTop: 1, fontWeight: '600' },
  input:            { paddingHorizontal: 14, paddingBottom: 10, fontSize: 16, lineHeight: 22, minHeight: 80, textAlignVertical: 'top' },
  imagePreviewWrap: { marginHorizontal: 12, marginBottom: 8, borderRadius: 10, overflow: 'hidden' },
  imagePreview:     { width: '100%', height: 200 },
  imageRemoveBtn:   { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12 },
  feelingsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  feelingChip:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  actionBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  actionChip:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  publishBtn:       { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  publishBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
});
