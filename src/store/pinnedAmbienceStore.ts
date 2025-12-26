import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PinnedAmbienceState {
  pinnedIds: string[];
  togglePinned: (id: string) => void;
  isPinned: (id: string) => boolean;
}

export const usePinnedAmbienceStore = create<PinnedAmbienceState>()(
  persist(
    (set, get) => ({
      pinnedIds: [],

      togglePinned: (id: string) => {
        const { pinnedIds } = get();
        if (pinnedIds.includes(id)) {
          set({ pinnedIds: pinnedIds.filter(pid => pid !== id) });
        } else {
          set({ pinnedIds: [...pinnedIds, id] });
        }
      },

      isPinned: (id: string) => get().pinnedIds.includes(id),
    }),
    {
      name: 'zen-timer-pinned-ambience',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
