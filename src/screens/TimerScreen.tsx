import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';
import { usePreferencesStore, getTotalSeconds, calculateBellTimes } from '../store/preferencesStore';
import { useSessionStore } from '../store/sessionStore';
import { audioService } from '../services/audioService';
import { COLORS, FONTS } from '../constants/theme';
import { RootStackParamList } from '../types';

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

  const { duration, ambienceId, bellId, repeatBell } = usePreferencesStore();
  const { addSession } = useSessionStore();
  const totalSeconds = getTotalSeconds(duration);
  const [remaining, setRemaining] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const bellTimesRef = useRef<number[]>([]);
  const playedBellsRef = useRef<Set<number>>(new Set());
  const isCompletedRef = useRef(false);
  const isMountedRef = useRef(true);
  const bellPlayingRef = useRef(false);

  const handleComplete = useCallback(async () => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    await audioService.stopAmbient();
    await audioService.playBell(bellId);

    // Record completed session
    addSession({
      durationSeconds: totalSeconds,
      completedAt: new Date().toISOString(),
      completed: true,
      ambienceId,
      bellId,
    });
  }, [bellId, totalSeconds, ambienceId, addSession]);

  // Handle app state changes (background/foreground) to maintain accurate time
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && !isCompletedRef.current) {
        // Recalculate remaining time based on actual elapsed time
        const elapsedMs = Date.now() - startTimeRef.current;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const newRemaining = Math.max(0, totalSeconds - elapsedSeconds);
        setRemaining(newRemaining);

        if (newRemaining <= 0) {
          handleComplete();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [totalSeconds, handleComplete]);

  useEffect(() => {
    isMountedRef.current = true;

    const init = async () => {
      await audioService.init();

      if (!isMountedRef.current) return;

      if (ambienceId) {
        await audioService.playAmbient(ambienceId);
      }

      bellTimesRef.current = calculateBellTimes(totalSeconds, repeatBell);
    };

    init();
    startTimeRef.current = Date.now();

    // Use timestamp-based timing to prevent drift
    intervalRef.current = setInterval(() => {
      if (!isMountedRef.current) return;

      const elapsedMs = Date.now() - startTimeRef.current;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const newRemaining = Math.max(0, totalSeconds - elapsedSeconds);

      setRemaining(newRemaining);

      if (newRemaining <= 0 && !isCompletedRef.current) {
        handleComplete();
      }
    }, 250); // Check more frequently for better accuracy

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      audioService.stopAll();
    };
  }, [ambienceId, totalSeconds, repeatBell, handleComplete]);

  // Bell scheduling - check based on elapsed time
  useEffect(() => {
    if (isCompletedRef.current || bellPlayingRef.current) return;

    const elapsedSeconds = totalSeconds - remaining;

    // Find bells that should play now
    const bellsToPlay = bellTimesRef.current.filter(
      (bellTime) => elapsedSeconds >= bellTime && !playedBellsRef.current.has(bellTime)
    );

    if (bellsToPlay.length > 0) {
      // Mark all as played immediately to prevent duplicates
      bellsToPlay.forEach((bellTime) => playedBellsRef.current.add(bellTime));

      // Play only the most recent bell (avoid overlapping)
      bellPlayingRef.current = true;
      audioService.playBell(bellId).finally(() => {
        bellPlayingRef.current = false;
      });
    }
  }, [remaining, bellId, totalSeconds]);

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
        <Text style={styles.timer}>{formatTime(remaining)}</Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={handleStop}
          activeOpacity={0.8}
        >
          <Text style={styles.stopButtonText}>Stop</Text>
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
    fontSize: 160,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -4,
  },
  footer: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  stopButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 8,
  },
  stopButtonText: {
    color: COLORS.text,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.medium,
  },
});
