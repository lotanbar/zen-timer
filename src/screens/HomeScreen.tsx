import React, { useState, useMemo, useEffect } from 'react';
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
import { CategoryTags } from '../components/CategoryTags';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { audioService } from '../services/audioService';
import { getAmbientAssets, getBellAssets, getCategories } from '../services/assetDiscoveryService';
import { COLORS, FONTS } from '../constants/theme';
import { RootStackParamList, AmbientCategory, Asset } from '../types';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type AccordionKey = 'duration' | 'ambience' | 'ending' | null;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const [expandedAccordion, setExpandedAccordion] = useState<AccordionKey>('duration');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [ambientAssets, setAmbientAssets] = useState<Asset[]>([]);
  const [bellAssets, setBellAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<{ id: AmbientCategory; label: string }[]>([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        const [ambient, bells, cats] = await Promise.all([
          getAmbientAssets(),
          getBellAssets(),
          getCategories(),
        ]);
        setAmbientAssets(ambient);
        setBellAssets(bells);
        setCategories(cats);
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

  const filteredAssets = useMemo(() => {
    if (selectedCategories.size === 0) {
      return ambientAssets;
    }
    return ambientAssets.filter(a => a.category && selectedCategories.has(a.category));
  }, [ambientAssets, selectedCategories]);

  const handleCategorySelect = (categoryId: AmbientCategory) => {
    if (categoryId === 'all') {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(prev => {
        const next = new Set(prev);
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
        return next;
      });
    }
  };

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
              <>
                <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                  <GridAssetPicker
                    assets={filteredAssets}
                    selectedId={ambienceId}
                    onSelect={handleAmbienceSelect}
                    showNoOption
                    noOptionLabel="None"
                  />
                </ScrollView>
                <View style={styles.bottomSection}>
                  <CategoryTags
                    categories={categories}
                    selectedCategories={selectedCategories}
                    onSelect={handleCategorySelect}
                  />
                </View>
              </>
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
  bottomSection: {
    marginTop: 'auto',
    paddingTop: 10,
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
