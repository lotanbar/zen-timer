import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from '../types';
import { useAuthStore } from '../store/authStore';

const CACHE_DIR = `${FileSystem.cacheDirectory}zen-timer-assets/`;
const IMAGES_DIR = `${CACHE_DIR}images/`;
const AUDIO_DIR = `${CACHE_DIR}audio/`;

interface CacheProgress {
  total: number;
  completed: number;
  failed: string[];
}

export interface PartialDownload {
  assetId: string;
  assetName: string;
  downloadedMB: number;
  totalMB: number;
  fileUri: string;
}

class AssetCacheService {
  private imageCache: Map<string, string> = new Map();
  private audioCache: Map<string, string> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      // Ensure cache directories exist
      await this.ensureDirectoryExists(CACHE_DIR);
      await this.ensureDirectoryExists(IMAGES_DIR);
      await this.ensureDirectoryExists(AUDIO_DIR);

      // Load existing cached files into memory map
      await this.loadExistingCache();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize asset cache:', error);
      this.initialized = true; // Continue anyway, will use remote URLs
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
    }
  }

  private async loadExistingCache(): Promise<void> {
    try {
      const imageInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
      if (imageInfo.exists) {
        const imageFiles = await FileSystem.readDirectoryAsync(IMAGES_DIR);
        for (const file of imageFiles) {
          const id = file.replace(/\.[^.]+$/, '');
          this.imageCache.set(id, `${IMAGES_DIR}${file}`);
        }
      }

      const audioInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
      if (audioInfo.exists) {
        const audioFiles = await FileSystem.readDirectoryAsync(AUDIO_DIR);
        for (const file of audioFiles) {
          const id = file.replace(/\.[^.]+$/, '');
          this.audioCache.set(id, `${AUDIO_DIR}${file}`);
        }
      }
    } catch (error) {
      console.error('Failed to load existing cache:', error);
    }
  }

  private getImageExtension(asset: Asset): string {
    return asset.type === 'bell' ? 'png' : 'jpg';
  }

  /**
   * Save resume data for an interrupted download
   */
  private async saveResumeData(assetId: string, resumeData: any): Promise<void> {
    const key = `download_resume_${assetId}`;
    await AsyncStorage.setItem(key, JSON.stringify(resumeData));
  }

  /**
   * Get resume data for a previous interrupted download
   */
  private async getResumeData(assetId: string): Promise<any | null> {
    const key = `download_resume_${assetId}`;
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Delete resume data and partial file for an asset
   */
  async deletePartialDownload(assetId: string): Promise<void> {
    try {
      // Remove resume data
      const key = `download_resume_${assetId}`;
      await AsyncStorage.removeItem(key);

      // Delete partial file if it exists
      const partialPath = `${AUDIO_DIR}${assetId}.mp3`;
      await FileSystem.deleteAsync(partialPath, { idempotent: true });

      // Remove from Firebase partialDownloads
      const { user } = useAuthStore.getState();
      if (user) {
        const updatedPartials = { ...user.partialDownloads };
        delete updatedPartials[assetId];

        // Update Firebase and local state
        const { usersRef } = await import('../config/firebase');
        await usersRef()
          .child(user.verificationCode)
          .child('partialDownloads')
          .set(updatedPartials);

        useAuthStore.setState({
          user: { ...user, partialDownloads: updatedPartials },
        });
      }

      console.log(`Deleted partial download for ${assetId}`);
    } catch (error) {
      console.error('Failed to delete partial download:', error);
    }
  }

  /**
   * Detect partial downloads on startup
   */
  async detectPartialDownloads(): Promise<PartialDownload[]> {
    const partialDownloads: PartialDownload[] = [];

    try {
      // Get all resume data from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      const resumeKeys = allKeys.filter((key) => key.startsWith('download_resume_'));

      for (const key of resumeKeys) {
        const assetId = key.replace('download_resume_', '');
        const resumeDataStr = await AsyncStorage.getItem(key);

        if (resumeDataStr) {
          const resumeData = JSON.parse(resumeDataStr);
          const fileInfo = await FileSystem.getInfoAsync(resumeData.fileUri);

          if (fileInfo.exists && fileInfo.size) {
            const downloadedMB = fileInfo.size / (1024 * 1024);
            const totalMB = (resumeData.totalBytesExpectedToWrite || 0) / (1024 * 1024);

            partialDownloads.push({
              assetId,
              assetName: assetId, // Will be enhanced with actual names later
              downloadedMB,
              totalMB,
              fileUri: resumeData.fileUri,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to detect partial downloads:', error);
    }

    return partialDownloads;
  }

  async cacheImage(asset: Asset): Promise<string | null> {
    await this.init();

    // Step 1: Check if file exists locally
    if (this.imageCache.has(asset.id)) {
      const cachedPath = this.imageCache.get(asset.id)!;
      try {
        const info = await FileSystem.getInfoAsync(cachedPath);
        if (info.exists) {
          // File exists locally, use it
          return cachedPath;
        }
      } catch {
        // File check failed
      }
      this.imageCache.delete(asset.id);
    }

    // Step 2: File doesn't exist locally, check if Firebase thinks we have it
    const imageAssetId = `${asset.id}_image`;
    const { isAssetCached, removeCachedAsset } = useAuthStore.getState();
    if (isAssetCached(imageAssetId)) {
      // Mismatch! Firebase says we have it but we don't
      console.log(`Cache mismatch for ${imageAssetId}: Firebase says cached but file missing. Syncing...`);
      await removeCachedAsset(imageAssetId);
    }

    // Step 3: Download from CDN
    const ext = this.getImageExtension(asset);
    const localPath = `${IMAGES_DIR}${asset.id}.${ext}`;

    try {
      const downloadResult = await FileSystem.downloadAsync(
        asset.imageUrl,
        localPath
      );

      if (downloadResult.status === 200) {
        this.imageCache.set(asset.id, localPath);

        // Step 4: Track bandwidth ONLY AFTER successful download
        try {
          const fileInfo = await FileSystem.getInfoAsync(localPath);
          if (fileInfo.exists && fileInfo.size) {
            const fileSizeMB = fileInfo.size / (1024 * 1024);
            const { trackBandwidth } = useAuthStore.getState();
            // Use image-specific asset ID to avoid conflicts with audio
            // This adds to quota AND marks as cached in Firebase
            await trackBandwidth(imageAssetId, fileSizeMB);
          }
        } catch (error) {
          console.error('Failed to track bandwidth:', error);
          // Don't fail the whole operation if tracking fails
        }

        return localPath;
      }
      return null;
    } catch (error) {
      console.error(`Failed to cache image ${asset.id}:`, error);
      // Download failed - asset will NOT be added to Firebase cachedAssets
      return null;
    }
  }

  async cacheAudio(
    asset: Asset,
    onProgress?: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void
  ): Promise<string | null> {
    await this.init();

    // Step 1: Check if file exists locally and is complete
    if (this.audioCache.has(asset.id)) {
      const cachedPath = this.audioCache.get(asset.id)!;
      try {
        const info = await FileSystem.getInfoAsync(cachedPath);
        if (info.exists) {
          // File exists locally, use it
          return cachedPath;
        }
      } catch {
        // File check failed
      }
      this.audioCache.delete(asset.id);
    }

    // Step 2: File doesn't exist locally, check if Firebase thinks we have it
    const { isAssetCached, removeCachedAsset } = useAuthStore.getState();
    if (isAssetCached(asset.id)) {
      // Mismatch! Firebase says we have it but we don't
      console.log(`Cache mismatch for ${asset.id}: Firebase says cached but file missing. Syncing...`);
      await removeCachedAsset(asset.id);
    }

    // Step 3: Check for existing resume data (partial download)
    const localPath = `${AUDIO_DIR}${asset.id}.mp3`;
    const resumeData = await this.getResumeData(asset.id);

    let downloadResumable: FileSystem.DownloadResumable;

    if (resumeData) {
      // Resume existing download
      console.log(`Resuming download for ${asset.id} from ${resumeData.totalBytesWritten} bytes`);
      downloadResumable = new FileSystem.DownloadResumable(
        resumeData.url,
        resumeData.fileUri,
        resumeData.options,
        (progress) => onProgress?.(progress),
        resumeData.resumeData
      );
    } else {
      // New download
      downloadResumable = FileSystem.createDownloadResumable(
        asset.audioUrl,
        localPath,
        {},
        (progress) => onProgress?.(progress)
      );
    }

    try {
      // Start/resume download
      const result = await downloadResumable.downloadAsync();

      if (!result) {
        throw new Error('Download failed: no result');
      }

      // Download complete - verify file
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (!fileInfo.exists || !fileInfo.size) {
        throw new Error('File verification failed');
      }

      const fileSizeMB = fileInfo.size / (1024 * 1024);

      // Track bandwidth (handles partial downloads automatically)
      const { trackBandwidth } = useAuthStore.getState();
      try {
        await trackBandwidth(asset.id, fileSizeMB);
      } catch (quotaError) {
        // Quota update failed - delete file to prevent free access
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw quotaError;
      }

      // Success - clear resume data and add to cache
      await AsyncStorage.removeItem(`download_resume_${asset.id}`);
      this.audioCache.set(asset.id, result.uri);

      console.log(`Successfully downloaded ${asset.id}: ${fileSizeMB.toFixed(2)}MB`);
      return result.uri;
    } catch (error) {
      // Download interrupted or failed
      console.error(`Download failed for ${asset.id}:`, error);

      try {
        // Save resume data for later
        const savable = await downloadResumable.savable();
        await this.saveResumeData(asset.id, savable);

        // Track partial download bandwidth
        const partialFileInfo = await FileSystem.getInfoAsync(savable.fileUri);
        if (partialFileInfo.exists && partialFileInfo.size) {
          const partialSizeMB = partialFileInfo.size / (1024 * 1024);
          const { trackPartialBandwidth } = useAuthStore.getState();

          console.log(`Tracking partial download: ${partialSizeMB.toFixed(2)}MB for ${asset.id}`);
          await trackPartialBandwidth(asset.id, partialSizeMB);
        }
      } catch (saveError) {
        console.error('Failed to save resume data:', saveError);
      }

      throw error;
    }
  }

  getCachedImagePath(assetId: string): string | null {
    return this.imageCache.get(assetId) ?? null;
  }

  getCachedAudioPath(assetId: string): string | null {
    return this.audioCache.get(assetId) ?? null;
  }

  getImageUri(asset: Asset): string {
    const cached = this.imageCache.get(asset.id);
    return cached ?? asset.imageUrl;
  }

  getAudioUri(asset: Asset): string | null {
    // Handle bundled assets (audioUrl starts with "BUNDLED:")
    if (asset.audioUrl.startsWith('BUNDLED:')) {
      return null; // Signal to use require() in audioService
    }
    const cached = this.audioCache.get(asset.id);
    return cached ?? asset.audioUrl;
  }

  isBundledAudio(asset: Asset): boolean {
    return asset.audioUrl.startsWith('BUNDLED:');
  }

  getBundledAudioKey(asset: Asset): string | null {
    if (!asset.audioUrl.startsWith('BUNDLED:')) return null;
    return asset.audioUrl.replace('BUNDLED:', '');
  }

  async cacheAllImages(
    assets: Asset[],
    onProgress?: (progress: CacheProgress) => void
  ): Promise<CacheProgress> {
    await this.init();

    const progress: CacheProgress = {
      total: assets.length,
      completed: 0,
      failed: [],
    };

    // Cache in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (asset) => {
          const result = await this.cacheImage(asset);
          return { asset, success: result !== null };
        })
      );

      for (const { asset, success } of results) {
        progress.completed++;
        if (!success) {
          progress.failed.push(asset.id);
        }
      }

      onProgress?.(progress);
    }

    return progress;
  }

  async clearCache(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR);
      if (info.exists) {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
      }
      this.imageCache.clear();
      this.audioCache.clear();
      this.initialized = false;
      this.initPromise = null;
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

export const assetCacheService = new AssetCacheService();
