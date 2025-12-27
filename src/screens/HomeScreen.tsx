import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Accordion } from '../components/Accordion';
import { DurationPicker } from '../components/DurationPicker';
import { GridAssetPicker } from '../components/GridAssetPicker';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { audioService } from '../services/audioService';
import { getAmbientAssets, getBellAssets } from '../services/assetDiscoveryService';
import { COLORS, FONTS } from '../constants/theme';
import { RootStackParamList, Asset } from '../types';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type AccordionKey = 'duration' | 'ambience' | 'ending' | null;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const [expandedAccordion, setExpandedAccordion] = useState<AccordionKey>('duration');
  const [isLoading, setIsLoading] = useState(true);
  const [ambientAssets, setAmbientAssets] = useState<Asset[]>([]);
  const [bellAssets, setBellAssets] = useState<Asset[]>([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        const [ambient, bells] = await Promise.all([
          getAmbientAssets(),
          getBellAssets(),
        ]);
        setAmbientAssets(ambient);
        setBellAssets(bells);
        audioService.setAssets(ambient, bells);
      } catch (error) {
        console.error('Failed to load assets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssets();
  }, []);

  const { duration, ambienceId, setDuration, setAmbience } = usePreferencesStore();
  const totalSeconds = getTotalSeconds(duration);
  const canStart = totalSeconds > 0;

  const handleToggle = (key: AccordionKey) => {
    setExpandedAccordion(expandedAccordion === key ? null : key);
    audioService.stopPreview();
  };

  const handleAmbienceSelect = async (id: string | null) => {
    setAmbience(id);
    await audioService.stopPreview();
    if (id) {
      await audioService.previewAmbient(id);
    }
  };

  const handleStart = async () => {
    await audioService.stopPreview();
    navigation.navigate('Timer');
  };

  const hasExpandedAccordion = expandedAccordion !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {!hasExpandedAccordion && <View style={styles.topSpacer} />}
      <View style={[styles.accordionsContainer, hasExpandedAccordion && styles.accordionsExpanded]}>
        <Accordion
          title="Duration"
          isExpanded={expandedAccordion === 'duration'}
          onToggle={() => handleToggle('duration')}
        >
          <DurationPicker duration={duration} onChange={setDuration} />
        </Accordion>

        <Accordion
          title="Ambience"
          isExpanded={expandedAccordion === 'ambience'}
          onToggle={() => handleToggle('ambience')}
        >
          <View style={styles.ambienceContent}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.text} />
              </View>
            ) : (
              <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <GridAssetPicker
                  assets={ambientAssets}
                  selectedId={ambienceId}
                  onSelect={handleAmbienceSelect}
                  showNoOption
                  noOptionLabel="None"
                />
              </ScrollView>
            )}
          </View>
        </Accordion>

        <Accordion
          title="Ending Sound"
          isExpanded={expandedAccordion === 'ending'}
          onToggle={() => handleToggle('ending')}
        >
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Coming soon...</Text>
          </View>
        </Accordion>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          onPress={handleStart}
          activeOpacity={0.8}
          disabled={!canStart}
        >
          <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>Start</Text>
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
  topSpacer: {
    flex: 1,
  },
  accordionsContainer: {},
  accordionsExpanded: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  ambienceContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.medium,
  },
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  startButton: {
    backgroundColor: COLORS.text,
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 8,
  },
  startButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  startButtonText: {
    color: COLORS.background,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.semibold,
  },
  startButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
});
