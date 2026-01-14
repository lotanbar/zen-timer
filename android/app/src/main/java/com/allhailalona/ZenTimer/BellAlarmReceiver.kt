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
        const val ACTION_TIMER_COMPLETE = "com.allhailalona.ZenTimer.TIMER_COMPLETE"
        const val EXTRA_BELL_URI = "bell_uri"
        const val EXTRA_IS_FINAL = "is_final"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_PLAY_BELL) return

        val bellUri = intent.getStringExtra(EXTRA_BELL_URI) ?: return
        val isFinal = intent.getBooleanExtra(EXTRA_IS_FINAL, false)

        Log.d(TAG, "Bell alarm fired: uri=$bellUri, isFinal=$isFinal")

        // Acquire wake lock to ensure bell plays even if screen is off
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "ZenTimer:BellAlarm"
        )
        wakeLock.acquire(30000) // 30 seconds max

        try {
            val mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(context, Uri.parse(bellUri))
                setOnPreparedListener { mp ->
                    mp.start()
                    Log.d(TAG, "Bell playing")
                }
                setOnCompletionListener { mp ->
                    mp.release()
                    wakeLock.release()
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
                    wakeLock.release()
                    true
                }
                prepareAsync()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play bell: ${e.message}", e)
            wakeLock.release()
        }
    }
}
