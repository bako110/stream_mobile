import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, ScrollView, FlatList,
  KeyboardAvoidingView, Platform, StatusBar, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { CameraRoll, type PhotoIdentifier } from '@react-native-camera-roll/camera-roll';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { uploadImageFromUri } from '../../services/uploadService';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import { MentionInput } from '../../components/common/MentionInput';
import { toastService } from '../../services';

const { width: W } = Dimensions.get('window');
const MAX_IMAGES   = 6;
const GALLERY_COLS = 4;
const GALLERY_CELL = W / GALLERY_COLS;

const MEDIA_PERMISSIONS = Platform.OS === 'ios'
  ? [PERMISSIONS.IOS.PHOTO_LIBRARY]
  : (Platform.Version as number) >= 33
    ? [PERMISSIONS.ANDROID.READ_MEDIA_IMAGES, PERMISSIONS.ANDROID.READ_MEDIA_VIDEO]
    : [PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE];

async function ensureMediaPermission(): Promise<boolean> {
  try {
    let allGranted = true;
    for (const perm of MEDIA_PERMISSIONS) {
      const status = await check(perm);
      if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) continue;
      if (status === RESULTS.BLOCKED || status === RESULTS.UNAVAILABLE) { allGranted = false; continue; }
      const requested = await request(perm);
      if (requested !== RESULTS.GRANTED && requested !== RESULTS.LIMITED) allGranted = false;
    }
    return allGranted;
  } catch {
    return false;
  }
}

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
  const insets          = useSafeAreaInsets();

  const [body,          setBody]          = useState('');
  const [category,      setCategory]      = useState<string | null>(null);
  const [mentionIds,    setMentionIds]    = useState<string[]>([]);
  const [feeling,       setFeeling]       = useState<string | undefined>();
  const [localUris,     setLocalUris]     = useState<string[]>([]);
  const [videoUri,      setVideoUri]      = useState<string | null>(null);
  const [showFeelings,  setShowFeelings]  = useState(false);
  const [posting,       setPosting]       = useState(false);
  const [isPrivate,     setIsPrivate]     = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<PhotoIdentifier[]>([]);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [selectedUris,  setSelectedUris]  = useState<string[]>([]);

  const handleBodyChange = useCallback((text: string, ids: string[]) => {
    setBody(text);
    setMentionIds(ids);
  }, []);

  useEffect(() => {
    (async () => {
      const granted = await ensureMediaPermission();
      if (!granted) { setGalleryDenied(true); return; }
      try {
        const page = await CameraRoll.getPhotos({
          first: 60,
          assetType: 'All',
          include: ['playableDuration'],
        });
        setGalleryPhotos(page.edges);
      } catch {
        setGalleryDenied(true);
      }
    })();
  }, []);

  const toggleGalleryPhoto = (item: PhotoIdentifier) => {
    const uri      = item.node.image.uri;
    const isVideo  = item.node.type.startsWith('video');

    if (isVideo) {
      if (localUris.length > 0) {
        toastService.warning('Photos déjà sélectionnées', 'Retire les photos pour ajouter une vidéo.');
        return;
      }
      setVideoUri(prev => (prev === uri ? null : uri));
      setSelectedUris(prev => (prev.includes(uri) ? [] : [uri]));
      return;
    }

    if (videoUri) {
      toastService.warning('Vidéo déjà sélectionnée', 'Retire la vidéo pour ajouter des photos.');
      return;
    }
    setSelectedUris(prev => {
      if (prev.includes(uri)) {
        setLocalUris(u => u.filter(x => x !== uri));
        return prev.filter(x => x !== uri);
      }
      if (localUris.length >= MAX_IMAGES) {
        toastService.warning('Maximum', `Tu peux ajouter jusqu'à ${MAX_IMAGES} images.`);
        return prev;
      }
      setLocalUris(u => [...u, uri]);
      return [...prev, uri];
    });
  };

  const videoPlayer = useVideoPlayer(
    videoUri ? { uri: videoUri } : { uri: 'about:blank' },
    p => { p.loop = true; p.muted = true; },
  );

  useEffect(() => {
    if (videoUri) videoPlayer.play();
    else videoPlayer.pause();
  }, [videoUri]);

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials    = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';
  const canPost     = body.trim().length > 0 || localUris.length > 0 || !!videoUri;

  const handlePickImages = () => {
    if (videoUri) {
      toastService.warning('Vidéo déjà sélectionnée', 'Retire la vidéo pour ajouter des photos.');
      return;
    }
    const remaining = MAX_IMAGES - localUris.length;
    if (remaining <= 0) {
      toastService.warning('Maximum', `Tu peux ajouter jusqu'à ${MAX_IMAGES} images.`);
      return;
    }
    launchImageLibrary(
      { mediaType: 'photo', selectionLimit: remaining, quality: 0.85 as any },
      res => {
        if (res.didCancel || res.errorCode) return;
        const uris = (res.assets ?? []).map(a => a.uri).filter(Boolean) as string[];
        setLocalUris(prev => [...prev, ...uris].slice(0, MAX_IMAGES));
      },
    );
  };

  const handlePickVideo = () => {
    if (localUris.length > 0) {
      toastService.warning('Photos déjà sélectionnées', 'Retire les photos pour ajouter une vidéo.');
      return;
    }
    launchImageLibrary(
      { mediaType: 'video', selectionLimit: 1 },
      res => {
        if (res.didCancel || res.errorCode) return;
        const uri = res.assets?.[0]?.uri;
        if (uri) setVideoUri(uri);
      },
    );
  };

  const removeImage = (idx: number) => {
    setLocalUris(prev => {
      const removed = prev[idx];
      setSelectedUris(s => s.filter(u => u !== removed));
      return prev.filter((_, i) => i !== idx);
    });
  };
  const removeVideo = () => { videoPlayer.pause(); setVideoUri(null); setSelectedUris([]); };

  // ── Publier ─────────────────────────────────────────────────────────────────

  const handlePost = () => {
    if (!canPost || posting) return;
    setPosting(true);

    const capturedBody     = body.trim();
    const capturedFeeling  = feeling;
    const capturedCategory = category ?? undefined;
    const capturedVideo    = videoUri;
    const capturedImages   = [...localUris];
    const capturedIsPrivate = isPrivate;

    // Fermer l'écran immédiatement dans tous les cas
    onPostCreated();

    if (!capturedVideo) {
      // Texte seul ou images seules → upload en arrière-plan (pas de compression)
      (async () => {
        try {
          let image_url: string | undefined;
          let image_urls: string[] | undefined;

          if (capturedImages.length === 1) {
            const r = await uploadImageFromUri(capturedImages[0], 'posts', `p_${Date.now()}.jpg`);
            image_url = r.url;
          } else if (capturedImages.length > 1) {
            const results = await Promise.all(
              capturedImages.map((uri, i) => uploadImageFromUri(uri, 'posts', `p_${Date.now()}_${i}.jpg`))
            );
            image_urls = results.map(r => r.url);
            image_url  = image_urls[0];
          }

          const created = await postService.create({
            body: capturedBody || undefined,
            image_url,
            image_urls,
            feeling: capturedFeeling,
            category: capturedCategory,
            mention_ids: mentionIds.length ? mentionIds : undefined,
            is_private: capturedIsPrivate,
          });
          // pending_review (2026-08bis) : media present -> invisible tant que
          // l'IA n'a pas confirme "cleared" -- message different du succes
          // immediat habituel, cf. MyVerificationQueueScreen.tsx pour le suivi.
          if (created.status === 'pending_review') {
            toastService.success('Envoyé', 'Publication en cours de vérification, elle sera visible une fois confirmée.');
          }
        } catch (err: any) {
          console.warn('[CreatePost] échec création post:', err?.message ?? err);
        }
      })();
      return;
    }

    // Vidéo → compression + upload en arrière-plan
    if (capturedImages.length > 0) {
      backgroundUploadService.enqueueVideoWithImages({
        videoUri:    capturedVideo,
        imageUris:   capturedImages,
        videoFolder: 'posts',
        imageFolder: 'posts',
        type:        'post',
        label:       capturedBody ? capturedBody.slice(0, 40) : 'Nouveau post',
        onDone: async (result) => {
          await postService.create({
            body:          capturedBody || undefined,
            feeling:       capturedFeeling,
            category:      capturedCategory,
            video_url:     result.videoUrl,
            thumbnail_url: result.thumbnailUrl,
            video_width:   result.videoWidth,
            video_height:  result.videoHeight,
            image_url:     result.imageUrls?.[0],
            image_urls:    result.imageUrls,
            mention_ids:   mentionIds.length ? mentionIds : undefined,
            is_private:    capturedIsPrivate,
          });
        },
      });
    } else {
      backgroundUploadService.enqueueVideo({
        localUri: capturedVideo,
        folder:   'posts',
        type:     'post',
        label:    capturedBody ? capturedBody.slice(0, 40) : 'Nouveau post',
        onDone: async (result) => {
          await postService.create({
            body:          capturedBody || undefined,
            feeling:       capturedFeeling,
            category:      capturedCategory,
            video_url:     result.videoUrl,
            thumbnail_url: result.thumbnailUrl,
            video_width:   result.videoWidth,
            video_height:  result.videoHeight,
            mention_ids:   mentionIds.length ? mentionIds : undefined,
            is_private:    capturedIsPrivate,
          });
        },
      });
    }
  };

  // ── Grille images ────────────────────────────────────────────────────────────

  const renderImageGrid = () => {
    if (localUris.length === 0) return null;
    const n = localUris.length;

    if (n === 1) {
      return (
        <View style={s.gridSingle}>
          <Image source={{ uri: localUris[0] }} style={s.imgSingle} resizeMode="cover" />
          <TouchableOpacity style={s.removeBtn} onPress={() => removeImage(0)}>
            <Icon name="x" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }
    if (n === 2) {
      return (
        <View style={s.gridRow}>
          {localUris.map((uri, i) => (
            <View key={i} style={[s.gridHalf, { marginLeft: i === 1 ? 2 : 0 }]}>
              <Image source={{ uri }} style={s.imgFill} resizeMode="cover" />
              <TouchableOpacity style={s.removeBtn} onPress={() => removeImage(i)}>
                <Icon name="x" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      );
    }
    if (n === 3) {
      return (
        <View style={s.gridRow}>
          <View style={s.gridHalf}>
            <Image source={{ uri: localUris[0] }} style={s.imgFill} resizeMode="cover" />
            <TouchableOpacity style={s.removeBtn} onPress={() => removeImage(0)}>
              <Icon name="x" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={[s.gridHalf, { marginLeft: 2 }]}>
            {[1, 2].map(i => (
              <View key={i} style={[s.gridQuarter, { marginTop: i === 2 ? 2 : 0 }]}>
                <Image source={{ uri: localUris[i] }} style={s.imgFill} resizeMode="cover" />
                <TouchableOpacity style={s.removeBtn} onPress={() => removeImage(i)}>
                  <Icon name="x" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      );
    }
    const shown = localUris.slice(0, 4);
    const extra = n - 4;
    return (
      <View style={s.gridFour}>
        {shown.map((uri, i) => (
          <View key={i} style={[s.gridQuarterFour, { marginLeft: i % 2 === 1 ? 2 : 0, marginTop: i >= 2 ? 2 : 0 }]}>
            <Image source={{ uri }} style={s.imgFill} resizeMode="cover" />
            {i === 3 && extra > 0 ? (
              <View style={s.extraOverlay}><Text style={s.extraText}>+{extra}</Text></View>
            ) : (
              <TouchableOpacity style={s.removeBtn} onPress={() => removeImage(i)}>
                <Icon name="x" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Créer un post</Text>
        <TouchableOpacity
          style={[s.publishBtn, { backgroundColor: (canPost && !posting) ? colors.primary : colors.primary + '44' }]}
          onPress={handlePost}
          disabled={!canPost || posting}
          activeOpacity={0.8}
        >
          <Text style={s.publishBtnText}>Publier</Text>
        </TouchableOpacity>
      </View>


      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>

        {/* Auteur */}
        <View style={[s.authorRow, { backgroundColor: colors.surface }]}>
          {currentUser?.avatar_url ? (
            <Image source={{ uri: currentUser.avatar_url }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 17 }}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.authorName, { color: colors.textPrimary }]}>{displayName}</Text>
            <View style={s.audienceLine}>
              {feeling && (
                <Text style={[s.audience, { color: colors.primary }]}>😊 se sent {feeling}</Text>
              )}
              <TouchableOpacity
                style={[s.visibilityChip, { backgroundColor: showVisibility ? colors.backgroundSecondary : 'transparent' }]}
                onPress={() => setShowVisibility(v => !v)}
              >
                <Icon name={isPrivate ? 'users' : 'globe'} size={11} color={colors.textTertiary} />
                <Text style={[s.audience, { color: colors.textTertiary, fontWeight: '600' }]}>
                  {isPrivate ? 'Amis' : 'Public'}
                </Text>
                <Icon name="chevron-down" size={10} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {showVisibility && (
          <View style={[s.visibilityMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[s.visibilityOption, !isPrivate && { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => { setIsPrivate(false); setShowVisibility(false); }}
            >
              <Icon name="globe" size={18} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.visibilityOptionTitle, { color: colors.textPrimary }]}>Public</Text>
                <Text style={[s.visibilityOptionDesc, { color: colors.textTertiary }]}>Tout le monde peut voir</Text>
              </View>
              {!isPrivate && <Icon name="check" size={14} color={colors.primary} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.visibilityOption, isPrivate && { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => { setIsPrivate(true); setShowVisibility(false); }}
            >
              <Icon name="users" size={18} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.visibilityOptionTitle, { color: colors.textPrimary }]}>Amis</Text>
                <Text style={[s.visibilityOptionDesc, { color: colors.textTertiary }]}>Vos abonnés seulement</Text>
              </View>
              {isPrivate && <Icon name="check" size={14} color={colors.primary} />}
            </TouchableOpacity>
          </View>
        )}

        {/* Zone de texte avec autocomplete mentions */}
        <View style={[s.inputWrap, { backgroundColor: colors.surface }]}>
          <MentionInput
            value={body}
            onChangeText={handleBodyChange}
            colors={colors}
            placeholder="Quoi de neuf ?"
            maxLength={2000}
            inputStyle={s.input}
          />
        </View>

        {/* Aperçu vidéo */}
        {videoUri && (
          <View style={s.videoPreviewWrap}>
            <VideoView
              player={videoPlayer}
              style={s.videoPreview}
              resizeMode="cover"
            />
            <TouchableOpacity style={s.removeVideoBtn} onPress={removeVideo}>
              <Icon name="x-circle" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={s.videoBadge}>
              <Icon name="video" size={11} color="#fff" />
              <Text style={s.videoBadgeText}>Vidéo</Text>
            </View>
          </View>
        )}

        {/* Grille images */}
        {!videoUri && localUris.length > 0 && (
          <View style={s.gridWrap}>
            {renderImageGrid()}
            {localUris.length < MAX_IMAGES && (
              <TouchableOpacity
                style={[s.addMoreBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                onPress={handlePickImages}
              >
                <Icon name="plus" size={20} color={colors.textTertiary} />
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Ajouter</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Feelings */}
        {showFeelings && (
          <View style={[s.feelingsWrap, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
            <Text style={[s.feelingsTitle, { color: colors.textSecondary }]}>Comment te sens-tu ?</Text>
            <View style={s.feelingsGrid}>
              {FEELINGS.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[s.feelingChip, {
                    backgroundColor: feeling === f ? colors.primary + '22' : colors.backgroundSecondary,
                    borderColor:     feeling === f ? colors.primary : colors.border,
                  }]}
                  onPress={() => { setFeeling(feeling === f ? undefined : f); setShowFeelings(false); }}
                >
                  <Text style={{ fontSize: 13, color: feeling === f ? colors.primary : colors.textPrimary }}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Galerie de l'appareil — chargée automatiquement à l'arrivée sur l'écran */}
        <View style={[s.galleryWrap, { borderTopColor: colors.divider }]}>
          <View style={s.galleryHeader}>
            <Text style={[s.galleryTitle, { color: colors.textPrimary }]}>Galerie</Text>
            {selectedUris.length > 0 && (
              <View style={[s.galleryCountPill, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[s.galleryCountText, { color: colors.primary }]}>
                  {selectedUris.length} sélectionné{selectedUris.length > 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          {galleryDenied ? (
            <View style={s.galleryEmptyWrap}>
              <View style={[s.galleryEmptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="image" size={22} color={colors.textTertiary} />
              </View>
              <Text style={[s.galleryEmptyText, { color: colors.textTertiary }]}>
                Accès à la galerie refusé.{'\n'}Active-le dans les réglages pour voir tes photos ici.
              </Text>
            </View>
          ) : (
            <FlatList
              data={galleryPhotos}
              numColumns={GALLERY_COLS}
              scrollEnabled={false}
              keyExtractor={item => item.node.id}
              contentContainerStyle={s.galleryList}
              renderItem={({ item }) => {
                const uri      = item.node.image.uri;
                const isVideo  = item.node.type.startsWith('video');
                const duration = item.node.image.playableDuration;
                const picked   = selectedUris.includes(uri);
                return (
                  <TouchableOpacity
                    style={s.galleryCell}
                    onPress={() => toggleGalleryPhoto(item)}
                    activeOpacity={0.85}
                  >
                    <View style={[s.galleryThumb, picked && { borderColor: colors.primary }]}>
                      <Image source={{ uri }} style={s.galleryImg} resizeMode="cover" />
                      {picked && <View style={s.galleryDim} />}

                      {isVideo && (
                        <View style={s.galleryVideoBadge}>
                          <Icon name="video" size={10} color="#fff" />
                          {!!duration && (
                            <Text style={s.galleryVideoDuration}>
                              {Math.floor(duration / 60)}:{String(Math.round(duration % 60)).padStart(2, '0')}
                            </Text>
                          )}
                        </View>
                      )}

                      <View style={[
                        s.galleryCheck,
                        picked
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: 'rgba(255,255,255,0.85)' },
                      ]}>
                        {picked && <Icon name="check" size={11} color="#fff" />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* Barre d'actions */}
      <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.divider, paddingBottom: insets.bottom || 8 }]}>
        <Text style={[s.actionLabel, { color: colors.textSecondary }]}>Ajouter à votre post</Text>
        <View style={s.actionBtns}>
          {/* Photo */}
          <TouchableOpacity style={s.actionBtn} onPress={handlePickImages} disabled={!!videoUri}>
            <Icon name="image" size={22} color={videoUri ? colors.textDisabled : '#4CAF50'} />
            {localUris.length > 0 && (
              <View style={[s.actionBadge, { backgroundColor: colors.primary }]}>
                <Text style={s.actionBadgeText}>{localUris.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Vidéo */}
          <TouchableOpacity
            style={[s.actionBtn, videoUri && { backgroundColor: colors.primary + '18', borderRadius: 20 }]}
            onPress={handlePickVideo}
            disabled={localUris.length > 0}
          >
            <Icon name="video" size={22} color={localUris.length > 0 ? colors.textDisabled : colors.primary} />
          </TouchableOpacity>

          {/* Mentionner */}
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => handleBodyChange(body + '@', mentionIds)}
          >
            <Icon name="at-sign" size={22} color={colors.primary} />
          </TouchableOpacity>

          {/* Feeling */}
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

const GRID_H = (W * 0.55);
const HALF_H = GRID_H / 2 - 1;

const s = StyleSheet.create({
  root:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:    { fontSize: 17, fontWeight: '700' },
  publishBtn:     { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20 },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  bgHint:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  bgHintText:     { fontSize: 12, fontWeight: '500' },

  authorRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar:         { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  authorName:     { fontSize: 15, fontWeight: '700' },
  audienceRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  audience:       { fontSize: 12, marginTop: 2 },
  audienceLine:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  visibilityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  visibilityMenu: { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  visibilityOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  visibilityOptionTitle: { fontSize: 14, fontWeight: '700' },
  visibilityOptionDesc:  { fontSize: 11, marginTop: 1 },

  galleryWrap:          { paddingTop: 16, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  galleryHeader:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginBottom: 10 },
  galleryTitle:         { fontSize: 15, fontWeight: '800' },
  galleryCountPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  galleryCountText:     { fontSize: 11, fontWeight: '700' },
  galleryList:          { paddingHorizontal: 12 },
  galleryEmptyWrap:      { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, gap: 10 },
  galleryEmptyIcon:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  galleryEmptyText:      { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  galleryCell:          { width: GALLERY_CELL - 4, height: GALLERY_CELL - 4, margin: 2 },
  galleryThumb:         { flex: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  galleryImg:           { width: '100%', height: '100%' },
  galleryDim:           { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  galleryVideoBadge:    { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  galleryVideoDuration: { fontSize: 9, fontWeight: '700', color: '#fff' },
  galleryCheck:         { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  inputWrap:      { paddingHorizontal: 14, paddingBottom: 12, minHeight: 120 },
  input:          { fontSize: 18, lineHeight: 26, textAlignVertical: 'top', flex: 1 },

  videoPreviewWrap: { marginHorizontal: 14, marginBottom: 12, borderRadius: 12, overflow: 'hidden', height: W * 0.56 },
  videoPreview:     { width: '100%', height: '100%' },
  removeVideoBtn:   { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 2 },
  videoBadge:       { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  videoBadgeText:   { color: '#fff', fontSize: 11, fontWeight: '700' },

  gridWrap:         { marginHorizontal: 14, marginBottom: 12 },
  gridSingle:       { borderRadius: 12, overflow: 'hidden', height: GRID_H },
  imgSingle:        { width: '100%', height: '100%' },
  gridRow:          { flexDirection: 'row', height: GRID_H, borderRadius: 12, overflow: 'hidden' },
  gridHalf:         { flex: 1, overflow: 'hidden' },
  gridQuarter:      { flex: 1, overflow: 'hidden' },
  gridFour:         { flexDirection: 'row', flexWrap: 'wrap', height: GRID_H, borderRadius: 12, overflow: 'hidden' },
  gridQuarterFour:  { width: (W - 28) / 2 - 1, height: HALF_H, overflow: 'hidden' },
  imgFill:          { width: '100%', height: '100%' },
  removeBtn:        { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  extraOverlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  extraText:        { color: '#fff', fontSize: 22, fontWeight: '800' },
  addMoreBtn:       { marginTop: 8, height: 48, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  feelingsWrap:   { padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
  feelingsTitle:  { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  feelingsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  feelingChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },

  actionBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionLabel:    { fontSize: 14, fontWeight: '600' },
  actionBtns:     { flexDirection: 'row', gap: 8 },
  actionBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  actionBadge:    { position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionBadgeText:{ color: '#fff', fontSize: 9, fontWeight: '800' },
});
