import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import { SectionTitleStyle } from '../../theme/feed';
import { Spacing } from '../../theme/spacing';

/**
 * SectionHeader — titre de section unique du Feed (lives, "dans ton quartier",
 * "ta tribu", "reels pour toi"…). Remplace les 4 styles de titre divergents qui
 * existaient inline. Toujours : Typography.h5 + textPrimary, "Voir tout" en primary.
 */
export const SectionHeader: React.FC<{
  title: string;
  colors: AppColors;
  /** Nom d'icône Feather affiché avant le titre (optionnel). */
  icon?: string;
  /** Couleur de l'icône — défaut: primary. */
  iconColor?: string;
  /** Pastille numérique après le titre (nb de lives, d'événements…). */
  count?: number;
  /** Affiche "Voir tout ›" à droite et câble l'action. */
  onSeeAll?: () => void;
  seeAllLabel?: string;
}> = ({ title, colors, icon, iconColor, count, onSeeAll, seeAllLabel = 'Voir tout' }) => (
  <View style={s.row}>
    <View style={s.left}>
      {icon ? <Icon name={icon} size={15} color={iconColor ?? colors.primary} /> : null}
      <Text style={[SectionTitleStyle, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {typeof count === 'number' && count > 0 ? (
        <Text style={[s.count, { color: colors.primary }]}>{count}</Text>
      ) : null}
    </View>

    {onSeeAll ? (
      <TouchableOpacity
        style={s.seeAll}
        onPress={onSeeAll}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Text style={[s.seeAllText, { color: colors.primary }]}>{seeAllLabel}</Text>
        <Icon name="chevron-right" size={14} color={colors.primary} />
      </TouchableOpacity>
    ) : null}
  </View>
);

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  count: {
    fontSize: 13,
    fontWeight: '700',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
