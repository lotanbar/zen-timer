import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StepButton, StepButtonRef, Toast } from '../components';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { useDevModeStore } from '../store/devModeStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import { getBellAssets } from '../services/assetDiscoveryService';
import { SAMPLE_ASSETS } from '../constants/sampleAssets';
import { RootStackParamList, Asset } from '../types';

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

  const {
    duration,
    ambienceId,
    bellId,
    repeatBell,
  } = usePreferencesStore();

  useEffect(() => {
    async function loadAssets() {
      try {
        const bells = await getBellAssets();
        setBellAssets(bells);
        audioService.setAssets(SAMPLE_ASSETS, bells);
      } catch (error) {
        console.error('Failed to load assets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssets();
  }, []);

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

  const selectedAmbience = SAMPLE_ASSETS.find(a => a.id === ambienceId);
  const selectedBell = bellAssets.find(b => b.id === bellId);

  const durationValue = formatDuration(duration.hours, duration.minutes, duration.seconds);
  const ambienceValue = selectedAmbience?.displayName || 'None';
  const bellValue = repeatBell.enabled
    ? `${selectedBell?.displayName || bellId} x${repeatBell.count + 1}`
    : selectedBell?.displayName || bellId;

  const handleNavigate = (screen: 'Duration' | 'Ambience' | 'Bell') => {
    navigation.navigate(screen);
  };

  const handleStart = async () => {
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
