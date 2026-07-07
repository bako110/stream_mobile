/**
 * ExplorerMenuScreen — menu Explorer (style TikTok/Facebook), extrait de FeedScreen
 * en vrai écran de navigation (au lieu d'un Modal local) pour que le bouton retour
 * ramène naturellement ici après avoir ouvert un item (Wallet, Planning, etc.),
 * via la pile de navigation standard plutôt qu'un état local à rouvrir manuellement.
 */
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { CachedImage } from '../../components/common';
import { authService } from '../../services';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const { width: SW } = Dimensions.get('window');

interface Props { onLogout?: () => void; }

export const ExplorerMenuScreen: React.FC<Props> = ({ onLogout }) => {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* Header */}
      <View style={[mnu.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: 52 }]}>
        <Text style={[mnu.headerTitle, { color: colors.textPrimary }]}>Explorer</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {onLogout && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Se déconnecter', 'Voulez-vous vraiment vous déconnecter ?', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Déconnecter', style: 'destructive', onPress: () => {
                    authService._clearTokens();
                    onLogout();
                    authService.logout().catch(() => {});
                  }},
                ]);
              }}
              style={mnu.closeBtn}
            >
              <Icon name="log-out" size={20} color="#EF4444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => nav.goBack()} style={mnu.closeBtn}>
            <Icon name="x" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Profil rapide */}
        {currentUser && (
          <TouchableOpacity
            style={[mnu.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.8}
            onPress={() => nav.navigate('EditProfile' as any)}
          >
            {currentUser.avatar_url ? (
              <CachedImage uri={currentUser.avatar_url} style={mnu.profileAvatar} />
            ) : (
              <View style={[mnu.profileAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>
                  {((currentUser.display_name ?? currentUser.username ?? '?')[0] ?? '?').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[mnu.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                {currentUser.display_name ?? currentUser.username}
              </Text>
              <Text style={[mnu.profileSub, { color: colors.textTertiary }]}>
                Voir mon profil
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Grille — Découvrir */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>DÉCOUVRIR</Text>
        <View style={mnu.grid}>
          {([
            { icon: 'film',        label: 'Films',         color: '#3B82F6', screen: 'Movies'      },
            { icon: 'tv',          label: 'Séries',        color: '#7B3FF2', screen: 'Series'      },
            { icon: 'play-circle', label: 'Reels',         color: '#FF7A2F', screen: 'Reels'       },
            { icon: 'radio',       label: 'Lives',         color: '#F0365A', screen: 'SimpleLiveList' },
            { icon: 'music',       label: 'Concerts live', color: '#E0389A', screen: 'LiveList'    },
            { icon: 'calendar',    label: 'Événements',    color: '#10B981', screen: 'Events'      },
            { icon: 'trending-up', label: 'Tendances',     color: '#F59E0B', screen: 'Trending'    },
          ] as const).map((item) => (
            <TouchableOpacity
              key={item.screen}
              style={[mnu.gridItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.75}
              onPress={() => (nav as any).navigate(item.screen)}
            >
              <View style={[mnu.gridIcon, { backgroundColor: item.color + '20' }]}>
                <Icon name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={[mnu.gridLabel, { color: colors.textPrimary }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Liste — Social */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>SOCIAL</Text>
        {([
          { icon: 'users',          label: 'Communautés',   sub: 'Rejoins des groupes',        color: '#36D9A0', screen: 'Communities'   },
          { icon: 'user-plus',      label: 'Amis',          sub: 'Abonnements & abonnés',      color: '#10B981', screen: 'Following'      },
          { icon: 'activity',       label: 'Activité',      sub: 'Tes interactions récentes',  color: '#E0389A', screen: 'Activity'       },
          { icon: 'clock',          label: 'Historique',    sub: 'Vidéos regardées',           color: '#6366F1', screen: 'WatchHistory'   },
          { icon: 'star',           label: 'Favoris',       sub: 'Contenus sauvegardés',       color: '#EAB308', screen: 'Favorites'      },
        ] as const).map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.75}
            onPress={() => (nav as any).navigate(item.screen)}
          >
            <View style={[mnu.listIcon, { backgroundColor: item.color + '18' }]}>
              <Icon name={item.icon} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <Text style={[mnu.listSub, { color: colors.textTertiary }]}>{item.sub}</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Liste — Espace personnel */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>MON ESPACE</Text>
        {([
          { icon: 'calendar',     label: 'Planning',      sub: 'Mes événements et invitations',  color: '#7B3FF2', screen: 'Planning'             },
          { icon: 'credit-card',  label: 'Wallet',        sub: 'Solde, achats, transferts',      color: '#F59E0B', screen: 'Wallet'              },
          { icon: 'gift',         label: 'Parrainage',    sub: 'Inviter des amis, gagner des GoGold', color: '#10B981', screen: 'Referral'         },
          { icon: 'bar-chart-2',  label: 'Monétisation',  sub: 'Dashboard, stats, revenus',      color: '#7B3FF2', screen: 'SettingsMonetisation' },
          { icon: 'shield',       label: 'Vérification',  sub: 'Obtenir le badge certifié',      color: '#1D9BF0', screen: 'SettingsVerification' },
          { icon: 'award',        label: 'Abonnement',    sub: 'Gérer ton abonnement',           color: '#14B8A6', screen: 'Subscriptions'        },
          { icon: 'zap',          label: 'Pub',           sub: 'Créer et gérer tes campagnes',   color: '#F97316', screen: 'Ads'                  },
        ] as const).map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.75}
            onPress={() => (nav as any).navigate(item.screen)}
          >
            <View style={[mnu.listIcon, { backgroundColor: item.color + '18' }]}>
              <Icon name={item.icon} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <Text style={[mnu.listSub, { color: colors.textTertiary }]}>{item.sub}</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Réglages */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>RÉGLAGES</Text>
        {([
          { icon: 'sliders',  label: 'Réglages',   sub: 'Apparence, notifications, compte', color: '#6B7280', screen: 'Settings' },
        ] as const).map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.75}
            onPress={() => (nav as any).navigate(item.screen)}
          >
            <View style={[mnu.listIcon, { backgroundColor: item.color + '18' }]}>
              <Icon name={item.icon} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <Text style={[mnu.listSub, { color: colors.textTertiary }]}>{item.sub}</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Section Assistance */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>ASSISTANCE</Text>
        <TouchableOpacity
          style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.75}
          onPress={() => (nav as any).navigate('Support')}
        >
          <View style={[mnu.listIcon, { backgroundColor: '#0EA5E918' }]}>
            <Icon name="life-buoy" size={20} color="#0EA5E9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>Assistance</Text>
            <Text style={[mnu.listSub, { color: colors.textTertiary }]}>Centre d'aide GoFolyX</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

const mnu = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: 22, fontWeight: '800' },
  closeBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  profileCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  profileAvatar: { width: 52, height: 52, borderRadius: 26 },
  profileName:   { fontSize: 16, fontWeight: '700' },
  profileSub:    { fontSize: 13, marginTop: 2 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  gridItem:      { width: (SW - 44) / 3, borderRadius: 14, padding: 14, alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  gridIcon:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gridLabel:     { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  listItem:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  listIcon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  listLabel:     { fontSize: 15, fontWeight: '700' },
  listSub:       { fontSize: 12, marginTop: 2 },
});
