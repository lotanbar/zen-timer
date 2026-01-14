package com.allhailalona.ZenTimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log

class BellAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BellAlarmReceiver"
        const val ACTION_PLAY_BELL = "com.allhailalona.ZenTimer.PLAY_BELL"
        const val ACTION_STOP_BELL = "com.allhailalona.ZenTimer.STOP_BELL"
        const val ACTION_START_FADE = "com.allhailalona.ZenTimer.START_FADE"
        const val ACTION_TIMER_COMPLETE = "com.allhailalona.ZenTimer.TIMER_COMPLETE"
        const val EXTRA_BELL_URI = "bell_uri"
        const val EXTRA_IS_FINAL = "is_final"

        // Keep reference to currently playing bell
        @Volatile
        private var currentMediaPlayer: MediaPlayer? = null
        @Volatile
        private var currentWakeLock: PowerManager.WakeLock? = null

        fun stopCurrentBell() {
            currentMediaPlayer?.let {
                try {
                    if (it.isPlaying) {
                        it.stop()
                    }
                    it.release()
                    Log.d(TAG, "Stopped currently playing bell")
                } catch (e: Exception) {
                    Log.e(TAG, "Error stopping bell: ${e.message}")
                }
            }
            currentMediaPlayer = null

            currentWakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "Released bell wake lock")
                }
            }
            currentWakeLock = null
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_STOP_BELL) {
            stopCurrentBell()
            return
        }

        if (intent.action == ACTION_START_FADE) {
            // Send broadcast to NativeAudioModule to trigger ambient fade
            Log.d(TAG, "Received ACTION_START_FADE, sending FADE_AMBIENT broadcast")
            val fadeIntent = Intent("com.allhailalona.ZenTimer.FADE_AMBIENT")
            fadeIntent.setPackage(context.packageName) // Make broadcast explicit
            fadeIntent.putExtra("duration", 10000) // 10 seconds
            context.sendBroadcast(fadeIntent)
            return
        }

        if (intent.action != ACTION_PLAY_BELL) return

        val bellUri = intent.getStringExtra(EXTRA_BELL_URI) ?: return
        val isFinal = intent.getBooleanExtra(EXTRA_IS_FINAL, false)

        Log.d(TAG, "Bell alarm fired: uri=$bellUri, isFinal=$isFinal")

        // Stop any currently playing bell first
        stopCurrentBell()

        // Acquire wake lock to ensure bell plays even if screen is off
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        currentWakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "ZenTimer:BellAlarm"
        )
        currentWakeLock?.acquire(30000) // 30 seconds max

        try {
            currentMediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(context, Uri.parse(bellUri))
                setVolume(0f, 0f) // Start at 0 for fade in

                setOnPreparedListener { mp ->
                    mp.start()
                    Log.d(TAG, "Bell playing with 3s fade in to 40% volume")

                    // Fade in over 3 seconds to 40% volume
                    val handler = android.os.Handler(android.os.Looper.getMainLooper())
                    val targetVolume = 0.4f
                    val fadeDurationMs = 3000L
                    val steps = 30
                    val stepDuration = fadeDurationMs / steps

                    var currentStep = 0
                    val fadeRunnable = object : Runnable {
                        override fun run() {
                            if (currentStep <= steps && mp.isPlaying) {
                                val volume = (currentStep.toFloat() / steps) * targetVolume
                                mp.setVolume(volume, volume)
                                currentStep++
                                handler.postDelayed(this, stepDuration)
                            }
                        }
                    }
                    handler.post(fadeRunnable)
                }
                setOnCompletionListener { mp ->
                    mp.release()
                    currentMediaPlayer = null

                    currentWakeLock?.let {
                        if (it.isHeld) it.release()
                    }
                    currentWakeLock = null

                    Log.d(TAG, "Bell completed, wake lock released")

                    // If this is the final bell, send callback to JS
                    if (isFinal) {
                        val callbackIntent = Intent(ACTION_TIMER_COMPLETE)
                        context.sendBroadcast(callbackIntent)
                    }
                }
                setOnErrorListener { mp, what, extra ->
                    Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
                    mp.release()
                    currentMediaPlayer = null

                    currentWakeLock?.let {
                        if (it.isHeld) it.release()
                    }
                    currentWakeLock = null
                    true
                }
                prepareAsync()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play bell: ${e.message}", e)
            currentWakeLock?.let {
                if (it.isHeld) it.release()
            }
            currentWakeLock = null
            currentMediaPlayer = null
        }
    }
}
