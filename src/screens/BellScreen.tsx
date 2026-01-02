import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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

  useEffect(() => {
    async function loadAssets() {
      try {
        const bells = await getBellAssets();
        setBellAssets(bells);
        audioService.setAssets([], bells);
      } catch (error) {
        console.error('Failed to load bell assets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssets();
  }, []);

  const handleBellSelect = (id: string) => {
    setLocalBellId(id);
    audioService.previewBell(id);
  };

  const handleBack = async () => {
    await audioService.stopPreview();
    navigation.goBack();
  };

  const handleSubmit = async () => {
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
                assets={bellAssets}
                selectedId={localBellId}
                onSelect={handleBellSelect}
                compact={localRepeatBell.enabled}
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.7}>
          <Text style={styles.submitButtonText}>Submit</Text>
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
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  backButtonText: {
    color: COLORS.text,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.medium,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.text,
    alignItems: 'center',
  },
  submitButtonText: {
    color: COLORS.background,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
});
