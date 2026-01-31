import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getUserByCode,
  updateQuotaUsage,
  addCachedAsset,
  hasAssetCached,
  usersRef,
} from '../config/firebase';
import { syncService, type SyncResult } from '../services/syncService';

export interface UserData {
  verificationCode: string;
  name: string;
  quotaLimitMB: number;
  quotaUsedMB: number;
  cachedAssets: string[];
  partialDownloads: { [assetId: string]: number }; // assetId -> MB already downloaded
}

interface AuthState {
  // User data
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  verifyCode: (code: string) => Promise<boolean>;
  refreshUserData: () => Promise<void>;
  logout: () => Promise<void>;
  trackBandwidth: (assetId: string, fileSizeMB: number) => Promise<void>;
  trackPartialBandwidth: (assetId: string, partialSizeMB: number) => Promise<void>;
  isAssetCached: (assetId: string) => boolean;
  removeCachedAsset: (assetId: string) => Promise<void>;
  getRemainingQuotaMB: () => number;
  hasQuotaRemaining: () => boolean;
  syncWithFirebase: () => Promise<SyncResult>;
}

const STORAGE_KEY = 'zen-timer-auth';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * Verify user's verification code against Firebase
   */
  verifyCode: async (code: string) => {
    set({ isLoading: true, error: null });

    try {
      const userData = await getUserByCode(code);

      if (!userData) {
        set({ error: 'Invalid verification code', isLoading: false });
        return false;
      }

      const user: UserData = {
        verificationCode: code,
        name: userData.name || 'User',
        quotaLimitMB: userData.quotaLimitMB || 1000,
        quotaUsedMB: userData.quotaUsedMB || 0,
        cachedAssets: userData.cachedAssets || [],
        partialDownloads: userData.partialDownloads || {},
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));

      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (error) {
      console.error('Verification error:', error);
      set({
        error: 'Failed to verify code. Check your internet connection.',
        isLoading: false,
      });
      return false;
    }
  },

  /**
   * Refresh user data from Firebase (quota, cached assets)
   */
  refreshUserData: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const userData = await getUserByCode(user.verificationCode);
      if (userData) {
        const updatedUser: UserData = {
          ...user,
          quotaUsedMB: userData.quotaUsedMB || 0,
          quotaLimitMB: userData.quotaLimitMB || 1000,
          cachedAssets: userData.cachedAssets || [],
          partialDownloads: userData.partialDownloads || {},
        };

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  },

  /**
   * Logout user (clear local storage)
   */
  logout: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ user: null, isAuthenticated: false, error: null });
  },

  /**
   * Track bandwidth usage for complete download
   * Checks if there was a partial download first, only tracks remaining MB
   * This is called AFTER a successful complete download
   */
  trackBandwidth: async (assetId: string, totalFileSizeMB: number) => {
    const { user } = get();
    if (!user) return;

    try {
      // Check if we already tracked a partial download
      const partialMB = user.partialDownloads[assetId] || 0;
      const remainingMB = totalFileSizeMB - partialMB;

      let newUsedMB = user.quotaUsedMB;

      if (remainingMB > 0) {
        // Track the remaining bytes (not already tracked)
        newUsedMB = user.quotaUsedMB + remainingMB;
        await updateQuotaUsage(user.verificationCode, newUsedMB);
        console.log(
          `Tracked ${remainingMB.toFixed(2)}MB (partial: ${partialMB.toFixed(2)}MB, total: ${totalFileSizeMB.toFixed(2)}MB)`
        );
      } else {
        console.log(`Already tracked ${partialMB.toFixed(2)}MB for ${assetId}, no additional charge`);
      }

      // Remove from partialDownloads, add to cachedAssets
      const updatedPartials = { ...user.partialDownloads };
      delete updatedPartials[assetId];

      const userRef = usersRef().child(user.verificationCode);
      await userRef.child('partialDownloads').set(updatedPartials);
      await addCachedAsset(user.verificationCode, assetId);

      // Update local state
      const updatedUser = {
        ...user,
        quotaUsedMB: newUsedMB,
        cachedAssets: [...user.cachedAssets, assetId],
        partialDownloads: updatedPartials,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser });

      console.log(`Total quota: ${newUsedMB.toFixed(2)}MB / ${user.quotaLimitMB}MB`);
    } catch (error) {
      console.error('Failed to track bandwidth:', error);
      throw error; // Re-throw so cache service can handle it
    }
  },

  /**
   * Track bandwidth for partial (interrupted) download
   * This is called when download fails/is interrupted
   */
  trackPartialBandwidth: async (assetId: string, partialSizeMB: number) => {
    const { user } = get();
    if (!user) return;

    try {
      // Add to quota
      const newUsedMB = user.quotaUsedMB + partialSizeMB;
      await updateQuotaUsage(user.verificationCode, newUsedMB);

      // Track as partial (not in cachedAssets yet)
      const updatedPartials = {
        ...user.partialDownloads,
        [assetId]: partialSizeMB,
      };

      const userRef = usersRef().child(user.verificationCode);
      await userRef.child('partialDownloads').set(updatedPartials);

      // Update local state
      const updatedUser = {
        ...user,
        quotaUsedMB: newUsedMB,
        partialDownloads: updatedPartials,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser });

      console.log(
        `Tracked partial download: ${partialSizeMB.toFixed(2)}MB for ${assetId}. Total: ${newUsedMB.toFixed(2)}MB / ${user.quotaLimitMB}MB`
      );
    } catch (error) {
      console.error('Failed to track partial bandwidth:', error);
      throw error;
    }
  },

  /**
   * Check if asset is cached locally (in-memory check only)
   */
  isAssetCached: (assetId: string) => {
    const { user } = get();
    if (!user) return false;
    return user.cachedAssets.includes(assetId);
  },

  /**
   * Sync cached assets: Remove asset from Firebase if it's marked as cached but doesn't exist locally
   * Call this when local cache check fails but Firebase thinks we have it
   */
  removeCachedAsset: async (assetId: string) => {
    const { user } = get();
    if (!user) return;

    try {
      // Remove from Firebase cachedAssets array
      const userRef = usersRef().child(user.verificationCode);
      const snapshot = await userRef.child('cachedAssets').once('value');
      const cachedAssets = snapshot.val() || [];

      const updatedAssets = cachedAssets.filter((id: string) => id !== assetId);
      await userRef.child('cachedAssets').set(updatedAssets);

      // Update local state
      const updatedUser = {
        ...user,
        cachedAssets: updatedAssets,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser });

      console.log(`Removed ${assetId} from cached assets (file not found locally)`);
    } catch (error) {
      console.error('Failed to remove cached asset:', error);
    }
  },

  /**
   * Get remaining quota in MB
   */
  getRemainingQuotaMB: () => {
    const { user } = get();
    if (!user) return 0;
    return Math.max(0, user.quotaLimitMB - user.quotaUsedMB);
  },

  /**
   * Check if user has quota remaining
   */
  hasQuotaRemaining: () => {
    const { user } = get();
    if (!user) return false;
    return user.quotaUsedMB < user.quotaLimitMB;
  },

  /**
   * Sync local storage with Firebase
   * Makes local storage the source of truth
   */
  syncWithFirebase: async () => {
    return await syncService.syncWithFirebase();
  },
}));

/**
 * Initialize auth state from AsyncStorage on app startup
 */
export const initializeAuth = async () => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      useAuthStore.setState({ user, isAuthenticated: true });

      // Refresh data from Firebase in background
      useAuthStore.getState().refreshUserData();
    }
  } catch (error) {
    console.error('Failed to initialize auth:', error);
  }
};
