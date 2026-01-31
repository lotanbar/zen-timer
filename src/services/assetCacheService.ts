import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from '../types';
import { useAuthStore } from '../store/authStore';
import { getSignedUrl, getBatchSignedUrls, BatchSignedUrlRequest } from './signedUrlService';

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
  private signedUrlCache: Map<string, { url: string; expires: number }> = new Map();
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
          const filePath = `${IMAGES_DIR}${file}`;
          // Validate image files are at least 1KB
          const info = await FileSystem.getInfoAsync(filePath);
          if (info.exists && info.size && info.size > 1024) {
            const id = file.replace(/\.[^.]+$/, '');
            this.imageCache.set(id, filePath);
          } else {
            // Delete corrupted file
            console.log(`[AssetCache] Removing corrupted image: ${file} (${info.size || 0} bytes)`);
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          }
        }
      }

      const audioInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
      if (audioInfo.exists) {
        const audioFiles = await FileSystem.readDirectoryAsync(AUDIO_DIR);
        for (const file of audioFiles) {
          const filePath = `${AUDIO_DIR}${file}`;
          // Validate audio files are at least 10KB
          const info = await FileSystem.getInfoAsync(filePath);
          if (info.exists && info.size && info.size > 10240) {
            const id = file.replace(/\.[^.]+$/, '');
            this.audioCache.set(id, filePath);
          } else {
            // Delete corrupted file
            console.log(`[AssetCache] Removing corrupted audio: ${file} (${info.size || 0} bytes)`);
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          }
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
   * Get a cached signed URL if available and not expired
   */
  private getCachedSignedUrl(assetId: string, type: 'image' | 'audio'): string | null {
    const key = `${assetId}_${type}`;
    const cached = this.signedUrlCache.get(key);
    if (cached && cached.expires > Date.now() / 1000 + 60) {
      // URL is valid for at least 1 more minute
      return cached.url;
    }
    return null;
  }

  /**
   * Store a signed URL in cache
   */
  private cacheSignedUrl(assetId: string, type: 'image' | 'audio', url: string, expires: number): void {
    const key = `${assetId}_${type}`;
    this.signedUrlCache.set(key, { url, expires });
  }

  /**
   * Prefetch signed URLs for multiple assets in a single batch request
   * Call this when loading a screen with many images
   */
  async prefetchSignedUrls(assets: Asset[], type: 'image' | 'audio' = 'image'): Promise<void> {
    const { user } = useAuthStore.getState();
    if (!user) return;

    // Filter out assets that already have cached signed URLs or local files
    const assetsToFetch = assets.filter((asset) => {
      // Skip if already have valid signed URL
      if (this.getCachedSignedUrl(asset.id, type)) return false;
      // Skip if already cached locally
      if (type === 'image' && this.imageCache.has(asset.id)) return false;
      if (type === 'audio' && this.audioCache.has(asset.id)) return false;
      // Skip bundled assets
      if (asset.imageUrl.startsWith('BUNDLED:') || asset.audioUrl.startsWith('BUNDLED:')) return false;
      return true;
    });

    if (assetsToFetch.length === 0) return;

    try {
      // Build batch request with file paths
      const batchRequest: BatchSignedUrlRequest[] = assetsToFetch.map((asset) => {
        const sourceUrl = type === 'image' ? asset.imageUrl : asset.audioUrl;
        const url = new URL(sourceUrl);
        return {
          assetId: asset.id,
          assetType: type,
          filePath: url.pathname,
        };
      });

      const response = await getBatchSignedUrls(batchRequest, user.verificationCode);

      // Cache all the signed URLs
      for (const result of response.urls) {
        if (result.signedUrl && !result.error) {
          this.cacheSignedUrl(result.assetId, result.assetType as 'image' | 'audio', result.signedUrl, result.expires);
        }
      }

      console.log(`[AssetCache] Prefetched ${response.urls.length} signed URLs`);
    } catch (error) {
      console.error('[AssetCache] Failed to prefetch signed URLs:', error);
    }
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

    // Step 0: Sync before download to ensure consistency
    const { syncWithFirebase } = useAuthStore.getState();
    try {
      await syncWithFirebase();
    } catch (error) {
      console.error('Pre-download sync failed:', error);
      // Continue anyway - sync is best effort
    }

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

    // Step 3: Get signed URL (from cache or Cloud Function)
    const { user } = useAuthStore.getState();
    if (!user) {
      console.error('User not authenticated');
      return null;
    }

    let signedUrl: string | null = this.getCachedSignedUrl(asset.id, 'image');
    if (!signedUrl) {
      try {
        // Extract the actual path from the asset's imageUrl
        const url = new URL(asset.imageUrl);
        const filePath = url.pathname;
        signedUrl = await getSignedUrl(asset.id, 'image', user.verificationCode, filePath);
      } catch (error) {
        console.error(`Failed to get signed URL for ${asset.id}:`, error);
        return null;
      }
    }

    // Step 4: Download from CDN using signed URL
    const ext = this.getImageExtension(asset);
    const localPath = `${IMAGES_DIR}${asset.id}.${ext}`;

    try {
      const downloadResult = await FileSystem.downloadAsync(signedUrl, localPath);

      if (downloadResult.status === 200) {
        this.imageCache.set(asset.id, localPath);

        // Step 5: Track bandwidth ONLY AFTER successful download
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

    // Step 0: Sync before download to ensure consistency
    const { syncWithFirebase } = useAuthStore.getState();
    try {
      await syncWithFirebase();
    } catch (error) {
      console.error('Pre-download sync failed:', error);
      // Continue anyway - sync is best effort
    }

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
    const { isAssetCached, removeCachedAsset, user } = useAuthStore.getState();
    if (isAssetCached(asset.id)) {
      // Mismatch! Firebase says we have it but we don't
      console.log(`Cache mismatch for ${asset.id}: Firebase says cached but file missing. Syncing...`);
      await removeCachedAsset(asset.id);
    }

    if (!user) {
      console.error('User not authenticated');
      return null;
    }

    // Step 3: Get signed URL from Cloud Function
    let signedUrl: string;
    try {
      // Extract the actual path from the asset's audioUrl
      const url = new URL(asset.audioUrl);
      const filePath = url.pathname;
      signedUrl = await getSignedUrl(asset.id, 'audio', user.verificationCode, filePath);
    } catch (error) {
      console.error(`Failed to get signed URL for ${asset.id}:`, error);
      throw error;
    }

    // Step 4: Check for existing resume data (partial download)
    const localPath = `${AUDIO_DIR}${asset.id}.mp3`;
    const resumeData = await this.getResumeData(asset.id);

    let downloadResumable: FileSystem.DownloadResumable;

    if (resumeData) {
      // Resume existing download with NEW signed URL
      console.log(`Resuming download for ${asset.id} from ${resumeData.totalBytesWritten} bytes`);
      downloadResumable = new FileSystem.DownloadResumable(
        signedUrl, // Use new signed URL
        resumeData.fileUri,
        resumeData.options,
        (progress) => onProgress?.(progress),
        resumeData.resumeData
      );
    } else {
      // New download
      downloadResumable = FileSystem.createDownloadResumable(
        signedUrl,
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

      // Download complete - verify file exists and has reasonable size
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (!fileInfo.exists || !fileInfo.size) {
        throw new Error('File verification failed: file does not exist');
      }

      // Audio files must be at least 10KB (10240 bytes) to be valid
      // Smaller files are likely error pages from failed CDN requests
      if (fileInfo.size < 10240) {
        console.error(`[AssetCache] Downloaded file too small: ${fileInfo.size} bytes (expected > 10KB)`);
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error(`File verification failed: downloaded file too small (${fileInfo.size} bytes)`);
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

      // Sync after successful download
      try {
        await syncWithFirebase();
      } catch (error) {
        console.error('Post-download sync failed:', error);
        // Don't fail the download if sync fails
      }

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
    const cached = this.audioCache.get(assetId);
    if (!cached) return null;

    // Validate file exists and is reasonable size (> 10KB for audio)
    // This is synchronous check - we rely on loadExistingCache having validated
    // If file was deleted externally, we'll catch it on next init
    return cached;
  }

  /**
   * Async version that validates file exists and has valid size
   */
  async getValidatedAudioPath(assetId: string): Promise<string | null> {
    const cached = this.audioCache.get(assetId);
    if (!cached) return null;

    try {
      const info = await FileSystem.getInfoAsync(cached);
      // Audio files should be at least 10KB (10240 bytes)
      if (info.exists && info.size && info.size > 10240) {
        return cached;
      }
      // File is missing or corrupted - remove from cache
      console.log(`[AssetCache] Removing invalid audio cache entry: ${assetId} (size: ${info.size || 0})`);
      this.audioCache.delete(assetId);
      return null;
    } catch {
      this.audioCache.delete(assetId);
      return null;
    }
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
