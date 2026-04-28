import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, FlatList,
  ViewToken, StatusBar, TouchableOpacity,
} from 'react-native';
import Animated, {
  SharedValue,
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { Button, AppLogo } from '../../components/common';

const { width } = Dimensions.get('window');

interface Slide {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  colors: [string, string];
}

interface Props {
  onFinish: () => void;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    emoji:    '🎵',
    title:    'Concerts en Direct',
    subtitle: 'Suivez vos artistes préférés en live, immersif et en temps réel, peu importe où vous êtes.',
    colors:   ['#7B3FF2', '#E0389A'],
  },
  {
    id: '2',
    emoji:    '🎬',
    title:    'Films & Séries',
    subtitle: 'Des milliers de contenus exclusifs, films et séries premium en streaming illimité.',
    colors:   ['#FF7A2F', '#E0389A'],
  },
  {
    id: '3',
    emoji:    '🎪',
    title:    'Événements Uniques',
    subtitle: 'Festivals, anniversaires, conférences — vivez chaque moment intense, en ligne ou sur place.',
    colors:   ['#36D9A0', '#7B3FF2'],
  },
];

export const OnboardingScreen: React.FC<Props> = ({ onFinish }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList<Slide>>(null);

  const scrollX = useSharedValue(0);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const goNext = useCallback(() => {
    if (activeIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      onFinish();
    }
  }, [activeIndex, onFinish]);

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
    <View style={styles.slide}>
      {/* Bulle illustrative animée */}
      <View style={styles.bubbleWrap}>
        <LinearGradient
          colors={[item.colors[0] + '30', item.colors[1] + '18']}
          style={styles.bubbleBg}
        />
        <Text style={styles.emoji}>{item.emoji}</Text>
        {/* Cercles décoratifs */}
        <View style={[styles.ring1, { borderColor: item.colors[0] + '40' }]} />
        <View style={[styles.ring2, { borderColor: item.colors[1] + '28' }]} />
      </View>

      <Text style={[styles.slideTitle, { color: colors.textPrimary }]}>
        {item.title}
      </Text>
      <Text style={[styles.slideSubtitle, { color: colors.textSecondary }]}>
        {item.subtitle}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Logo */}
      <View style={styles.header}>
        <AppLogo size="sm" />
      </View>

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        renderItem={renderSlide}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        onScroll={e => { scrollX.value = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
      />

      {/* Dots indicateurs */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <AnimDot key={i} index={i} activeIndex={activeIndex} scrollX={scrollX} primaryColor={colors.primary} borderColor={colors.border} />
        ))}
      </View>

      {/* Actions */}
      <View style={[styles.footer, { paddingBottom: 48 }]}>
        <Button
          label={activeIndex === SLIDES.length - 1 ? 'Commencer  →' : 'Suivant  →'}
          onPress={goNext}
          size="lg"
        />

        {activeIndex < SLIDES.length - 1 && (
          <TouchableOpacity onPress={onFinish} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: colors.textTertiary }]}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Dot animé
const AnimDot: React.FC<{
  index: number;
  activeIndex: number;
  scrollX: SharedValue<number>;
  primaryColor: string;
  borderColor: string;
}> = ({ index, activeIndex, scrollX, primaryColor, borderColor }) => {
  const isActive = index === activeIndex;

  const dotStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const w = interpolate(scrollX.value, inputRange, [8, 24, 8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.4, 1, 0.4], Extrapolation.CLAMP);
    return { width: w, opacity };
  });

  return (
    <Animated.View style={[
      styles.dot,
      dotStyle,
      { backgroundColor: isActive ? primaryColor : borderColor },
    ]} />
  );
};

const styles = StyleSheet.create({
  root:          { flex: 1 },
  header:        { paddingTop: 56, alignItems: 'center', paddingBottom: 4 },
  slide:         { width, alignItems: 'center', paddingHorizontal: 32, paddingTop: 12 },
  bubbleWrap:    {
    width: width * 0.68, height: width * 0.68,
    borderRadius: width * 0.34,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 36, overflow: 'visible',
  },
  bubbleBg:      { ...StyleSheet.absoluteFill, borderRadius: width * 0.34 },
  emoji:         { fontSize: 88 },
  ring1:         {
    position: 'absolute', width: width * 0.76, height: width * 0.76,
    borderRadius: width * 0.38, borderWidth: 1.5,
  },
  ring2:         {
    position: 'absolute', width: width * 0.84, height: width * 0.84,
    borderRadius: width * 0.42, borderWidth: 1,
  },
  slideTitle:    { fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 36, marginBottom: 14 },
  slideSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 24, fontWeight: '400' },
  dotsRow:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 24 },
  dot:           { height: 8, borderRadius: 4 },
  footer:        { paddingHorizontal: 28, gap: 0 },
  skipBtn:       { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24 },
  skipText:      { fontSize: 14, fontWeight: '500' },
});
