import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AssetCacheState {
  downloadedAssets: string[];
  downloadProgress: Record<string, number>;

  isDownloaded: (id: string) => boolean;
  markAsDownloaded: (id: string) => void;
  setProgress: (id: string, progress: number) => void;
  clearProgress: (id: string) => void;
}

export const useAssetCacheStore = create<AssetCacheState>()(
  persist(
    (set, get) => ({
      downloadedAssets: [],
      downloadProgress: {},

      isDownloaded: (id) => get().downloadedAssets.includes(id),

      markAsDownloaded: (id) =>
        set((state) => ({
          downloadedAssets: state.downloadedAssets.includes(id)
            ? state.downloadedAssets
            : [...state.downloadedAssets, id],
        })),

      setProgress: (id, progress) =>
        set((state) => ({
          downloadProgress: { ...state.downloadProgress, [id]: progress },
        })),

      clearProgress: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.downloadProgress;
          return { downloadProgress: rest };
        }),
    }),
    {
      name: 'zen-timer-asset-cache',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ downloadedAssets: state.downloadedAssets }),
    }
  )
);
