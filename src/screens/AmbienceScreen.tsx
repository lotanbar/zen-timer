import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { SlotCarousel } from '../components';
import { usePreferencesStore } from '../store/preferencesStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import { SAMPLE_ASSETS } from '../constants/sampleAssets';
import { RootStackParamList } from '../types';

type AmbienceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Ambience'>;
};

export function AmbienceScreen({ navigation }: AmbienceScreenProps) {
  const { ambienceId: storeAmbienceId, setAmbience } = usePreferencesStore();

  // Find matching sample or default to first
  const initialId = SAMPLE_ASSETS.find(s => s.id === storeAmbienceId)?.id || SAMPLE_ASSETS[0].id;
  const [localAmbienceId, setLocalAmbienceId] = useState<string>(initialId);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Register sample assets with audio service
  React.useEffect(() => {
    audioService.setAssets(SAMPLE_ASSETS, []);
  }, []);

  // Stop preview when leaving screen (useFocusEffect handles navigation blur)
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        audioService.stopPreview();
      };
    }, [])
  );

  const handleAmbienceSelect = (id: string) => {
    setLocalAmbienceId(id);

    // Toggle off if clicking currently playing item
    if (audioService.isPreviewPlaying(id)) {
      audioService.stopPreview();
      return;
    }

    // Play new item with loading indicator (clears when data loads, not when fadeIn ends)
    setLoadingId(id);
    audioService.previewAmbient(id, () => setLoadingId(null));
  };

  const handleBack = async () => {
    await audioService.stopPreview();
    navigation.goBack();
  };

  const handleSubmit = async () => {
    setAmbience(localAmbienceId);
    await audioService.stopPreview();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Ambience</Text>

        <View style={styles.carouselContainer}>
          <SlotCarousel
            assets={SAMPLE_ASSETS}
            selectedId={localAmbienceId}
            onSelect={handleAmbienceSelect}
            loadingId={loadingId}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="chevron-left" size={22} color={COLORS.textSecondary} />
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
  carouselContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    paddingVertical: 14,
    paddingHorizontal: 50,
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
