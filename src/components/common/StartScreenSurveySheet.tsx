/**
 * StartScreenSurveySheet — "Qu'est-ce qui t'amène sur Gofolyx ?" Reels/Feed/
 * Communautés. Répondre met à jour directement la préférence d'écran de
 * démarrage (Réglages > Contenu) ; fermer sans répondre ne change rien.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { StartScreen } from '../../hooks/useAppPreferences';

const OPTIONS: { key: StartScreen; label: string; icon: string; desc: string }[] = [
  { key: 'feed',        label: 'Accueil',     icon: 'home', desc: 'Posts, événements, concerts' },
  { key: 'reels',       label: 'Reels',       icon: 'film', desc: 'Vidéos courtes' },
  { key: 'communities', label: 'Communautés', icon: 'grid', desc: 'Groupes et discussions' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAnswer: (choice: StartScreen) => void;
}

export const StartScreenSurveySheet: React.FC<Props> = ({ visible, onClose, onAnswer }) => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const [saving,   setSaving]   = useState<StartScreen | null>(null);
  const [selected, setSelected] = useState<StartScreen | null>(null);

  // L'option choisie reste visible (coche + surbrillance) un court instant
  // avant la fermeture — sans ça, le sheet disparaissait instantanément et
  // rien ne confirmait visuellement que le choix avait bien été pris en compte.
  const handlePick = (choice: StartScreen) => {
    if (saving) return;
    setSaving(choice);
    setSelected(choice);
    onAnswer(choice);
  };

  // Réinitialisé à chaque nouvelle ouverture, pas à la fermeture (sinon la
  // coche disparaîtrait avant la fin de l'animation de fermeture du Modal).
  React.useEffect(() => {
    if (visible) { setSaving(null); setSelected(null); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[st.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}>
          <View style={[st.handle, { backgroundColor: colors.divider }]} />

          <Text style={[st.title, { color: colors.textPrimary }]}>Qu'est-ce qui t'amène sur Gofolyx ?</Text>
          <Text style={[st.sub, { color: colors.textSecondary }]}>
            On ouvrira directement cet écran à chaque lancement de l'app.
          </Text>

          <View style={st.options}>
            {OPTIONS.map(opt => {
              const isSelected = selected === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => handlePick(opt.key)}
                  disabled={!!saving}
                  activeOpacity={0.8}
                  style={[st.option, {
                    borderColor: isSelected ? colors.primary : colors.divider,
                    backgroundColor: isSelected ? colors.primary + '0F' : colors.background,
                  }]}
                >
                  <View style={[st.optionIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Icon name={opt.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.optionLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                    <Text style={[st.optionDesc, { color: colors.textTertiary }]}>{opt.desc}</Text>
                  </View>
                  {isSelected ? (
                    <View style={[st.checkDot, { backgroundColor: colors.primary }]}>
                      <Icon name="check" size={12} color="#fff" />
                    </View>
                  ) : (
                    <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={onClose} style={st.dismissBtn} disabled={!!saving}>
            <Text style={[st.dismissTxt, { color: colors.textTertiary }]}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingTop: 10 },
  handle:  { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title:   { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub:     { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 18, lineHeight: 18 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16, borderWidth: 1.5,
  },
  optionIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  checkDot:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { fontSize: 14, fontWeight: '700' },
  optionDesc:  { fontSize: 12, marginTop: 1 },
  dismissBtn:  { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  dismissTxt:  { fontSize: 13, fontWeight: '600' },
});
