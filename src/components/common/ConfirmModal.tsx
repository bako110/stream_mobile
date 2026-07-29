import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { confirmService, ConfirmState, ConfirmButton, ConfirmButtonStyle } from '../../services/confirmService';

function buttonColors(colors: ReturnType<typeof useTheme>['theme']['colors'], style: ConfirmButtonStyle | undefined) {
  if (style === 'destructive') return { bg: colors.error, text: '#fff' };
  if (style === 'cancel') return { bg: colors.backgroundSecondary, text: colors.textPrimary };
  return { bg: colors.primary, text: '#fff' };
}

export const ConfirmModal: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [state, setState] = useState<ConfirmState | null>(null);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = confirmService.subscribe(next => {
      setState(next);
      setLoadingIndex(null);
    });
    return unsubscribe;
  }, []);

  if (!state) return null;

  const handlePress = async (button: ConfirmButton, index: number) => {
    if (loadingIndex !== null) return;
    if (!button.onPress) {
      confirmService.dismiss();
      return;
    }
    setLoadingIndex(index);
    try {
      await button.onPress();
    } catch {
      // l'écran appelant gère ses propres erreurs
    } finally {
      confirmService.dismiss();
    }
  };

  const stacked = state.buttons.length !== 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{state.title}</Text>
          {!!state.message && (
            <Text style={[styles.message, { color: colors.textSecondary }]}>{state.message}</Text>
          )}
          <View style={[styles.buttonRow, stacked && styles.buttonColumn]}>
            {state.buttons.map((button, index) => {
              const { bg, text } = buttonColors(colors, button.style);
              const disabled = loadingIndex !== null;
              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.85}
                  disabled={disabled}
                  onPress={() => handlePress(button, index)}
                  style={[
                    styles.button,
                    { backgroundColor: bg },
                    stacked ? styles.buttonStacked : styles.buttonSide,
                    disabled && loadingIndex !== index && styles.buttonDisabled,
                  ]}
                >
                  {loadingIndex === index ? (
                    <ActivityIndicator size="small" color={text} />
                  ) : (
                    <Text style={[styles.buttonText, { color: text }]} numberOfLines={1}>
                      {button.text}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSide: { flex: 1 },
  buttonStacked: { width: '100%' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 14.5, fontWeight: '700' },
});
