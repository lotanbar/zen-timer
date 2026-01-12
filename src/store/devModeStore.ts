import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DevModeState {
  isDevMode: boolean;
  toggleDevMode: () => void;
  setDevMode: (enabled: boolean) => void;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set, get) => ({
      isDevMode: false,

      toggleDevMode: () => set({ isDevMode: !get().isDevMode }),

      setDevMode: (enabled: boolean) => set({ isDevMode: enabled }),
    }),
    {
      name: 'zen-timer-dev-mode',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
