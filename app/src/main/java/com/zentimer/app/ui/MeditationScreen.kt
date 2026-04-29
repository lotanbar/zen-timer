package com.zentimer.app.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val MEDIA_AUDIO_ATTRIBUTES = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
    .build()

private data class PreparedPlayer(
    val player: MediaPlayer,
    val completion: CompletableDeferred<Unit>
)

/**
 * Prepares an ambience MediaPlayer on the IO dispatcher.
 * The completion deferred is resolved by setOnCompletionListener registered before start(),
 * which guarantees no completion event is ever missed.
 * setWakeMode keeps audio buffers fed while the screen is off.
 */
private suspend fun prepareAmbiencePlayer(context: Context, uri: Uri): PreparedPlayer? =
    try {
        withContext(Dispatchers.IO) {
            val completion = CompletableDeferred<Unit>()
            val player = MediaPlayer().apply {
                setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
                setAudioAttributes(MEDIA_AUDIO_ATTRIBUTES)
                setDataSource(context, uri)
                isLooping = false
                setOnCompletionListener { completion.complete(Unit) }
                setOnErrorListener { _, _, _ -> completion.completeExceptionally(Exception("MediaPlayer error")); true }
                prepare()
                setVolume(0f, 0f)
            }
            PreparedPlayer(player, completion)
        }
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        Log.d("ZenAmbience", "prepareAmbiencePlayer failed: $e")
        null
    }

@Composable
fun MeditationScreen(
    totalSeconds: Int,
    assetTreeUri: String,
    ambienceRelativePath: String?,
    endingBellRelativePath: String?,
    onSessionFinished: () -> Unit
) {
    val ambienceLoopFadeMs = 5_000L
    val ambienceSessionEndFadeMs = 10_000L
    val bellFadeInMs = 1_000L
    val bellTargetVolume = 0.5f

    val context = LocalContext.current
    var remaining by remember(totalSeconds) {
        mutableIntStateOf(totalSeconds.coerceAtLeast(0))
    }
    var isPaused by remember { mutableStateOf(false) }
    var ambiencePlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    var ambiencePlaybackJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    val oneShotPlayers = remember { mutableListOf<MediaPlayer>() }

    DisposableEffect(Unit) {
        onDispose {
            ambiencePlaybackJob?.cancel()
            oneShotPlayers.forEach { player ->
                try { if (player.isPlaying) player.stop() } catch (_: Exception) { }
                player.release()
            }
            oneShotPlayers.clear()
            ambiencePlayer?.run {
                try { if (isPlaying) stop() } catch (_: Exception) { }
                release()
            }
        }
    }

    LaunchedEffect(totalSeconds, assetTreeUri, ambienceRelativePath, endingBellRelativePath) {
        // Hold a partial wake lock for the session so the coroutine scheduler keeps running
        // while the screen is off. Timed acquire as a safety net against leaks.
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "ZenTimer:MeditationWakeLock"
        ).apply { acquire((totalSeconds.toLong() + 120L) * 1000L) }

        try {
            val root = openAssetRoot(context, assetTreeUri)

            suspend fun resolve(relativePath: String?): Uri? {
                val bundled = BUNDLED_TRACKS.firstOrNull { it.sentinelPath == relativePath }
                if (bundled != null)
                    return Uri.parse("android.resource://com.zentimer.app/raw/${bundled.resName}")
                if (root == null || relativePath.isNullOrBlank()) return null
                val parts = relativePath.split('/').filter { it.isNotBlank() }
                return withContext(Dispatchers.IO) {
                    var current: DocumentFile = root
                    for (p in parts) {
                        val next = current.listFiles().firstOrNull { it.name == p }
                            ?: return@withContext null
                        current = next
                    }
                    if (current.isFile) current.uri else null
                }
            }

            suspend fun fadePlayer(player: MediaPlayer, from: Float, to: Float, durationMs: Long) {
                val stepMs = 50L
                val steps = (durationMs / stepMs).coerceAtLeast(1L).toInt()
                repeat(steps) { step ->
                    val t = (step + 1).toFloat() / steps.toFloat()
                    val eased = (t * t * t * (t * (t * 6f - 15f) + 10f)).coerceIn(0f, 1f)
                    val v = from + ((to - from) * eased)
                    try { player.setVolume(v, v) } catch (_: Exception) { return }
                    delay(stepMs)
                }
            }

            fun playOneShot(uri: Uri?) {
                if (uri == null) return
                try {
                    val player = MediaPlayer().apply {
                        setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
                        setAudioAttributes(MEDIA_AUDIO_ATTRIBUTES)
                        setDataSource(context, uri)
                        isLooping = false
                        setOnCompletionListener {
                            try { it.release() } catch (_: Exception) { }
                            oneShotPlayers.remove(it)
                        }
                        prepare()
                        setVolume(0f, 0f)
                        start()
                    }
                    oneShotPlayers += player
                    launch { fadePlayer(player, from = 0f, to = bellTargetVolume, durationMs = bellFadeInMs) }
                } catch (_: Exception) { }
            }

            val ambienceUri = resolve(ambienceRelativePath)
            val initialPP = if (ambienceUri != null) {
                prepareAmbiencePlayer(context, ambienceUri)?.also { pp ->
                    pp.player.start()
                    ambiencePlayer = pp.player
                }
            } else null

            var finalSessionFadeStarted = false
            var ambienceVolume = 0f
            var ambienceFadeJob: kotlinx.coroutines.Job? = null

            fun startAmbienceFade(target: Float, durationMs: Long) {
                val active = ambiencePlayer ?: return
                ambienceFadeJob?.cancel()
                val from = ambienceVolume
                ambienceFadeJob = launch {
                    val fadeStart = SystemClock.elapsedRealtime()
                    while (true) {
                        delay(50)
                        val elapsed = (SystemClock.elapsedRealtime() - fadeStart).toFloat()
                        val t = (elapsed / durationMs.toFloat()).coerceIn(0f, 1f)
                        val eased = (t * t * (3f - (2f * t))).coerceIn(0f, 1f)
                        val v = from + ((target - from) * eased)
                        ambienceVolume = v
                        try { active.setVolume(v, v) } catch (_: Exception) { return@launch }
                        if (t >= 1f) break
                    }
                    ambienceVolume = target
                }
            }

            if (initialPP != null && totalSeconds > 0) {
                ambiencePlaybackJob = launch {
                    var pp = initialPP!!
                    var preloadedPP: PreparedPlayer? = null
                    Log.d("ZenAmbience", "Playback job started")
                    try {
                        while (remaining > 0) {
                            val player = pp.player
                            val durationMs = player.duration.toLong()
                            ambienceVolume = 0f
                            startAmbienceFade(target = 1f, durationMs = ambienceLoopFadeMs)

                            // Schedule fade-out and preload only when duration is known.
                            // For unknown duration (<=0) we skip crossfade and just await completion.
                            if (durationMs > ambienceLoopFadeMs) {
                                delay(durationMs - ambienceLoopFadeMs)
                                if (!finalSessionFadeStarted) {
                                    startAmbienceFade(target = 0f, durationMs = ambienceLoopFadeMs)
                                    if (preloadedPP == null) {
                                        launch {
                                            val next = prepareAmbiencePlayer(context, ambienceUri!!)
                                            if (!finalSessionFadeStarted) preloadedPP = next
                                            else next?.player?.release()
                                        }
                                    }
                                }
                            }

                            // Await natural completion — no polling needed.
                            // CompletableDeferred was registered before start(), so no race.
                            pp.completion.await()

                            try { player.stop() } catch (_: Exception) { }
                            player.release()
                            ambiencePlayer = null
                            Log.d("ZenAmbience", "Track ended. finalFade=$finalSessionFadeStarted remaining=$remaining")

                            if (finalSessionFadeStarted || remaining <= 0) break

                            val nextPP = preloadedPP?.also { preloadedPP = null }
                                ?: prepareAmbiencePlayer(context, ambienceUri!!)
                            if (nextPP == null) break

                            nextPP.player.start()
                            ambiencePlayer = nextPP.player
                            pp = nextPP
                        }
                    } finally {
                        preloadedPP?.player?.release()
                        preloadedPP = null
                    }
                    Log.d("ZenAmbience", "Playback job exiting")
                }
            }

            val endingUri = resolve(endingBellRelativePath)
            var bell30Played = false
            var bell15Played = false

            var tickBase = SystemClock.elapsedRealtime()
            while (remaining > 0) {
                if (!bell30Played && remaining <= 30) {
                    bell30Played = true
                    playOneShot(endingUri)
                }
                if (!bell15Played && remaining <= 15) {
                    bell15Played = true
                    playOneShot(endingUri)
                }
                if (isPaused) {
                    delay(200)
                    tickBase = SystemClock.elapsedRealtime()
                    continue
                }
                delay(200)
                val now = SystemClock.elapsedRealtime()
                val elapsed = ((now - tickBase) / 1000L).toInt()
                if (elapsed >= 1) {
                    remaining = (remaining - elapsed).coerceAtLeast(0)
                    tickBase += elapsed * 1000L
                }
            }

            // Session end: start fade-out and play final bell.
            finalSessionFadeStarted = true
            startAmbienceFade(target = 0f, durationMs = ambienceSessionEndFadeMs)
            playOneShot(endingUri)

            // Keep meditation screen visible briefly, then clean up and return.
            delay(10_000L)

            ambienceFadeJob?.cancel()
            ambiencePlaybackJob?.cancel()
            ambiencePlayer?.run {
                try { stop() } catch (_: Exception) { }
                release()
            }
            ambiencePlayer = null

            onSessionFinished()
        } finally {
            if (wakeLock.isHeld) wakeLock.release()
        }
    }

    val mm = remaining / 60
    val ss = remaining % 60
    val formatted = "%02d:%02d".format(mm, ss)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            tonalElevation = 2.dp,
            color = MaterialTheme.colorScheme.surfaceVariant
        ) {
            Text(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 28.dp),
                text = formatted,
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    isPaused = !isPaused
                    ambiencePlayer?.let { player ->
                        try {
                            if (isPaused) {
                                if (player.isPlaying) player.pause()
                            } else {
                                player.start()
                            }
                        } catch (_: Exception) {
                        }
                    }
                }
            ) {
                Text(if (isPaused) "Resume" else "Pause")
            }
            OutlinedButton(
                modifier = Modifier.weight(1f),
                shape = MaterialTheme.shapes.extraLarge,
                onClick = {
                    oneShotPlayers.forEach { player ->
                        try {
                            if (player.isPlaying) player.stop()
                        } catch (_: Exception) {
                        }
                        player.release()
                    }
                    oneShotPlayers.clear()
                    ambiencePlaybackJob?.cancel()
                    ambiencePlayer?.run {
                        try {
                            if (isPlaying) stop()
                        } catch (_: Exception) {
                        }
                        release()
                    }
                    ambiencePlayer = null
                    onSessionFinished()
                },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Stop")
            }
        }
    }
}
