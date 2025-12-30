import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ToastAndroid,
  Platform,
  Alert,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Accordion,
  DurationPicker,
  GridAssetPicker,
  SlotCarousel,
  RepeatingBellOptions,
  CategoryTags,
  SearchBar,
} from '../components';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { usePinnedAmbienceStore } from '../store/pinnedAmbienceStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import {
  getAmbientAssets,
  getBellAssets,
  getCategories,
} from '../services/assetDiscoveryService';
import { RootStackParamList, AmbientCategory, Asset } from '../types';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type AccordionKey = 'duration' | 'ambience' | 'ending' | null;

// Grid layout constants (must match GridAssetPicker)
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_MARGIN = 12;
const ITEM_SIZE = (SCREEN_WIDTH - 40 - ITEM_MARGIN * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const ROW_HEIGHT = (ITEM_SIZE - 10) + 6 + 26 + ITEM_MARGIN; // image + marginTop + label (~2 lines) + row margin

function ShuffleIcon({ size = 20, color = COLORS.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 3h5v5M4 20L20.5 3.5M21 16v5h-5M15 15l5.5 5.5M4 4l5 5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FilterIcon({ size = 20, color = COLORS.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 4h20L14 13v6l-4 2v-8L2 4z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('', message);
  }
}

export function HomeScreen({ navigation }: HomeScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollY = useRef(0);
  const [expandedAccordion, setExpandedAccordion] = useState<AccordionKey>('duration');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showTags, setShowTags] = useState(false);

  // Dynamic asset loading
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

  const {
    duration,
    ambienceId,
    bellId,
    repeatBell,
    setDuration,
    setAmbience,
    setBell,
    setRepeatBell,
    resetToDefaults,
  } = usePreferencesStore();

  const { pinnedIds, togglePinned } = usePinnedAmbienceStore();

  // Filter assets by category and search, with pinned items at top
  const filteredAssets = useMemo(() => {
    let result = ambientAssets;

    // Category filter (multi-select)
    if (selectedCategories.size > 0) {
      result = result.filter(a => a.category && selectedCategories.has(a.category));
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => a.displayName.toLowerCase().includes(query));
    }

    // Sort pinned items to top
    result = [...result].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });

    return result;
  }, [ambientAssets, selectedCategories, searchQuery, pinnedIds]);

  const handleCategorySelect = (categoryId: AmbientCategory) => {
    if (categoryId === 'all') {
      // Clear all filters
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

  const handleAmbienceSelect = async (id: string | null, asset?: Asset) => {
    // Check for discrepancy
    if (asset?.hasDiscrepancy) {
      showToast('Asset Discrepancy');
      return;
    }

    setAmbience(id); // Update UI immediately for snappy feel
    await audioService.stopPreview();
    if (id) {
      await audioService.previewAmbient(id);
    }
  };

  const handleBellSelect = (id: string) => {
    setBell(id);
    audioService.previewBell(id);
  };

  const handleLongPress = (id: string) => {
    togglePinned(id);
  };

  const smoothScrollTo = (targetY: number, duration: number = 600) => {
    const startY = currentScrollY.current;
    const animatedValue = new Animated.Value(0);

    animatedValue.addListener(({ value }) => {
      const y = startY + (targetY - startY) * value;
      scrollViewRef.current?.scrollTo({ y, animated: false });
    });

    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      animatedValue.removeAllListeners();
    });
  };

  const handleShuffle = () => {
    if (filteredAssets.length === 0) return;
    const randomIndex = Math.floor(Math.random() * filteredAssets.length);
    const randomAsset = filteredAssets[randomIndex];

    // Calculate row position (+1 for "None" option at start)
    const itemIndex = randomIndex + 1;
    const rowIndex = Math.floor(itemIndex / NUM_COLUMNS);

    // Position: container padding (10) + row offset, then subtract 2 rows to center better
    const rowY = 10 + rowIndex * ROW_HEIGHT;
    const scrollY = Math.max(0, rowY - ROW_HEIGHT * 2);

    // Scroll with smooth animation (1200ms), then select and preview
    smoothScrollTo(scrollY, 1200);
    handleAmbienceSelect(randomAsset.id, randomAsset);
  };

  const handleStart = async () => {
    // Stop bell sounds but keep ambient preview if playing
    await audioService.stopBellPreview();

    // If the selected ambience is being previewed, promote it to main playback
    if (ambienceId && audioService.isPreviewPlaying(ambienceId)) {
      await audioService.promoteAmbientPreview();
    } else {
      // Stop any other preview (different ambience or none selected)
      await audioService.stopPreview();
    }

    navigation.navigate('Timer');
  };

  const handleReset = () => {
    resetToDefaults();
    setExpandedAccordion('duration');
    setSelectedCategories(new Set());
    setSearchQuery('');
    audioService.stopPreview();
  };

  const hasExpandedAccordion = expandedAccordion !== null;
  const totalSeconds = getTotalSeconds(duration);
  const canStart = totalSeconds > 0;

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
                  {/* Main grid */}
                  <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={(e) => { currentScrollY.current = e.nativeEvent.contentOffset.y; }}
                    scrollEventThrottle={16}
                  >
                    <GridAssetPicker
                      assets={filteredAssets}
                      selectedId={ambienceId}
                      onSelect={handleAmbienceSelect}
                      onLongPress={handleLongPress}
                      showNoOption
                      noOptionLabel="None"
                      pinnedIds={pinnedIds}
                    />
                  </ScrollView>

                  {/* Bottom section: tags + search */}
                  <View style={styles.bottomSection}>
                    {showTags && (
                      <CategoryTags
                        categories={categories}
                        selectedCategories={selectedCategories}
                        onSelect={handleCategorySelect}
                      />
                    )}
                    <View style={styles.searchRow}>
                      <View style={styles.searchBarWrapper}>
                        <SearchBar
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          placeholder={`Search sounds... (${filteredAssets.length})`}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => setShowTags(!showTags)}
                        style={styles.iconButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <FilterIcon size={20} color={COLORS.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleShuffle}
                        style={styles.iconButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <ShuffleIcon size={20} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
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
            <View style={styles.endingContent}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.text} />
                </View>
              ) : (
                <>
                  <View style={styles.carouselCenter}>
                    <SlotCarousel
                      assets={bellAssets}
                      selectedId={bellId}
                      onSelect={handleBellSelect}
                      compact={repeatBell.enabled}
                    />
                  </View>
                  <RepeatingBellOptions
                    options={repeatBell}
                    duration={duration}
                    onChange={setRepeatBell}
                  />
                </>
              )}
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

          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Text style={styles.resetIcon}>↺</Text>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
  },
  searchBarWrapper: {
    flex: 1,
  },
  endingContent: {
    flex: 1,
  },
  carouselCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
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
  resetButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetIcon: {
    color: COLORS.textSecondary,
    fontSize: 22,
  },
});
