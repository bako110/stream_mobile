import React, { useCallback, useEffect, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle, withSpring, withTiming, useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useWs } from '../../context/WebSocketContext';
import { TAB_BAR_HEIGHT } from '../../styles';

interface TabConfig {
  name:  string;
  icon:  string;
  label: string;
}

const TABS: TabConfig[] = [
  { name: 'Home',        icon: 'home',        label: 'Accueil'     },
  { name: 'Communities', icon: 'users',        label: 'Communautés' },
  { name: 'Reels',       icon: 'play-circle', label: 'Reels'       },
  { name: 'Profile',     icon: 'user',        label: 'Profil'      },
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
  const { missedCallCount } = useWs();
  const [createOpen, setCreateOpen] = useState(false);

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options as any;
  const hideTabBar = focusedOptions?.tabBarStyle?.display === 'none' || focusedOptions?.tabBarVisible === false;

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
        { backgroundColor: colors.surface, borderTopColor: colors.divider, height: barHeight, paddingBottom: bottomPad },
      ]}>
        <LinearGradient
          colors={[colors.primary + '30', colors.gradientEnd + '15', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topLine}
          pointerEvents="none"
        />

        {TABS.map((tab, index) => {
          const route     = state.routes.find(r => r.name === tab.name);
          const isFocused = !!route && state.routes[state.index]?.name === tab.name;
          const badge     = tab.name === 'Profile' ? missedCallCount : 0;

          return (
            <React.Fragment key={tab.name}>
              <TabItem
                config={tab}
                routeKey={route?.key}
                isFocused={isFocused}
                navigation={navigation}
                activeColor={colors.primary}
                inactiveColor={colors.textTertiary}
                badge={badge}
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

      <TouchableOpacity onPress={onToggle} style={styles.createBtnTouchable} activeOpacity={0.75}>
        <View style={[
          styles.createBtn,
          { backgroundColor: colors.background, borderColor: open ? colors.textPrimary : colors.divider },
        ]}>
          <Animated.View style={iconRotateStyle}>
            <Icon name="plus" size={20} color={colors.textPrimary} />
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
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFocused ? 1 : 0, { damping: 15, stiffness: 180 });
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -2]) }],
  }));

  // Cercle de fond derrière l'icône active — même langage visuel que le bouton
  // Créer (cercle avec fond + bordure), au lieu du simple trait dégradé d'avant.
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity:   progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.5, 1]) }],
  }));

  const onPress = useCallback(() => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(config.name);
    }
  }, [isFocused, routeKey, config.name, navigation]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.tab} activeOpacity={0.75}>
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.iconBubble, { backgroundColor: activeColor + '18', borderColor: activeColor + '35' }, bubbleStyle]} />

        <Animated.View style={iconStyle}>
          <Icon name={config.icon} size={20} color={isFocused ? activeColor : inactiveColor} />
          {!!badge && badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </Animated.View>
      </View>

      <Text style={[styles.label, { color: isFocused ? activeColor : inactiveColor, fontWeight: isFocused ? '700' : '500' }]}>
        {config.label}
      </Text>
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
  tab: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
    paddingTop:     6,
  },
  iconSlot: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconBubble: {
    position:     'absolute',
    width:         36,
    height:        36,
    borderRadius:  18,
    borderWidth:   1,
  },
  label: {
    fontSize:      10.5,
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
    width:          56,
  },
  createBtnTouchable: {
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      -16, // dépasse légèrement au-dessus de la barre, sans FAB flottant décalé
  },
  createBtn: {
    width:          46,
    height:         46,
    borderRadius:   23,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOpacity:  0.12,
    shadowRadius:   6,
    shadowOffset:   { width: 0, height: 2 },
    elevation:      3,
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
