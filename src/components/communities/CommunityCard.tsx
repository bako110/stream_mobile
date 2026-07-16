import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import type { CommunityData, JoinStatus } from '../../services/communityService';

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function gradientFor(_name: string): [string, string] {
  return ['#7B3FF2', '#9B65F5'];
}

export const CommunityCard = React.memo(function CommunityCard({
  item,
  isMine,
  colors,
  onPress,
  onJoin,
  onLeave,
  onCancelRequest,
}: {
  item: CommunityData;
  isMine: boolean;
  colors: any;
  onPress: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onCancelRequest: () => void;
}) {
  const joinStatus: JoinStatus = isMine ? 'member' : (item.join_status ?? 'none');
  const isPrivateOrApproval = item.is_private || item.requires_approval;
  const price = item.entry_price_gogold ?? 0;

  const subline = (() => {
    if (item.description) return item.description;
    const parts: string[] = [];
    if (item.is_private) parts.push('Privee');
    else parts.push('Publique');
    if (isPrivateOrApproval) parts.push('sur invitation');
    if (price > 0) parts.push(`${price} GoGold`);
    return parts.join(' · ');
  })();

  const renderRight = () => {
    if (joinStatus === 'member') {
      return (
        <View style={CS.rightMeta}>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </View>
      );
    }
    if (joinStatus === 'pending') {
      return (
        <TouchableOpacity onPress={onCancelRequest} activeOpacity={0.8} style={CS.pillPending}>
          <Text style={CS.pillPendingTxt}>En attente</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity onPress={onJoin} activeOpacity={0.8} style={CS.pillJoin}>
        <Text style={CS.pillJoinTxt}>
          {isPrivateOrApproval ? 'Demander' : price > 0 ? `${price} GoGold` : 'Rejoindre'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.65}
      onPress={onPress}
      style={[CS.row, { backgroundColor: colors.background }]}
    >
      {/* Avatar */}
      <View style={CS.avatarWrap}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={CS.avatar} />
        ) : (
          <LinearGradient colors={gradientFor(item.name)} style={CS.avatarGrad}>
            <Text style={CS.avatarLetter}>{(item.name[0] ?? '?').toUpperCase()}</Text>
          </LinearGradient>
        )}
        {item.is_verified && (
          <View style={CS.verifiedDot}>
            <Icon name="check" size={8} color="#fff" />
          </View>
        )}
      </View>

      {/* Contenu + separateur indenté */}
      <View style={[CS.inner, { borderBottomColor: colors.divider }]}>
        {/* Ligne 1 : nom + badges + membres */}
        <View style={CS.row1}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
            <Text style={[CS.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.is_verified && <Icon name="check-circle" size={12} color="#3B82F6" />}
            {(item as any).tier === 'pro' && (
              <View style={CS.badgePro}><Text style={CS.badgeProTxt}>PRO</Text></View>
            )}
            {(item as any).tier === 'elite' && (
              <View style={CS.badgeElite}><Text style={CS.badgeEliteTxt}>ELITE</Text></View>
            )}
          </View>
          <Text style={[CS.membersCount, { color: colors.textTertiary }]}>
            {fmtCount(item.members_count ?? 0)}
          </Text>
        </View>

        {/* Ligne 2 : description / sous-titre */}
        <View style={CS.row2}>
          <Text style={[CS.subline, { color: colors.textTertiary }]} numberOfLines={1}>
            {subline}
          </Text>
          {renderRight()}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const CS = StyleSheet.create({
  // Ligne WhatsApp-style : avatar a gauche, contenu avec separateur indenté
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },

  // Avatar
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatar:     { width: 52, height: 52, borderRadius: 26 },
  avatarGrad: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 20 },
  verifiedDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  // Zone droite avec le séparateur qui ne touche pas le bord gauche
  inner: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },

  // Ligne 1 : nom + membres
  row1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
  membersCount: { fontSize: 12, fontWeight: '500', marginLeft: 6 },

  // Ligne 2 : sous-titre + action
  row2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subline: { fontSize: 13, flex: 1, marginRight: 8 },

  // Chevron membre
  rightMeta: { paddingLeft: 4 },

  // Pilule "Rejoindre"
  pillJoin: {
    backgroundColor: '#7B3FF2',
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pillJoinTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Pilule "En attente"
  pillPending: {
    backgroundColor: '#F59E0B18',
    borderWidth: 1,
    borderColor: '#F59E0B60',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pillPendingTxt: { color: '#F59E0B', fontSize: 12, fontWeight: '600' },

  // Badges tier
  badgePro:      { backgroundColor: '#7B3FF222', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  badgeProTxt:   { color: '#7B3FF2', fontSize: 9, fontWeight: '800' },
  badgeElite:    { backgroundColor: '#F59E0B22', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  badgeEliteTxt: { color: '#F59E0B', fontSize: 9, fontWeight: '800' },
});
