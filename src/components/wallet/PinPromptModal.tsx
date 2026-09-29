/**
 * PinPromptModal — pavé numérique pour confirmer une sortie de GoGold
 * (cadeau / transfert / retrait). Piloté par useWalletPinGate : s'ouvre quand
 * le backend répond 403 { detail: { code: 'pin_required' | 'pin_invalid' } }.
 *
 * Validation automatique : dès que 4 chiffres sont saisis, `onSubmit` est
 * appelé. Sur `pin_invalid` le hook vide le champ (via `error`) et l'utilisateur
 * retape. Sur `pin_locked` le hook affiche le message et ferme.
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { PinPad } from '../common/PinPad';
import { GofolyxLoader } from '../common/FolixLoader';

const PIN_LENGTH = 4;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
  error?: string;
  attemptsLeft?: number;
  title?: string;
  subtitle?: string;
}

export const PinPromptModal: React.FC<Props> = ({
  visible, onClose, onSubmit, error, attemptsLeft, title, subtitle,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (visible) setPin(''); }, [visible]);
  useEffect(() => { if (error || attemptsLeft != null) setPin(''); }, [error, attemptsLeft]);

  const handleComplete = async (code: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(code);
    } finally {
      setSubmitting(false);
    }
  };

  const helper =
    error ||
    (attemptsLeft != null && attemptsLeft > 0
      ? `Code incorrect — ${attemptsLeft} essai${attemptsLeft > 1 ? 's' : ''} restant${attemptsLeft > 1 ? 's' : ''}`
      : undefined);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={m.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[m.sheet, { backgroundColor: colors.surface, paddingBottom: 20 + insets.bottom }]}>
          <View style={[m.handle, { backgroundColor: colors.divider }]} />
          <TouchableOpacity style={m.close} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <View style={[m.iconWrap, { backgroundColor: colors.primary + '15' }]}>
            <Icon name="lock" size={22} color={colors.primary} />
          </View>
          <Text style={[m.title, { color: colors.textPrimary }]}>
            {title ?? 'Code PIN'}
          </Text>
          <Text style={[m.desc, { color: colors.textTertiary }]}>
            {subtitle ?? 'Saisissez votre code pour confirmer.'}
          </Text>

          {submitting ? (
            <View style={m.loading}>
              <GofolyxLoader variant="bar" color={colors.primary} />
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <PinPad
                length={PIN_LENGTH}
                value={pin}
                onChange={setPin}
                onComplete={handleComplete}
              />
            </View>
          )}

          {!!helper && <Text style={m.error}>{helper}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const m = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, alignItems: 'center' },
  handle:   { width: 36, height: 4, borderRadius: 2, marginBottom: 14 },
  close:    { position: 'absolute', top: 14, right: 14, padding: 4 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12, marginTop: 6 },
  title:    { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  desc:     { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  loading:  { height: 316, alignItems: 'center', justifyContent: 'center' },
  error:    { fontSize: 12.5, color: '#EF4444', marginTop: 14, textAlign: 'center', fontWeight: '600' },
});
