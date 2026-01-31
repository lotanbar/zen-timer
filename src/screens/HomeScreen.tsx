import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { StepButton, StepButtonRef, Toast, DownloadProgressModal, PartialDownloadModal } from '../components';
import { VerificationModal } from '../components/VerificationModal';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { useDevModeStore } from '../store/devModeStore';
import { useAuthStore } from '../store/authStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import { assetCacheService, type PartialDownload } from '../services/assetCacheService';
import { getBellAssets } from '../services/assetDiscoveryService';
import { DEV_SAMPLE_ASSETS, DEV_SAMPLE_IDS } from '../constants/devAssets';
import { RootStackParamList, Asset } from '../types';
import * as sampleGenerator from '../services/sampleGeneratorService';
import { syncService } from '../services/syncService';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_HEIGHT = SCREEN_HEIGHT * 0.10;
const BUTTON_GAP = 16;

function formatDuration(hours: number, minutes: number, seconds: number): string {
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(' ') : '0s';
}

function getRandomInterval() {
  return 3000 + Math.random() * 7000; // 3-10 seconds
}

export function HomeScreen({ navigation }: HomeScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [bellAssets, setBellAssets] = useState<Asset[]>([]);
  const [ambienceAssets, setAmbienceAssets] = useState<Asset[]>([]);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Partial download state
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [partialDownloads, setPartialDownloads] = useState<PartialDownload[]>([]);

  // Download progress state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    downloadedMB: 0,
    totalMB: 0,
    percent: 0,
  });
  const [downloadingAssetName, setDownloadingAssetName] = useState('');

  const durationRef = useRef<StepButtonRef>(null);
  const ambienceRef = useRef<StepButtonRef>(null);
  const bellRef = useRef<StepButtonRef>(null);
  const buttonRefs = [durationRef, ambienceRef, bellRef];

  // Dev mode tap detection
  const { isDevMode, toggleDevMode } = useDevModeStore();
  const [tapCount, setTapCount] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auth state
  const {
    isAuthenticated,
    hasQuotaRemaining,
    getRemainingQuotaMB,
    refreshUserData,
    user,
  } = useAuthStore();

  const {
    duration,
    ambienceId,
    bellId,
    repeatBell,
    setAmbience,
    setBell,
  } = usePreferencesStore();

  useEffect(() => {
    async function loadAssets() {
      try {
        const bells = await getBellAssets();
        setBellAssets(bells);

        // Load generated ambience samples (or defaults if none exist)
        const loadedAmbienceSamples = await sampleGenerator.getOrCreateSamples();
        setAmbienceAssets(loadedAmbienceSamples);
        audioService.setAssets(loadedAmbienceSamples, bells);

        // Set default ambience if none selected, or if dev sample selected but dev mode off
        const isDevSample = ambienceId && DEV_SAMPLE_IDS.includes(ambienceId);
        const ambienceExists = ambienceId && loadedAmbienceSamples.some(a => a.id === ambienceId);
        if (!ambienceId || (isDevSample && !isDevMode) || (!ambienceExists && !isDevSample)) {
          const randomAmbience = pickRandom(loadedAmbienceSamples);
          setAmbience(randomAmbience.id);
        }

        // Set default bell if selected bell doesn't exist
        const bellExists = bells.some(b => b.id === bellId);
        if (!bellExists && bells.length > 0) {
          const randomBell = pickRandom(bells);
          setBell(randomBell.id);
        }
      } catch (error) {
        console.error('Failed to load assets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssets();
  }, [isDevMode]);

  // Show verification modal on app launch if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Small delay to let the app render first
      const timer = setTimeout(() => {
        setShowVerificationModal(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isAuthenticated]);

  // Run sync and check for partial downloads on app launch (only if authenticated)
  useEffect(() => {
    async function runStartupSync() {
      if (!isAuthenticated) return;

      try {
        // Step 1: Sync local storage with Firebase
        console.log('Running startup sync...');
        const syncResult = await syncService.syncWithFirebase();

        // Show toast if there were significant changes
        const message = syncService.formatSyncMessage(syncResult);
        if (message) {
          setToastMessage(message);
          setShowToast(true);
        }

        // Step 2: Check for partial downloads
        const partials = await assetCacheService.detectPartialDownloads();
        if (partials.length > 0) {
          console.log(`Found ${partials.length} partial download(s)`);
          setPartialDownloads(partials);
          setShowPartialModal(true);
        }
      } catch (error) {
        console.error('Startup sync failed:', error);
      }
    }

    runStartupSync();
  }, [isAuthenticated]);

  // Reload ambience samples when screen is focused (in case user refreshed in AmbienceScreen)
  useFocusEffect(
    useCallback(() => {
      async function reloadAmbienceSamples() {
        const loadedAmbienceSamples = await sampleGenerator.getOrCreateSamples();
        setAmbienceAssets(loadedAmbienceSamples);
        audioService.setAmbientAssets(loadedAmbienceSamples);
      }
      reloadAmbienceSamples();

      // Refresh user quota data from Firebase
      if (isAuthenticated) {
        refreshUserData();
      }
    }, [isAuthenticated, refreshUserData])
  );

  // Three independent pulse timers so multiple buttons can light up at once
  useEffect(() => {
    let timeoutId1: NodeJS.Timeout;
    let timeoutId2: NodeJS.Timeout;
    let timeoutId3: NodeJS.Timeout;
    const lastPulseTime = [0, 0, 0]; // Track last pulse time for each button
    const COOLDOWN = 2000; // 2 second cooldown per button

    const getAvailableIndex = (): number | null => {
      const now = Date.now();
      const available = [0, 1, 2].filter(i => now - lastPulseTime[i] >= COOLDOWN);
      if (available.length === 0) return null;
      return available[Math.floor(Math.random() * available.length)];
    };

    const pulseButton = () => {
      const index = getAvailableIndex();
      if (index !== null) {
        lastPulseTime[index] = Date.now();
        buttonRefs[index].current?.pulse();
      }
    };

    const scheduleNextPulse1 = () => {
      timeoutId1 = setTimeout(() => {
        pulseButton();
        scheduleNextPulse1();
      }, getRandomInterval());
    };

    const scheduleNextPulse2 = () => {
      timeoutId2 = setTimeout(() => {
        pulseButton();
        scheduleNextPulse2();
      }, getRandomInterval());
    };

    const scheduleNextPulse3 = () => {
      timeoutId3 = setTimeout(() => {
        pulseButton();
        scheduleNextPulse3();
      }, getRandomInterval());
    };

    scheduleNextPulse1();
    scheduleNextPulse2();
    scheduleNextPulse3();

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, []);

  // Cleanup tap timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);

  const handleLogoPress = () => {
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }

    const newCount = tapCount + 1;
    setTapCount(newCount);

    // Show countdown toasts from tap 4 onwards
    if (newCount >= 4 && newCount < 7) {
      const remaining = 7 - newCount;
      setToastMessage(
        `You're ${remaining} tap${remaining > 1 ? 's' : ''} from ${isDevMode ? 'leaving' : 'becoming'} a dev...`
      );
      setShowToast(true);
    }

    // Toggle dev mode on 7th tap
    if (newCount >= 7) {
      toggleDevMode();
      setToastMessage(isDevMode ? 'Dev mode disabled' : 'Dev mode enabled!');
      setShowToast(true);
      setTapCount(0);
      return;
    }

    // Reset tap count after 2 seconds of no taps
    tapTimeoutRef.current = setTimeout(() => {
      setTapCount(0);
    }, 2000);
  };

  // Include dev samples in lookup when dev mode is on
  const allAmbienceAssets = isDevMode ? [...DEV_SAMPLE_ASSETS, ...ambienceAssets] : ambienceAssets;
  const selectedAmbience = allAmbienceAssets.find(a => a.id === ambienceId);
  const selectedBell = bellAssets.find(b => b.id === bellId);

  const durationValue = formatDuration(duration.hours, duration.minutes, duration.seconds);
  const ambienceValue = selectedAmbience?.displayName || 'None';
  const bellValue = repeatBell.enabled
    ? `${selectedBell?.displayName || bellId} x${repeatBell.count}`
    : selectedBell?.displayName || bellId;

  const handleNavigate = (screen: 'Duration' | 'Ambience' | 'Bell') => {
    navigation.navigate(screen);
  };

  const handleContinuePartialDownloads = () => {
    setShowPartialModal(false);
    // Partial downloads will resume automatically when user starts meditation
  };

  const handleDeletePartialDownloads = async () => {
    setShowPartialModal(false);

    for (const partial of partialDownloads) {
      await assetCacheService.deletePartialDownload(partial.assetId);
    }

    setPartialDownloads([]);
    setToastMessage('Partial downloads deleted');
    setShowToast(true);
  };

  const handleStart = async () => {
    // Check authentication
    if (!isAuthenticated) {
      setShowVerificationModal(true);
      return;
    }

    // Refresh quota data before checking
    await refreshUserData();

    // Check quota
    if (!hasQuotaRemaining()) {
      const remainingMB = getRemainingQuotaMB();
      Alert.alert(
        'Quota Exceeded',
        `You've used all your bandwidth quota. ${remainingMB < 0 ? `You're ${Math.abs(remainingMB).toFixed(1)}MB over your limit.` : 'Please contact the app administrator to increase your quota.'}`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Check if ambience needs to be downloaded
    const selectedAmbience = allAmbienceAssets.find(a => a.id === ambienceId);
    if (selectedAmbience) {
      const cachedPath = assetCacheService.getCachedAudioPath(selectedAmbience.id);

      if (!cachedPath) {
        // Need to download (or resume) the ambience file
        setIsDownloading(true);
        setDownloadingAssetName(selectedAmbience.displayName || selectedAmbience.id);
        setDownloadProgress({ downloadedMB: 0, totalMB: 0, percent: 0 });

        try {
          await assetCacheService.cacheAudio(selectedAmbience, (progress) => {
            const downloadedMB = progress.totalBytesWritten / (1024 * 1024);
            const totalMB = progress.totalBytesExpectedToWrite / (1024 * 1024);
            const percent = (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100;

            setDownloadProgress({ downloadedMB, totalMB, percent });
          });

          console.log('Download complete, proceeding to meditation');
        } catch (error) {
          const currentProgress = downloadProgress;
          Alert.alert(
            'Download Interrupted',
            `Download was interrupted. You've used ${currentProgress.downloadedMB.toFixed(1)}MB of quota. The download can be resumed later.`,
            [{ text: 'OK' }]
          );
          setIsDownloading(false);
          return;
        }

        setIsDownloading(false);
      }
    }

    // Start meditation
    await audioService.stopPreview();
    navigation.navigate('Timer');
  };

  const totalSeconds = getTotalSeconds(duration);
  const canStart = totalSeconds > 0;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLogoPress} activeOpacity={0.8}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </TouchableOpacity>
        {isAuthenticated && user && (
          <View style={styles.quotaContainer}>
            <Text style={styles.quotaText}>
              {user.name} • {user.quotaLimitMB === -1
                ? 'Unlimited'
                : `${getRemainingQuotaMB().toFixed(0)}MB / ${user.quotaLimitMB}MB`}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.buttonsContainer}>
        <StepButton
          ref={durationRef}
          label="Duration"
          value={durationValue}
          onPress={() => handleNavigate('Duration')}
        />
        <StepButton
          ref={ambienceRef}
          label="Ambience"
          value={ambienceValue}
          imageUrl={selectedAmbience?.imageUrl}
          onPress={() => handleNavigate('Ambience')}
        />
        <StepButton
          ref={bellRef}
          label="Bell"
          value={bellValue}
          imageUrl={selectedBell?.imageUrl}
          onPress={() => handleNavigate('Bell')}
        />
      </View>

      <View style={styles.footer}>
        {!isAuthenticated && (
          <View style={styles.authBanner}>
            <Text style={styles.authBannerText}>
              You need to{' '}
              <Text
                style={styles.authBannerLink}
                onPress={() => setShowVerificationModal(true)}
              >
                authenticate
              </Text>
              {' '}to stream meditation data
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          onPress={handleStart}
          activeOpacity={0.8}
          disabled={!canStart}
        >
          <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>Start</Text>
        </TouchableOpacity>
      </View>

      <Toast
        message={toastMessage}
        visible={showToast}
        onHide={() => setShowToast(false)}
      />

      <VerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
      />

      <PartialDownloadModal
        visible={showPartialModal}
        partialDownloads={partialDownloads}
        onContinue={handleContinuePartialDownloads}
        onDelete={handleDeletePartialDownloads}
      />

      <DownloadProgressModal
        visible={isDownloading}
        assetName={downloadingAssetName}
        downloadedMB={downloadProgress.downloadedMB}
        totalMB={downloadProgress.totalMB}
        percent={downloadProgress.percent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  logo: {
    width: 80,
    height: 80,
  },
  quotaContainer: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
  },
  quotaText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: BUTTON_GAP,
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  authBanner: {
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    width: '100%',
  },
  authBannerText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.small,
    textAlign: 'center',
    lineHeight: 18,
  },
  authBannerLink: {
    color: '#FFA500',
    fontWeight: FONTS.semibold,
    textDecorationLine: 'underline',
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
