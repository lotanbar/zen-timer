import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Asset } from '../types';
import { COLORS, FONTS } from '../constants/theme';
import { CachedImage } from './CachedImage';

interface SlotCarouselProps {
  assets: Asset[];
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const SIZES = {
  normal: { itemSize: 200, itemGap: 32 },
  compact: { itemSize: 140, itemGap: 24 },
};
const REPEATS = 100;

export function SlotCarousel({ assets, selectedId, onSelect, compact = false }: SlotCarouselProps) {
  const { itemSize, itemGap } = compact ? SIZES.compact : SIZES.normal;
  const itemTotal = itemSize + itemGap;

  const { width: screenWidth } = useWindowDimensions();
  // Center the item: padding so that item center aligns with screen center
  const centerOffset = 26; // shift items slightly right
  const sidePadding = (screenWidth - itemTotal) / 2 + centerOffset;

  const listRef = useRef<FlatList>(null);
  const hasScrolledRef = useRef(false);
  const prevCompactRef = useRef(compact);
  const selectedIndex = assets.findIndex((a) => a.id === selectedId);

  // Create a large repeated array for infinite scroll illusion
  const repeatedAssets = useMemo(() => {
    const result: { asset: Asset; index: number }[] = [];
    for (let i = 0; i < REPEATS; i++) {
      assets.forEach((asset, idx) => {
        result.push({ asset, index: idx });
      });
    }
    return result;
  }, [assets]);

  // Start in the middle
  const middleStartIndex = Math.floor(REPEATS / 2) * assets.length + selectedIndex;

  const handleLayout = useCallback(() => {
    if (!hasScrolledRef.current && listRef.current && selectedIndex >= 0) {
      hasScrolledRef.current = true;
      listRef.current.scrollToOffset({
        offset: middleStartIndex * itemTotal,
        animated: false,
      });
    }
  }, [selectedIndex, middleStartIndex, itemTotal]);

  // Re-sync scroll position only when compact mode changes
  useEffect(() => {
    if (prevCompactRef.current !== compact) {
      prevCompactRef.current = compact;
      if (hasScrolledRef.current && listRef.current && selectedIndex >= 0) {
        listRef.current.scrollToOffset({
          offset: middleStartIndex * itemTotal,
          animated: false,
        });
      }
    }
  }, [compact, itemTotal, middleStartIndex, selectedIndex]);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / itemTotal);
    const realIndex = ((index % assets.length) + assets.length) % assets.length;

    if (assets[realIndex]?.id !== selectedId) {
      onSelect(assets[realIndex].id);
    }
  };

  const handleItemPress = (flatIndex: number, itemId: string) => {
    listRef.current?.scrollToOffset({
      offset: flatIndex * itemTotal,
      animated: true,
    });
    if (itemId !== selectedId) {
      onSelect(itemId);
    }
  };

  const currentAsset = assets.find((a) => a.id === selectedId);

  const renderItem = useCallback(({ item, index: flatIndex }: { item: { asset: Asset; index: number }; index: number }) => {
    const isSelected = item.asset.id === selectedId;

    return (
      <TouchableOpacity
        style={{ width: itemTotal, alignItems: 'center', justifyContent: 'center' }}
        onPress={() => handleItemPress(flatIndex, item.asset.id)}
        activeOpacity={0.7}
      >
        <View
          style={[
            { width: itemSize, height: itemSize, borderRadius: compact ? 14 : 20, overflow: 'hidden', backgroundColor: COLORS.background },
            !isSelected && styles.dimmedImage,
          ]}
        >
          <CachedImage asset={item.asset} />
        </View>
      </TouchableOpacity>
    );
  }, [selectedId, itemTotal, itemSize, compact]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: itemTotal,
    offset: itemTotal * index,
    index,
  }), [itemTotal]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={repeatedAssets}
        renderItem={renderItem}
        keyExtractor={(_, index) => index.toString()}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemTotal}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onLayout={handleLayout}
        getItemLayout={getItemLayout}
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
        initialScrollIndex={middleStartIndex}
      />
      <View style={styles.labelContainer}>
        <Text style={[styles.label, compact && styles.labelCompact]}>{currentAsset?.displayName ?? ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingVertical: 20,
  },
  dimmedImage: {
    opacity: 0.35,
  },
  labelContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
  },
  label: {
    color: COLORS.text,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.semibold,
    textAlign: 'center',
  },
  labelCompact: {
    fontSize: FONTS.size.medium,
    marginTop: -8,
  },
});
