import { Audio } from 'expo-av';
import { Asset } from '../types';
import { assetCacheService } from './assetCacheService';

const FADE_DURATION = 400;
const FADE_STEPS = 20;

// Bundled audio assets map
const BUNDLED_AUDIO: { [key: string]: number } = {
  dev_wind: require('../../assets/dev/dev_wind.mp3'),
  dev_frogs: require('../../assets/dev/dev_frogs.mp3'),
};

export class PreviewPlayer {
  private previewSound: Audio.Sound | null = null;
  private currentPreviewId: string | null = null;
  private previewRequestId: number = 0;

  private ambientAssets: Asset[] = [];
  private bellAssets: Asset[] = [];

  setAmbientAssets(assets: Asset[]): void {
    this.ambientAssets = assets;
  }

  setBellAssets(assets: Asset[]): void {
    this.bellAssets = assets;
  }

  private getAudioSource(assetId: string, type: 'ambient' | 'bell'): { uri: string } | number | null {
    const assets = type === 'ambient' ? this.ambientAssets : this.bellAssets;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return null;

    // Check for bundled asset (ambient only)
    if (type === 'ambient' && assetCacheService.isBundledAudio(asset)) {
      const key = assetCacheService.getBundledAudioKey(asset);
      if (key && BUNDLED_AUDIO[key]) {
        return BUNDLED_AUDIO[key];
      }
      return null;
    }

    // Try cached version first, fallback to remote
    const uri = assetCacheService.getAudioUri(asset);
    return uri ? { uri } : null;
  }

  async previewAmbient(assetId: string, onLoaded?: () => void): Promise<void> {
    // If same asset is playing, stop it (toggle behavior)
    if (this.currentPreviewId === assetId) {
      await this.stop();
      onLoaded?.();
      return;
    }

    try {
      await this.stop();
      const requestId = ++this.previewRequestId;

      const source = this.getAudioSource(assetId, 'ambient');
      if (!source) {
        onLoaded?.();
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: true, isLooping: true, volume: 0 }
      );

      // Check if this request is still current
      if (requestId !== this.previewRequestId) {
        console.log('[Preview] Stale request, unloading sound');
        sound.setOnPlaybackStatusUpdate(null);
        sound.unloadAsync().catch(() => {});
        onLoaded?.();
        return;
      }

      this.previewSound = sound;
      this.currentPreviewId = assetId;

      // Manual loop fallback: restart when sound finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          if (this.previewSound === sound) {
            sound.setPositionAsync(0)
              .then(() => sound.playAsync())
              .catch((err) => console.error('[Preview] Restart failed:', err));
          }
        }
      });

      // Data is loaded, clear loading state before fadeIn
      onLoaded?.();

      this.fadeIn(sound, FADE_DURATION);
    } catch (error) {
      console.error('Failed to preview ambient sound:', error);
      onLoaded?.();
    }
  }

  async previewBell(assetId: string, onLoaded?: () => void): Promise<void> {
    try {
      await this.stop();
      const requestId = ++this.previewRequestId;

      const source = this.getAudioSource(assetId, 'bell');
      if (!source) {
        onLoaded?.();
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: true, volume: 0 }
      );

      // Check if this request is still current
      if (requestId !== this.previewRequestId) {
        console.log('[Bell Preview] Stale request, unloading sound');
        sound.setOnPlaybackStatusUpdate(null);
        sound.unloadAsync().catch(() => {});
        onLoaded?.();
        return;
      }

      this.previewSound = sound;

      // Data is loaded, clear loading state before fadeIn
      onLoaded?.();

      // Fade in over 2 seconds
      this.fadeIn(sound, 2000);

      // Auto-cleanup after preview finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.previewSound = null;
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to preview bell sound:', error);
      onLoaded?.();
    }
  }

  async stop(): Promise<void> {
    this.currentPreviewId = null;
    this.previewRequestId++;
    if (this.previewSound) {
      const sound = this.previewSound;
      this.previewSound = null;
      try {
        sound.setOnPlaybackStatusUpdate(null);
        await this.fadeOut(sound);
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  isPreviewPlaying(assetId: string): boolean {
    return this.currentPreviewId === assetId;
  }

  isAmbientPreviewPlaying(): boolean {
    return this.currentPreviewId !== null && this.previewSound !== null;
  }

  getCurrentPreviewId(): string | null {
    return this.currentPreviewId;
  }

  private async fadeOut(sound: Audio.Sound): Promise<void> {
    const stepTime = FADE_DURATION / FADE_STEPS;
    for (let i = FADE_STEPS; i >= 0; i--) {
      try {
        await sound.setVolumeAsync(i / FADE_STEPS);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      } catch {
        break;
      }
    }
  }

  private async fadeIn(sound: Audio.Sound, durationMs: number): Promise<void> {
    const stepTime = durationMs / FADE_STEPS;
    await sound.setVolumeAsync(0);
    for (let i = 0; i <= FADE_STEPS; i++) {
      try {
        await sound.setVolumeAsync(i / FADE_STEPS);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      } catch {
        break;
      }
    }
  }
}

export const previewPlayer = new PreviewPlayer();
