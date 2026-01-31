import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { GridAssetPicker, SearchBar } from '../components';
import { usePreferencesStore } from '../store/preferencesStore';
import { useDevModeStore } from '../store/devModeStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import { RootStackParamList, Asset } from '../types';
import * as sampleGenerator from '../services/sampleGeneratorService';
import { DEV_SAMPLE_ASSETS, DEV_SAMPLE_IDS } from '../constants/devAssets';
import { assetCacheService } from '../services/assetCacheService';

type AmbienceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Ambience'>;
};

function ShuffleIcon({ size = 20, color = COLORS.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function RefreshIcon({ size = 20, color = COLORS.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AmbienceScreen({ navigation }: AmbienceScreenProps) {
  const { ambienceId: storeAmbienceId, setAmbience } = usePreferencesStore();
  const { isDevMode } = useDevModeStore();
  const scrollViewRef = useRef<ScrollView>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [localAmbienceId, setLocalAmbienceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [starredIds, setStarredIds] = useState<string[]>([]);

  // Load saved samples and starred IDs on mount or when dev mode changes
  useEffect(() => {
    const loadData = async () => {
      const [samples, starred] = await Promise.all([
        sampleGenerator.getOrCreateSamples(),
        sampleGenerator.loadStarredIds(),
      ]);
      // Include dev samples if dev mode is enabled
      const allAssets = isDevMode ? [...DEV_SAMPLE_ASSETS, ...samples] : samples;
      setAssets(allAssets);
      setStarredIds(starred);
      audioService.setAmbientAssets(allAssets);
      // Prefetch signed URLs for all thumbnails in one batch request
      assetCacheService.prefetchSignedUrls(allAssets, 'image');
      // Set initial selection - use null if ambienceId is null
      if (!storeAmbienceId) {
        setLocalAmbienceId(null);
      } else {
        const matchingId = allAssets.find(s => s.id === storeAmbienceId)?.id || allAssets[0]?.id;
        setLocalAmbienceId(matchingId);
      }
    };
    loadData();
  }, [storeAmbienceId, isDevMode]);

  // Reset selection if dev mode is disabled and a dev sample was selected
  useEffect(() => {
    if (!isDevMode && storeAmbienceId && DEV_SAMPLE_IDS.includes(storeAmbienceId)) {
      setAmbience(null);
    }
  }, [isDevMode, storeAmbienceId, setAmbience]);

  // Stop preview when leaving screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        audioService.stopPreview();
      };
    }, [])
  );

  // Filter assets by search query, with dev samples first, then starred
  const filteredAssets = assets
    .filter(asset => asset.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Dev samples always first
      const aDev = DEV_SAMPLE_IDS.includes(a.id);
      const bDev = DEV_SAMPLE_IDS.includes(b.id);
      if (aDev && !bDev) return -1;
      if (!aDev && bDev) return 1;
      // Then starred items
      const aStarred = starredIds.includes(a.id);
      const bStarred = starredIds.includes(b.id);
      if (aStarred && !bStarred) return -1;
      if (!aStarred && bStarred) return 1;
      return 0;
    });

  // Countdown timer for refresh dialog
  useEffect(() => {
    if (!showRefreshDialog) {
      setCountdown(isDevMode ? 0 : 5);
      return;
    }

    // Skip countdown in dev mode
    if (isDevMode) {
      setCountdown(0);
      return;
    }

    if (countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [showRefreshDialog, countdown, isDevMode]);

  const handleRefreshPress = () => {
    setShowRefreshDialog(true);
  };

  const handleRefreshCancel = () => {
    setShowRefreshDialog(false);
  };

  const handleRefreshConfirm = async () => {
    if (!isDevMode && countdown > 0) return;

    setShowRefreshDialog(false);
    setIsRefreshing(true);
    await audioService.stopPreview();

    // Step 1: Generate new samples (one per category), keeping starred ones
    // Step 2: Save to storage (happens inside this function)
    await sampleGenerator.generateAndSaveWithStarred(assets, starredIds);

    // Step 3: Refetch from storage
    const refetchedSamples = await sampleGenerator.getOrCreateSamples();

    // Step 4: Display
    const allAssets = isDevMode ? [...DEV_SAMPLE_ASSETS, ...refetchedSamples] : refetchedSamples;
    setAssets(allAssets);
    audioService.setAmbientAssets(allAssets);

    // Select first non-starred item or first item
    const firstUnstarred = allAssets.find(s => !starredIds.includes(s.id));
    setLocalAmbienceId(firstUnstarred?.id || allAssets[0]?.id);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    setIsRefreshing(false);
  };

  const handleLongPress = async (id: string) => {
    // Don't allow starring dev samples
    if (DEV_SAMPLE_IDS.includes(id)) return;

    let newStarredIds: string[];
    if (starredIds.includes(id)) {
      // Unstar
      newStarredIds = starredIds.filter(sid => sid !== id);
    } else {
      // Star
      newStarredIds = [...starredIds, id];
    }
    setStarredIds(newStarredIds);
    await sampleGenerator.saveStarredIds(newStarredIds);
  };

  const handleAmbienceSelect = (id: string | null) => {
    setLocalAmbienceId(id);

    // Stop preview if null (none) is selected
    if (id === null) {
      audioService.stopPreview();
      return;
    }

    // Toggle off if clicking currently playing item
    if (audioService.isPreviewPlaying(id)) {
      audioService.stopPreview();
      return;
    }

    // Play new item with loading indicator
    setLoadingId(id);
    audioService.previewAmbient(id, () => setLoadingId(null));
  };

  const handleShuffle = () => {
    if (filteredAssets.length === 0) return;
    const randomIndex = Math.floor(Math.random() * filteredAssets.length);
    const randomAsset = filteredAssets[randomIndex];
    handleAmbienceSelect(randomAsset.id);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSelect = async () => {
    setAmbience(localAmbienceId);
    await audioService.stopPreview();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Ambience</Text>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <GridAssetPicker
            assets={filteredAssets}
            selectedId={localAmbienceId}
            onSelect={handleAmbienceSelect}
            onLongPress={handleLongPress}
            showNoOption={true}
            noOptionLabel="None"
            pinnedIds={starredIds}
            loadingId={loadingId}
            isDevMode={isDevMode}
          />
        </ScrollView>
      </View>

      <View style={styles.bottomSection}>
        <Text style={styles.instructionText}>
          Long press a tile to star it, long press again to undo
        </Text>
        <View style={styles.searchRow}>
          <View style={styles.searchBarContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search sounds..."
            />
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleShuffle}
            activeOpacity={0.7}
          >
            <ShuffleIcon size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, isRefreshing && styles.iconButtonDisabled]}
            onPress={handleRefreshPress}
            activeOpacity={0.7}
            disabled={isRefreshing}
          >
            <RefreshIcon size={20} color={isRefreshing ? COLORS.border : COLORS.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.selectButton} onPress={handleSelect} activeOpacity={0.7}>
          <Text style={styles.selectButtonText}>Select</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showRefreshDialog}
        transparent
        animationType="fade"
        onRequestClose={handleRefreshCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reshuffle audio tracks?</Text>
            <Text style={styles.modalText}>
              Star tracks you want to keep - they won't be replaced. This action is irreversible, you might NOT find unstarred tracks ever again.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={handleRefreshCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  !isDevMode && countdown > 0 && styles.modalConfirmButtonDisabled,
                ]}
                onPress={handleRefreshConfirm}
                activeOpacity={!isDevMode || countdown === 0 ? 0.7 : 1}
                disabled={!isDevMode && countdown > 0}
              >
                <Text
                  style={[
                    styles.modalConfirmText,
                    !isDevMode && countdown > 0 && styles.modalConfirmTextDisabled,
                  ]}
                >
                  {!isDevMode && countdown > 0 ? `Confirm (${countdown})` : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginBottom: 16,
  },
  instructionText: {
    color: COLORS.textSecondary || '#888',
    fontSize: FONTS.size.small,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  bottomSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  searchBarContainer: {
    flex: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.5,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surface || '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.semibold,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalText: {
    color: COLORS.text,
    fontSize: FONTS.size.medium,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: COLORS.text,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.medium,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.text,
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  modalConfirmText: {
    color: COLORS.background,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
  modalConfirmTextDisabled: {
    color: '#666',
  },
});
