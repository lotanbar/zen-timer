import { Audio } from 'expo-av';
import { Asset } from '../types';
import { assetCacheService } from './assetCacheService';

const FADE_DURATION = 400;
const FADE_STEPS = 20;

class AudioService {
  private ambientSound: Audio.Sound | null = null;
  private bellSound: Audio.Sound | null = null;
  private previewSound: Audio.Sound | null = null;
  private currentPreviewId: string | null = null;
  private currentAmbientId: string | null = null;
  private initialized = false;

  // Asset registry - populated dynamically
  private ambientAssets: Asset[] = [];
  private bellAssets: Asset[] = [];

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize audio mode:', error);
    }
  }

  setAssets(ambient: Asset[], bells: Asset[]): void {
    this.ambientAssets = ambient;
    this.bellAssets = bells;
  }

  private getAudioUri(assetId: string, type: 'ambient' | 'bell'): string | null {
    const assets = type === 'ambient' ? this.ambientAssets : this.bellAssets;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return null;

    // Try cached version first, fallback to remote
    return assetCacheService.getAudioUri(asset);
  }

  async playAmbient(assetId: string): Promise<void> {
    // Skip if same ambient is already playing
    if (this.currentAmbientId === assetId && this.ambientSound) {
      return;
    }

    try {
      await this.stopAmbient();

      const uri = this.getAudioUri(assetId, 'ambient');
      if (!uri) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { isLooping: true, shouldPlay: true }
      );

      this.ambientSound = sound;
      this.currentAmbientId = assetId;
    } catch (error) {
      console.error('Failed to play ambient sound:', error);
    }
  }

  async stopAmbient(): Promise<void> {
    if (this.ambientSound) {
      try {
        await this.ambientSound.stopAsync();
        await this.ambientSound.unloadAsync();
      } catch (error) {
        console.error('Failed to stop ambient sound:', error);
      } finally {
        this.ambientSound = null;
        this.currentAmbientId = null;
      }
    }
  }

  async playBell(assetId: string): Promise<void> {
    try {
      const uri = this.getAudioUri(assetId, 'bell');
      if (!uri) return;

      if (this.bellSound) {
        try {
          await this.bellSound.unloadAsync();
        } catch {
          // Ignore unload errors
        }
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      this.bellSound = sound;

      // Auto-cleanup after bell finishes (assume max 30 seconds)
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to play bell sound:', error);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([
      this.stopAmbient(),
      this.stopPreview(),
      this.stopBell(),
    ]);
  }

  private async stopBell(): Promise<void> {
    if (this.bellSound) {
      try {
        await this.bellSound.stopAsync();
        await this.bellSound.unloadAsync();
      } catch {
        // Ignore errors
      } finally {
        this.bellSound = null;
      }
    }
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

  private async fadeIn(sound: Audio.Sound): Promise<void> {
    const stepTime = FADE_DURATION / FADE_STEPS;
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

  async stopPreview(): Promise<void> {
    this.currentPreviewId = null;
    if (this.previewSound) {
      const sound = this.previewSound;
      this.previewSound = null;
      try {
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

  // Promote ambient preview to main ambient sound (for seamless transition to timer)
  async promoteAmbientPreview(): Promise<void> {
    if (this.previewSound && this.currentPreviewId) {
      // Move preview to ambient
      this.ambientSound = this.previewSound;
      this.currentAmbientId = this.currentPreviewId;
      this.previewSound = null;
      this.currentPreviewId = null;
    }
  }

  // Stop only bell-related sounds, keep ambient preview playing
  async stopBellPreview(): Promise<void> {
    await this.stopBell();
    // Note: We don't stop ambient preview here
  }

  async previewAmbient(assetId: string): Promise<void> {
    try {
      // If same asset is playing, stop it (toggle behavior)
      if (this.currentPreviewId === assetId) {
        await this.stopPreview();
        return;
      }

      await this.stopPreview();

      const uri = this.getAudioUri(assetId, 'ambient');
      if (!uri) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: true, volume: 0 }
      );

      this.previewSound = sound;
      this.currentPreviewId = assetId;
      await this.fadeIn(sound);
    } catch (error) {
      console.error('Failed to preview ambient sound:', error);
    }
  }

  async previewBell(assetId: string): Promise<void> {
    try {
      await this.stopPreview();

      const uri = this.getAudioUri(assetId, 'bell');
      if (!uri) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      this.previewSound = sound;

      // Auto-cleanup after preview finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.previewSound = null;
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to preview bell sound:', error);
    }
  }
}

export const audioService = new AudioService();
