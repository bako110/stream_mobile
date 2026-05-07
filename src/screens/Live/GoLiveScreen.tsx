/**
 * GoLiveScreen — Choisir entre Live spontané et Concert Live.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  StatusBar, Platform, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView,
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
      });
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail || 'Impossible de démarrer le live');
    } finally {
      setStarting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[st.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Démarrer un live</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">

        {/* ── Card Live Spontané ─────────────────────────────────────── */}
        <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LinearGradient
            colors={['#F0365A22', '#E0389A11']}
            style={st.cardGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
          <View style={st.cardHeader}>
            <View style={[st.cardIcon, { backgroundColor: '#F0365A20' }]}>
              <Icon name="radio" size={24} color="#F0365A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Live spontané</Text>
              <Text style={[st.cardSub, { color: colors.textSecondary }]}>
                Démarre maintenant, tes abonnés seront notifiés
              </Text>
            </View>
          </View>

          <View style={st.form}>
            <Text style={[st.label, { color: colors.textSecondary }]}>Titre *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Session Q&A, freestyle..."
              placeholderTextColor={colors.textTertiary}
              style={[st.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              maxLength={100}
            />

            <Text style={[st.label, { color: colors.textSecondary, marginTop: 10 }]}>Description (optionnel)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="De quoi ça parle ?"
              placeholderTextColor={colors.textTertiary}
              style={[st.input, st.inputMulti, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              multiline
              numberOfLines={3}
              maxLength={300}
            />

            <TouchableOpacity
              style={[st.startBtn, starting && st.startBtnDisabled]}
              onPress={handleStartQuickLive}
              disabled={starting}
            >
              {starting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Icon name="radio" size={18} color="#fff" />
                  <Text style={st.startBtnText}>Go Live maintenant</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Card Concert Live ──────────────────────────────────────── */}
        <TouchableOpacity
          style={[st.card, st.cardSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => nav.navigate('CreateConcert')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7B3FF222', '#9B65F511']}
            style={st.cardGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
          <View style={st.cardHeader}>
            <View style={[st.cardIcon, { backgroundColor: '#7B3FF220' }]}>
              <Icon name="music" size={24} color="#7B3FF2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Concert live</Text>
              <Text style={[st.cardSub, { color: colors.textSecondary }]}>
                Programme un concert, vends des billets, diffuse avec LiveKit
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.textTertiary} />
          </View>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 12,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: {
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, padding: 18,
  },
  cardSecondary: { paddingBottom: 18 },
  cardGradient: { ...StyleSheet.absoluteFillObject },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 3 },
  cardSub: { fontSize: 13, lineHeight: 18 },
  form: { marginTop: 16, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, borderWidth: 1,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F0365A', borderRadius: 24,
    paddingVertical: 14, marginTop: 14,
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
