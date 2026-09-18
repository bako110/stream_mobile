/**
 * PinPad — pavé numérique dessiné (0-9 + effacer) pour la saisie d'un code PIN.
 *
 * - N points en haut qui se remplissent au fur et à mesure.
 * - Grille 3×4 de touches tactiles (pas le clavier système).
 * - Validation automatique : `onComplete(code)` est appelé dès que `length`
 *   chiffres sont saisis. Le parent remet `value` à '' pour rejouer une saisie
 *   (erreur de PIN, nouvelle tentative).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export const PinPad: React.FC<Props> = ({
  length = 4,
  value,
  onChange,
  onComplete,
  disabled = false,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const press = (k: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (k === '') return;
    if (k === 'del') {
      if (value.length > 0) onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    const next = value + k;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <View style={s.wrap}>
      {/* Points */}
      <View style={s.dots}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              {
                borderColor: colors.primary,
                backgroundColor: value.length > i ? colors.primary : 'transparent',
              },
            ]}
          />
        ))}
      </View>

      {/* Grille */}
      <View style={s.grid}>
        {KEYS.map((k, i) => {
          if (k === '') return <View key={i} style={s.key} />;
          const isDel = k === 'del';
          return (
            <TouchableOpacity
              key={i}
              style={[
                s.key,
                !isDel && { backgroundColor: colors.backgroundSecondary },
                isDel && { backgroundColor: 'transparent' },
                disabled && { opacity: 0.4 },
              ]}
              activeOpacity={0.6}
              onPress={() => press(k)}
              disabled={disabled}
            >
              {isDel ? (
                <Icon name="delete" size={22} color={colors.textSecondary} />
              ) : (
                <Text style={[s.keyText, { color: colors.textPrimary }]}>{k}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  wrap:  { alignItems: 'center' },
  dots:  { flexDirection: 'row', gap: 16, marginBottom: 24, marginTop: 4 },
  dot:   { width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  grid:  { width: 252, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  key:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 26, fontWeight: '600' },
});
