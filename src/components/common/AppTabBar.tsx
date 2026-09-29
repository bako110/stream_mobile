import React, { useCallback, useEffect, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle, withSpring, withTiming, useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
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
  // Zoom d'accessibilité système — au-delà d'un certain agrandissement, les 4
  // libellés + le bouton Créer central n'ont plus la place de tenir sur la
  // largeur de la barre : masque les textes, garde uniquement les icônes.
  const { fontScale } = useWindowDimensions();
  const showLabels = fontScale < 1.15;

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options as any;
  const hideTabBar = focusedOptions?.tabBarStyle?.display === 'none' || focusedOptions?.tabBarVisible === false;
  // Sur Reels, la vidéo occupe tout l'écran (plein écran réel, voir SCREEN_H
  // dans ReelsScreen.tsx) — la tab bar flotte donc en overlay transparent
  // par-dessus au lieu de réserver sa propre hauteur opaque en bas.
  const isReelsScreen = focusedRoute.name === 'Reels';

  // Le menu "+" restait ouvert indéfiniment si on changeait d'onglet ou
  // qu'on naviguait ailleurs sans re-cliquer dessus pour le refermer
  // explicitement — aucun listener ne le réinitialisait auparavant. On le
  // referme systématiquement dès que l'onglet actif (donc l'écran affiché)
  // change.
  useEffect(() => { setCreateOpen(false); }, [state.index]);

  if (hideTabBar) return null;

  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom, 12)
    : insets.bottom;
  const barHeight = TAB_BAR_HEIGHT + bottomPad;

  const navigateToCreate = (screen: string) => {
    setCreateOpen(false);
    (navigation as any).navigate(screen);
  };

  return (
    <>
      <View style={[
        styles.container,
        isReelsScreen
          ? { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', borderTopWidth: 0, height: barHeight, paddingBottom: bottomPad }
          : { backgroundColor: colors.surface, borderTopColor: colors.divider, height: barHeight, paddingBottom: bottomPad },
      ]}>
        {isReelsScreen ? (
          <>
            {/* Dégradé sombre (bas → haut) plutôt qu'un fond opaque — garantit
                la lisibilité des icônes blanches quel que soit le contenu de
                la vidéo derrière, sans jamais masquer complètement l'image.
                Renforcé (0.75 au lieu de 0.7) pour que toute la zone du
                footer se perçoive comme un espace distinct, pas juste les
                icônes individuellement. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.0)']}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Fine ligne de séparation en haut de la zone — marque clairement
                où commence le footer, sans être une bordure opaque. */}
            <View pointerEvents="none" style={styles.reelsTopBorder} />
          </>
        ) : (
          <LinearGradient
            colors={[colors.primary + '30', colors.gradientEnd + '15', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topLine}
            pointerEvents="none"
          />
        )}

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
                activeColor={isReelsScreen ? '#fff' : colors.primary}
                inactiveColor={isReelsScreen ? 'rgba(255,255,255,0.6)' : colors.textTertiary}
                showLabel={showLabels}
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
    </>
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
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.createBtn, { borderColor: colors.surface }]}
        >
          <Animated.View style={iconRotateStyle}>
            <Icon name="plus" size={16} color="#fff" />
          </Animated.View>
        </LinearGradient>
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
  showLabel:      boolean;
}

const TabItem: React.FC<TabItemProps> = memo(({
  config, routeKey, isFocused, navigation,
  activeColor, inactiveColor, badge, showLabel,
}) => {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFocused ? 1 : 0, { damping: 15, stiffness: 180 });
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -2]) }],
  }));

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
        <Animated.View style={iconStyle}>
          <Icon name={config.icon} size={16} color={isFocused ? activeColor : inactiveColor} />
          {!!badge && badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {showLabel && (
        <Text style={[styles.label, { color: isFocused ? activeColor : inactiveColor, fontWeight: isFocused ? '700' : '500' }]}>
          {config.label}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation:      12,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: -3 },
    shadowOpacity:  0.08,
    shadowRadius:   8,
  },
  topLine: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
    height:   2,
  },
  reelsTopBorder: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    height:          StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
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
    fontSize:      9.5,
    letterSpacing: 0.2,
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
    marginTop:      -8, // le bouton dépasse légèrement au-dessus de la barre
  },
  createBtn: {
    width:          32,
    height:         32,
    borderRadius:   10,
    borderWidth:    3,      // liseré de la couleur de la barre → détache le bouton du fond
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOpacity:  0.18,
    shadowRadius:   8,
    shadowOffset:   { width: 0, height: 3 },
    elevation:      6,
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
