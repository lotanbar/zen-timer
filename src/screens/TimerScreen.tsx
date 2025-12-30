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
  const isCompletedRef = useRef(false);
  const isMountedRef = useRef(true);

  const handleComplete = useCallback(() => {
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

    // Navigate back (called after bell finishes playing)
    navigation.goBack();
  }, [totalSeconds, ambienceId, bellId, addSession, navigation]);

  // Handle app state changes (background/foreground) to update display
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && !isCompletedRef.current) {
        // Recalculate remaining time for display
        const elapsedMs = Date.now() - startTimeRef.current;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const newRemaining = Math.max(0, totalSeconds - elapsedSeconds);
        setRemaining(newRemaining);

        // Check if timer completed while in background
        if (audioService.isTimerCompleted()) {
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

      // Start ambient if selected
      if (ambienceId) {
        await audioService.playAmbient(ambienceId);
      }

      // Calculate bell times (excluding the final bell which is handled by completion)
      const bellTimes = calculateBellTimes(totalSeconds, repeatBell);

      // Start the background timer - this handles bells and completion even when screen is off
      await audioService.startTimer(totalSeconds, bellId, bellTimes, () => {
        if (isMountedRef.current) {
          handleComplete();
        }
      });
    };

    init();
    startTimeRef.current = Date.now();

    // Simple interval just for UI updates (ok if paused in background)
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
  }, [ambienceId, totalSeconds, repeatBell, bellId, handleComplete]);

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
