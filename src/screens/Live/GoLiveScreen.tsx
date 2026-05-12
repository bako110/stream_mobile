import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  StatusBar, Platform, Alert, ActivityIndicator, Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { liveService } from '../../services/liveService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const GoLiveScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [starting, setStarting] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    liveService.stopAllMine().catch(() => {});
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  async function handleStartQuickLive() {
    const t = title.trim();
    if (!t) { Alert.alert('Titre requis', 'Donne un titre à ton live.'); return; }
    if (starting) return;
    setStarting(true);
    try {
      const result = await liveService.startLive({ title: t, description: description.trim() || undefined });
      nav.replace('SimpleLiveStream', {
        liveId: result.live.id,
        publisherToken: result.token,
        livekitUrl: result.livekit_url,
        userId: result.live.user_id,
      });
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail || 'Impossible de démarrer le live');
      setStarting(false);
    }
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Démarrer un live</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Body — layout fixe */}
      <View style={st.body}>

        {/* ── Section Live Spontané ──────────────────────────────────────── */}
        <View style={[st.mainCard, { backgroundColor: colors.surface, borderColor: '#F0365A40' }]}>
          <LinearGradient
            colors={['#F0365A18', '#E0389A0C']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />

          {/* Icon + labels */}
          <View style={st.cardTop}>
            <Animated.View style={[st.liveIconWrap, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient colors={['#F0365A', '#E0389A']} style={st.liveIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Icon name="radio" size={28} color="#fff" />
              </LinearGradient>
            </Animated.View>
            <View style={st.cardLabels}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Live spontané</Text>
              <Text style={[st.cardSub, { color: colors.textSecondary }]}>
                Lance-toi maintenant — tes abonnés sont notifiés instantanément
              </Text>
            </View>
          </View>

          {/* Form */}
          <View style={st.form}>
            <View style={[st.inputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="type" size={15} color={colors.textTertiary} style={st.inputIcon} />
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Titre du live *"
                placeholderTextColor={colors.textTertiary}
                style={[st.input, { color: colors.textPrimary }]}
                maxLength={100}
              />
            </View>

            <View style={[st.inputWrap, st.inputWrapMulti, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="align-left" size={15} color={colors.textTertiary} style={[st.inputIcon, { marginTop: 2 }]} />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description (optionnel)"
                placeholderTextColor={colors.textTertiary}
                style={[st.input, st.inputMulti, { color: colors.textPrimary }]}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
            </View>

            <TouchableOpacity
              onPress={handleStartQuickLive}
              disabled={starting}
              activeOpacity={0.85}
              style={{ marginTop: 6 }}
            >
              <LinearGradient
                colors={starting ? ['#aaa', '#888'] : ['#F0365A', '#E0389A']}
                style={st.goBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                {starting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <View style={st.liveDot} />
                    <Text style={st.goBtnText}>Go Live maintenant</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Section Concert Live ──────────────────────────────────────── */}
        <TouchableOpacity
          style={[st.concertCard, { backgroundColor: colors.surface, borderColor: '#7B3FF240' }]}
          onPress={() => nav.navigate('CreateConcert')}
          activeOpacity={0.82}
        >
          <LinearGradient
            colors={['#7B3FF218', '#9B65F50C']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
          <View style={st.concertInner}>
            <View style={[st.concertIconWrap]}>
              <LinearGradient colors={['#7B3FF2', '#9B65F5']} style={st.concertIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Icon name="music" size={22} color="#fff" />
              </LinearGradient>
            </View>
            <View style={st.concertLabels}>
              <Text style={[st.concertTitle, { color: colors.textPrimary }]}>Concert live</Text>
              <Text style={[st.concertSub, { color: colors.textSecondary }]}>
                Programme, vends des billets et diffuse
              </Text>
            </View>
            <View style={[st.arrowWrap, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="arrow-right" size={16} color={colors.textSecondary} />
            </View>
          </View>
        </TouchableOpacity>

      </View>
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 16,
  },

  // ── Main card ──────────────────────────────────────────────────────────────
  mainCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    padding: 20,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  liveIconWrap: { flexShrink: 0 },
  liveIconGrad: {
    width: 60, height: 60, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabels: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardSub: { fontSize: 13, lineHeight: 18 },

  form: { gap: 10 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, minHeight: 48,
  },
  inputWrapMulti: { alignItems: 'flex-start', paddingVertical: 10 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14 },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },

  goBtn: {
    borderRadius: 26, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#fff', opacity: 0.9,
  },
  goBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Concert card ───────────────────────────────────────────────────────────
  concertCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    padding: 18,
  },
  concertInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  concertIconWrap: { flexShrink: 0 },
  concertIconGrad: {
    width: 50, height: 50, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  concertLabels: { flex: 1 },
  concertTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  concertSub: { fontSize: 13, lineHeight: 17 },
  arrowWrap: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
});
