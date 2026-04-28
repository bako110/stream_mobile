import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, Alert, ScrollView,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { uploadMessageImage } from '../../services/uploadService';

const FEELINGS = [
  '😊 Content', '😢 Triste', '😂 Heureux', '🔥 Motivé',
  '🎉 Excité',  '😎 Cool',   '🤔 Pensif',  '💪 Fier',
  '😍 Amoureux','😤 Déterminé','🥳 En fête', '😴 Fatigué',
];

interface Props {
  onBack: () => void;
  onPostCreated: () => void;
}

export const CreatePostScreen: React.FC<Props> = ({ onBack, onPostCreated }) => {
  const { theme }       = useTheme();
  const { colors }      = theme;
  const { currentUser } = useUser();

  const [body,          setBody]          = useState('');
  const [feeling,       setFeeling]       = useState<string | undefined>();
  const [localImageUri, setLocalImageUri] = useState<string | undefined>();
  const [showFeelings,  setShowFeelings]  = useState(false);
  const [posting,       setPosting]       = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials    = displayName ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';
  const canPost     = body.trim().length > 0 || !!localImageUri;

  const handlePickImage = () => {
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.85 as any }, res => {
      if (res.didCancel || res.errorCode) return;
      const uri = res.assets?.[0]?.uri;
      if (uri) setLocalImageUri(uri);
    });
  };

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      if (localImageUri) {
        const uploaded = await uploadMessageImage(localImageUri);
        imageUrl = uploaded?.url;
      }
      await postService.create({
        body: body.trim() || undefined,
        image_url: imageUrl,
        feeling,
      });
      onPostCreated();
    } catch {
      Alert.alert('Erreur', 'Impossible de publier.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Créer un post</Text>

        <TouchableOpacity
          style={[s.publishBtn, { backgroundColor: canPost ? colors.primary : colors.primary + '44' }]}
          onPress={handlePost}
          disabled={!canPost || posting}
          activeOpacity={0.8}
        >
          {posting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.publishBtnText}>Publier</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        {/* ── Auteur ── */}
        <View style={[s.authorRow, { backgroundColor: colors.surface }]}>
          {currentUser?.avatar_url ? (
            <Image source={{ uri: currentUser.avatar_url }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 17 }}>{initials}</Text>
            </View>
          )}
          <View>
            <Text style={[s.authorName, { color: colors.textPrimary }]}>{displayName}</Text>
            {feeling ? (
              <Text style={[s.audience, { color: colors.primary }]}>😊 se sent {feeling}</Text>
            ) : (
              <View style={s.audienceRow}>
                <Icon name="globe" size={11} color={colors.textTertiary} />
                <Text style={[s.audience, { color: colors.textTertiary }]}>Public</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Zone de texte ── */}
        <View style={[s.inputWrap, { backgroundColor: colors.surface }]}>
          <TextInput
            ref={inputRef}
            style={[s.input, { color: colors.textPrimary }]}
            placeholder="Quoi de neuf ?"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            value={body}
            onChangeText={setBody}
            autoFocus={false}
          />
        </View>

        {/* ── Aperçu image ── */}
        {localImageUri && (
          <View style={s.imageWrap}>
            <Image source={{ uri: localImageUri }} style={s.imagePreview} resizeMode="cover" />
            <TouchableOpacity style={s.imageRemoveBtn} onPress={() => setLocalImageUri(undefined)}>
              <Icon name="x-circle" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Sélecteur de feelings ── */}
        {showFeelings && (
          <View style={[s.feelingsWrap, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
            <Text style={[s.feelingsTitle, { color: colors.textSecondary }]}>Comment te sens-tu ?</Text>
            <View style={s.feelingsGrid}>
              {FEELINGS.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[
                    s.feelingChip,
                    {
                      backgroundColor: feeling === f ? colors.primary + '22' : colors.backgroundSecondary,
                      borderColor:     feeling === f ? colors.primary         : colors.border,
                    },
                  ]}
                  onPress={() => { setFeeling(feeling === f ? undefined : f); setShowFeelings(false); }}
                >
                  <Text style={{ fontSize: 13, color: feeling === f ? colors.primary : colors.textPrimary }}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Barre d'actions ── */}
      <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
        <Text style={[s.actionLabel, { color: colors.textSecondary }]}>Ajouter à votre post</Text>
        <View style={s.actionBtns}>
          <TouchableOpacity style={s.actionBtn} onPress={handlePickImage}>
            <Icon name="image" size={22} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, showFeelings && { backgroundColor: colors.primary + '18', borderRadius: 20 }]}
            onPress={() => setShowFeelings(v => !v)}
          >
            <Text style={{ fontSize: 20 }}>😊</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  root:           { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 0 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:    { fontSize: 17, fontWeight: '700' },
  publishBtn:     { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20 },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  authorRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar:         { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  authorName:     { fontSize: 15, fontWeight: '700' },
  audienceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  audience:       { fontSize: 12, marginTop: 2 },
  inputWrap:      { paddingHorizontal: 14, paddingBottom: 12, minHeight: 120 },
  input:          { fontSize: 18, lineHeight: 26, textAlignVertical: 'top' },
  imageWrap:      { marginHorizontal: 14, marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  imagePreview:   { width: '100%', aspectRatio: 4 / 3 },
  imageRemoveBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 15 },
  feelingsWrap:   { padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
  feelingsTitle:  { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  feelingsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  feelingChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  actionBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionLabel:    { fontSize: 14, fontWeight: '600' },
  actionBtns:     { flexDirection: 'row', gap: 8 },
  actionBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
