import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { reportService } from '../../services/reportService';
import type { ReportContentType, ReportReason } from '../../services/reportService';
import { useTheme } from '../../hooks/useTheme';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam',           label: 'Spam' },
  { value: 'inappropriate',  label: 'Contenu inapproprié' },
  { value: 'violence',       label: 'Violence' },
  { value: 'harassment',     label: 'Harcèlement' },
  { value: 'misinformation', label: 'Désinformation' },
  { value: 'other',          label: 'Autre' },
];

interface Props {
  visible: boolean;
  contentType: ReportContentType;
  contentId: string;
  onClose: () => void;
}

export const ReportModal: React.FC<Props> = ({ visible, contentType, contentId, onClose }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [selected, setSelected] = useState<ReportReason | null>(null);
  const [details, setDetails]   = useState('');
  const [loading, setLoading]   = useState(false);

  const reset = () => { setSelected(null); setDetails(''); setLoading(false); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await reportService.create({ content_type: contentType, content_id: contentId, reason: selected, details: details.trim() || undefined });
      reset();
      onClose();
      Alert.alert('Signalement envoyé', 'Merci, nous allons examiner ce contenu.');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Une erreur est survenue.';
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={[st.sheet, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={st.header}>
            <Text style={[st.title, { color: colors.textPrimary }]}>Signaler ce contenu</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[st.subtitle, { color: colors.textSecondary }]}>
            Pourquoi signalez-vous ce contenu ?
          </Text>

          {/* Raisons */}
          {REASONS.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[st.row, selected === r.value && { backgroundColor: colors.primary + '18' }]}
              onPress={() => setSelected(r.value)}
              activeOpacity={0.7}
            >
              <View style={[st.radio, { borderColor: selected === r.value ? colors.primary : colors.border }]}>
                {selected === r.value && <View style={[st.radioDot, { backgroundColor: colors.primary }]} />}
              </View>
              <Text style={[st.rowLabel, { color: colors.textPrimary }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}

          {/* Détails (optionnel) */}
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBackground, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Détails supplémentaires (optionnel)"
            placeholderTextColor={colors.textTertiary}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={500}
          />

          {/* Bouton envoyer */}
          <TouchableOpacity
            style={[st.btn, { backgroundColor: selected ? '#EF4444' : colors.border }]}
            onPress={handleSubmit}
            disabled={!selected || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={st.btnText}>Envoyer le signalement</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title:     { fontSize: 16, fontWeight: '700' },
  subtitle:  { fontSize: 13, marginBottom: 16 },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, borderRadius: 10, marginBottom: 2 },
  radio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  radioDot:  { width: 10, height: 10, borderRadius: 5 },
  rowLabel:  { fontSize: 14 },
  input:     { marginTop: 12, borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 13, minHeight: 70, textAlignVertical: 'top' },
  btn:       { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
});
