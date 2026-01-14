import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  AppStateStatus,
  useWindowDimensions,
  NativeEventEmitter,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';
import { usePreferencesStore, getTotalSeconds, calculateBellTimes } from '../store/preferencesStore';
import { useSessionStore } from '../store/sessionStore';
import { audioService } from '../services/audioService';
import { COLORS, FONTS } from '../constants/theme';
import { RootStackParamList } from '../types';
import { DEV_SAMPLE_ASSETS } from '../constants/devAssets';
import { BELL_ASSETS } from '../constants/assets';
import { useDevModeStore } from '../store/devModeStore';
import * as sampleGenerator from '../services/sampleGeneratorService';

type TimerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Timer'>;
};

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TimerScreen({ navigation }: TimerScreenProps) {
  // Keep screen awake during meditation
  useKeepAwake();

  const { width: screenWidth } = useWindowDimensions();
  const { duration, ambienceId, bellId, repeatBell } = usePreferencesStore();
  const { addSession } = useSessionStore();
  const totalSeconds = getTotalSeconds(duration);
  const [remaining, setRemaining] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isCompletedRef = useRef(false);
  const isMountedRef = useRef(true);

  const handleComplete = useCallback(async () => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setRemaining(0);

    // Record completed session
    addSession({
      durationSeconds: totalSeconds,
      completedAt: new Date().toISOString(),
      completed: true,
      ambienceId,
      bellId,
    });

    // Native Kotlin sends TIMER_COMPLETE AFTER fade is done, so navigate immediately
    await audioService.stopAll();
    navigation.goBack();
  }, [totalSeconds, ambienceId, bellId, addSession, navigation]);

  // Listen for native timer completion event (fires even when screen is off)
  useEffect(() => {
    const { NativeAudioModule } = NativeModules;
    if (!NativeAudioModule) return;

    const eventEmitter = new NativeEventEmitter(NativeAudioModule);
    const subscription = eventEmitter.addListener('onTimerComplete', () => {
      console.log('[Timer] Native timer complete event received');
      if (!isCompletedRef.current && isMountedRef.current) {
        handleComplete();
      }
    });

    return () => subscription.remove();
  }, [handleComplete]);

  // Native Kotlin handles ALL audio - screen on/off, background, fades
  // JS just needs to pass URIs and wait for completion signal
  const { isDevMode } = useDevModeStore();

  useEffect(() => {
    isMountedRef.current = true;

    const init = async () => {
      await audioService.init();

      if (!isMountedRef.current) return;

      // Load generated ambience samples from storage
      const loadedAmbienceSamples = await sampleGenerator.getOrCreateSamples();
      const allAmbienceAssets = isDevMode ? [...DEV_SAMPLE_ASSETS, ...loadedAmbienceSamples] : loadedAmbienceSamples;
      const ambientAsset = allAmbienceAssets.find(a => a.id === ambienceId);
      const bellAsset = BELL_ASSETS.find(b => b.id === bellId);

      if (!ambientAsset || !bellAsset) {
        console.error('[TimerScreen] Assets not found', { ambienceId, bellId });
        navigation.goBack();
        return;
      }

      const ambientUri = ambientAsset.audioUrl;
      const bellUri = bellAsset.audioUrl;

      // Calculate bell times
      const bellTimes = calculateBellTimes(totalSeconds, repeatBell);

      console.log('[TimerScreen] Starting native meditation timer', {
        ambientUri,
        bellUri,
        bellTimes,
        duration: totalSeconds,
      });

      // Single native call - Kotlin handles EVERYTHING
      const success = await audioService.startMeditationTimer(
        ambientUri,
        bellUri,
        bellTimes,
        totalSeconds
      );

      if (!success) {
        console.error('[TimerScreen] Failed to start native timer');
        navigation.goBack();
        return;
      }

      console.log('[TimerScreen] Native timer started successfully');
    };

    init();
    startTimeRef.current = Date.now();

    // Simple UI-only countdown
    intervalRef.current = setInterval(() => {
      if (!isMountedRef.current || isCompletedRef.current) return;

      const elapsedMs = Date.now() - startTimeRef.current;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const newRemaining = Math.max(0, totalSeconds - elapsedSeconds);

      setRemaining(newRemaining);
    }, 250);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      audioService.stopAll();
    };
  }, [ambienceId, bellId, totalSeconds, repeatBell, isDevMode, handleComplete, navigation]);

  const handleStop = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Record incomplete session
    const elapsedSeconds = totalSeconds - remaining;
    if (elapsedSeconds > 0) {
      addSession({
        durationSeconds: elapsedSeconds,
        completedAt: new Date().toISOString(),
        completed: false,
        ambienceId,
        bellId,
      });
    }

    await audioService.stopAll();
    navigation.goBack();
  }, [remaining, totalSeconds, ambienceId, bellId, addSession, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.timerContainer}>
        <Text
          style={[styles.timer, { fontSize: screenWidth * 0.4 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatTime(remaining)}
        </Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleStop}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>Stop</Text>
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
  timerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timer: {
    color: COLORS.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -4,
  },
  footer: {
    flexDirection: 'row',
    paddingVertical: 24,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 16,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.medium,
  },
});
