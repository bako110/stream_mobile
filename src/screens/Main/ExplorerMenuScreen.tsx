/**
 * ExplorerMenuScreen — menu Explorer (style TikTok/Facebook), extrait de FeedScreen
 * en vrai écran de navigation (au lieu d'un Modal local) pour que le bouton retour
 * ramène naturellement ici après avoir ouvert un item (Wallet, Planning, etc.),
 * via la pile de navigation standard plutôt qu'un état local à rouvrir manuellement.
 */
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { CachedImage } from '../../components/common';
import { authService, showConfirm } from '../../services';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface Props { onLogout?: () => void; }

export const ExplorerMenuScreen: React.FC<Props> = ({ onLogout }) => {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* Header */}
      <View style={[mnu.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 14 }]}>
        <Text style={[mnu.headerTitle, { color: colors.textPrimary }]}>Explorer</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {onLogout && (
            <TouchableOpacity
              onPress={() => {
                showConfirm('Se déconnecter', 'Voulez-vous vraiment vous déconnecter ?', [
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

        {/* Liste — Découvrir */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>DÉCOUVRIR</Text>
        {([
          { icon: 'film',        label: 'Films',         sub: 'Regarder des films en streaming',           color: '#3B82F6', screen: 'Movies'         },
          { icon: 'tv',          label: 'Séries',        sub: 'Suivre tes séries, épisode par épisode',    color: '#7B3FF2', screen: 'Series'         },
          { icon: 'play-circle', label: 'Reels',         sub: 'Défiler des vidéos courtes à l\'infini',    color: '#FF7A2F', screen: 'Reels'          },
          { icon: 'radio',       label: 'Lives',         sub: 'Voir les diffusions en direct du moment',   color: '#F0365A', screen: 'SimpleLiveList' },
          { icon: 'zap',         label: 'Live Matchs',   sub: 'Suivre des battles et tournois en direct',  color: '#9B65F5', screen: 'LiveMatches'    },
          { icon: 'music',       label: 'Concerts live', sub: 'Assister à des concerts en streaming',      color: '#E0389A', screen: 'LiveList'       },
          { icon: 'calendar',    label: 'Événements',    sub: 'Trouver des sorties et réserver des billets', color: '#10B981', screen: 'Events'       },
          { icon: 'trending-up', label: 'Tendances',     sub: 'Voir ce qui buzz en ce moment',             color: '#F59E0B', screen: 'Trending'       },
        ] as const).map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.75}
            onPress={() => item.screen === 'Reels'
              ? (nav as any).navigate('Tabs', { screen: 'Reels' })
              : (nav as any).navigate(item.screen)}
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

        {/* Liste — Social */}
        <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>SOCIAL</Text>
        {([
          { icon: 'users',          label: 'Communautés',   sub: 'Rejoindre des groupes qui te ressemblent',   color: '#36D9A0', screen: 'Communities'   },
          { icon: 'user-plus',      label: 'Amis',          sub: 'Gérer tes abonnements et tes abonnés',       color: '#10B981', screen: 'Following'      },
          { icon: 'activity',       label: 'Activité',      sub: 'Voir tes likes, commentaires et interactions', color: '#E0389A', screen: 'Activity'     },
          { icon: 'clock',          label: 'Historique',    sub: 'Retrouver les vidéos déjà regardées',        color: '#6366F1', screen: 'WatchHistory'   },
          { icon: 'star',           label: 'Favoris',       sub: 'Retrouver tes contenus sauvegardés',         color: '#EAB308', screen: 'Favorites'      },
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
          { icon: 'calendar',     label: 'Planning',      sub: 'Voir tes événements et invitations à venir',    color: '#7B3FF2', screen: 'Planning'             },
          { icon: 'credit-card',  label: 'Wallet',        sub: 'Consulter ton solde, acheter, transférer',      color: '#F59E0B', screen: 'Wallet'              },
          { icon: 'gift',         label: 'Parrainage',    sub: 'Inviter des amis et gagner des GoGold',         color: '#10B981', screen: 'Referral'             },
          { icon: 'bar-chart-2',  label: 'Monétisation',  sub: 'Activer et configurer tes revenus créateur',    color: '#7B3FF2', screen: 'SettingsMonetisation' },
          { icon: 'trending-up',  label: 'Statistiques',  sub: 'Suivre tes vues, ton audience et leur évolution', color: '#3B82F6', screen: 'CreatorAnalytics'   },
          { icon: 'shield',       label: 'Vérification',  sub: 'Demander le badge de compte certifié',          color: '#1D9BF0', screen: 'SettingsVerification' },
          { icon: 'award',        label: 'Abonnement',    sub: 'Gérer ou changer ton abonnement premium',       color: '#14B8A6', screen: 'Subscriptions'        },
          { icon: 'zap',          label: 'Pub',           sub: 'Créer et suivre tes campagnes publicitaires',   color: '#F97316', screen: 'Ads'                  },
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
          { icon: 'sliders',  label: 'Réglages',   sub: 'Apparence, notifications et gestion du compte', color: '#6B7280', screen: 'Settings' },
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
            <Text style={[mnu.listSub, { color: colors.textTertiary }]}>Consulter l'aide ou contacter le support</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.75}
          onPress={() => (nav as any).navigate('Feedback')}
        >
          <View style={[mnu.listIcon, { backgroundColor: '#7B3FF218' }]}>
            <Icon name="edit-3" size={20} color="#7B3FF2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>Donner mon avis</Text>
            <Text style={[mnu.listSub, { color: colors.textTertiary }]}>Signaler un bug ou proposer une idée</Text>
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
  listItem:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  listIcon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  listLabel:     { fontSize: 15, fontWeight: '700' },
  listSub:       { fontSize: 12, marginTop: 2 },
});
