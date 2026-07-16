import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import type { CommunityData } from '../../services/communityService';

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function gradientFor(_name: string): [string, string] {
  return ['#7B3FF2', '#9B65F5'];
}

// Carte compacte pour l'affichage en grille 2 colonnes de "Mes communautés" —
// CommunityCard (ligne WhatsApp-style pleine largeur) écrase son contenu si on
// le force dans une colonne étroite, donc layout dédié ici (avatar centré,
// contenu empilé verticalement) plutôt que de réutiliser CommunityCard tel quel.
export const CommunityGridCard = React.memo(function CommunityGridCard({
  item,
  colors,
  onPress,
}: {
  item: CommunityData;
  colors: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[G.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={G.avatarWrap}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={G.avatar} />
        ) : (
          <LinearGradient colors={gradientFor(item.name)} style={G.avatarGrad}>
            <Text style={G.avatarLetter}>{(item.name[0] ?? '?').toUpperCase()}</Text>
          </LinearGradient>
        )}
        {item.is_verified && (
          <View style={G.verifiedDot}>
            <Icon name="check" size={8} color="#fff" />
          </View>
        )}
      </View>

      <Text style={[G.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.name}
      </Text>
      <View style={G.membersRow}>
        <Icon name="users" size={11} color={colors.textTertiary} />
        <Text style={[G.membersCount, { color: colors.textTertiary }]}>
          {fmtCount(item.members_count ?? 0)} membre{(item.members_count ?? 0) > 1 ? 's' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const G = StyleSheet.create({
  card: {
    width: '46%', alignItems: 'center', gap: 8,
    margin: 6, padding: 14, borderRadius: 16, borderWidth: 1,
  },
  avatarWrap: { position: 'relative' },
  avatar:     { width: 56, height: 56, borderRadius: 28 },
  avatarGrad: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 22 },
  verifiedDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 17, height: 17, borderRadius: 9,
    backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  name: { fontSize: 13, fontWeight: '700', textAlign: 'center', maxWidth: '100%' },
  membersRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  membersCount: { fontSize: 11, fontWeight: '600' },
});
