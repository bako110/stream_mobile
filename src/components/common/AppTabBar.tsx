import React, { useCallback, useEffect, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle, withTiming, useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { TAB_BAR_HEIGHT } from '../../styles';
import { popToTabRoot } from '../../navigation/stackHygiene';

interface TabConfig {
  name:  string;
  icon:  string;
  label: string;
}

const TABS: TabConfig[] = [
  { name: 'Home',        icon: 'home',        label: 'Accueil'    },
  { name: 'Communities', icon: 'compass',     label: 'Découvrir'  },
  { name: 'Reels',       icon: 'play-circle', label: 'Reels'      },
  { name: 'Profile',     icon: 'user',        label: 'Profil'     },
];

const CREATE_OPTIONS = [
  { icon: 'film',     label: 'Reel',       screen: 'CreateReel'    },
  { icon: 'edit-2',   label: 'Post',       screen: 'CreatePost'    },
  { icon: 'music',    label: 'Concert',    screen: 'CreateConcert' },
  { icon: 'calendar', label: 'Événement',  screen: 'CreateEvent'   },
] as const;

export const AppTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options as any;
  const hideTabBar = focusedOptions?.tabBarStyle?.display === 'none' || focusedOptions?.tabBarVisible === false;
  // tabBarTransparent (option déclarée par l'écran lui-même, ex: Reels dans
  // MainNavigator.tsx) — AppTabBar n'a plus besoin de connaître le nom
  // "Reels" en dur, n'importe quel écran plein écran peut demander le même
  // traitement. Seule la couleur de fond change (transparent, pour ne jamais
  // masquer le contenu derrière) — hauteur, position, icônes et tout le reste
  // restent exactement identiques à tous les autres écrans.
  const wantsTransparentBar = !!focusedOptions?.tabBarTransparent;

  // Le menu "+" restait ouvert indéfiniment si on changeait d'onglet ou
  // qu'on naviguait ailleurs sans re-cliquer dessus pour le refermer
  // explicitement — aucun listener ne le réinitialisait auparavant. On le
  // referme systématiquement dès que l'onglet actif (donc l'écran affiché)
  // change.
  useEffect(() => { setCreateOpen(false); }, [state.index]);

  if (hideTabBar) return null;

  // bottomPad PLAFONNÉ à 24 — sert uniquement à calculer la HAUTEUR visuelle
  // de la pilule (barHeight), jamais sa position. Sur un téléphone en
  // navigation gestuelle, insets.bottom est petit (quelques px), donc
  // Math.max(..., 12) suffisait. Mais sur un téléphone avec une VRAIE barre de
  // navigation système (3 boutons — Samsung notamment), insets.bottom peut
  // dépasser 40-48px : utilisé tel quel dans barHeight, ce nombre gonflait
  // toute la pilule bien au-delà de sa taille normale (symptôme confirmé par
  // capture d'écran : pilule démesurée uniquement sur ces appareils).
  const bottomPad = Platform.OS === 'android'
    ? Math.min(Math.max(insets.bottom, 12), 24)
    : insets.bottom;
  // Hauteur d'origine conservée (TAB_BAR_HEIGHT + bottomPad) — seul le DESIGN
  // (pilule détachée des bords, radius, ombre colorée) reprend la référence,
  // pas le gabarit.
  const barHeight = TAB_BAR_HEIGHT + bottomPad;
  // insets.bottom RÉEL (non plafonné) pour la POSITION — ce conteneur est
  // absolute par rapport au bord physique de l'écran (pas une zone qui exclut
  // déjà la barre système), donc la distance depuis le bas doit refléter la
  // vraie hauteur de la barre de navigation Android, sinon la pilule
  // chevaucherait les boutons système sur les appareils concernés.
  const bottomOffset = Math.max(insets.bottom - 8, 4);

  const navigateToCreate = (screen: string) => {
    setCreateOpen(false);
    (navigation as any).navigate(screen);
  };

  return (
    // left/right/borderRadius répétés explicitement ici (déjà dans
    // styles.container, mais en dernier dans le tableau) — ce conteneur ne
    // doit JAMAIS pouvoir perdre sa forme pilule détachée, transitoirement ou
    // non. Hauteur/position identiques sur TOUS les écrans (simplification
    // 2026-10, supprime la duplication de calcul qui divergeait de
    // ReelsScreen.tsx sur les appareils à barre de navigation système
    // Samsung). Sur Reels, un fond ENTIÈREMENT transparent avait été essayé
    // mais donnait un rectangle visuellement franc (coins arrondis non
    // "découpés" puisqu'il n'y a rien à découper sur un fond 100%
    // transparent — la vidéo rectangulaire en dessous occupait alors tout
    // l'espace, sans forme pilule perceptible). Un voile noir semi-
    // transparent garde la vidéo bien lisible à travers tout en laissant la
    // forme pilule visible, cohérent avec tous les autres écrans.
    <View style={[
      styles.container,
      { backgroundColor: wantsTransparentBar ? 'rgba(0,0,0,0.35)' : colors.surface, height: barHeight, bottom: bottomOffset },
      { left: 8, right: 8, borderRadius: 24 },
    ]}>
      {TABS.map((tab, index) => {
        const route     = state.routes.find(r => r.name === tab.name);
        const isFocused = !!route && state.routes[state.index]?.name === tab.name;

        return (
          <React.Fragment key={tab.name}>
            <TabItem
              config={tab}
              routeKey={route?.key}
              isFocused={isFocused}
              navigation={navigation}
              activeColor={colors.primary}
              inactiveColor={colors.textTertiary}
            />
            {/* Bouton Créer — entre Communautés (index 1) et Reels (index 2) */}
            {index === 1 && (
              <CreateTabButton
                open={createOpen}
                onToggle={() => setCreateOpen(o => !o)}
                onSelect={navigateToCreate}
                colors={colors}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};

interface CreateTabButtonProps {
  open:     boolean;
  onToggle: () => void;
  onSelect: (screen: string) => void;
  colors:   any;
}

const CreateTabButton: React.FC<CreateTabButtonProps> = memo(({ open, onToggle, onSelect, colors }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 200 });
  }, [open]);

  const iconRotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 45])}deg` }],
  }));

  const menuStyle = useAnimatedStyle(() => ({
    opacity:   progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [12, 0]) },
      { scale:      interpolate(progress.value, [0, 1], [0.9, 1]) },
    ],
  }));

  return (
    <View style={styles.createWrap} pointerEvents="box-none">
      {open && (
        <Animated.View style={[styles.createMenu, { backgroundColor: colors.surface, borderColor: colors.divider }, menuStyle]}>
          {CREATE_OPTIONS.map((opt, i) => (
            <React.Fragment key={opt.label}>
              {i > 0 && <View style={[styles.createMenuDivider, { backgroundColor: colors.divider }]} />}
              <TouchableOpacity
                onPress={() => onSelect(opt.screen)}
                activeOpacity={0.7}
                style={styles.createMenuItem}
              >
                <Icon name={opt.icon} size={16} color={colors.textSecondary} />
                <Text style={[styles.createMenuLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </Animated.View>
      )}

      <TouchableOpacity
        onPress={onToggle}
        style={styles.createBtnTouchable}
        activeOpacity={0.85}
      >
        <View
          style={[styles.createBtn, { borderColor: colors.surface, backgroundColor: open ? 'transparent' : colors.gradientStart }]}
        >
          <Animated.View style={iconRotateStyle}>
            <Icon name="plus" size={16} color={open ? colors.primary : '#fff'} />
          </Animated.View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

interface TabItemProps {
  config:         TabConfig;
  routeKey:       string | undefined;
  isFocused:      boolean;
  navigation:     BottomTabBarProps['navigation'];
  activeColor:    string;
  inactiveColor:  string;
  badge?:         number;
}

const TabItem: React.FC<TabItemProps> = memo(({
  config, routeKey, isFocused, navigation,
  activeColor, inactiveColor, badge,
}) => {
  const onPress = useCallback(() => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (event.defaultPrevented) return;
    if (!isFocused) {
      navigation.navigate(config.name);
      return;
    }
    // Tap sur l'onglet déjà actif — même comportement qu'Instagram/TikTok :
    // vide toute la pile accumulée au-dessus des Tabs pour revenir directement
    // à la racine, au lieu de laisser l'utilisateur "coincé" avec un bouton
    // retour qui doit traverser 20 écrans un par un.
    popToTabRoot();
  }, [isFocused, routeKey, config.name, navigation]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.tab} activeOpacity={0.75}>
      <View style={styles.iconSlot}>
        <Icon name={config.icon} size={16} color={isFocused ? activeColor : inactiveColor} />
        {!!badge && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.label, { color: isFocused ? activeColor : inactiveColor, fontWeight: isFocused ? '700' : '500' }]}>
        {config.label}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  // container : la pilule flottante elle-même, positionnée en absolute
  // (left/right: 8, cf. référence) — détachée des bords de l'écran. Hauteur
  // fournie dynamiquement dans le JSX (TAB_BAR_HEIGHT + bottomPad, taille
  // d'origine) — seul le design (radius, ombre colorée) reprend la référence.
  container: {
    position:       'absolute',
    left:           8,
    right:          8,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-around',
    borderRadius:   24,
  },
  // flex:1 d'origine conservé (pas la largeur fixe de la référence) — seul le
  // design du container (pilule flottante) change, pas les proportions des
  // items.
  tab: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            2,
    paddingTop:     2,
  },
  iconSlot: {
    width:          28,
    height:         28,
    alignItems:     'center',
    justifyContent: 'center',
  },
  label: {
    marginTop:     1,
    fontSize:      11,
  },
  badge: {
    position: 'absolute', top: -6, right: -10,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff', fontSize: 9, fontWeight: '700',
  },

  createWrap: {
    alignItems:     'center',
    justifyContent: 'center',
    width:          64,
  },
  createBtnTouchable: {
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      -8, // dépasse légèrement au-dessus de la barre
  },
  // Taille d'origine conservée (32x32) — seul le design (forme/ombre/couleur)
  // reprend la référence, pas la taille.
  createBtn: {
    width:          32,
    height:         32,
    borderRadius:   10,
    borderWidth:    3,      // liseré de la couleur de la barre → détache le bouton du fond
    alignItems:     'center',
    justifyContent: 'center',
  },
  createMenu: {
    position:     'absolute',
    bottom:       58,
    left:         '50%',
    marginLeft:   -75, // moitié de minWidth (150) — centre le menu sur le bouton parent
    borderRadius: 16,
    borderWidth:  StyleSheet.hairlineWidth,
    overflow:     'hidden',
    shadowColor:  '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation:    8,
    minWidth:     150,
  },
  createMenuItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  createMenuDivider: {
    height: StyleSheet.hairlineWidth,
  },
  createMenuLabel: {
    fontSize:   13,
    fontWeight: '600',
  },
});
