/**
 * SheetCloseButton — bouton de fermeture standard pour toutes les bottom sheets
 * de l'app. Avant ce composant, chaque sheet dessinait sa propre icône "x"
 * avec des tailles/styles différents (20/26/15px, avec ou sans fond en cercle),
 * sans aucune cohérence visuelle d'un endroit à l'autre de l'app.
 */
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  onPress: () => void;
  style?: object;
}

export const SheetCloseButton: React.FC<Props> = ({ onPress, style }) => {
  const { theme: { colors } } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[st.btn, { backgroundColor: colors.backgroundSecondary }, style]}
    >
      <Icon name="x" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  btn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
});
