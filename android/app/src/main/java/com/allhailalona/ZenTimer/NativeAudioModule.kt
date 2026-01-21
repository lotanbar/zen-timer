package com.allhailalona.ZenTimer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private val handler = Handler(Looper.getMainLooper())
    private var fadeRunnable: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private var currentVolume = 1.0f
    private var trackDurationMs: Long = 0
    private var isFading = false
    private var fadeOutScheduled = false

    // Fade settings
    private val FADE_DURATION_MS = 5000L
    private val FADE_STEPS = 50

    // Bell alarm tracking
    private val scheduledBellAlarms = mutableListOf<PendingIntent>()

    // Broadcast receiver for timer completion
    private val timerCompleteReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == BellAlarmReceiver.ACTION_TIMER_COMPLETE) {
                Log.d(TAG, "Timer complete broadcast received, sending to JS")
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onTimerComplete", null)
            }
        }
    }

    // Broadcast receiver for ambient fade requests
    private val fadeAmbienceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val duration = intent?.getIntExtra("duration", 10000) ?: 10000
            Log.d(TAG, "Received FADE_AMBIENT broadcast, fading out over ${duration}ms")
            handler.post {
                fadeOut(duration.toLong()) {
                    Log.d(TAG, "Ambient fade complete, stopping player and sending TIMER_COMPLETE event")

                    // Stop player immediately to prevent loop restart
                    player?.let {
                        it.stop()
                        it.clearMediaItems()
                        Log.d(TAG, "Player stopped after fade")
                    }

                    // Send timer complete broadcast to trigger navigation
                    val completeIntent = Intent(BellAlarmReceiver.ACTION_TIMER_COMPLETE)
                    completeIntent.setPackage(reactApplicationContext.packageName)
                    reactApplicationContext.sendBroadcast(completeIntent)
                }
            }
        }
    }

    companion object {
        private const val TAG = "NativeAudioModule"
    }

    init {
        // Register broadcast receiver for timer completion
        try {
            val filter = IntentFilter(BellAlarmReceiver.ACTION_TIMER_COMPLETE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactApplicationContext.registerReceiver(timerCompleteReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactApplicationContext.registerReceiver(timerCompleteReceiver, filter)
            }
            Log.d(TAG, "Timer complete receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register timer complete receiver: ${e.message}")
        }

        // Register broadcast receiver for ambient fade requests
        try {
            val fadeFilter = IntentFilter("com.allhailalona.ZenTimer.FADE_AMBIENT")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactApplicationContext.registerReceiver(fadeAmbienceReceiver, fadeFilter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactApplicationContext.registerReceiver(fadeAmbienceReceiver, fadeFilter)
            }
            Log.d(TAG, "Fade ambience receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register fade ambience receiver: ${e.message}")
        }
    }

    override fun getName(): String = "NativeAudioModule"

    @ReactMethod
    fun loadAndPlay(uri: String, promise: Promise) {
        handler.post {
            try {
                // Don't call release() - keep service running, just cleanup player
                cleanupPlayer()
                acquireWakeLock()

                val context = reactApplicationContext

                // Create ExoPlayer
                player = ExoPlayer.Builder(context).build().apply {
                    val mediaItem = MediaItem.fromUri(Uri.parse(uri))
                    setMediaItem(mediaItem)
                    repeatMode = Player.REPEAT_MODE_ONE
                    volume = 0f
                    prepare()

                    addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(state: Int) {
                            if (state == Player.STATE_READY && trackDurationMs == 0L) {
                                trackDurationMs = duration
                                Log.d(TAG, "Track ready, duration: ${trackDurationMs}ms")
                                play()
                                fadeIn()
                                scheduleFadeOut()
                            }
                        }

                        override fun onPositionDiscontinuity(
                            oldPosition: Player.PositionInfo,
                            newPosition: Player.PositionInfo,
                            reason: Int
                        ) {
                            // Loop occurred
                            if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) {
                                Log.d(TAG, "Loop detected - restarting fade cycle")
                                fadeOutScheduled = false
                                handler.post {
                                    fadeIn()
                                    scheduleFadeOut()
                                }
                            }
                        }
                    })
                }

                // Create MediaSession - this is THE key to reliable background playback
                mediaSession = MediaSession.Builder(context, player!!)
                    .setId("ZenTimerSession")
                    .build()

                Log.d(TAG, "MediaSession created - background playback enabled")

                // Start foreground service with notification
                startForegroundService()

                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load audio: ${e.message}", e)
                releaseWakeLock()
                promise.reject("ERROR", e.message)
            }
        }
    }

    private fun scheduleFadeOut() {
        if (fadeOutScheduled || trackDurationMs <= 0) return
        fadeOutScheduled = true

        val fadeOutDelay = trackDurationMs - FADE_DURATION_MS - 500

        // Guard against negative delay (tracks shorter than fade duration + buffer)
        if (fadeOutDelay <= 0) {
            Log.d(TAG, "Track too short for fade out scheduling (${trackDurationMs}ms), skipping")
            return
        }

        Log.d(TAG, "Scheduling fade out in ${fadeOutDelay}ms")

        handler.postDelayed({
            if (!isFading && player != null) {
                Log.d(TAG, "Starting scheduled fade out")
                fadeOut()
            }
        }, fadeOutDelay)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        handler.post {
            try {
                cancelFade()
                release()
                releaseWakeLock()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun fadeOutAndStop(durationMs: Int, promise: Promise) {
        handler.post {
            try {
                fadeOut(durationMs.toLong()) {
                    release()
                    releaseWakeLock()
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun fadeVolume(durationMs: Int, promise: Promise) {
        handler.post {
            try {
                fadeOut(durationMs.toLong()) {
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun pause(promise: Promise) {
        handler.post {
            try {
                player?.pause()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun resume(promise: Promise) {
        handler.post {
            try {
                player?.play()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun scheduleBells(bellUri: String, bellTimesSeconds: ReadableArray, timerDurationSeconds: Int, promise: Promise) {
        try {
            cancelBells() // Cancel any existing bells first

            val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val now = SystemClock.elapsedRealtime()

            for (i in 0 until bellTimesSeconds.size()) {
                val bellTimeSeconds = bellTimesSeconds.getInt(i)
                val triggerAtMillis = now + (bellTimeSeconds * 1000L)
                val isFinal = (i == bellTimesSeconds.size() - 1)

                val intent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                    action = BellAlarmReceiver.ACTION_PLAY_BELL
                    putExtra(BellAlarmReceiver.EXTRA_BELL_URI, bellUri)
                    putExtra(BellAlarmReceiver.EXTRA_IS_FINAL, isFinal)
                }

                val pendingIntent = PendingIntent.getBroadcast(
                    reactApplicationContext,
                    i, // unique request code
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                // Use setExactAndAllowWhileIdle for precise timing even in Doze mode
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAtMillis,
                        pendingIntent
                    )
                } else {
                    alarmManager.setExact(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAtMillis,
                        pendingIntent
                    )
                }

                scheduledBellAlarms.add(pendingIntent)
                Log.d(TAG, "Scheduled bell ${i + 1}/${bellTimesSeconds.size()} at ${bellTimeSeconds}s (isFinal=$isFinal)")
            }

            // Schedule ambient fade to start when timer completes
            val fadeIntent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                action = BellAlarmReceiver.ACTION_START_FADE
            }
            val fadePendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext,
                9999, // unique request code for fade
                fadeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val fadeTriggerMillis = now + (timerDurationSeconds * 1000L)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    fadeTriggerMillis,
                    fadePendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    fadeTriggerMillis,
                    fadePendingIntent
                )
            }
            scheduledBellAlarms.add(fadePendingIntent)
            Log.d(TAG, "Scheduled ambient fade at ${timerDurationSeconds}s")

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule bells: ${e.message}", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun cancelBells(promise: Promise? = null) {
        try {
            val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            // Cancel all scheduled alarms
            for (pendingIntent in scheduledBellAlarms) {
                alarmManager.cancel(pendingIntent)
                pendingIntent.cancel()
            }

            scheduledBellAlarms.clear()

            // Stop any currently playing bell
            val stopIntent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                action = BellAlarmReceiver.ACTION_STOP_BELL
                setPackage(reactApplicationContext.packageName)
            }
            reactApplicationContext.sendBroadcast(stopIntent)

            Log.d(TAG, "All bell alarms cancelled and stopped any playing bell")

            promise?.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel bells: ${e.message}", e)
            promise?.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun startMeditationTimer(
        ambientUri: String,
        bellUri: String,
        bellTimesSeconds: ReadableArray,
        timerDurationSeconds: Int,
        promise: Promise
    ) {
        try {
            Log.d(TAG, "Starting meditation timer: ambient=$ambientUri, bell=$bellUri, duration=${timerDurationSeconds}s")

            // 1. Start ambient audio - loadAndPlay handles its own handler.post and promise
            handler.post {
                try {
                    // Create ExoPlayer
                    cleanupPlayer()
                    acquireWakeLock()

                    player = ExoPlayer.Builder(reactApplicationContext).build().apply {
                        val mediaItem = MediaItem.fromUri(Uri.parse(ambientUri))
                        setMediaItem(mediaItem)
                        repeatMode = Player.REPEAT_MODE_ONE
                        volume = 0f
                        prepare()

                        addListener(object : Player.Listener {
                            override fun onPlaybackStateChanged(state: Int) {
                                if (state == Player.STATE_READY && trackDurationMs == 0L) {
                                    trackDurationMs = duration
                                    Log.d(TAG, "Track ready, duration: ${trackDurationMs}ms")
                                    play()
                                    fadeIn()
                                    scheduleFadeOut()
                                }
                            }

                            override fun onPositionDiscontinuity(
                                oldPosition: Player.PositionInfo,
                                newPosition: Player.PositionInfo,
                                reason: Int
                            ) {
                                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) {
                                    Log.d(TAG, "Loop detected - restarting fade cycle")
                                    fadeOutScheduled = false
                                    handler.post {
                                        fadeIn()
                                        scheduleFadeOut()
                                    }
                                }
                            }
                        })
                    }

                    mediaSession = MediaSession.Builder(reactApplicationContext, player!!)
                        .setId("ZenTimerSession")
                        .build()

                    startForegroundService()
                    Log.d(TAG, "Ambient started successfully")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start ambient: ${e.message}", e)
                }
            }

            // 2. Schedule bells - inline implementation to avoid Promise object creation
            try {
                cancelBells() // Cancel any existing bells first

                val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val now = SystemClock.elapsedRealtime()

                for (i in 0 until bellTimesSeconds.size()) {
                    val bellTimeSeconds = bellTimesSeconds.getInt(i)
                    val triggerAtMillis = now + (bellTimeSeconds * 1000L)
                    val isFinal = (i == bellTimesSeconds.size() - 1)

                    val intent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                        action = BellAlarmReceiver.ACTION_PLAY_BELL
                        putExtra(BellAlarmReceiver.EXTRA_BELL_URI, bellUri)
                        putExtra(BellAlarmReceiver.EXTRA_IS_FINAL, isFinal)
                    }

                    val pendingIntent = PendingIntent.getBroadcast(
                        reactApplicationContext,
                        i,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.ELAPSED_REALTIME_WAKEUP,
                            triggerAtMillis,
                            pendingIntent
                        )
                    } else {
                        alarmManager.setExact(
                            AlarmManager.ELAPSED_REALTIME_WAKEUP,
                            triggerAtMillis,
                            pendingIntent
                        )
                    }

                    scheduledBellAlarms.add(pendingIntent)
                    Log.d(TAG, "Scheduled bell ${i + 1}/${bellTimesSeconds.size()} at ${bellTimeSeconds}s (isFinal=$isFinal)")
                }

                // Schedule ambient fade at timer completion
                val fadeIntent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                    action = BellAlarmReceiver.ACTION_START_FADE
                }
                val fadePendingIntent = PendingIntent.getBroadcast(
                    reactApplicationContext,
                    9999,
                    fadeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val fadeTriggerMillis = now + (timerDurationSeconds * 1000L)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        fadeTriggerMillis,
                        fadePendingIntent
                    )
                } else {
                    alarmManager.setExact(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        fadeTriggerMillis,
                        fadePendingIntent
                    )
                }
                scheduledBellAlarms.add(fadePendingIntent)
                Log.d(TAG, "Scheduled ambient fade at ${timerDurationSeconds}s")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule bells: ${e.message}", e)
            }

            Log.d(TAG, "Meditation timer initialization complete")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start meditation timer: ${e.message}", e)
            promise.reject("ERROR", e.message)
        }
    }

    private fun fadeIn(onComplete: (() -> Unit)? = null) {
        cancelFade()
        isFading = true

        val stepDuration = FADE_DURATION_MS / FADE_STEPS
        var step = 0

        Log.d(TAG, "Fade in starting")

        fadeRunnable = object : Runnable {
            override fun run() {
                if (step <= FADE_STEPS && player != null) {
                    currentVolume = step.toFloat() / FADE_STEPS
                    player?.volume = currentVolume
                    step++
                    handler.postDelayed(this, stepDuration)
                } else {
                    Log.d(TAG, "Fade in complete")
                    isFading = false
                    onComplete?.invoke()
                }
            }
        }
        handler.post(fadeRunnable!!)
    }

    private fun fadeOut(durationMs: Long = FADE_DURATION_MS, onComplete: (() -> Unit)? = null) {
        cancelFade()
        isFading = true

        val stepDuration = durationMs / FADE_STEPS
        var step = FADE_STEPS

        Log.d(TAG, "Fade out starting (${durationMs}ms)")

        fadeRunnable = object : Runnable {
            override fun run() {
                if (step >= 0 && player != null) {
                    currentVolume = step.toFloat() / FADE_STEPS
                    player?.volume = currentVolume
                    step--
                    handler.postDelayed(this, stepDuration)
                } else {
                    Log.d(TAG, "Fade out complete")
                    isFading = false
                    onComplete?.invoke()
                }
            }
        }
        handler.post(fadeRunnable!!)
    }

    private fun cancelFade() {
        fadeRunnable?.let { handler.removeCallbacks(it) }
        fadeRunnable = null
        isFading = false
    }

    private fun acquireWakeLock() {
        releaseWakeLock()
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "ZenTimer:AudioPlayback"
            )
            // 4 hours max timeout - reasonable for longest meditation sessions
            wakeLock?.acquire(4 * 60 * 60 * 1000L)
            Log.d(TAG, "Wake lock acquired (4h timeout)")

            val wifiManager = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wifiManager.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "ZenTimer:AudioStreaming"
            )
            wifiLock?.acquire()
            Log.d(TAG, "WiFi lock acquired (4h timeout)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire locks: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock released")
            }
        }
        wakeLock = null

        wifiLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "WiFi lock released")
            }
        }
        wifiLock = null
    }

    private fun startForegroundService() {
        try {
            val intent = Intent(reactApplicationContext, AudioPlaybackService::class.java).apply {
                action = AudioPlaybackService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            Log.d(TAG, "Foreground service started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service: ${e.message}")
        }
    }

    private fun stopForegroundService() {
        try {
            val intent = Intent(reactApplicationContext, AudioPlaybackService::class.java).apply {
                action = AudioPlaybackService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            Log.d(TAG, "Foreground service stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop foreground service: ${e.message}")
        }
    }

    private fun cleanupPlayer() {
        mediaSession?.release()
        mediaSession = null
        player?.release()
        player = null
        currentVolume = 1.0f
        trackDurationMs = 0
        isFading = false
        fadeOutScheduled = false
    }

    private fun release() {
        stopForegroundService()
        cleanupPlayer()
        cancelBells() // Cancel any scheduled bell alarms
    }

    override fun invalidate() {
        handler.post {
            cancelFade()
            release()
            releaseWakeLock()
        }
        try {
            reactApplicationContext.unregisterReceiver(timerCompleteReceiver)
            Log.d(TAG, "Timer complete receiver unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister timer complete receiver: ${e.message}")
        }
        try {
            reactApplicationContext.unregisterReceiver(fadeAmbienceReceiver)
            Log.d(TAG, "Fade ambience receiver unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister fade ambience receiver: ${e.message}")
        }
        super.invalidate()
    }
}
