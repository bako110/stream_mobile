/**
 * HelpGuideSheet — bottom sheet d'aide générique, déclenché par un bouton "?"
 * dans le header d'un écran. Affiche une liste de points (icône + titre +
 * texte) décrivant comment fonctionne l'écran courant.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

export interface HelpGuidePoint {
  icon:  string;
  title: string;
  text:  string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title:   string;
  intro?:  string;
  points:  HelpGuidePoint[];
}

export const HelpGuideButton: React.FC<{ onPress: () => void; color?: string }> = ({ onPress, color }) => (
  <TouchableOpacity onPress={onPress} style={hb.btn} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
    <Icon name="help-circle" size={20} color={color ?? '#7B3FF2'} />
  </TouchableOpacity>
);

const hb = StyleSheet.create({
  btn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

export const HelpGuideSheet: React.FC<Props> = ({ visible, onClose, title, intro, points }) => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[st.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20, maxHeight: '80%' }]}>
          <View style={[st.handle, { backgroundColor: colors.divider }]} />

          <View style={st.headerRow}>
            <Text style={[st.title, { color: colors.textPrimary }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={st.closeBtn}>
              <Icon name="x" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {intro ? (
              <Text style={[st.intro, { color: colors.textSecondary }]}>{intro}</Text>
            ) : null}

            {points.map((p, i) => (
              <View key={i} style={st.pointRow}>
                <View style={[st.pointIcon, { backgroundColor: '#7B3FF215' }]}>
                  <Icon name={p.icon} size={16} color="#7B3FF2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.pointTitle, { color: colors.textPrimary }]}>{p.title}</Text>
                  <Text style={[st.pointText, { color: colors.textSecondary }]}>{p.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={[st.gotItBtn, { backgroundColor: '#7B3FF2' }]} activeOpacity={0.85}>
            <Text style={st.gotItText}>Compris</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingTop: 10 },
  handle:  { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title:   { fontSize: 18, fontWeight: '800', flex: 1 },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  intro:   { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  pointRow:  { flexDirection: 'row', gap: 12, marginBottom: 16 },
  pointIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pointTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  pointText:  { fontSize: 12.5, lineHeight: 18 },
  gotItBtn:  { marginTop: 6, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  gotItText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
