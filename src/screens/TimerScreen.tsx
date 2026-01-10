import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  AppStateStatus,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';
import { usePreferencesStore, getTotalSeconds, calculateBellTimes } from '../store/preferencesStore';
import { useSessionStore } from '../store/sessionStore';
import { audioService } from '../services/audioService';
import { isScreenInteractive } from '../services/screenStateService';
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

  const { width: screenWidth } = useWindowDimensions();
  const { duration, ambienceId, bellId, repeatBell } = usePreferencesStore();
  const { addSession } = useSessionStore();
  const totalSeconds = getTotalSeconds(duration);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number>(0); // Accumulated paused time
  const pauseStartRef = useRef<number | null>(null);
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

  // Handle app state changes:
  // - When going to background: pause ONLY if screen is still on (user switched apps)
  // - When screen is turned off: keep playing (meditation continues)
  // - When returning to foreground: update display, check completion
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (isCompletedRef.current) return;

      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Check if screen is still on (user switched apps) vs screen turned off
        const screenOn = await isScreenInteractive();
        if (screenOn && !isPaused) {
          // User switched to another app with screen on - pause the meditation
          pauseStartRef.current = Date.now();
          setIsPaused(true);
          audioService.pauseAmbient();
        }
        // If screen is off, keep playing - the background timer handles everything
      } else if (nextAppState === 'active') {
        // Recalculate remaining time for display (accounting for any pauses)
        let totalPausedMs = pausedTimeRef.current;
        if (pauseStartRef.current) {
          totalPausedMs += Date.now() - pauseStartRef.current;
        }
        const elapsedMs = Date.now() - startTimeRef.current - totalPausedMs;
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
  }, [totalSeconds, handleComplete, isPaused]);

  useEffect(() => {
    isMountedRef.current = true;

    const init = async () => {
      await audioService.init();

      if (!isMountedRef.current) return;

      // Start ambient if selected (should be pre-cached)
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

      // Calculate elapsed time excluding paused periods
      let totalPausedMs = pausedTimeRef.current;
      if (pauseStartRef.current) {
        // Currently paused, add ongoing pause duration
        totalPausedMs += Date.now() - pauseStartRef.current;
      }

      const elapsedMs = Date.now() - startTimeRef.current - totalPausedMs;
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

  const handlePauseResume = useCallback(async () => {
    if (isPaused) {
      // Resume
      if (pauseStartRef.current) {
        pausedTimeRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      setIsPaused(false);
      await audioService.resumeAmbient();
    } else {
      // Pause
      pauseStartRef.current = Date.now();
      setIsPaused(true);
      await audioService.pauseAmbient();
    }
  }, [isPaused]);

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
          onPress={handlePauseResume}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>{isPaused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>
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
