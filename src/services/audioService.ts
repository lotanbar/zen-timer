import { Audio, AVPlaybackStatus } from 'expo-av';
import { Asset as ExpoAsset } from 'expo-asset';
import { Asset } from '../types';
import { assetCacheService } from './assetCacheService';
import { debugLog } from './debugLogService';

const FADE_DURATION = 400;
const FADE_STEPS = 20;

// Loop transition settings
const LOOP_FADE_OUT_DURATION = 10000;  // 10 seconds fade out
const LOOP_SILENCE_DURATION = 3000;    // 3 seconds silence
const LOOP_FADE_IN_DURATION = 10000;   // 10 seconds fade in

// Path to bundled silent audio for background timer
const SILENCE_AUDIO = require('../../assets/silence.mp3');

type TimerCallback = () => void;

class AudioService {
  // Single ambient sound instance
  private ambientSound: Audio.Sound | null = null;
  private currentAmbientId: string | null = null;
  private ambientDurationMs: number = 0;
  private loopTimeoutId: NodeJS.Timeout | null = null;
  private isLooping: boolean = false;
  private isAmbientPaused: boolean = false;

  private bellSounds: Set<Audio.Sound> = new Set();
  private previewSound: Audio.Sound | null = null;
  private timerSound: Audio.Sound | null = null;
  private currentPreviewId: string | null = null;
  private initialized = false;

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

  // BACKUP: JS interval as fallback monitor (in case expo-av callbacks stop)
  private backupIntervalId: NodeJS.Timeout | null = null;
  private lastCallbackTime: number = 0;

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

  // Bundled audio assets map (for assets that ship with the app)
  private bundledAudio: { [key: string]: number } = {};

  // Cache for extracted bundled asset URIs
  private bundledAssetUris: Map<string, string> = new Map();

  private getAudioSource(assetId: string, type: 'ambient' | 'bell'): { uri: string } | number | null {
    const assets = type === 'ambient' ? this.ambientAssets : this.bellAssets;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return null;

    // Check for bundled asset
    if (assetCacheService.isBundledAudio(asset)) {
      const key = assetCacheService.getBundledAudioKey(asset);
      if (key && this.bundledAudio[key]) {
        return this.bundledAudio[key];
      }
      return null;
    }

    // Try cached version first, fallback to remote
    const uri = assetCacheService.getAudioUri(asset);
    return uri ? { uri } : null;
  }

  async playAmbient(assetId: string): Promise<boolean> {
    debugLog.log('Ambient', `🎬 playAmbient: ${assetId}`);

    // Skip if same ambient is already playing
    if (this.currentAmbientId === assetId && this.ambientSound) {
      return true;
    }

    const requestId = ++this.ambientRequestId;

    try {
      await this.stopAmbient();

      const source = this.getAudioSource(assetId, 'ambient');
      if (!source) {
        debugLog.log('Ambient', '❌ No source found');
        return false;
      }

      debugLog.log('Ambient', `📍 Loading ambient sound...`);

      const { sound, status } = await Audio.Sound.createAsync(
        source,
        { isLooping: false, shouldPlay: true, volume: 0 }
      );

      // Check if this request is still current (handles rapid selection)
      if (requestId !== this.ambientRequestId) {
        sound.unloadAsync().catch(() => {});
        return false;
      }

      this.ambientSound = sound;
      this.currentAmbientId = assetId;
      this.ambientDurationMs = (status as any).durationMillis ?? 0;
      this.isLooping = true;

      debugLog.log('Ambient', `✅ Loaded | duration=${Math.round(this.ambientDurationMs / 1000)}s`);

      // Fade in
      await this.fadeIn(sound, FADE_DURATION);

      // Schedule the loop transition
      this.scheduleLoopTransition();

      return true;
    } catch (error) {
      debugLog.log('Ambient', `❌ Failed: ${error}`);
      return false;
    }
  }

  private scheduleLoopTransition(): void {
    this.clearLoopTimeout();

    if (!this.ambientSound || !this.isLooping || this.ambientDurationMs <= 0) return;

    // Schedule fade-out to start 10 seconds before track ends
    const fadeOutStartTime = Math.max(0, this.ambientDurationMs - LOOP_FADE_OUT_DURATION);

    debugLog.log('Ambient', `⏰ Scheduling loop transition in ${Math.round(fadeOutStartTime / 1000)}s`);

    this.loopTimeoutId = setTimeout(() => {
      this.performLoopTransition();
    }, fadeOutStartTime);
  }

  private async performLoopTransition(): Promise<void> {
    if (!this.ambientSound || !this.isLooping || this.isAmbientPaused) return;

    debugLog.log('Ambient', `🔄 Starting loop transition: fade out`);

    try {
      // 1. Fade out over 10 seconds
      await this.fadeOutGradual(this.ambientSound, LOOP_FADE_OUT_DURATION);

      if (!this.isLooping || this.isAmbientPaused) return;

      // 2. Pause during silence
      await this.ambientSound.pauseAsync();
      debugLog.log('Ambient', `🔇 Silence period (${LOOP_SILENCE_DURATION / 1000}s)`);

      // 3. Wait for silence period
      await new Promise(resolve => setTimeout(resolve, LOOP_SILENCE_DURATION));

      if (!this.isLooping || this.isAmbientPaused) return;

      // 4. Seek to beginning and start playing
      await this.ambientSound.setPositionAsync(0);
      await this.ambientSound.playAsync();

      // 5. Fade in over 10 seconds
      debugLog.log('Ambient', `🔊 Fade in`);
      await this.fadeInGradual(this.ambientSound, LOOP_FADE_IN_DURATION);

      if (!this.isLooping) return;

      // 6. Schedule next loop
      debugLog.log('Ambient', `✅ Loop complete, scheduling next`);
      this.scheduleLoopTransition();
    } catch (error) {
      debugLog.log('Ambient', `❌ Loop transition error: ${error}`);
      // Try to recover by restarting
      if (this.isLooping && this.currentAmbientId) {
        const assetId = this.currentAmbientId;
        await this.stopAmbient();
        await this.playAmbient(assetId);
      }
    }
  }

  private async fadeOutGradual(sound: Audio.Sound, durationMs: number): Promise<void> {
    const steps = 30;
    const stepTime = durationMs / steps;

    for (let i = steps; i >= 0; i--) {
      if (!this.isLooping) break;
      try {
        await sound.setVolumeAsync(i / steps);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      } catch {
        break;
      }
    }
  }

  private async fadeInGradual(sound: Audio.Sound, durationMs: number): Promise<void> {
    const steps = 30;
    const stepTime = durationMs / steps;

    for (let i = 0; i <= steps; i++) {
      if (!this.isLooping) break;
      try {
        await sound.setVolumeAsync(i / steps);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      } catch {
        break;
      }
    }
  }

  private clearLoopTimeout(): void {
    if (this.loopTimeoutId) {
      clearTimeout(this.loopTimeoutId);
      this.loopTimeoutId = null;
    }
  }

  async stopAmbient(): Promise<void> {
    this.isLooping = false;
    this.isAmbientPaused = false;
    this.currentAmbientId = null;
    this.ambientDurationMs = 0;
    this.clearLoopTimeout();

    if (this.ambientSound) {
      try {
        await this.ambientSound.stopAsync();
        await this.ambientSound.unloadAsync();
      } catch {
        // Ignore errors during cleanup
      }
      this.ambientSound = null;
    }
  }

  async fadeOutAmbient(durationMs: number): Promise<void> {
    this.isLooping = false;
    this.clearLoopTimeout();

    if (!this.ambientSound) return;

    const steps = 30;
    const stepTime = durationMs / steps;

    for (let i = steps; i >= 0; i--) {
      try {
        await this.ambientSound.setVolumeAsync(i / steps);
        await new Promise(resolve => setTimeout(resolve, stepTime));
      } catch {
        break;
      }
    }

    await this.stopAmbient();
  }

  async pauseAmbient(): Promise<void> {
    this.isAmbientPaused = true;
    this.clearLoopTimeout();

    if (this.ambientSound) {
      try {
        await this.ambientSound.pauseAsync();
        debugLog.log('Ambient', '⏸️ Paused');
      } catch (error) {
        debugLog.log('Ambient', `❌ Failed to pause: ${error}`);
      }
    }
  }

  async resumeAmbient(): Promise<void> {
    this.isAmbientPaused = false;

    if (this.ambientSound) {
      try {
        await this.ambientSound.playAsync();
        debugLog.log('Ambient', '▶️ Resumed');
        // Reschedule loop based on current position
        const status = await this.ambientSound.getStatusAsync();
        if (status.isLoaded) {
          const position = status.positionMillis ?? 0;
          const remaining = this.ambientDurationMs - position;
          const fadeOutStartIn = Math.max(0, remaining - LOOP_FADE_OUT_DURATION);

          this.clearLoopTimeout();
          this.loopTimeoutId = setTimeout(() => {
            this.performLoopTransition();
          }, fadeOutStartIn);

          debugLog.log('Ambient', `⏰ Rescheduled loop in ${Math.round(fadeOutStartIn / 1000)}s`);
        }
      } catch (error) {
        debugLog.log('Ambient', `❌ Failed to resume: ${error}`);
      }
    }
  }

  async playBell(assetId: string): Promise<void> {
    try {
      const source = this.getAudioSource(assetId, 'bell');
      if (!source) return;

      const { sound } = await Audio.Sound.createAsync(
        source,
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
      const source = this.getAudioSource(assetId, 'bell');
      if (!source) {
        onComplete();
        return 0;
      }

      const { sound, status } = await Audio.Sound.createAsync(
        source,
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
    debugLog.log('Timer', `🚀 startTimer | duration=${durationSeconds}s | bellId=${bellId} | bellTimes=${JSON.stringify(bellTimes)}`);

    await this.stopTimer();

    this.timerStartTime = Date.now();
    this.timerDurationMs = durationSeconds * 1000;
    this.timerCallback = onComplete;
    this.timerCompleted = false;
    this.scheduledBellTimes = bellTimes;
    this.playedBellTimes = new Set();
    this.timerBellId = bellId;
    this.lastCallbackTime = Date.now();

    try {
      debugLog.log('Timer', '🔇 Creating silent audio for background callbacks...');
      const { sound } = await Audio.Sound.createAsync(
        SILENCE_AUDIO,
        { isLooping: true, shouldPlay: true }
      );

      this.timerSound = sound;
      debugLog.log('Timer', '✅ Silent audio started, expo-av callbacks active');

      // This callback fires even in background!
      sound.setOnPlaybackStatusUpdate(this.handleTimerUpdate);

      // BACKUP: Start JS interval as secondary monitor
      this.startBackupMonitor();
    } catch (error) {
      debugLog.log('Timer', `❌ Failed to start timer audio: ${error}`);
    }
  }

  // Backup JS interval that runs independently of expo-av
  private startBackupMonitor(): void {
    this.stopBackupMonitor();

    debugLog.log('Backup', '🛡️ Starting backup JS interval monitor (every 3s)');

    this.backupIntervalId = setInterval(async () => {
      if (this.timerCompleted) return;

      const now = Date.now();
      const timeSinceLastCallback = now - this.lastCallbackTime;
      const elapsedSeconds = Math.floor((now - this.timerStartTime) / 1000);

      // If expo-av callback hasn't fired in 5+ seconds, something is wrong
      if (timeSinceLastCallback > 5000) {
        debugLog.log('Backup', `⚠️ CALLBACK STALL DETECTED! Last callback ${Math.round(timeSinceLastCallback / 1000)}s ago | elapsed=${elapsedSeconds}s`);

        // Try to restart the timer sound
        if (this.timerSound) {
          try {
            const status = await this.timerSound.getStatusAsync();
            debugLog.log('Backup', `Timer sound status: isLoaded=${status.isLoaded} isPlaying=${(status as any).isPlaying}`);

            if (status.isLoaded && !(status as any).isPlaying) {
              debugLog.log('Backup', '🔧 Timer sound stopped, restarting...');
              await this.timerSound.playAsync();
              debugLog.log('Backup', '✅ Timer sound restarted');
            }
          } catch (err) {
            debugLog.log('Backup', `❌ Failed to check/restart timer: ${err}`);
          }
        }

        // Check ambient sound
        await this.checkAndRestartAmbient('Backup');
      }

      // Periodic ambient check
      if (this.ambientSound && this.currentAmbientId && !this.isAmbientPaused) {
        try {
          const ambientStatus = await this.ambientSound.getStatusAsync();
          if (ambientStatus.isLoaded && !(ambientStatus as any).isPlaying && this.isLooping) {
            debugLog.log('Backup', `⚠️ Ambient not playing (backup check)`);
            await this.checkAndRestartAmbient('Backup-Periodic');
          }
        } catch (err) {
          debugLog.log('Backup', `⚠️ Ambient check failed: ${err}`);
        }
      }
    }, 3000);
  }

  private stopBackupMonitor(): void {
    if (this.backupIntervalId) {
      clearInterval(this.backupIntervalId);
      this.backupIntervalId = null;
      debugLog.log('Backup', '🛑 Backup monitor stopped');
    }
  }

  // Shared method to check and restart ambient sound
  private async checkAndRestartAmbient(source: string): Promise<void> {
    if (!this.ambientSound || !this.currentAmbientId || this.isAmbientPaused) return;

    try {
      const status = await this.ambientSound.getStatusAsync();
      if (!status.isLoaded) {
        debugLog.log(source, '⚠️ Ambient not loaded, recreating...');
        const assetId = this.currentAmbientId;
        await this.stopAmbient();
        await this.playAmbient(assetId);
        return;
      }

      if (!(status as any).isPlaying && this.isLooping) {
        debugLog.log(source, `🔧 Ambient stopped, restarting...`);
        await this.ambientSound.setPositionAsync(0);
        await this.ambientSound.playAsync();
        await this.ambientSound.setVolumeAsync(1);
        this.scheduleLoopTransition();
        debugLog.log(source, '✅ Ambient restarted');
      }
    } catch (err: any) {
      if (err?.code === 'E_AUDIO_NOPLAYER') {
        debugLog.log(source, '🔧 Native player destroyed, recreating...');
        const assetId = this.currentAmbientId;
        await this.stopAmbient();
        await this.playAmbient(assetId);
      } else {
        debugLog.log(source, `❌ Failed to restart ambient: ${err}`);
      }
    }
  }

  private handleTimerUpdate = async (status: AVPlaybackStatus): Promise<void> => {
    // Track that callback fired (for backup monitor)
    this.lastCallbackTime = Date.now();

    if (!status.isLoaded) return;
    if (this.timerCompleted) return;

    const elapsedMs = Date.now() - this.timerStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

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
    debugLog.log('Timer', '🛑 stopTimer called');
    this.timerCallback = null;
    this.timerBellId = null;

    // Stop backup monitor
    this.stopBackupMonitor();

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

    // Flush logs to disk
    debugLog.forceFlush();
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

  async stopPreview(): Promise<void> {
    this.currentPreviewId = null;
    this.previewRequestId++; // Invalidate any in-flight preview loads
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

  // Stop only bell-related sounds, keep ambient preview playing
  async stopBellPreview(): Promise<void> {
    await this.stopBell();
  }

  async previewAmbient(assetId: string, onLoaded?: () => void): Promise<void> {
    // If same asset is playing, stop it (toggle behavior)
    if (this.currentPreviewId === assetId) {
      await this.stopPreview();
      onLoaded?.();
      return;
    }

    try {
      await this.stopPreview();
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

      this.fadeIn(sound);
    } catch (error) {
      console.error('Failed to preview ambient sound:', error);
      onLoaded?.();
    }
  }

  async previewBell(assetId: string, onLoaded?: () => void): Promise<void> {
    try {
      await this.stopPreview();
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

// Export debug log access for debugging
export { debugLog } from './debugLogService';
