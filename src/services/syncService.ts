import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { usersRef } from '../config/firebase';

const CACHE_DIR = `${FileSystem.cacheDirectory}zen-timer-assets/`;
const IMAGES_DIR = `${CACHE_DIR}images/`;
const AUDIO_DIR = `${CACHE_DIR}audio/`;

export interface SyncResult {
  partialAdded: string[];
  partialRemoved: string[];
  cachedAdded: string[];
  cachedRemoved: string[];
  quotaAdjustmentMB: number;
}

class SyncService {
  /**
   * Get actual file size on disk (in MB)
   * Returns null if file doesn't exist
   */
  private async getFileSizeMB(fileUri: string): Promise<number | null> {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && info.size) {
        return info.size / (1024 * 1024);
      }
      return null;
    } catch (error) {
      console.error(`Failed to get file size for ${fileUri}:`, error);
      return null;
    }
  }

  /**
   * Check if a file exists on disk
   */
  private async fileExists(fileUri: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      return info.exists;
    } catch {
      return false;
    }
  }

  /**
   * Get all local audio files with their actual sizes
   */
  private async getLocalAudioFiles(): Promise<Map<string, number>> {
    const localFiles = new Map<string, number>();

    try {
      const audioInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
      if (!audioInfo.exists) {
        return localFiles;
      }

      const files = await FileSystem.readDirectoryAsync(AUDIO_DIR);
      for (const file of files) {
        if (file.endsWith('.mp3')) {
          const assetId = file.replace('.mp3', '');
          const filePath = `${AUDIO_DIR}${file}`;
          const sizeMB = await this.getFileSizeMB(filePath);

          if (sizeMB !== null) {
            localFiles.set(assetId, sizeMB);
          }
        }
      }
    } catch (error) {
      console.error('Failed to scan local audio files:', error);
    }

    return localFiles;
  }

  /**
   * Get all local image files with their actual sizes
   */
  private async getLocalImageFiles(): Promise<Map<string, number>> {
    const localFiles = new Map<string, number>();

    try {
      const imageInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
      if (!imageInfo.exists) {
        return localFiles;
      }

      const files = await FileSystem.readDirectoryAsync(IMAGES_DIR);
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.png')) {
          const assetId = file.replace(/\.(jpg|png)$/, '');
          const filePath = `${IMAGES_DIR}${file}`;
          const sizeMB = await this.getFileSizeMB(filePath);

          if (sizeMB !== null) {
            localFiles.set(assetId, sizeMB);
          }
        }
      }
    } catch (error) {
      console.error('Failed to scan local image files:', error);
    }

    return localFiles;
  }

  /**
   * Get all resume data from AsyncStorage
   */
  private async getResumeData(): Promise<Map<string, any>> {
    const resumeData = new Map<string, any>();

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const resumeKeys = allKeys.filter((key) => key.startsWith('download_resume_'));

      for (const key of resumeKeys) {
        const assetId = key.replace('download_resume_', '');
        const dataStr = await AsyncStorage.getItem(key);

        if (dataStr) {
          try {
            resumeData.set(assetId, JSON.parse(dataStr));
          } catch {
            // Invalid resume data, skip it
          }
        }
      }
    } catch (error) {
      console.error('Failed to load resume data:', error);
    }

    return resumeData;
  }

  /**
   * Sync local storage with Firebase
   * Makes local storage the source of truth
   */
  async syncWithFirebase(): Promise<SyncResult> {
    const result: SyncResult = {
      partialAdded: [],
      partialRemoved: [],
      cachedAdded: [],
      cachedRemoved: [],
      quotaAdjustmentMB: 0,
    };

    const { user } = useAuthStore.getState();
    if (!user) {
      console.log('No user authenticated, skipping sync');
      return result;
    }

    console.log('Starting sync...');

    try {
      // Get local state
      const localAudioFiles = await this.getLocalAudioFiles();
      const localImageFiles = await this.getLocalImageFiles();
      const resumeData = await this.getResumeData();

      // Get Firebase state
      const firebasePartials = user.partialDownloads || {};
      const firebaseCached = user.cachedAssets || [];

      // Process audio files
      for (const [assetId, fileSizeMB] of localAudioFiles.entries()) {
        const hasResumeData = resumeData.has(assetId);
        const isInFirebasePartials = firebasePartials[assetId] !== undefined;
        const isInFirebaseCached = firebaseCached.includes(assetId);

        if (hasResumeData) {
          // Partial download - verify it's in Firebase partials
          if (!isInFirebasePartials) {
            // Add to Firebase partials + charge quota
            result.partialAdded.push(assetId);
            result.quotaAdjustmentMB += fileSizeMB;
          } else if (firebasePartials[assetId] !== fileSizeMB) {
            // Size mismatch - update to actual size
            const diff = fileSizeMB - firebasePartials[assetId];
            result.quotaAdjustmentMB += diff;
          }

          // If it's also in cached, remove from cached
          if (isInFirebaseCached) {
            result.cachedRemoved.push(assetId);
          }
        } else {
          // Complete download - verify it's in Firebase cached
          if (!isInFirebaseCached) {
            // Add to Firebase cached + charge quota
            result.cachedAdded.push(assetId);
            result.quotaAdjustmentMB += fileSizeMB;
          }

          // If it's in partials, remove from partials (already charged)
          if (isInFirebasePartials) {
            result.partialRemoved.push(assetId);
            // Don't charge again - already charged as partial
            result.quotaAdjustmentMB -= firebasePartials[assetId];
          }
        }
      }

      // Process image files (always treated as complete downloads)
      for (const [rawAssetId, fileSizeMB] of localImageFiles.entries()) {
        // Images are stored with "_image" suffix in Firebase
        const assetId = `${rawAssetId}_image`;
        const isInFirebaseCached = firebaseCached.includes(assetId);

        if (!isInFirebaseCached) {
          result.cachedAdded.push(assetId);
          result.quotaAdjustmentMB += fileSizeMB;
        }
      }

      // Remove Firebase partials that don't exist locally
      for (const assetId of Object.keys(firebasePartials)) {
        const hasLocalFile = localAudioFiles.has(assetId);
        const hasResumeData = resumeData.has(assetId);

        if (!hasLocalFile || !hasResumeData) {
          result.partialRemoved.push(assetId);
          // No quota adjustment - user lost access to what they paid for
        }
      }

      // Remove Firebase cached that don't exist locally
      for (const assetId of firebaseCached) {
        const isImage = assetId.endsWith('_image');
        const rawAssetId = isImage ? assetId.replace('_image', '') : assetId;

        let hasLocalFile = false;
        if (isImage) {
          hasLocalFile = localImageFiles.has(rawAssetId);
        } else {
          hasLocalFile = localAudioFiles.has(rawAssetId) && !resumeData.has(rawAssetId);
        }

        if (!hasLocalFile) {
          result.cachedRemoved.push(assetId);
          // No quota adjustment - user lost access to what they paid for
        }
      }

      // Apply changes to Firebase
      if (this.hasSyncChanges(result)) {
        await this.applySyncToFirebase(result, user.verificationCode);
        console.log('Sync complete:', result);
      } else {
        console.log('No sync changes needed');
      }

      return result;
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }

  /**
   * Check if sync has any changes
   */
  private hasSyncChanges(result: SyncResult): boolean {
    return (
      result.partialAdded.length > 0 ||
      result.partialRemoved.length > 0 ||
      result.cachedAdded.length > 0 ||
      result.cachedRemoved.length > 0 ||
      result.quotaAdjustmentMB !== 0
    );
  }

  /**
   * Apply sync changes to Firebase
   */
  private async applySyncToFirebase(result: SyncResult, verificationCode: string): Promise<void> {
    const { user } = useAuthStore.getState();
    if (!user) return;

    const userRef = usersRef().child(verificationCode);

    try {
      // Update quota
      if (result.quotaAdjustmentMB !== 0) {
        const newQuotaUsedMB = Math.max(0, user.quotaUsedMB + result.quotaAdjustmentMB);
        await userRef.child('quotaUsedMB').set(newQuotaUsedMB);
        console.log(`Quota adjusted: ${result.quotaAdjustmentMB > 0 ? '+' : ''}${result.quotaAdjustmentMB.toFixed(2)}MB`);
      }

      // Update partials
      const updatedPartials = { ...user.partialDownloads };

      // Add new partials
      for (const assetId of result.partialAdded) {
        const localFiles = await this.getLocalAudioFiles();
        const sizeMB = localFiles.get(assetId);
        if (sizeMB !== undefined) {
          updatedPartials[assetId] = sizeMB;
        }
      }

      // Remove deleted partials
      for (const assetId of result.partialRemoved) {
        delete updatedPartials[assetId];
      }

      await userRef.child('partialDownloads').set(updatedPartials);

      // Update cached
      let updatedCached = [...user.cachedAssets];

      // Add new cached
      for (const assetId of result.cachedAdded) {
        if (!updatedCached.includes(assetId)) {
          updatedCached.push(assetId);
        }
      }

      // Remove deleted cached
      updatedCached = updatedCached.filter((id) => !result.cachedRemoved.includes(id));

      await userRef.child('cachedAssets').set(updatedCached);

      // Update local state
      const updatedUser = {
        ...user,
        quotaUsedMB: Math.max(0, user.quotaUsedMB + result.quotaAdjustmentMB),
        partialDownloads: updatedPartials,
        cachedAssets: updatedCached,
      };

      await AsyncStorage.setItem('zen-timer-auth', JSON.stringify(updatedUser));
      useAuthStore.setState({ user: updatedUser });
    } catch (error) {
      console.error('Failed to apply sync to Firebase:', error);
      throw error;
    }
  }

  /**
   * Format sync result for user notification
   */
  formatSyncMessage(result: SyncResult): string | null {
    if (!this.hasSyncChanges(result)) {
      return null;
    }

    const parts: string[] = [];
    const totalChanges =
      result.partialAdded.length +
      result.partialRemoved.length +
      result.cachedAdded.length +
      result.cachedRemoved.length;

    if (totalChanges > 0) {
      parts.push(`Synced ${totalChanges} file${totalChanges > 1 ? 's' : ''}`);
    }

    if (result.quotaAdjustmentMB !== 0) {
      const sign = result.quotaAdjustmentMB > 0 ? '+' : '';
      parts.push(`quota ${sign}${result.quotaAdjustmentMB.toFixed(1)}MB`);
    }

    return parts.join(', ');
  }
}

export const syncService = new SyncService();
