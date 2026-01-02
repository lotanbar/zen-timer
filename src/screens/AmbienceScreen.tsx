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
import { GridAssetPicker, CategoryTags, SearchBar } from '../components';
import { usePreferencesStore } from '../store/preferencesStore';
import { usePinnedAmbienceStore } from '../store/pinnedAmbienceStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import { getAmbientAssets, getCategories } from '../services/assetDiscoveryService';
import { RootStackParamList, AmbientCategory, Asset } from '../types';

type AmbienceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Ambience'>;
};

// Grid layout constants
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_MARGIN = 12;
const ITEM_SIZE = (SCREEN_WIDTH - 40 - ITEM_MARGIN * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const ROW_HEIGHT = (ITEM_SIZE - 10) + 6 + 26 + ITEM_MARGIN;

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

export function AmbienceScreen({ navigation }: AmbienceScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollY = useRef(0);

  const { ambienceId: storeAmbienceId, setAmbience } = usePreferencesStore();
  const { pinnedIds, togglePinned } = usePinnedAmbienceStore();

  const [localAmbienceId, setLocalAmbienceId] = useState<string | null>(storeAmbienceId);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showTags, setShowTags] = useState(false);

  // Dynamic asset loading
  const [isLoading, setIsLoading] = useState(true);
  const [ambientAssets, setAmbientAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<{ id: AmbientCategory; label: string }[]>([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        const [ambient, cats] = await Promise.all([
          getAmbientAssets(),
          getCategories(),
        ]);
        setAmbientAssets(ambient);
        setCategories(cats);
        audioService.setAssets(ambient, []);
      } catch (error) {
        console.error('Failed to load assets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssets();
  }, []);

  // Filter assets
  const filteredAssets = useMemo(() => {
    let result = ambientAssets;

    if (selectedCategories.size > 0) {
      result = result.filter(a => a.category && selectedCategories.has(a.category));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => a.displayName.toLowerCase().includes(query));
    }

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

  const handleAmbienceSelect = async (id: string | null, asset?: Asset) => {
    if (asset?.hasDiscrepancy) {
      showToast('Asset Discrepancy');
      return;
    }

    setLocalAmbienceId(id);
    await audioService.stopPreview();
    if (id) {
      await audioService.previewAmbient(id);
    }
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

    const itemIndex = randomIndex + 1;
    const rowIndex = Math.floor(itemIndex / NUM_COLUMNS);
    const rowY = 10 + rowIndex * ROW_HEIGHT;
    const scrollY = Math.max(0, rowY - ROW_HEIGHT * 2);

    smoothScrollTo(scrollY, 1200);
    handleAmbienceSelect(randomAsset.id, randomAsset);
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

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.text} />
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollViewRef}
              style={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              onScroll={(e) => { currentScrollY.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
              <GridAssetPicker
                assets={filteredAssets}
                selectedId={localAmbienceId}
                onSelect={handleAmbienceSelect}
                onLongPress={handleLongPress}
                showNoOption
                noOptionLabel="None"
                pinnedIds={pinnedIds}
              />
            </ScrollView>

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
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  bottomSection: {
    paddingTop: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBarWrapper: {
    flex: 1,
  },
  iconButton: {
    padding: 8,
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
