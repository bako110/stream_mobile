/**
 * Icônes vectorielles (Feather/MaterialCommunityIcons) par catégorie de contenu —
 * remplace l'affichage en emoji texte (cat.emoji, voir CONTENT_CATEGORIES) partout
 * où une vraie icône cohérente avec le reste du design de l'app est attendue.
 * Aligné sur CONTENT_CATEGORIES (components/common/CategorySelector.tsx) et le
 * backend content_category.py.
 */
import React from 'react';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';

export const CATEGORY_ICONS: Record<string, { lib: 'feather' | 'mc'; name: string }> = {
  musique:      { lib: 'feather', name: 'music' },
  sport:        { lib: 'mc',      name: 'soccer' },
  gaming:       { lib: 'mc',      name: 'controller-classic-outline' },
  humour:       { lib: 'mc',      name: 'emoticon-happy-outline' },
  danse:        { lib: 'mc',      name: 'human' },
  cuisine:      { lib: 'feather', name: 'coffee' },
  mode:         { lib: 'mc',      name: 'tshirt-crew-outline' },
  beaute:       { lib: 'mc',      name: 'lipstick' },
  tech:         { lib: 'feather', name: 'cpu' },
  education:    { lib: 'feather', name: 'book-open' },
  lifestyle:    { lib: 'feather', name: 'star' },
  art:          { lib: 'feather', name: 'image' },
  voyage:       { lib: 'feather', name: 'send' },
  business:     { lib: 'feather', name: 'briefcase' },
  actualite:    { lib: 'feather', name: 'file-text' },
  spiritualite: { lib: 'mc',      name: 'hands-pray' },
  famille:      { lib: 'mc',      name: 'home-heart' },
  sante:        { lib: 'feather', name: 'heart' },
  autre:        { lib: 'feather', name: 'grid' },
  free:         { lib: 'feather', name: 'star' },
};

/** Rendu direct d'une icône de catégorie — repli sur 'grid' si le value n'est pas mappé. */
export const CategoryIcon: React.FC<{ value: string; size?: number; color: string }> = ({ value, size = 15, color }) => {
  const info = CATEGORY_ICONS[value] ?? { lib: 'feather' as const, name: 'grid' };
  return info.lib === 'mc'
    ? <MCIcon name={info.name} size={size} color={color} />
    : <Icon name={info.name} size={size} color={color} />;
};
