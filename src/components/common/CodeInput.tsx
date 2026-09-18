/**
 * CodeInput — saisie d'un code numérique à N chiffres (PIN wallet, OTP…).
 *
 * Technique « N cases visibles + 1 input caché » (extraite de PhoneOtpScreen) :
 * l'utilisateur voit des cases, mais tape dans un seul TextInput invisible qui
 * porte tout le clavier / autofill natif.
 *
 * `mask` remplace chaque chiffre saisi par un point plein (saisie de PIN).
 */
import React, { useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  mask?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

export const CodeInput: React.FC<Props> = ({
  length = 4,
  value,
  onChange,
  mask = false,
  autoFocus = true,
  disabled = false,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const inputRef = useRef<TextInput>(null);

  const focus = () => inputRef.current?.focus();

  return (
    <View>
      <View style={s.row}>
        {Array.from({ length }).map((_, i) => {
          const filled = value.length > i;
          const active = value.length === i && !disabled;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.8}
              onPress={focus}
              disabled={disabled}
              style={[
                s.box,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: active
                    ? colors.primary
                    : filled
                    ? colors.primary + '60'
                    : colors.border,
                  opacity: disabled ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[s.char, { color: colors.textPrimary }]}>
                {filled ? (mask ? '●' : value[i]) : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={v => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        editable={!disabled}
        autoFocus={autoFocus}
        style={s.hidden}
        // iOS : propose le code SMS mais ne gêne pas la saisie manuelle du PIN
        textContentType={mask ? 'password' : 'oneTimeCode'}
        secureTextEntry={false}
      />
    </View>
  );
};

const s = StyleSheet.create({
  row:    { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 },
  box:    { width: 44, height: 52, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  char:   { fontSize: 22, fontWeight: '700' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
