/**
 * CategorySelector — pills de selection d'une categorie de contenu (taxonomie
 * fermee partagee avec le backend, voir stream_backend/app/utils/content_category.py).
 * Utilise a la creation d'un reel/post/live/communaute pour le systeme de
 * recommandation (UserInterest). Toujours optionnel cote UI — le backend
 * retombe sur "autre" si rien n'est envoye.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export interface ContentCategory {
  value: string;
  label: string;
  emoji: string;
}

export const CONTENT_CATEGORIES: ContentCategory[] = [
  { value: 'musique',      label: 'Musique',      emoji: '🎵' },
  { value: 'sport',        label: 'Sport',        emoji: '⚽' },
  { value: 'gaming',       label: 'Gaming',       emoji: '🎮' },
  { value: 'humour',       label: 'Humour',       emoji: '😂' },
  { value: 'danse',        label: 'Danse',        emoji: '💃' },
  { value: 'cuisine',      label: 'Cuisine',      emoji: '🍳' },
  { value: 'mode',         label: 'Mode',         emoji: '👗' },
  { value: 'beaute',       label: 'Beauté',       emoji: '💄' },
  { value: 'tech',         label: 'Tech',         emoji: '💻' },
  { value: 'education',    label: 'Éducation',    emoji: '📚' },
  { value: 'lifestyle',    label: 'Lifestyle',    emoji: '✨' },
  { value: 'art',          label: 'Art',          emoji: '🎨' },
  { value: 'voyage',       label: 'Voyage',       emoji: '✈️' },
  { value: 'business',     label: 'Business',     emoji: '💼' },
  { value: 'actualite',    label: 'Actualité',    emoji: '📰' },
  { value: 'spiritualite', label: 'Spiritualité', emoji: '🙏' },
  { value: 'famille',      label: 'Famille',      emoji: '👨‍👩‍👧' },
  { value: 'sante',        label: 'Santé',        emoji: '🏥' },
  { value: 'autre',        label: 'Autre',        emoji: '📌' },
];

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export const CategorySelector: React.FC<Props> = ({ value, onChange, label }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ gap: 8 }}>
      {label && <Text style={[s.label, { color: colors.textTertiary }]}>{label}</Text>}
      <View style={s.row}>
        {CONTENT_CATEGORIES.map(cat => {
          const active = value === cat.value;
          return (
            <TouchableOpacity
              key={cat.value}
              onPress={() => onChange(active ? null : cat.value)}
              style={[
                s.chip,
                { borderColor: active ? '#9B65F5' : colors.border, backgroundColor: active ? '#9B65F522' : colors.backgroundSecondary },
              ]}
            >
              <Text style={s.emoji}>{cat.emoji}</Text>
              <Text style={{ color: active ? '#9B65F5' : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8,
  },
  emoji: { fontSize: 13 },
});
