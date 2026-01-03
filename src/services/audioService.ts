import { Audio, AVPlaybackStatus } from 'expo-av';
import { Asset } from '../types';
import { assetCacheService } from './assetCacheService';

const FADE_DURATION = 400;
const FADE_STEPS = 20;

// Path to bundled silent audio for background timer
const SILENCE_AUDIO = require('../../assets/silence.mp3');

type TimerCallback = () => void;

class AudioService {
  private ambientSound: Audio.Sound | null = null;
  private ambientSoundNext: Audio.Sound | null = null; // For crossfade looping
  private bellSounds: Set<Audio.Sound> = new Set();
  private previewSound: Audio.Sound | null = null;
  private timerSound: Audio.Sound | null = null;
  private currentPreviewId: string | null = null;
  private currentAmbientId: string | null = null;
  private initialized = false;
  private isPreparingNextLoop: boolean = false; // Prevent multiple crossfade attempts

  // Request counters to handle race conditions during rapid selection
  private previewRequestId: number = 0;
  private ambientRequestId: number = 0;

  // Timer state
  private timerStartTime: number = 0;
  private timerDurationMs: number = 0;
  private timerCallback: TimerCallback | null = null;
  private timerCompleted: boolean = false;
  private scheduledBellTimes: number[] = [];
  private playedBellTimes: Set<number> = new Set();
  private timerBellId: string | null = null;

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

    const requestId = ++this.ambientRequestId;

    try {
      await this.stopAmbient();

      const uri = this.getAudioUri(assetId, 'ambient');
      if (!uri) return;

      // Note: isLooping doesn't work reliably for streamed remote audio,
      // so we manually handle looping via setOnPlaybackStatusUpdate
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { isLooping: true, shouldPlay: true, volume: 0 }
      );

      // Check if this request is still current (handles rapid selection)
      if (requestId !== this.ambientRequestId) {
        console.log('[Ambient] Stale request, unloading sound');
        sound.setOnPlaybackStatusUpdate(null);
        sound.unloadAsync().catch(() => {});
        return;
      }

      this.ambientSound = sound;
      this.currentAmbientId = assetId;

      // Manual loop fallback: restart when sound finishes (in case isLooping fails for remote audio)
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          console.log('[Ambient] Status update: not loaded', status);
          return;
        }
        if (status.didJustFinish) {
          console.log('[Ambient] didJustFinish, attempting restart...');
          if (this.ambientSound === sound) {
            sound.setPositionAsync(0)
              .then(() => sound.playAsync())
              .then(() => console.log('[Ambient] Restarted successfully'))
              .catch((err) => console.error('[Ambient] Restart failed:', err));
          } else {
            console.log('[Ambient] Sound reference mismatch, skipping restart');
          }
        }
      });

      // Fade in like preview
      this.fadeIn(sound, FADE_DURATION);
    } catch (error) {
      console.error('Failed to play ambient sound:', error);
    }
  }

  async stopAmbient(): Promise<void> {
    this.isPreparingNextLoop = false;

    // Stop main ambient sound
    if (this.ambientSound) {
      const sound = this.ambientSound;
      this.ambientSound = null;
      this.currentAmbientId = null;
      try {
        sound.setOnPlaybackStatusUpdate(null);
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (error) {
        console.error('Failed to stop ambient sound:', error);
      }
    }

    // Also stop any pending next loop sound
    if (this.ambientSoundNext) {
      const nextSound = this.ambientSoundNext;
      this.ambientSoundNext = null;
      try {
        nextSound.setOnPlaybackStatusUpdate(null);
        await nextSound.stopAsync();
        await nextSound.unloadAsync();
      } catch {
        // Ignore
      }
    }
  }

  async fadeOutAmbient(durationMs: number): Promise<void> {
    if (!this.ambientSound) return;

    const steps = 30;
    const stepTime = durationMs / steps;
    const sound = this.ambientSound;

    // Disable loop callback during fadeout
    sound.setOnPlaybackStatusUpdate(null);

    for (let i = steps; i >= 0; i--) {
      if (!this.ambientSound || this.ambientSound !== sound) break;
      try {
        await sound.setVolumeAsync(i / steps);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      } catch {
        break;
      }
    }

    await this.stopAmbient();
  }

  async playBell(assetId: string): Promise<void> {
    try {
      const uri = this.getAudioUri(assetId, 'bell');
      if (!uri) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 0 }
      );

      this.bellSounds.add(sound);

      // Fade in over 2 seconds
      this.fadeIn(sound, 2000);

      // Auto-cleanup after bell finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.bellSounds.delete(sound);
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to play bell sound:', error);
    }
  }

  // Play bell and return its duration, call onComplete when finished
  async playBellWithCompletion(assetId: string, onComplete: () => void): Promise<number> {
    try {
      const uri = this.getAudioUri(assetId, 'bell');
      if (!uri) {
        onComplete();
        return 0;
      }

      const { sound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 0 }
      );

      this.bellSounds.add(sound);
      const durationMs = status.isLoaded ? (status.durationMillis ?? 5000) : 5000;

      // Fade in over 2 seconds
      this.fadeIn(sound, 2000);

      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
          this.bellSounds.delete(sound);
          sound.unloadAsync().catch(() => {});
          onComplete();
        }
      });

      return durationMs;
    } catch (error) {
      console.error('Failed to play bell sound:', error);
      onComplete();
      return 0;
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([
      this.stopAmbient(),
      this.stopPreview(),
      this.stopBell(),
      this.stopTimer(),
    ]);
  }

  private async stopBell(): Promise<void> {
    const sounds = Array.from(this.bellSounds);
    this.bellSounds.clear();

    await Promise.all(
      sounds.map(async (sound) => {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch {
          // Ignore errors
        }
      })
    );
  }

  // Start background timer - uses silent audio to keep callbacks firing
  async startTimer(
    durationSeconds: number,
    bellId: string,
    bellTimes: number[],
    onComplete: TimerCallback
  ): Promise<void> {
    await this.stopTimer();

    this.timerStartTime = Date.now();
    this.timerDurationMs = durationSeconds * 1000;
    this.timerCallback = onComplete;
    this.timerCompleted = false;
    this.scheduledBellTimes = bellTimes;
    this.playedBellTimes = new Set();
    this.timerBellId = bellId;

    try {
      const { sound } = await Audio.Sound.createAsync(
        SILENCE_AUDIO,
        { isLooping: true, shouldPlay: true }
      );

      this.timerSound = sound;

      // This callback fires even in background!
      sound.setOnPlaybackStatusUpdate(this.handleTimerUpdate);
    } catch (error) {
      console.error('Failed to start timer audio:', error);
    }
  }

  private handleTimerUpdate = async (status: AVPlaybackStatus): Promise<void> => {
    if (!status.isLoaded || this.timerCompleted) return;

    const elapsedMs = Date.now() - this.timerStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    // CRITICAL: Monitor ambient sound for looping and recovery
    // The ambient sound's own callback may not fire in background, but this timer callback does
    if (this.ambientSound && this.currentAmbientId) {
      try {
        const ambientStatus = await this.ambientSound.getStatusAsync();
        if (ambientStatus.isLoaded) {
          const position = ambientStatus.positionMillis ?? 0;
          const duration = ambientStatus.durationMillis ?? 0;

          // Seamless loop: pre-load next track, then overlap-swap
          // Phase 1: Pre-load next track 3 seconds before end (paused, ready to go)
          if (duration > 0 && position >= duration - 3000 && !this.ambientSoundNext && !this.isPreparingNextLoop) {
            this.isPreparingNextLoop = true;
            const uri = this.getAudioUri(this.currentAmbientId, 'ambient');
            if (uri) {
              try {
                console.log('[Timer] Pre-loading next loop at', position, '/', duration);
                const { sound: nextSound } = await Audio.Sound.createAsync(
                  { uri },
                  { isLooping: false, shouldPlay: false, volume: 1.0 }
                );
                this.ambientSoundNext = nextSound;
                console.log('[Timer] Next loop pre-loaded and ready');
              } catch (createErr) {
                console.error('[Timer] Failed to pre-load next loop:', createErr);
              }
            }
            this.isPreparingNextLoop = false;
          }

          // Phase 2: Start new sound 500ms before end, let them overlap briefly
          if (duration > 0 && position >= duration - 500 && this.ambientSoundNext) {
            console.log('[Timer] Starting overlap swap at', position, '/', duration);
            const oldSound = this.ambientSound;
            const nextSound = this.ambientSoundNext;

            // Swap references
            this.ambientSound = nextSound;
            this.ambientSoundNext = null;

            // Start new sound and WAIT for it to actually begin playing
            await nextSound.playAsync();

            // Now new sound is playing - instantly mute old sound (no audible overlap)
            if (oldSound) {
              oldSound.setOnPlaybackStatusUpdate(null);
              await oldSound.setVolumeAsync(0);
              // Clean up in background
              oldSound.stopAsync().then(() => oldSound.unloadAsync()).catch(() => {});
            }
            console.log('[Timer] Swap complete');
          }
          // Also restart if stopped unexpectedly
          else if (!ambientStatus.isPlaying && !this.isPreparingNextLoop) {
            console.log('[Timer] Ambient stopped, restarting from position', position);
            await this.ambientSound.setPositionAsync(0);
            await this.ambientSound.playAsync();
            console.log('[Timer] Ambient restarted successfully');
          }
        }
      } catch (err: any) {
        // Native player was destroyed (e.g., screen off killed it)
        // Need to recreate the sound from scratch
        if (err?.code === 'E_AUDIO_NOPLAYER') {
          console.log('[Timer] Native player destroyed, recreating ambient sound...');
          const assetId = this.currentAmbientId;
          // Clear old references
          this.ambientSound = null;
          this.currentAmbientId = null;
          this.isPreparingNextLoop = false;
          // Recreate the sound
          await this.playAmbient(assetId);
          console.log('[Timer] Ambient sound recreated successfully');
        } else {
          console.error('[Timer] Failed to check/restart ambient:', err);
        }
      }
    }

    // Check for intermediate bells
    for (const bellTime of this.scheduledBellTimes) {
      if (elapsedSeconds >= bellTime && !this.playedBellTimes.has(bellTime)) {
        this.playedBellTimes.add(bellTime);
        if (this.timerBellId) {
          this.playBell(this.timerBellId);
        }
        break; // Only play one bell per update to avoid overlap
      }
    }

    // Check for timer completion
    if (elapsedMs >= this.timerDurationMs) {
      this.timerCompleted = true;

      // Save references before stopTimer nullifies them
      const callback = this.timerCallback;
      const bellId = this.timerBellId;

      await this.stopTimer();

      if (bellId) {
        // Play bell and fade out ambient over its duration
        const bellDuration = await this.playBellWithCompletion(bellId, () => {
          if (callback) callback();
        });
        // Fade out ambient over the bell duration
        this.fadeOutAmbient(bellDuration);
      } else {
        await this.stopAmbient();
        if (callback) callback();
      }
    }
  };

  async stopTimer(): Promise<void> {
    this.timerCallback = null;
    this.timerBellId = null;

    if (this.timerSound) {
      try {
        this.timerSound.setOnPlaybackStatusUpdate(null);
        await this.timerSound.stopAsync();
        await this.timerSound.unloadAsync();
      } catch {
        // Ignore errors
      } finally {
        this.timerSound = null;
      }
    }
  }

  isTimerCompleted(): boolean {
    return this.timerCompleted;
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

  private async fadeIn(sound: Audio.Sound, durationMs: number = FADE_DURATION): Promise<void> {
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

  // Fade out a sound and unload it (fire and forget for crossfade cleanup)
  private async fadeOutAndUnload(sound: Audio.Sound, durationMs: number): Promise<void> {
    const steps = 15;
    const stepTime = durationMs / steps;
    try {
      sound.setOnPlaybackStatusUpdate(null);
      for (let i = steps; i >= 0; i--) {
        await sound.setVolumeAsync(i / steps);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      }
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      // Ignore errors during cleanup
    }
  }

  async stopPreview(): Promise<void> {
    this.currentPreviewId = null;
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

  async previewAmbient(assetId: string, onLoaded?: () => void): Promise<void> {
    // If same asset is playing, stop it (toggle behavior)
    if (this.currentPreviewId === assetId) {
      await this.stopPreview();
      onLoaded?.();
      return;
    }

    const requestId = ++this.previewRequestId;

    try {
      await this.stopPreview();

      const uri = this.getAudioUri(assetId, 'ambient');
      if (!uri) {
        onLoaded?.();
        return;
      }

      // Note: isLooping doesn't work reliably for streamed remote audio
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: true, volume: 0 }
      );

      // Check if this request is still current (handles rapid selection)
      if (requestId !== this.previewRequestId) {
        console.log('[Preview] Stale request, unloading sound');
        sound.setOnPlaybackStatusUpdate(null);
        sound.unloadAsync().catch(() => {});
        onLoaded?.();
        return;
      }

      this.previewSound = sound;
      this.currentPreviewId = assetId;

      // Manual loop fallback: restart when sound finishes (in case isLooping fails for remote audio)
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          console.log('[Preview] Status update: not loaded', status);
          return;
        }
        if (status.didJustFinish) {
          console.log('[Preview] didJustFinish, attempting restart...');
          if (this.previewSound === sound) {
            sound.setPositionAsync(0)
              .then(() => sound.playAsync())
              .then(() => console.log('[Preview] Restarted successfully'))
              .catch((err) => console.error('[Preview] Restart failed:', err));
          } else {
            console.log('[Preview] Sound reference mismatch, skipping restart');
          }
        }
      });

      // Data is loaded, clear loading state before fadeIn
      onLoaded?.();

      this.fadeIn(sound);
    } catch (error) {
      console.error('Failed to preview ambient sound:', error);
      onLoaded?.();
    }
  }

  async previewBell(assetId: string, onLoaded?: () => void): Promise<void> {
    const requestId = ++this.previewRequestId;

    try {
      await this.stopPreview();

      const uri = this.getAudioUri(assetId, 'bell');
      if (!uri) {
        onLoaded?.();
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 0 }
      );

      // Check if this request is still current (handles rapid selection)
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
}

export const audioService = new AudioService();
