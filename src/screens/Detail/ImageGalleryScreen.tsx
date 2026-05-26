import React, { useState, useRef, useCallback } from 'react';
import {
  View, Image, FlatList, TouchableOpacity, Text,
  StatusBar, Platform, Dimensions, StyleSheet, ActivityIndicator,
  NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  urls: string[];
  initialIndex?: number;
  onBack: () => void;
}

const ImageItem: React.FC<{ uri: string }> = ({ uri }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={{ width: SW, height: SH, alignItems: 'center', justifyContent: 'center' }}>
      {!loaded && (
        <ActivityIndicator
          color="rgba(255,255,255,0.5)"
          size="large"
          style={{ position: 'absolute' }}
        />
      )}
      <Image
        source={{ uri }}
        style={{ width: SW, height: SH }}
        resizeMode="contain"
        onLoad={() => setLoaded(true)}
      />
    </View>
  );
};

export const ImageGalleryScreen: React.FC<Props> = ({ urls, initialIndex = 0, onBack }) => {
  const insets = useSafeAreaInsets();
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const flatRef = useRef<FlatList>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
    setCurrentIdx(idx);
  }, []);

  return (
    <View style={s.root}>
      <StatusBar hidden />

      <FlatList
        ref={flatRef}
        data={urls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
        keyExtractor={(u, i) => u + i}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => <ImageItem uri={item} />}
        decelerationRate="fast"
      />

      {/* Bouton fermeture */}
      <TouchableOpacity
        onPress={onBack}
        style={[s.closeBtn, { top: (Platform.OS === 'ios' ? insets.top : 16) + 8 }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="x" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Compteur X / Y */}
      {urls.length > 1 && (
        <View style={[s.counter, { top: (Platform.OS === 'ios' ? insets.top : 16) + 8 }]}>
          <Text style={s.counterText}>{currentIdx + 1} / {urls.length}</Text>
        </View>
      )}

      {/* Dots bas */}
      {urls.length > 1 && urls.length <= 10 && (
        <View style={[s.dotsRow, { bottom: insets.bottom + 24 }]}>
          {urls.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === currentIdx ? s.dotActive : s.dotInactive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  counterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
  dotInactive: {
    width: 5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
