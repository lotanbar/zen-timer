import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Asset } from '../types';
import { COLORS, FONTS } from '../constants/theme';
import { CachedImage } from './CachedImage';

interface GridAssetPickerProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string | null, asset?: Asset) => void;
  onLongPress?: (id: string) => void;
  showNoOption?: boolean;
  noOptionLabel?: string;
  pinnedIds?: string[];
  loadingId?: string | null;
  isDevMode?: boolean;
}

const { width } = Dimensions.get('window');
export const NUM_COLUMNS = 3;
export const ITEM_MARGIN = 12;
export const ITEM_SIZE = (width - 40 - ITEM_MARGIN * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

export function GridAssetPicker({
  assets,
  selectedId,
  onSelect,
  onLongPress,
  showNoOption = false,
  noOptionLabel = 'None',
  pinnedIds = [],
  loadingId,
  isDevMode = false,
}: GridAssetPickerProps) {
  const data: (Asset | null)[] = showNoOption ? [null, ...assets] : assets;

  const renderItem = (item: Asset | null, index: number) => {
    const isSelected = item === null ? selectedId === null : selectedId === item?.id;
    const isNoOption = item === null;
    const isPinned = item ? pinnedIds.includes(item.id) : false;
    const hasDiscrepancy = item?.hasDiscrepancy ?? false;
    const isLoading = item ? item.id === loadingId : false;

    return (
      <TouchableOpacity
        key={item?.id ?? 'none'}
        style={[
          styles.item,
          isSelected && styles.selectedItem,
          (index + 1) % NUM_COLUMNS !== 0 && styles.itemMargin,
        ]}
        onPress={() => onSelect(item?.id ?? null, item ?? undefined)}
        onLongPress={() => item && onLongPress?.(item.id)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        <View style={[
          styles.imageContainer,
          isSelected && styles.selectedImageContainer,
          hasDiscrepancy && styles.discrepancyImageContainer,
        ]}>
          {isNoOption ? (
            <View style={styles.noOptionImage}>
              <Text style={styles.noOptionIcon}>✕</Text>
            </View>
          ) : (
            <>
              <CachedImage asset={item!} />
              {isLoading && (
                <>
                  <View style={styles.loadingOverlay} />
                  <View style={styles.loadingIndicator}>
                    <ActivityIndicator size="small" color={COLORS.text} />
                  </View>
                </>
              )}
              {hasDiscrepancy && (
                <>
                  <View style={styles.discrepancyOverlay} />
                  <View style={styles.discrepancyIndicator}>
                    <Text style={styles.discrepancyIcon}>!</Text>
                  </View>
                </>
              )}
              {isPinned && !hasDiscrepancy && !isLoading && (
                <View style={styles.pinnedIndicator}>
                  <Text style={styles.pinnedStar}>★</Text>
                </View>
              )}
            </>
          )}
        </View>
        <Text style={[styles.label, isSelected && styles.selectedLabel]} numberOfLines={2}>
          {isNoOption ? noOptionLabel : item!.displayName}
        </Text>
        {isDevMode && !isNoOption && item?.duration && (
          <Text style={styles.durationLabel}>{formatDuration(item.duration)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const rows: (Asset | null)[][] = [];
  for (let i = 0; i < data.length; i += NUM_COLUMNS) {
    rows.push(data.slice(i, i + NUM_COLUMNS));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((item, itemIndex) => renderItem(item, rowIndex * NUM_COLUMNS + itemIndex))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: ITEM_MARGIN,
  },
  item: {
    width: ITEM_SIZE,
    alignItems: 'center',
  },
  itemMargin: {
    marginRight: ITEM_MARGIN,
  },
  selectedItem: {},
  imageContainer: {
    width: ITEM_SIZE - 10,
    height: ITEM_SIZE - 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedImageContainer: {
    borderColor: COLORS.text,
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
    fontSize: 28,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.xs,
    fontWeight: FONTS.regular,
    marginTop: 6,
    textAlign: 'center',
  },
  selectedLabel: {
    color: COLORS.text,
    fontWeight: FONTS.medium,
  },
  durationLabel: {
    color: COLORS.text,
    fontSize: FONTS.size.xs,
    marginTop: 2,
    textAlign: 'center',
  },
  pinnedIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinnedStar: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: -1,
  },
  discrepancyImageContainer: {
    borderColor: '#FF4444',
  },
  discrepancyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 68, 68, 0.3)',
  },
  discrepancyIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  discrepancyIcon: {
    color: '#FF4444',
    fontSize: 32,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  loadingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
