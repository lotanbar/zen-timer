package com.allhailalona.ZenTimer

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.facebook.react.bridge.*

class NativeAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var player: ExoPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var fadeRunnable: Runnable? = null
    private var currentVolume = 1.0f
    private var trackDurationMs: Long = 0
    private var loopTransitionRunnable: Runnable? = null

    // Fade settings
    private val FADE_DURATION_MS = 5000L
    private val FADE_STEPS = 50

    companion object {
        private const val TAG = "NativeAudioModule"
    }

    override fun getName(): String = "NativeAudioModule"

    @ReactMethod
    fun loadAndPlay(uri: String, promise: Promise) {
        handler.post {
            try {
                release()

                val context = reactApplicationContext
                player = ExoPlayer.Builder(context).build().apply {
                    val mediaItem = MediaItem.fromUri(Uri.parse(uri))
                    setMediaItem(mediaItem)
                    repeatMode = Player.REPEAT_MODE_ALL // Native looping
                    volume = 0f
                    prepare()

                    addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(state: Int) {
                            if (state == Player.STATE_READY) {
                                trackDurationMs = duration
                                Log.d(TAG, "Track ready, duration: ${trackDurationMs}ms")
                                play()
                                fadeIn()
                                scheduleLoopTransition()
                            }
                        }
                    })
                }

                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load audio: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        handler.post {
            try {
                cancelFade()
                cancelLoopTransition()
                release()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun fadeOutAndStop(promise: Promise) {
        handler.post {
            try {
                cancelLoopTransition()
                fadeOut {
                    release()
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
                cancelLoopTransition()
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
                scheduleLoopTransition()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    private fun scheduleLoopTransition() {
        cancelLoopTransition()

        val player = this.player ?: return
        if (trackDurationMs <= 0) return

        // Calculate when to start fade out (5 seconds before track ends)
        val currentPosition = player.currentPosition
        val timeUntilFadeStart = (trackDurationMs - FADE_DURATION_MS - 500) - (currentPosition % trackDurationMs)

        if (timeUntilFadeStart > 0) {
            Log.d(TAG, "Scheduling loop transition in ${timeUntilFadeStart}ms")

            loopTransitionRunnable = Runnable {
                performLoopTransition()
            }
            handler.postDelayed(loopTransitionRunnable!!, timeUntilFadeStart)
        } else {
            // Already past the fade point, schedule for next loop
            val nextFadeStart = trackDurationMs - FADE_DURATION_MS - 500 + (trackDurationMs - currentPosition % trackDurationMs)
            Log.d(TAG, "Scheduling loop transition for next loop in ${nextFadeStart}ms")

            loopTransitionRunnable = Runnable {
                performLoopTransition()
            }
            handler.postDelayed(loopTransitionRunnable!!, nextFadeStart)
        }
    }

    private fun performLoopTransition() {
        Log.d(TAG, "Starting loop transition: fade out")

        fadeOut {
            Log.d(TAG, "Fade out complete, starting fade in")
            fadeIn {
                Log.d(TAG, "Fade in complete, scheduling next transition")
                scheduleLoopTransition()
            }
        }
    }

    private fun fadeIn(onComplete: (() -> Unit)? = null) {
        cancelFade()

        val stepDuration = FADE_DURATION_MS / FADE_STEPS
        var step = 0

        fadeRunnable = object : Runnable {
            override fun run() {
                if (step <= FADE_STEPS) {
                    currentVolume = step.toFloat() / FADE_STEPS
                    player?.volume = currentVolume
                    step++
                    handler.postDelayed(this, stepDuration)
                } else {
                    onComplete?.invoke()
                }
            }
        }
        handler.post(fadeRunnable!!)
    }

    private fun fadeOut(onComplete: (() -> Unit)? = null) {
        cancelFade()

        val stepDuration = FADE_DURATION_MS / FADE_STEPS
        var step = FADE_STEPS

        fadeRunnable = object : Runnable {
            override fun run() {
                if (step >= 0) {
                    currentVolume = step.toFloat() / FADE_STEPS
                    player?.volume = currentVolume
                    step--
                    handler.postDelayed(this, stepDuration)
                } else {
                    onComplete?.invoke()
                }
            }
        }
        handler.post(fadeRunnable!!)
    }

    private fun cancelFade() {
        fadeRunnable?.let { handler.removeCallbacks(it) }
        fadeRunnable = null
    }

    private fun cancelLoopTransition() {
        loopTransitionRunnable?.let { handler.removeCallbacks(it) }
        loopTransitionRunnable = null
    }

    private fun release() {
        player?.release()
        player = null
        currentVolume = 1.0f
        trackDurationMs = 0
    }

    // Called when React Native is shutting down
    override fun invalidate() {
        handler.post {
            cancelFade()
            cancelLoopTransition()
            release()
        }
        super.invalidate()
    }
}
