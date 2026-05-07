package com.zentimer.app.ui

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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

/** Resolves a relative path inside the asset tree to a content URI. */
private suspend fun resolveAssetUri(context: Context, assetTreeUri: String, relativePath: String): Uri? =
    withContext(Dispatchers.IO) {
        val root = openAssetRoot(context, assetTreeUri) ?: return@withContext null
        val parts = relativePath.split('/').filter { it.isNotBlank() }
        var current: DocumentFile = root
        for (p in parts) {
            val next = current.listFiles().firstOrNull { it.name == p } ?: return@withContext null
            current = next
        }
        if (current.isFile) current.uri else null
    }

@Composable
fun MeditationScreen(
    totalSeconds: Int,
    assetTreeUri: String,
    initialAmbienceRelativePath: String?,
    endingBellRelativePath: String?,
    onNextAmbience: () -> String?,
    onRemoveAmbience: (String) -> Unit,
    onSessionFinished: () -> Unit
) {
    val ambienceLoopFadeMs = 5_000L
    val ambienceSessionEndFadeMs = 10_000L
    val bellFadeInMs = 1_000L
    val bellTargetVolume = 0.5f

    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()

    var remaining by remember(totalSeconds) { mutableIntStateOf(totalSeconds.coerceAtLeast(0)) }
    var isPaused by remember { mutableStateOf(false) }
    var currentAmbiencePath by remember { mutableStateOf(initialAmbienceRelativePath) }
    var ambiencePlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    var ambiencePlaybackJob by remember { mutableStateOf<Job?>(null) }
    var ambienceFadeJob by remember { mutableStateOf<Job?>(null) }
    var ambienceVolume by remember { mutableFloatStateOf(0f) }
    var finalSessionFadeStarted by remember { mutableStateOf(false) }
    val oneShotPlayers = remember { mutableListOf<MediaPlayer>() }

    DisposableEffect(Unit) {
        onDispose {
            ambienceFadeJob?.cancel()
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

    /** Smooth fade of the current ambience player. Does NOT cancel/start the playback loop. */
    fun startAmbienceFade(target: Float, durationMs: Long) {
        val active = ambiencePlayer ?: return
        ambienceFadeJob?.cancel()
        val from = ambienceVolume
        ambienceFadeJob = scope.launch(Dispatchers.IO) {
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

    /** Starts the seamless looping ambience playback job for the given URI. */
    fun startAmbienceLoop(ambienceUri: Uri) {
        ambienceFadeJob?.cancel()
        ambiencePlaybackJob?.cancel()
        ambiencePlayer?.run {
            try { if (isPlaying) stop() } catch (_: Exception) { }
            release()
        }
        ambiencePlayer = null
        ambienceVolume = 0f

        ambiencePlaybackJob = scope.launch {
            var pp = prepareAmbiencePlayer(context, ambienceUri) ?: return@launch
            pp.player.start()
            ambiencePlayer = pp.player
            var preloadedPP: PreparedPlayer? = null
            Log.d("ZenAmbience", "Playback job started")
            try {
                while (remaining > 0 && !finalSessionFadeStarted) {
                    val player = pp.player
                    val durationMs = player.duration.toLong()
                    ambienceVolume = 0f
                    startAmbienceFade(target = 1f, durationMs = ambienceLoopFadeMs)

                    if (durationMs > ambienceLoopFadeMs) {
                        delay(durationMs - ambienceLoopFadeMs)
                        if (!finalSessionFadeStarted) {
                            startAmbienceFade(target = 0f, durationMs = ambienceLoopFadeMs)
                            if (preloadedPP == null) {
                                launch {
                                    val next = prepareAmbiencePlayer(context, ambienceUri)
                                    if (!finalSessionFadeStarted) preloadedPP = next
                                    else next?.player?.release()
                                }
                            }
                        }
                    }

                    pp.completion.await()

                    try { player.stop() } catch (_: Exception) { }
                    player.release()
                    ambiencePlayer = null
                    Log.d("ZenAmbience", "Track ended. finalFade=$finalSessionFadeStarted remaining=$remaining")

                    if (finalSessionFadeStarted || remaining <= 0) break

                    val nextPP = preloadedPP?.also { preloadedPP = null }
                        ?: prepareAmbiencePlayer(context, ambienceUri)
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

    /** Switches to a new ambience path immediately (hard cut — no crossfade). */
    fun switchAmbience(newPath: String?) {
        currentAmbiencePath = newPath
        if (newPath == null || finalSessionFadeStarted) {
            ambienceFadeJob?.cancel()
            ambiencePlaybackJob?.cancel()
            ambiencePlayer?.run {
                try { if (isPlaying) stop() } catch (_: Exception) { }
                release()
            }
            ambiencePlayer = null
            return
        }
        scope.launch {
            val uri = resolveAssetUri(context, assetTreeUri, newPath) ?: return@launch
            startAmbienceLoop(uri)
        }
    }

    LaunchedEffect(totalSeconds, assetTreeUri, initialAmbienceRelativePath, endingBellRelativePath) {
        // Start foreground service to keep process alive while screen is off.
        val serviceIntent = Intent(context, com.zentimer.app.MeditationForegroundService::class.java)
        context.startForegroundService(serviceIntent)

        // Hold a partial wake lock for the session so the coroutine scheduler keeps running.
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "ZenTimer:MeditationWakeLock"
        ).apply { acquire((totalSeconds.toLong() + 120L) * 1000L) }

        try {
            suspend fun resolveUri(relativePath: String?): Uri? {
                if (relativePath.isNullOrBlank()) return null
                return resolveAssetUri(context, assetTreeUri, relativePath)
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

            // Start initial ambience
            val initialUri = resolveUri(initialAmbienceRelativePath)
            if (initialUri != null && totalSeconds > 0) {
                startAmbienceLoop(initialUri)
            }

            val endingUri = resolveUri(endingBellRelativePath)
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

            // Session end: fade out ambience and play final bell.
            finalSessionFadeStarted = true
            startAmbienceFade(target = 0f, durationMs = ambienceSessionEndFadeMs)
            playOneShot(endingUri)

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
            context.stopService(serviceIntent)
            if (wakeLock.isHeld) wakeLock.release()
        }
    }

    val mm = remaining / 60
    val ss = remaining % 60
    val formatted = "%02d:%02d".format(mm, ss)

    var deleteTapCount by remember { mutableIntStateOf(0) }

    // Fixed height for the button bar so timer knows how much upper space it gets
    val buttonBarHeight = 120.dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        // ── Timer — centered in upper area ────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = formatted,
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        // ── Icon buttons — horizontal row, pinned at bottom ───────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(buttonBarHeight)
                .padding(bottom = 20.dp),
            contentAlignment = Alignment.Center
        ) {
        androidx.compose.material3.Surface(
            modifier = Modifier.padding(horizontal = 28.dp),
            shape = RoundedCornerShape(24.dp),
            color = androidx.compose.ui.graphics.Color(0xFFD0D0D0)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
            // Stop
            IconButton(
                modifier = Modifier.size(68.dp),
                onClick = {
                    oneShotPlayers.forEach { player ->
                        try { if (player.isPlaying) player.stop() } catch (_: Exception) { }
                        player.release()
                    }
                    oneShotPlayers.clear()
                    ambiencePlaybackJob?.cancel()
                    ambiencePlayer?.run {
                        try { if (isPlaying) stop() } catch (_: Exception) { }
                        release()
                    }
                    ambiencePlayer = null
                    onSessionFinished()
                },
                colors = IconButtonDefaults.iconButtonColors(contentColor = Color.White)
            ) {
                Icon(Icons.Filled.Stop, contentDescription = "Stop", modifier = Modifier.size(36.dp))
            }

            // Pause / Resume
            IconButton(
                modifier = Modifier.size(68.dp),
                onClick = {
                    isPaused = !isPaused
                    ambiencePlayer?.let { player ->
                        try {
                            if (isPaused) { if (player.isPlaying) player.pause() }
                            else player.start()
                        } catch (_: Exception) { }
                    }
                },
                colors = IconButtonDefaults.iconButtonColors(contentColor = Color.White)
            ) {
                Icon(
                    if (isPaused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                    contentDescription = if (isPaused) "Resume" else "Pause",
                    modifier = Modifier.size(32.dp)
                )
            }

            // Skip (next ambience — hard cut)
            IconButton(
                modifier = Modifier.size(68.dp),
                onClick = {
                    val next = onNextAmbience() ?: return@IconButton
                    switchAmbience(next)
                },
                enabled = !finalSessionFadeStarted,
                colors = IconButtonDefaults.iconButtonColors(contentColor = Color.White)
            ) {
                Icon(Icons.Filled.FastForward, contentDescription = "Skip", modifier = Modifier.size(36.dp))
            }

            // Delete (3-tap confirmation)
            IconButton(
                modifier = Modifier.size(68.dp),
                onClick = {
                    deleteTapCount++
                    when (deleteTapCount) {
                        1 -> Toast.makeText(context, "Tap 3 more times to delete", Toast.LENGTH_SHORT).show()
                        2 -> Toast.makeText(context, "2 more taps to delete", Toast.LENGTH_SHORT).show()
                        3 -> Toast.makeText(context, "1 more tap to delete", Toast.LENGTH_SHORT).show()
                        else -> {
                            deleteTapCount = 0
                            val toRemove = currentAmbiencePath ?: return@IconButton
                            onRemoveAmbience(toRemove)
                            val next = onNextAmbience()
                            switchAmbience(next)
                        }
                    }
                },
                enabled = currentAmbiencePath != null && !finalSessionFadeStarted,
                colors = IconButtonDefaults.iconButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete", modifier = Modifier.size(36.dp))
            }
        } // Row
        } // Surface
        } // Box
    } // Column
}