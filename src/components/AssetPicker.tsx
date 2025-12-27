import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { Asset } from '../types';
import { COLORS, FONTS } from '../constants/theme';

interface AssetPickerProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showNoOption?: boolean;
  noOptionLabel?: string;
}

const ITEM_SIZE = 130;
const ITEM_GAP = 16;

export function AssetPicker({
  assets,
  selectedId,
  onSelect,
  showNoOption = false,
  noOptionLabel = 'None',
}: AssetPickerProps) {
  const data: (Asset | null)[] = showNoOption ? [null, ...assets] : assets;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {data.map((item, index) => {
        const isSelected = item === null ? selectedId === null : selectedId === item?.id;
        const isNoOption = item === null;

        return (
          <TouchableOpacity
            key={item?.id ?? 'none'}
            style={[styles.item, index < data.length - 1 && { marginRight: ITEM_GAP }]}
            onPress={() => onSelect(item?.id ?? null)}
            activeOpacity={0.7}
          >
            <View style={[styles.imageContainer, isSelected && styles.selectedImageContainer]}>
              {isNoOption ? (
                <View style={styles.noOptionImage}>
                  <Text style={styles.noOptionIcon}>✕</Text>
                </View>
              ) : (
                <Image source={{ uri: item!.imageUrl }} style={styles.image} />
              )}
            </View>
            <Text style={[styles.label, isSelected && styles.selectedLabel]} numberOfLines={2}>
              {isNoOption ? noOptionLabel : item!.displayName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  item: {
    width: ITEM_SIZE,
    alignItems: 'center',
  },
  imageContainer: {
    width: ITEM_SIZE - 10,
    height: ITEM_SIZE - 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedImageContainer: {
    borderColor: COLORS.text,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noOptionImage: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noOptionIcon: {
    color: COLORS.textSecondary,
    fontSize: 32,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.small,
    fontWeight: FONTS.regular,
    marginTop: 8,
    textAlign: 'center',
  },
  selectedLabel: {
    color: COLORS.text,
    fontWeight: FONTS.medium,
  },
});
