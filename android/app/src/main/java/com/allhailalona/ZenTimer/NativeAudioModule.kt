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

    // Dual player architecture for cross-fade
    private var playerA: ExoPlayer? = null
    private var playerB: ExoPlayer? = null
    private var activePlayer: ExoPlayer? = null
    private var standbyPlayer: ExoPlayer? = null
    private var isPlayerAActive = true

    private var mediaSession: MediaSession? = null
    private val handler = Handler(Looper.getMainLooper())
    private val fadeRunnables = mutableMapOf<ExoPlayer, Runnable>()
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private var trackDurationMs: Long = 0
    private var crossFadeScheduled = false

    // Cross-fade settings (20 seconds)
    private val CROSSFADE_DURATION_MS = 20000L
    private val FADE_STEPS = 100

    // Bell alarm tracking
    private val scheduledBellAlarms = mutableListOf<PendingIntent>()

    // Pause/resume state for rescheduling bells
    private var savedBellUri: String = ""
    private var savedBellTimesSeconds: IntArray = intArrayOf()
    private var savedTimerDurationSeconds: Int = 0
    private var timerStartElapsedRealtime: Long = 0
    private var pausedAtElapsedRealtime: Long = 0
    private var totalPausedMs: Long = 0
    private var isPausedState = false

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
                fadePlayerOut(activePlayer, duration.toLong()) {
                    Log.d(TAG, "Ambient fade complete, stopping players and sending TIMER_COMPLETE event")

                    // Stop both players immediately to prevent loop restart
                    playerA?.stop()
                    playerA?.clearMediaItems()
                    playerB?.stop()
                    playerB?.clearMediaItems()
                    Log.d(TAG, "Players stopped after fade")

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
                val mediaItem = MediaItem.fromUri(Uri.parse(uri))

                // Create Player A (will be active first)
                playerA = ExoPlayer.Builder(context).build().apply {
                    setMediaItem(mediaItem)
                    repeatMode = Player.REPEAT_MODE_OFF  // Manual looping via cross-fade
                    volume = 0f
                    prepare()

                    addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(state: Int) {
                            if (state == Player.STATE_READY && trackDurationMs == 0L) {
                                trackDurationMs = duration
                                Log.d(TAG, "Player A ready, track duration: ${trackDurationMs}ms")

                                // Start Player A
                                play()
                                fadePlayerIn(this@apply, CROSSFADE_DURATION_MS) {
                                    Log.d(TAG, "Initial fade in complete")
                                }

                                // Schedule first cross-fade
                                scheduleCrossFade()
                            }
                        }
                    })
                }

                // Create Player B (standby)
                playerB = ExoPlayer.Builder(context).build().apply {
                    setMediaItem(mediaItem)
                    repeatMode = Player.REPEAT_MODE_OFF  // Manual looping via cross-fade
                    volume = 0f
                    prepare()

                    addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(state: Int) {
                            if (state == Player.STATE_READY) {
                                Log.d(TAG, "Player B ready (standby)")
                            }
                        }
                    })
                }

                // Set initial active/standby
                activePlayer = playerA
                standbyPlayer = playerB
                isPlayerAActive = true

                // Create MediaSession - this is THE key to reliable background playback
                mediaSession = MediaSession.Builder(context, activePlayer!!)
                    .setId("ZenTimerSession")
                    .build()

                Log.d(TAG, "MediaSession created with dual players - background playback enabled")

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

    private fun scheduleCrossFade() {
        if (crossFadeScheduled || trackDurationMs <= 0) return
        crossFadeScheduled = true

        val crossFadeDelay = trackDurationMs - CROSSFADE_DURATION_MS - 500

        // Guard against tracks too short for cross-fade
        if (crossFadeDelay <= 0) {
            Log.w(TAG, "Track too short for cross-fade (${trackDurationMs}ms < ${CROSSFADE_DURATION_MS + 500}ms), using simple loop")
            return
        }

        Log.d(TAG, "Scheduling cross-fade in ${crossFadeDelay}ms (20s before end)")

        handler.postDelayed({
            if (activePlayer != null && standbyPlayer != null) {
                startCrossFade()
            }
        }, crossFadeDelay)
    }

    private fun startCrossFade() {
        Log.d(TAG, "Starting cross-fade: ${if (isPlayerAActive) "A→B" else "B→A"}")

        // Prepare standby player from beginning
        standbyPlayer?.seekTo(0)
        standbyPlayer?.play()

        // Fade out active player over 20 seconds
        fadePlayerOut(activePlayer, CROSSFADE_DURATION_MS)

        // Fade in standby player over 20 seconds
        fadePlayerIn(standbyPlayer, CROSSFADE_DURATION_MS) {
            // After cross-fade completes, swap roles
            swapPlayers()
            crossFadeScheduled = false
            scheduleCrossFade()  // Schedule next cross-fade
        }
    }

    private fun swapPlayers() {
        isPlayerAActive = !isPlayerAActive
        activePlayer = if (isPlayerAActive) playerA else playerB
        standbyPlayer = if (isPlayerAActive) playerB else playerA

        // Update MediaSession to point to new active player
        mediaSession?.player = activePlayer

        Log.d(TAG, "Players swapped: active=${if (isPlayerAActive) "A" else "B"}")
    }

    private fun rescheduleCrossFade() {
        val currentPosition = activePlayer?.currentPosition ?: 0
        val remaining = trackDurationMs - currentPosition
        val crossFadeDelay = remaining - CROSSFADE_DURATION_MS - 500

        if (crossFadeDelay > 0) {
            crossFadeScheduled = true
            handler.postDelayed({
                if (activePlayer != null && standbyPlayer != null) {
                    startCrossFade()
                }
            }, crossFadeDelay)
            Log.d(TAG, "Rescheduled cross-fade in ${crossFadeDelay}ms")
        } else {
            Log.d(TAG, "Not enough time remaining for cross-fade (${remaining}ms)")
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        handler.post {
            try {
                cancelAllFades()
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
                fadePlayerOut(activePlayer, durationMs.toLong()) {
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
                fadePlayerOut(activePlayer, durationMs.toLong()) {
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
                if (isPausedState) {
                    promise.resolve(true)
                    return@post
                }
                isPausedState = true
                pausedAtElapsedRealtime = SystemClock.elapsedRealtime()

                // Pause BOTH players
                playerA?.pause()
                playerB?.pause()

                // Cancel all fades and cross-fade scheduling
                cancelAllFades()

                // Cancel all scheduled bell/fade alarms — they'll be rescheduled on resume
                cancelBells()

                Log.d(TAG, "Paused: both players + all fades cancelled at elapsed=${pausedAtElapsedRealtime}")
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
                if (!isPausedState) {
                    promise.resolve(true)
                    return@post
                }

                val pauseDuration = SystemClock.elapsedRealtime() - pausedAtElapsedRealtime
                totalPausedMs += pauseDuration
                isPausedState = false

                // Resume active player only
                activePlayer?.play()

                // Reschedule cross-fade based on remaining time
                rescheduleCrossFade()

                // Reschedule bells with adjusted times
                rescheduleBells()

                Log.d(TAG, "Resumed: paused for ${pauseDuration}ms, total paused=${totalPausedMs}ms")
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    private fun rescheduleBells() {
        if (savedBellUri.isEmpty() || savedBellTimesSeconds.isEmpty()) {
            Log.d(TAG, "No bells to reschedule")
            return
        }

        val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = SystemClock.elapsedRealtime()
        // How many seconds have truly elapsed (excluding paused time)
        val activeElapsedMs = now - timerStartElapsedRealtime - totalPausedMs
        val activeElapsedSeconds = activeElapsedMs / 1000

        for (i in savedBellTimesSeconds.indices) {
            val bellTimeSeconds = savedBellTimesSeconds[i].toLong()
            val remainingSeconds = bellTimeSeconds - activeElapsedSeconds
            if (remainingSeconds <= 0) {
                Log.d(TAG, "Bell at ${bellTimeSeconds}s already past (elapsed=${activeElapsedSeconds}s), skipping")
                continue
            }

            val isFinal = (i == savedBellTimesSeconds.size - 1)
            val triggerAtMillis = now + (remainingSeconds * 1000)

            val intent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                action = BellAlarmReceiver.ACTION_PLAY_BELL
                putExtra(BellAlarmReceiver.EXTRA_BELL_URI, savedBellUri)
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
            Log.d(TAG, "Rescheduled bell ${i + 1} in ${remainingSeconds}s (isFinal=$isFinal)")
        }

        // Reschedule ambient fade
        val fadeRemainingSeconds = savedTimerDurationSeconds.toLong() - activeElapsedSeconds
        if (fadeRemainingSeconds > 0) {
            val fadeIntent = Intent(reactApplicationContext, BellAlarmReceiver::class.java).apply {
                action = BellAlarmReceiver.ACTION_START_FADE
            }
            val fadePendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext,
                9999,
                fadeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val fadeTriggerMillis = now + (fadeRemainingSeconds * 1000)
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
            Log.d(TAG, "Rescheduled ambient fade in ${fadeRemainingSeconds}s")
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

            // Save bell scheduling info for pause/resume rescheduling
            savedBellUri = bellUri
            savedBellTimesSeconds = IntArray(bellTimesSeconds.size()) { bellTimesSeconds.getInt(it) }
            savedTimerDurationSeconds = timerDurationSeconds
            timerStartElapsedRealtime = SystemClock.elapsedRealtime()
            totalPausedMs = 0
            isPausedState = false

            // 1. Start ambient audio with dual players for cross-fade
            handler.post {
                try {
                    cleanupPlayer()
                    acquireWakeLock()

                    val context = reactApplicationContext
                    val mediaItem = MediaItem.fromUri(Uri.parse(ambientUri))

                    // Create Player A (will be active first)
                    playerA = ExoPlayer.Builder(context).build().apply {
                        setMediaItem(mediaItem)
                        repeatMode = Player.REPEAT_MODE_OFF  // Manual looping via cross-fade
                        volume = 0f
                        prepare()

                        addListener(object : Player.Listener {
                            override fun onPlaybackStateChanged(state: Int) {
                                if (state == Player.STATE_READY && trackDurationMs == 0L) {
                                    trackDurationMs = duration
                                    Log.d(TAG, "Player A ready, track duration: ${trackDurationMs}ms")

                                    // Start Player A
                                    play()
                                    fadePlayerIn(this@apply, CROSSFADE_DURATION_MS) {
                                        Log.d(TAG, "Initial fade in complete")
                                    }

                                    // Schedule first cross-fade
                                    scheduleCrossFade()
                                }
                            }
                        })
                    }

                    // Create Player B (standby)
                    playerB = ExoPlayer.Builder(context).build().apply {
                        setMediaItem(mediaItem)
                        repeatMode = Player.REPEAT_MODE_OFF  // Manual looping via cross-fade
                        volume = 0f
                        prepare()

                        addListener(object : Player.Listener {
                            override fun onPlaybackStateChanged(state: Int) {
                                if (state == Player.STATE_READY) {
                                    Log.d(TAG, "Player B ready (standby)")
                                }
                            }
                        })
                    }

                    // Set initial active/standby
                    activePlayer = playerA
                    standbyPlayer = playerB
                    isPlayerAActive = true

                    mediaSession = MediaSession.Builder(context, activePlayer!!)
                        .setId("ZenTimerSession")
                        .build()

                    startForegroundService()
                    Log.d(TAG, "Ambient started successfully with dual players")
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

    private fun fadePlayerIn(player: ExoPlayer?, durationMs: Long, onComplete: (() -> Unit)? = null) {
        if (player == null) {
            onComplete?.invoke()
            return
        }

        // Cancel any existing fade for this player
        fadeRunnables[player]?.let { handler.removeCallbacks(it) }

        val stepDuration = durationMs / FADE_STEPS
        var step = 0

        Log.d(TAG, "Fade in starting (${durationMs}ms) - ${if (player == playerA) "Player A" else "Player B"}")

        val runnable = object : Runnable {
            override fun run() {
                if (step <= FADE_STEPS && player.isPlaying) {
                    val volume = step.toFloat() / FADE_STEPS
                    player.volume = volume
                    step++
                    handler.postDelayed(this, stepDuration)
                } else {
                    Log.d(TAG, "Fade in complete - ${if (player == playerA) "Player A" else "Player B"}")
                    fadeRunnables.remove(player)
                    onComplete?.invoke()
                }
            }
        }

        fadeRunnables[player] = runnable
        handler.post(runnable)
    }

    private fun fadePlayerOut(player: ExoPlayer?, durationMs: Long, onComplete: (() -> Unit)? = null) {
        if (player == null) {
            onComplete?.invoke()
            return
        }

        // Cancel any existing fade for this player
        fadeRunnables[player]?.let { handler.removeCallbacks(it) }

        val stepDuration = durationMs / FADE_STEPS
        var step = FADE_STEPS

        Log.d(TAG, "Fade out starting (${durationMs}ms) - ${if (player == playerA) "Player A" else "Player B"}")

        val runnable = object : Runnable {
            override fun run() {
                if (step >= 0 && player.isPlaying) {
                    val volume = step.toFloat() / FADE_STEPS
                    player.volume = volume
                    step--
                    handler.postDelayed(this, stepDuration)
                } else {
                    Log.d(TAG, "Fade out complete - ${if (player == playerA) "Player A" else "Player B"}")
                    fadeRunnables.remove(player)
                    onComplete?.invoke()
                }
            }
        }

        fadeRunnables[player] = runnable
        handler.post(runnable)
    }

    private fun cancelAllFades() {
        for ((player, runnable) in fadeRunnables) {
            handler.removeCallbacks(runnable)
        }
        fadeRunnables.clear()
        crossFadeScheduled = false
        Log.d(TAG, "All fades and cross-fade scheduling cancelled")
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
            // Use stopService() instead of sending a STOP intent via startService().
            // startService() triggers onStartCommand() which calls startForeground() —
            // that throws ForegroundServiceStartNotAllowedException on Android 12+
            // when the app is in the background (e.g. screen off after timer completes).
            val intent = Intent(reactApplicationContext, AudioPlaybackService::class.java)
            reactApplicationContext.stopService(intent)
            Log.d(TAG, "Foreground service stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop foreground service: ${e.message}")
        }
    }

    private fun cleanupPlayer() {
        mediaSession?.release()
        mediaSession = null

        playerA?.release()
        playerA = null

        playerB?.release()
        playerB = null

        activePlayer = null
        standbyPlayer = null

        // Clear fade state
        fadeRunnables.clear()
        trackDurationMs = 0
        crossFadeScheduled = false
    }

    private fun release() {
        stopForegroundService()
        cleanupPlayer()
        cancelBells() // Cancel any scheduled bell alarms
    }

    override fun invalidate() {
        handler.post {
            cancelAllFades()
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
