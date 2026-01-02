import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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

  // Register sample assets with audio service
  React.useEffect(() => {
    audioService.setAssets(SAMPLE_ASSETS, []);
  }, []);

  const handleAmbienceSelect = async (id: string) => {
    setLocalAmbienceId(id);
    await audioService.stopPreview();
    await audioService.previewAmbient(id);
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
          />
        </View>
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
  carouselContainer: {
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
