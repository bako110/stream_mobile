import React, { useCallback, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle, withSpring, useSharedValue,
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
  { name: 'Home',     icon: 'home',        label: 'Accueil'  },
  { name: 'Planning', icon: 'calendar',    label: 'Planning' },
  { name: 'Reels',    icon: 'play-circle', label: 'Reels'    },
  { name: 'Profile',  icon: 'user',        label: 'Profil'   },
];

export const AppTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { missedCallCount } = useWs();

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options as any;
  const hideTabBar = focusedOptions?.tabBarStyle?.display === 'none' || focusedOptions?.tabBarVisible === false;

  if (hideTabBar) return null;

  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom, 12)
    : insets.bottom;
  const barHeight = TAB_BAR_HEIGHT + bottomPad;

  return (
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

      {TABS.map((tab) => {
        const route     = state.routes.find(r => r.name === tab.name);
        const isFocused = !!route && state.routes[state.index]?.name === tab.name;
        const badge     = tab.name === 'Profile' ? missedCallCount : 0;

        return (
          <TabItem
            key={tab.name}
            config={tab}
            routeKey={route?.key}
            isFocused={isFocused}
            navigation={navigation}
            activeColor={colors.primary}
            inactiveColor={colors.textTertiary}
            gradientColors={[colors.gradientStart, colors.gradientEnd]}
            badge={badge}
          />
        );
      })}
    </View>
  );
};

interface TabItemProps {
  config:         TabConfig;
  routeKey:       string | undefined;
  isFocused:      boolean;
  navigation:     BottomTabBarProps['navigation'];
  activeColor:    string;
  inactiveColor:  string;
  gradientColors: [string, string];
  badge?:         number;
}

const TabItem: React.FC<TabItemProps> = memo(({
  config, routeKey, isFocused, navigation,
  activeColor, inactiveColor, gradientColors, badge,
}) => {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFocused ? 1 : 0, { damping: 15, stiffness: 180 });
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      interpolate(progress.value, [0, 1], [1, 1.15]) },
      { translateY: interpolate(progress.value, [0, 1], [0, -3])   },
    ],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity:   progress.value,
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.4, 1]) }],
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
      <Animated.View style={[styles.pill, pillStyle]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={iconStyle}>
        <Icon name={config.icon} size={22} color={isFocused ? activeColor : inactiveColor} />
        {!!badge && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </Animated.View>

      <Text style={[styles.label, { color: isFocused ? activeColor : inactiveColor }]}>
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
    gap:            3,
    paddingTop:     6,
  },
  pill: {
    position:     'absolute',
    top:          4,
    width:        40,
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  label: {
    fontSize:      10,
    fontWeight:    '600',
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
});
