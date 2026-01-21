import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from '../types';

const CACHE_DIR = `${FileSystem.cacheDirectory}zen-timer-assets/`;
const IMAGES_DIR = `${CACHE_DIR}images/`;
const AUDIO_DIR = `${CACHE_DIR}audio/`;

interface CacheProgress {
  total: number;
  completed: number;
  failed: string[];
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

  async cacheImage(asset: Asset): Promise<string | null> {
    await this.init();

    // Return cached version if exists
    if (this.imageCache.has(asset.id)) {
      const cachedPath = this.imageCache.get(asset.id)!;
      try {
        const info = await FileSystem.getInfoAsync(cachedPath);
        if (info.exists) {
          return cachedPath;
        }
      } catch {
        // File check failed
      }
      this.imageCache.delete(asset.id);
    }

    // Download and cache
    const ext = this.getImageExtension(asset);
    const localPath = `${IMAGES_DIR}${asset.id}.${ext}`;

    try {
      const downloadResult = await FileSystem.downloadAsync(
        asset.imageUrl,
        localPath
      );

      if (downloadResult.status === 200) {
        this.imageCache.set(asset.id, localPath);
        return localPath;
      }
      return null;
    } catch (error) {
      console.error(`Failed to cache image ${asset.id}:`, error);
      return null;
    }
  }

  async cacheAudio(asset: Asset): Promise<string | null> {
    await this.init();

    if (this.audioCache.has(asset.id)) {
      const cachedPath = this.audioCache.get(asset.id)!;
      try {
        const info = await FileSystem.getInfoAsync(cachedPath);
        if (info.exists) {
          return cachedPath;
        }
      } catch {
        // File check failed
      }
      this.audioCache.delete(asset.id);
    }

    const localPath = `${AUDIO_DIR}${asset.id}.mp3`;

    try {
      const downloadResult = await FileSystem.downloadAsync(
        asset.audioUrl,
        localPath
      );

      if (downloadResult.status === 200) {
        this.audioCache.set(asset.id, localPath);
        return localPath;
      }
      return null;
    } catch (error) {
      console.error(`Failed to cache audio ${asset.id}:`, error);
      return null;
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
