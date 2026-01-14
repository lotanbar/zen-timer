import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { SlotCarousel, RepeatingBellOptions } from '../components';
import { usePreferencesStore } from '../store/preferencesStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import { getBellAssets } from '../services/assetDiscoveryService';
import { RootStackParamList, RepeatBellOptions as RepeatBellOptionsType, Asset } from '../types';

type BellScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Bell'>;
};

export function BellScreen({ navigation }: BellScreenProps) {
  const {
    bellId: storeBellId,
    repeatBell: storeRepeatBell,
    duration,
    setBell,
    setRepeatBell,
  } = usePreferencesStore();

  const [localBellId, setLocalBellId] = useState<string>(storeBellId);
  const [localRepeatBell, setLocalRepeatBell] = useState<RepeatBellOptionsType>(storeRepeatBell);

  const [isLoading, setIsLoading] = useState(true);
  const [bellAssets, setBellAssets] = useState<Asset[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAssets() {
      try {
        const bells = await getBellAssets();
        setBellAssets(bells);
        audioService.setBellAssets(bells);
      } catch (error) {
        console.error('Failed to load bell assets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssets();
  }, []);

  // Stop preview when leaving screen (useFocusEffect handles navigation blur)
  useFocusEffect(
    useCallback(() => {
      return () => {
        audioService.stopPreview();
      };
    }, [])
  );

  // Track repeat mode changes to reset carousel position
  const carouselKeyRef = useRef(0);
  const prevRepeatEnabledRef = useRef(localRepeatBell.enabled);

  // Reset carousel when repeat mode toggles
  if (prevRepeatEnabledRef.current !== localRepeatBell.enabled) {
    prevRepeatEnabledRef.current = localRepeatBell.enabled;
    carouselKeyRef.current += 1;
  }

  const handleBellSelect = (id: string) => {
    setLocalBellId(id);

    // Toggle off if clicking currently playing item
    if (audioService.isPreviewPlaying(id)) {
      audioService.stopPreview();
      return;
    }

    // Play new item with loading indicator (clears when data loads, not when fadeIn ends)
    setLoadingId(id);
    audioService.previewBell(id, () => setLoadingId(null));
  };

  const handleSelect = async () => {
    setBell(localBellId);
    setRepeatBell(localRepeatBell);
    await audioService.stopPreview();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Ending Sound</Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.text} />
          </View>
        ) : (
          <View style={styles.bellContent}>
            <View style={styles.carouselCenter}>
              <SlotCarousel
                key={carouselKeyRef.current}
                assets={bellAssets}
                selectedId={localBellId}
                onSelect={handleBellSelect}
                compact={localRepeatBell.enabled}
                loadingId={loadingId}
              />
            </View>
            <RepeatingBellOptions
              options={localRepeatBell}
              duration={duration}
              onChange={setLocalRepeatBell}
            />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.selectButton} onPress={handleSelect} activeOpacity={0.7}>
          <Text style={styles.selectButtonText}>Select</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    color: COLORS.text,
    fontSize: FONTS.size.xlarge,
    fontWeight: FONTS.semibold,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellContent: {
    flex: 1,
  },
  carouselCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  selectButton: {
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 8,
    backgroundColor: COLORS.text,
    alignItems: 'center',
  },
  selectButtonText: {
    color: COLORS.background,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
});
