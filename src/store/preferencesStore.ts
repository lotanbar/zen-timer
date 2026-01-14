import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Duration, RepeatBellOptions, UserPreferences } from '../types';
import { DEFAULT_BELL_ID } from '../constants/assets';

const DEFAULT_PREFERENCES: UserPreferences = {
  duration: { hours: 0, minutes: 20, seconds: 0 },
  ambienceId: null,
  bellId: DEFAULT_BELL_ID,
  repeatBell: {
    enabled: false,
    count: 1,
    beforeEndSeconds: 60,
  },
};

interface PreferencesState extends UserPreferences {
  setDuration: (duration: Duration) => void;
  setAmbience: (id: string | null) => void;
  setBell: (id: string) => void;
  setRepeatBell: (options: RepeatBellOptions) => void;
  resetToDefaults: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,

      setDuration: (duration) => set({ duration }),

      setAmbience: (ambienceId) => set({ ambienceId }),

      setBell: (bellId) => set({ bellId }),

      setRepeatBell: (repeatBell) => set({ repeatBell }),

      resetToDefaults: () => set(DEFAULT_PREFERENCES),
    }),
    {
      name: 'zen-timer-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persistedState: any, version) => {
        if (version === 0) {
          // Migrate from intervalSeconds to beforeEndSeconds
          if (persistedState?.repeatBell?.intervalSeconds !== undefined) {
            const oldInterval = persistedState.repeatBell.intervalSeconds;
            const oldCount = persistedState.repeatBell.count || 1;
            persistedState.repeatBell.beforeEndSeconds = oldInterval * oldCount;
            delete persistedState.repeatBell.intervalSeconds;
          }
        }
        return persistedState as PreferencesState;
      },
    }
  )
);

export function getTotalSeconds(duration: Duration): number {
  return duration.hours * 3600 + duration.minutes * 60 + duration.seconds;
}

export function calculateBellTimes(
  totalSeconds: number,
  repeatBell: RepeatBellOptions
): number[] {
  if (!repeatBell.enabled || repeatBell.beforeEndSeconds >= totalSeconds || repeatBell.count < 1) {
    return [totalSeconds]; // Just the final bell
  }

  const times: number[] = [];

  // Calculate interval: for count bells over beforeEndSeconds,
  // interval is beforeEndSeconds / (count - 1) so the last bell lands exactly at the end
  const interval = repeatBell.count > 1
    ? repeatBell.beforeEndSeconds / (repeatBell.count - 1)
    : repeatBell.beforeEndSeconds;

  // Add bells: evenly spaced from beforeEndSeconds before end to the end
  for (let i = 0; i < repeatBell.count; i++) {
    const bellTime = totalSeconds - repeatBell.beforeEndSeconds + i * interval;
    if (bellTime > 0) {
      times.push(bellTime);
    }
  }

  // Sort chronologically
  times.sort((a, b) => a - b);

  return times;
}

export function getIntervalDisplay(repeatBell: RepeatBellOptions): string {
  const interval = repeatBell.count > 1
    ? repeatBell.beforeEndSeconds / (repeatBell.count - 1)
    : repeatBell.beforeEndSeconds;
  const mins = Math.floor(interval / 60);
  const secs = Math.round(interval % 60);

  if (mins > 0 && secs > 0) {
    return `${mins}m ${secs}s apart`;
  } else if (mins > 0) {
    return `${mins}m apart`;
  } else {
    return `${secs}s apart`;
  }
}

export function isRepeatBellValid(
  totalSeconds: number,
  repeatBell: RepeatBellOptions
): boolean {
  return repeatBell.beforeEndSeconds < totalSeconds;
}
