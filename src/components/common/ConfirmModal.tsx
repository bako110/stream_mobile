import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { confirmService, ConfirmState, ConfirmButton, ConfirmButtonStyle } from '../../services/confirmService';

function buttonColors(colors: ReturnType<typeof useTheme>['theme']['colors'], style: ConfirmButtonStyle | undefined) {
  if (style === 'destructive') return { bg: colors.error, text: '#fff' };
  if (style === 'cancel') return { bg: colors.backgroundSecondary, text: colors.textPrimary };
  return { bg: colors.primary, text: '#fff' };
}

// Icône par défaut d'une ligne de menu quand l'appelant n'en précise pas —
// garde le rendu sobre (pas de couleur, juste une forme reconnaissable).
function defaultIcon(style: ConfirmButtonStyle | undefined): string {
  if (style === 'destructive') return 'trash-2';
  if (style === 'cancel') return 'x';
  return 'chevron-right';
}

export const ConfirmModal: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<ConfirmState | null>(null);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const sheetY   = useRef(new Animated.Value(40)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = confirmService.subscribe(next => {
      setState(next);
      setLoadingIndex(null);
      if (next) {
        sheetY.setValue(40);
        backdrop.setValue(0);
        Animated.parallel([
          Animated.timing(backdrop, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.timing(sheetY, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }
    });
    return unsubscribe;
  }, []);

  if (!state) return null;

  const handlePress = async (button: ConfirmButton, index: number) => {
    if (loadingIndex !== null) return;
    // Capturé AVANT d'exécuter onPress — si onPress ouvre lui-même un second
    // showConfirm de façon synchrone (menu → sous-confirmation, ex: "Supprimer"
    // qui ré-ouvre "Supprimer ce commentaire ?"), confirmService._current a déjà
    // changé par le temps qu'on atteint le finally. dismiss(stateId) sans id
    // fermait alors INCONDITIONNELLEMENT ce nouvel état tout juste ouvert (le
    // id === undefined contourne la garde dans confirmService.dismiss), donnant
    // l'impression que le bouton "Supprimer" de la sous-confirmation ne
    // déclenchait jamais rien — en réalité elle se fermait avant que l'utilisateur
    // ne puisse taper dessus.
    const stateId = state.id;
    if (!button.onPress) {
      confirmService.dismiss(stateId);
      return;
    }
    setLoadingIndex(index);
    try {
      await button.onPress();
    } catch {
      // l'écran appelant gère ses propres erreurs
    } finally {
      confirmService.dismiss(stateId);
    }
  };

  // 2 boutons ou moins = confirmation (bottom sheet, boutons pleine largeur en
  // pied de sheet). 3+ boutons = menu d'options (bottom sheet en lignes). Même
  // conteneur pour les deux — plus de carte centrée type Alert natif.
  const isMenu = state.buttons.length > 2;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}} statusBarTranslucent>
      <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay, opacity: backdrop }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => confirmService.dismiss(state.id)}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            paddingBottom: 16 + insets.bottom,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.divider }]} />

        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {state.title}
        </Text>
        {!!state.message && (
          <Text style={[styles.sheetMessage, { color: colors.textTertiary }]}>{state.message}</Text>
        )}

        {isMenu ? (
          <View style={styles.rows}>
            {state.buttons.map((button, index) => {
              const isCancel = button.style === 'cancel';
              const isDestructive = button.style === 'destructive';
              const disabled = loadingIndex !== null;
              const iconColor = isDestructive ? colors.error : colors.textSecondary;
              const textColor = isDestructive ? colors.error : colors.textPrimary;
              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.6}
                  disabled={disabled}
                  onPress={() => handlePress(button, index)}
                  style={[
                    styles.row,
                    isCancel && { marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 14 },
                    disabled && loadingIndex !== index && styles.rowDisabled,
                  ]}
                >
                  {loadingIndex === index ? (
                    <ActivityIndicator size="small" color={iconColor} style={styles.rowIcon} />
                  ) : (
                    <Icon name={button.icon ?? defaultIcon(button.style)} size={18} color={iconColor} style={styles.rowIcon} />
                  )}
                  <Text style={[styles.rowText, { color: textColor }]} numberOfLines={1}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.buttonRow}>
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
                    styles.buttonSide,
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
        )}
      </Animated.View>
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
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSide: { flex: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 14.5, fontWeight: '700' },

  // ── Bottom sheet — confirmation (2 boutons) et menu d'options (3+) ──────
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, paddingHorizontal: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 14,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 2, paddingHorizontal: 20 },
  sheetMessage: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginBottom: 6, lineHeight: 18 },
  rows: { marginTop: 6, paddingHorizontal: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 10,
    gap: 14,
  },
  rowIcon: { width: 18 },
  rowText: { fontSize: 15, fontWeight: '600' },
  rowDisabled: { opacity: 0.5 },
});
