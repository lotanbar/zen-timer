import { Audio } from 'expo-av';
import { Platform, NativeModules } from 'react-native';
import { previewPlayer } from './previewPlayer';

const { NativeAudioModule } = NativeModules;

class AudioService {
  private initialized = false;

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

  /**
   * Start meditation timer with native Kotlin audio
   * Handles: ambient playback, bell scheduling, fades - all in Kotlin
   */
  async startMeditationTimer(
    ambientUri: string,
    bellUri: string,
    bellTimes: number[],
    durationSeconds: number
  ): Promise<boolean> {
    if (Platform.OS !== 'android' || !NativeAudioModule) {
      console.error('[AudioService] Native audio only supported on Android');
      return false;
    }

    try {
      await NativeAudioModule.startMeditationTimer(
        ambientUri,
        bellUri,
        bellTimes,
        durationSeconds
      );
      console.log('[AudioService] Meditation timer started (native)');
      return true;
    } catch (error) {
      console.error('[AudioService] Failed to start meditation timer:', error);
      return false;
    }
  }

  /**
   * Pause meditation audio
   */
  async pause(): Promise<void> {
    if (Platform.OS !== 'android' || !NativeAudioModule) return;

    try {
      await NativeAudioModule.pause();
      console.log('[AudioService] Audio paused');
    } catch (error) {
      console.error('[AudioService] Failed to pause audio:', error);
    }
  }

  /**
   * Resume meditation audio
   */
  async resume(): Promise<void> {
    if (Platform.OS !== 'android' || !NativeAudioModule) return;

    try {
      await NativeAudioModule.resume();
      console.log('[AudioService] Audio resumed');
    } catch (error) {
      console.error('[AudioService] Failed to resume audio:', error);
    }
  }

  /**
   * Stop all audio - ambient and bells
   */
  async stopAll(): Promise<void> {
    if (Platform.OS !== 'android' || !NativeAudioModule) return;

    try {
      await NativeAudioModule.stop();
      await NativeAudioModule.cancelBells();
      console.log('[AudioService] All audio stopped');
    } catch (error) {
      console.error('[AudioService] Failed to stop audio:', error);
    }
  }

  // ========== Preview Methods (Selection Screens) ==========
  // These use expo-av for quick preview playback in menus
  // NOT used during actual meditation

  setAmbientAssets(assets: any[]): void {
    previewPlayer.setAmbientAssets(assets);
  }

  setBellAssets(assets: any[]): void {
    previewPlayer.setBellAssets(assets);
  }

  setAssets(ambient: any[], bells: any[]): void {
    previewPlayer.setAmbientAssets(ambient);
    previewPlayer.setBellAssets(bells);
  }

  async previewAmbient(assetId: string, onLoaded?: () => void): Promise<void> {
    return previewPlayer.previewAmbient(assetId, onLoaded);
  }

  async previewBell(assetId: string, onLoaded?: () => void): Promise<void> {
    return previewPlayer.previewBell(assetId, onLoaded);
  }

  async stopPreview(): Promise<void> {
    return previewPlayer.stop();
  }

  isPreviewPlaying(assetId: string): boolean {
    return previewPlayer.isPreviewPlaying(assetId);
  }

  isAmbientPreviewPlaying(): boolean {
    return previewPlayer.isAmbientPreviewPlaying();
  }

  getCurrentPreviewId(): string | null {
    return previewPlayer.getCurrentPreviewId();
  }
}

export const audioService = new AudioService();

// Export debug log access for debugging
export { debugLog } from './debugLogService';
