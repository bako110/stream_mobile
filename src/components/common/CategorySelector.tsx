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
import { CategoryIcon } from './categoryIcons';

export interface ContentCategory {
  value: string;
  label: string;
}

export const CONTENT_CATEGORIES: ContentCategory[] = [
  { value: 'musique',      label: 'Musique' },
  { value: 'sport',        label: 'Sport' },
  { value: 'gaming',       label: 'Gaming' },
  { value: 'humour',       label: 'Humour' },
  { value: 'danse',        label: 'Danse' },
  { value: 'cuisine',      label: 'Cuisine' },
  { value: 'mode',         label: 'Mode' },
  { value: 'beaute',       label: 'Beauté' },
  { value: 'tech',         label: 'Tech' },
  { value: 'education',    label: 'Éducation' },
  { value: 'lifestyle',    label: 'Lifestyle' },
  { value: 'art',          label: 'Art' },
  { value: 'voyage',       label: 'Voyage' },
  { value: 'business',     label: 'Business' },
  { value: 'actualite',    label: 'Actualité' },
  { value: 'spiritualite', label: 'Spiritualité' },
  { value: 'famille',      label: 'Famille' },
  { value: 'sante',        label: 'Santé' },
  { value: 'auto',         label: 'Auto/Moto' },
  { value: 'animaux',      label: 'Animaux' },
  { value: 'nature',       label: 'Nature' },
  { value: 'bricolage',    label: 'Bricolage' },
  { value: 'cinema',       label: 'Film/Série' },
  { value: 'autre',        label: 'Autre' },
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
              <CategoryIcon value={cat.value} size={13} color={active ? '#9B65F5' : colors.textSecondary} />
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
});
