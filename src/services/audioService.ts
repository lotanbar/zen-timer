import { Audio, AVPlaybackStatus } from 'expo-av';
import { Asset } from '../types';
import { assetCacheService } from './assetCacheService';
import { debugLog } from './debugLogService';

const FADE_DURATION = 400;
const FADE_STEPS = 20;

// Path to bundled silent audio for background timer
const SILENCE_AUDIO = require('../../assets/silence.mp3');

// DEBUG: 5-second test loop for diagnosing looping issues
const TEST_LOOP_5S = require('../../assets/test_loop_5s.mp3');

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

  private getAudioUri(assetId: string, type: 'ambient' | 'bell'): string | number | null {
    // Special case: bundled test track
    if (assetId === 'debug_test_5s') {
      console.log('[AudioService] 🔧 Using bundled 5-second test track');
      return TEST_LOOP_5S;
    }

    const assets = type === 'ambient' ? this.ambientAssets : this.bellAssets;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return null;

    // Try cached version first, fallback to remote
    return assetCacheService.getAudioUri(asset);
  }

  async playAmbient(assetId: string): Promise<void> {
    debugLog.log('Ambient', `🎬 playAmbient: ${assetId}`);

    // Skip if same ambient is already playing
    if (this.currentAmbientId === assetId && this.ambientSound) {
      return;
    }

    const requestId = ++this.ambientRequestId;

    try {
      await this.stopAmbient();

      const source = this.getAudioUri(assetId, 'ambient');
      if (!source) {
        debugLog.log('Ambient', '❌ No URI found');
        return;
      }
      const isBundled = typeof source === 'number';
      debugLog.log('Ambient', `📍 Loading: ${isBundled ? 'BUNDLED' : 'STREAM'}`);

      // Note: isLooping doesn't work reliably for streamed remote audio,
      // so we manually handle looping via setOnPlaybackStatusUpdate
      const { sound, status } = await Audio.Sound.createAsync(
        isBundled ? source : { uri: source },
        { isLooping: true, shouldPlay: true, volume: 0 }
      );

      const loadedStatus = status as any;
      debugLog.log('Ambient', `✅ Created | duration=${loadedStatus.durationMillis ? Math.round(loadedStatus.durationMillis/1000) + 's' : '?'}`);

      // Check if this request is still current (handles rapid selection)
      if (requestId !== this.ambientRequestId) {
        sound.setOnPlaybackStatusUpdate(null);
        sound.unloadAsync().catch(() => {});
        return;
      }

      this.ambientSound = sound;
      this.currentAmbientId = assetId;

      // Manual loop fallback: restart when sound finishes (in case isLooping fails for remote audio)
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          debugLog.log('Ambient', '⚠️ Callback: not loaded');
          return;
        }

        const pos = (status as any).positionMillis ?? 0;
        const dur = (status as any).durationMillis ?? 0;

        if (status.didJustFinish) {
          debugLog.log('Ambient', `🏁 didJustFinish! pos=${Math.round(pos/1000)}s / dur=${Math.round(dur/1000)}s`);
          if (this.ambientSound === sound) {
            debugLog.log('Ambient', '🔄 Restarting from callback...');
            sound.setPositionAsync(0)
              .then(() => sound.playAsync())
              .then(() => debugLog.log('Ambient', '✅ Restarted from callback'))
              .catch((err) => debugLog.log('Ambient', `❌ Callback restart failed: ${err}`));
          }
        }
      });

      // Fade in
      this.fadeIn(sound, FADE_DURATION);
    } catch (error) {
      debugLog.log('Ambient', `❌ Failed: ${error}`);
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
    debugLog.log('Timer', `🚀 startTimer | duration=${durationSeconds}s | bellId=${bellId} | bellTimes=${JSON.stringify(bellTimes)}`);
    debugLog.log('Timer', `📊 State: ambientSound=${!!this.ambientSound} | ambientId=${this.currentAmbientId}`);

    await this.stopTimer();

    this.timerStartTime = Date.now();
    this.timerDurationMs = durationSeconds * 1000;
    this.timerCallback = onComplete;
    this.timerCompleted = false;
    this.scheduledBellTimes = bellTimes;
    this.playedBellTimes = new Set();
    this.timerBellId = bellId;
    this.ambientCheckCount = 0;
    this.lastAmbientLogTime = 0;
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
      // This catches cases where expo-av callbacks stop firing
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
        debugLog.log('Backup', `⚠️ CALLBACK STALL DETECTED! Last callback ${Math.round(timeSinceLastCallback/1000)}s ago | elapsed=${elapsedSeconds}s`);

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

        // Also check ambient sound
        await this.checkAndRestartAmbient('Backup');
      }

      // Periodic ambient check regardless
      if (this.ambientSound && this.currentAmbientId) {
        try {
          const ambientStatus = await this.ambientSound.getStatusAsync();
          if (ambientStatus.isLoaded && !(ambientStatus as any).isPlaying && !this.isPreparingNextLoop) {
            debugLog.log('Backup', `⚠️ Ambient not playing (backup check) | pos=${(ambientStatus as any).positionMillis}`);
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
    if (!this.ambientSound || !this.currentAmbientId) return;

    try {
      const status = await this.ambientSound.getStatusAsync();
      if (!status.isLoaded) {
        debugLog.log(source, '⚠️ Ambient not loaded, recreating...');
        const assetId = this.currentAmbientId;
        this.ambientSound = null;
        this.currentAmbientId = null;
        await this.playAmbient(assetId);
        return;
      }

      if (!(status as any).isPlaying && !this.isPreparingNextLoop) {
        debugLog.log(source, `🔧 Ambient stopped at pos=${(status as any).positionMillis}, restarting...`);
        await this.ambientSound.setPositionAsync(0);
        await this.ambientSound.playAsync();
        debugLog.log(source, '✅ Ambient restarted');
      }
    } catch (err: any) {
      if (err?.code === 'E_AUDIO_NOPLAYER') {
        debugLog.log(source, '🔧 Native player destroyed, recreating...');
        const assetId = this.currentAmbientId;
        this.ambientSound = null;
        this.currentAmbientId = null;
        this.isPreparingNextLoop = false;
        await this.playAmbient(assetId);
      } else {
        debugLog.log(source, `❌ Failed to restart ambient: ${err}`);
      }
    }
  }

  // Track last log time to avoid spam
  private lastAmbientLogTime: number = 0;
  private ambientCheckCount: number = 0;

  private handleTimerUpdate = async (status: AVPlaybackStatus): Promise<void> => {
    // Track that callback fired (for backup monitor)
    this.lastCallbackTime = Date.now();

    if (!status.isLoaded) {
      debugLog.log('Timer', '❌ Timer status not loaded');
      return;
    }
    if (this.timerCompleted) return;

    const elapsedMs = Date.now() - this.timerStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    this.ambientCheckCount++;

    // Log timer heartbeat every 30 seconds (reduced frequency for file logs)
    const now = Date.now();
    if (now - this.lastAmbientLogTime >= 30000) {
      debugLog.log('Timer', `💓 Heartbeat #${this.ambientCheckCount} | elapsed=${elapsedSeconds}s | ambient=${!!this.ambientSound}`);
      this.lastAmbientLogTime = now;
    }

    // CRITICAL: Monitor ambient sound for looping and recovery
    // The ambient sound's own callback may not fire in background, but this timer callback does
    if (this.ambientSound && this.currentAmbientId) {
      try {
        const ambientStatus = await this.ambientSound.getStatusAsync();
        if (ambientStatus.isLoaded) {
          const position = ambientStatus.positionMillis ?? 0;
          const duration = ambientStatus.durationMillis ?? 0;
          const isPlaying = ambientStatus.isPlaying;
          const didJustFinish = (ambientStatus as any).didJustFinish;

          // Log important state changes to file
          if (!isPlaying || didJustFinish) {
            debugLog.log('Timer', `🎵 Ambient: pos=${Math.round(position/1000)}s / dur=${Math.round(duration/1000)}s | playing=${isPlaying} | didJustFinish=${didJustFinish} | nextReady=${!!this.ambientSoundNext}`);
          }

          // Seamless loop: pre-load next track, then overlap-swap
          // Phase 1: Pre-load next track 3 seconds before end (paused, ready to go)
          if (duration > 0 && position >= duration - 3000 && !this.ambientSoundNext && !this.isPreparingNextLoop) {
            this.isPreparingNextLoop = true;
            const source = this.getAudioUri(this.currentAmbientId, 'ambient');
            if (source) {
              try {
                const isBundled = typeof source === 'number';
                debugLog.log('Timer', `🔄 Pre-loading next loop at pos=${Math.round(position/1000)}s / dur=${Math.round(duration/1000)}s`);
                const { sound: nextSound } = await Audio.Sound.createAsync(
                  isBundled ? source : { uri: source },
                  { isLooping: false, shouldPlay: false, volume: 1.0 }
                );
                this.ambientSoundNext = nextSound;
                debugLog.log('Timer', '✅ Next loop pre-loaded');
              } catch (createErr) {
                debugLog.log('Timer', `❌ Failed to pre-load next loop: ${createErr}`);
              }
            }
            this.isPreparingNextLoop = false;
          }

          // Phase 2: Start new sound 500ms before end, let them overlap briefly
          if (duration > 0 && position >= duration - 500 && this.ambientSoundNext) {
            debugLog.log('Timer', `🔀 Overlap swap at pos=${Math.round(position/1000)}s / dur=${Math.round(duration/1000)}s`);
            const oldSound = this.ambientSound;
            const nextSound = this.ambientSoundNext;

            // Swap references
            this.ambientSound = nextSound;
            this.ambientSoundNext = null;

            // Start new sound and WAIT for it to actually begin playing
            await nextSound.playAsync();
            debugLog.log('Timer', '✅ Swap complete, new sound playing');

            // Now new sound is playing - instantly mute old sound (no audible overlap)
            if (oldSound) {
              oldSound.setOnPlaybackStatusUpdate(null);
              await oldSound.setVolumeAsync(0);
              // Clean up in background
              oldSound.stopAsync().then(() => oldSound.unloadAsync()).catch(() => {});
            }
          }
          // Also restart if stopped unexpectedly
          else if (!isPlaying && !this.isPreparingNextLoop) {
            debugLog.log('Timer', `⚠️ AMBIENT STOPPED! pos=${Math.round(position/1000)}s / dur=${Math.round(duration/1000)}s | Restarting...`);
            await this.ambientSound.setPositionAsync(0);
            await this.ambientSound.playAsync();
            debugLog.log('Timer', '✅ Ambient restarted');
          }
        } else {
          debugLog.log('Timer', '⚠️ Ambient status not loaded!');
        }
      } catch (err: any) {
        // Native player was destroyed (e.g., screen off killed it)
        debugLog.log('Timer', `❌ Error checking ambient: ${err?.code} ${err?.message || err}`);
        if (err?.code === 'E_AUDIO_NOPLAYER') {
          debugLog.log('Timer', '🔧 Native player destroyed, recreating...');
          const assetId = this.currentAmbientId;
          this.ambientSound = null;
          this.currentAmbientId = null;
          this.isPreparingNextLoop = false;
          await this.playAmbient(assetId);
          debugLog.log('Timer', '✅ Ambient recreated');
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

      const source = this.getAudioUri(assetId, 'ambient');
      if (!source) {
        onLoaded?.();
        return;
      }
      const isBundled = typeof source === 'number';

      // Note: isLooping doesn't work reliably for streamed remote audio
      const { sound } = await Audio.Sound.createAsync(
        isBundled ? source : { uri: source },
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

// Export debug log access for debugging
export { debugLog } from './debugLogService';
