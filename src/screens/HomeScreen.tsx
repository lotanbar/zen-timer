import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StepButton, StepButtonRef } from '../components';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { COLORS, FONTS } from '../constants/theme';
import { audioService } from '../services/audioService';
import {
  getAmbientAssets,
  getBellAssets,
} from '../services/assetDiscoveryService';
import { RootStackParamList, Asset } from '../types';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_HEIGHT = SCREEN_HEIGHT * 0.10;
const BUTTON_GAP = 16;
const TOTAL_BUTTONS_HEIGHT = 3 * BUTTON_HEIGHT + 2 * BUTTON_GAP;

function formatDuration(hours: number, minutes: number, seconds: number): string {
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(' ') : '0s';
}

export function HomeScreen({ navigation }: HomeScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [ambientAssets, setAmbientAssets] = useState<Asset[]>([]);
  const [bellAssets, setBellAssets] = useState<Asset[]>([]);
  const lastNavigatedScreen = useRef<string | null>(null);

  const durationRef = useRef<StepButtonRef>(null);
  const ambienceRef = useRef<StepButtonRef>(null);
  const bellRef = useRef<StepButtonRef>(null);

  const {
    duration,
    ambienceId,
    bellId,
    repeatBell,
    resetToDefaults,
  } = usePreferencesStore();

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

  // Listen for focus events to trigger animation on the button that was navigated to
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (lastNavigatedScreen.current) {
        const screen = lastNavigatedScreen.current;
        lastNavigatedScreen.current = null;

        // Delay animation so user can see it after screen transition
        setTimeout(() => {
          switch (screen) {
            case 'Duration':
              durationRef.current?.animate();
              break;
            case 'Ambience':
              ambienceRef.current?.animate();
              break;
            case 'Bell':
              bellRef.current?.animate();
              break;
          }
        }, 200);
      }
    });

    return unsubscribe;
  }, [navigation]);

  const selectedAmbience = ambientAssets.find(a => a.id === ambienceId);
  const selectedBell = bellAssets.find(b => b.id === bellId);

  const durationValue = formatDuration(duration.hours, duration.minutes, duration.seconds);
  const ambienceValue = selectedAmbience?.displayName || 'None';
  const bellValue = repeatBell.enabled
    ? `${selectedBell?.displayName || bellId} x${repeatBell.count + 1}`
    : selectedBell?.displayName || bellId;

  const handleNavigate = (screen: 'Duration' | 'Ambience' | 'Bell') => {
    lastNavigatedScreen.current = screen;
    navigation.navigate(screen);
  };

  const handleStart = async () => {
    await audioService.stopPreview();
    navigation.navigate('Timer');
  };

  const handleReset = () => {
    resetToDefaults();
    audioService.stopPreview();
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonsContainer: {
    position: 'absolute',
    top: (SCREEN_HEIGHT - TOTAL_BUTTONS_HEIGHT) / 2,
    left: 20,
    right: 20,
    gap: BUTTON_GAP,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingBottom: 32,
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
