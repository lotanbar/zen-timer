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
import { StepButton, StepButtonRef } from '../components';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
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
  return 3000 + Math.random() * 5000; // 3-8 seconds
}

export function HomeScreen({ navigation }: HomeScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [bellAssets, setBellAssets] = useState<Asset[]>([]);

  const durationRef = useRef<StepButtonRef>(null);
  const ambienceRef = useRef<StepButtonRef>(null);
  const bellRef = useRef<StepButtonRef>(null);
  const buttonRefs = [durationRef, ambienceRef, bellRef];

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

  // Random pulse effect to make app feel alive
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const scheduleNextPulse = () => {
      timeoutId = setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * buttonRefs.length);
        buttonRefs[randomIndex].current?.pulse();
        scheduleNextPulse();
      }, getRandomInterval());
    };

    scheduleNextPulse();

    return () => clearTimeout(timeoutId);
  }, []);

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
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
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
