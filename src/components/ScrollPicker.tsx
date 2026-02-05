import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

interface ScrollPickerProps {
  values: number[];
  selectedValue: number;
  onChange: (value: number) => void;
  label: string;
  size?: 'normal' | 'small';
}

const SIZES = {
  normal: { itemHeight: 80, width: 110, fontSize: 42 },
  small: { itemHeight: 64, width: 85, fontSize: 34 },
};
const VISIBLE_ITEMS = 3;

export function ScrollPicker({ values, selectedValue, onChange, label, size = 'normal' }: ScrollPickerProps) {
  const { itemHeight, width, fontSize } = SIZES[size];

  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);
  const lastValueRef = useRef(selectedValue);
  const selectedIndex = values.indexOf(selectedValue);

  const handleLayout = useCallback((_event: LayoutChangeEvent) => {
    if (!hasScrolledRef.current && scrollRef.current && selectedIndex >= 0) {
      hasScrolledRef.current = true;
      scrollRef.current.scrollTo({
        y: selectedIndex * itemHeight,
        animated: false,
      });
    }
  }, [selectedIndex, itemHeight]);

  // Scroll to new position when value changes externally (e.g., reset to defaults)
  useEffect(() => {
    if (hasScrolledRef.current && lastValueRef.current !== selectedValue && selectedIndex >= 0) {
      scrollRef.current?.scrollTo({
        y: selectedIndex * itemHeight,
        animated: true,
      });
    }
    lastValueRef.current = selectedValue;
  }, [selectedValue, selectedIndex, itemHeight]);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / itemHeight);
    const clampedIndex = Math.max(0, Math.min(index, values.length - 1));
    if (values[clampedIndex] !== selectedValue) {
      onChange(values[clampedIndex]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.pickerContainer, { height: itemHeight * VISIBLE_ITEMS, width }]}>
        <View style={[styles.selectionIndicator, { top: itemHeight, height: itemHeight }]} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={itemHeight}
          decelerationRate={0.95}
          onMomentumScrollEnd={handleScrollEnd}
          onLayout={handleLayout}
          contentContainerStyle={{ paddingVertical: itemHeight }}
          nestedScrollEnabled
          scrollEventThrottle={16}
        >
          {values.map((item) => {
            const isSelected = item === selectedValue;
            return (
              <View
                key={item}
                style={[styles.item, { height: itemHeight }]}
              >
                <Text style={[styles.itemText, { fontSize }, isSelected && styles.selectedText]}>
                  {item.toString().padStart(2, '0')}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pickerContainer: {
    overflow: 'hidden',
  },
  selectionIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    zIndex: 1,
    pointerEvents: 'none',
  },
  item: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    color: COLORS.textSecondary,
  },
  selectedText: {
    color: COLORS.text,
    fontWeight: FONTS.semibold,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.small,
    marginTop: 8,
  },
});
