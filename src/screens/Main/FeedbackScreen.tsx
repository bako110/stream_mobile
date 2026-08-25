import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { toastService } from '../../services';
import { feedbackService } from '../../services/feedbackService';
import type { Feedback, FeedbackCategory } from '../../services/feedbackService';

interface Props {
  navigation: any;
}

const CATEGORIES: { value: FeedbackCategory; label: string; icon: string; color: string }[] = [
  { value: 'bug',        label: 'Signaler un bug',       icon: 'alert-triangle', color: '#EF4444' },
  { value: 'suggestion', label: "Suggérer une amélioration", icon: 'zap',        color: '#F59E0B' },
  { value: 'avis',       label: 'Donner un avis général', icon: 'message-circle', color: '#7B3FF2' },
];

const STATUS_LABEL: Record<Feedback['status'], { label: string; color: string }> = {
  nouveau: { label: 'Envoyé',  color: '#6B7280' },
  lu:      { label: 'Lu',      color: '#0EA5E9' },
  traite:  { label: 'Traité',  color: '#10B981' },
};

export const FeedbackScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);

  const [history, setHistory]   = useState<Feedback[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const items = await feedbackService.listMine();
      setHistory(items);
    } catch { /* silencieux — l'historique n'est pas critique */ }
  }, []);

  useEffect(() => {
    loadHistory().finally(() => setLoading(false));
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const handleSubmit = async () => {
    if (!category || !message.trim()) return;
    setSending(true);
    try {
      await feedbackService.create({ category, message: message.trim() });
      setCategory(null);
      setMessage('');
      await loadHistory();
      toastService.success('Merci !', 'Ton retour a bien été envoyé à notre équipe.');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Une erreur est survenue.';
      toastService.error('Erreur', msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Donner mon avis</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: colors.primary + '12' }]}>
          <View style={[s.heroIcon, { backgroundColor: colors.primary + '20' }]}>
            <Icon name="edit-3" size={32} color={colors.primary} />
          </View>
          <Text style={[s.heroTitle, { color: colors.textPrimary }]}>Ton avis compte</Text>
          <Text style={[s.heroSub, { color: colors.textTertiary }]}>
            Un bug à signaler ? Une idée pour améliorer Gofolyx ? Dis-nous tout.
          </Text>
        </View>

        {/* Catégorie */}
        <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE DE RETOUR</Text>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.value}
              style={[
                s.categoryRow,
                { backgroundColor: colors.surface, borderColor: category === c.value ? c.color : colors.border },
                category === c.value && { backgroundColor: c.color + '12' },
              ]}
              activeOpacity={0.75}
              onPress={() => setCategory(c.value)}
            >
              <View style={[s.categoryIcon, { backgroundColor: c.color + '18' }]}>
                <Icon name={c.icon} size={18} color={c.color} />
              </View>
              <Text style={[s.categoryLabel, { color: colors.textPrimary }]}>{c.label}</Text>
              <View style={[s.radio, { borderColor: category === c.value ? c.color : colors.border }]}>
                {category === c.value && <View style={[s.radioDot, { backgroundColor: c.color }]} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Message */}
        <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TON MESSAGE</Text>
        <View style={{ paddingHorizontal: 16 }}>
          <TextInput
            style={[s.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Décris ton retour en quelques mots…"
            placeholderTextColor={colors.textTertiary}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
          />
          <Text style={[s.counter, { color: colors.textTertiary }]}>{message.length}/2000</Text>

          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: category && message.trim() ? colors.primary : colors.border }]}
            onPress={handleSubmit}
            disabled={!category || !message.trim() || sending}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Icon name="send" size={16} color="#fff" />
                  <Text style={s.submitBtnText}>Envoyer</Text>
                </>
            }
          </TouchableOpacity>
        </View>

        {/* Historique */}
        <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>MES RETOURS ENVOYÉS</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : history.length === 0 ? (
          <Text style={[s.emptyText, { color: colors.textTertiary }]}>
            Tu n'as pas encore envoyé de retour.
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {history.map(f => {
              const cat = CATEGORIES.find(c => c.value === f.category);
              const st  = STATUS_LABEL[f.status];
              return (
                <View key={f.id} style={[s.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={s.historyHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Icon name={cat?.icon ?? 'message-circle'} size={14} color={cat?.color ?? colors.textTertiary} />
                      <Text style={[s.historyCategory, { color: colors.textPrimary }]}>{cat?.label ?? f.category}</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: st.color + '18' }]}>
                      <Text style={[s.statusPillText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={[s.historyMessage, { color: colors.textSecondary }]} numberOfLines={4}>
                    {f.message}
                  </Text>
                  {f.admin_response && (
                    <View style={[s.responseBox, { backgroundColor: colors.primary + '0F', borderColor: colors.primary + '30' }]}>
                      <Text style={[s.responseLabel, { color: colors.primary }]}>Réponse de l'équipe</Text>
                      <Text style={[s.responseText, { color: colors.textPrimary }]}>{f.admin_response}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  hero:      { margin: 16, borderRadius: 20, padding: 24, alignItems: 'center' },
  heroIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  heroSub:   { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19, paddingHorizontal: 8 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 },

  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1.5,
  },
  categoryIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  radio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:  { width: 10, height: 10, borderRadius: 5 },

  input:   { borderRadius: 14, borderWidth: 1, padding: 14, fontSize: 14, minHeight: 110, textAlignVertical: 'top' },
  counter: { fontSize: 11, textAlign: 'right', marginTop: 6 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 15, marginTop: 16,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  emptyText: { fontSize: 13, paddingHorizontal: 16, marginTop: 4 },

  historyCard:   { borderRadius: 14, padding: 14, borderWidth: 1, gap: 8 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyCategory: { fontSize: 13, fontWeight: '700' },
  historyMessage:  { fontSize: 13, lineHeight: 19 },
  statusPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:  { fontSize: 11, fontWeight: '700' },
  responseBox:   { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 4 },
  responseLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  responseText:  { fontSize: 13, lineHeight: 19 },
});
