import { NativeModules, Platform } from 'react-native';

const { NativeAudioModule } = NativeModules;

class NativeAudioService {
  private isAvailable: boolean;

  constructor() {
    this.isAvailable = Platform.OS === 'android' && NativeAudioModule != null;
  }

  /**
   * Check if native audio is available (Android only)
   */
  available(): boolean {
    return this.isAvailable;
  }

  /**
   * Load and play audio from a URI with automatic looping and fade
   */
  async loadAndPlay(uri: string): Promise<boolean> {
    if (!this.isAvailable) {
      console.warn('[NativeAudio] Not available on this platform');
      return false;
    }

    try {
      await NativeAudioModule.loadAndPlay(uri);
      return true;
    } catch (error) {
      console.error('[NativeAudio] Failed to load and play:', error);
      return false;
    }
  }

  /**
   * Stop playback immediately
   */
  async stop(): Promise<void> {
    if (!this.isAvailable) return;

    try {
      await NativeAudioModule.stop();
    } catch (error) {
      console.error('[NativeAudio] Failed to stop:', error);
    }
  }

  /**
   * Fade out and stop playback
   */
  async fadeOutAndStop(): Promise<void> {
    if (!this.isAvailable) return;

    try {
      await NativeAudioModule.fadeOutAndStop();
    } catch (error) {
      console.error('[NativeAudio] Failed to fade out and stop:', error);
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.isAvailable) return;

    try {
      await NativeAudioModule.pause();
    } catch (error) {
      console.error('[NativeAudio] Failed to pause:', error);
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (!this.isAvailable) return;

    try {
      await NativeAudioModule.resume();
    } catch (error) {
      console.error('[NativeAudio] Failed to resume:', error);
    }
  }

  /**
   * Schedule bells to play at specific times using native AlarmManager
   * This ensures bells fire precisely even when screen is off
   */
  async scheduleBells(bellUri: string, bellTimesSeconds: number[]): Promise<boolean> {
    if (!this.isAvailable) {
      console.warn('[NativeAudio] Bell scheduling not available on this platform');
      return false;
    }

    try {
      await NativeAudioModule.scheduleBells(bellUri, bellTimesSeconds);
      return true;
    } catch (error) {
      console.error('[NativeAudio] Failed to schedule bells:', error);
      return false;
    }
  }

  /**
   * Cancel all scheduled bells
   */
  async cancelBells(): Promise<void> {
    if (!this.isAvailable) return;

    try {
      await NativeAudioModule.cancelBells();
    } catch (error) {
      console.error('[NativeAudio] Failed to cancel bells:', error);
    }
  }
}

export const nativeAudioService = new NativeAudioService();
