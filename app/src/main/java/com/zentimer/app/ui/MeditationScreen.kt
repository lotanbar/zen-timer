package com.zentimer.app.ui

import android.media.MediaPlayer
import android.net.Uri
import com.zentimer.app.ui.BUNDLED_TRACKS
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import android.os.SystemClock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

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
    val bellFadeInMs = 150L
    val bellTargetVolume = 0.5f

    val context = LocalContext.current
    var remaining by remember(totalSeconds) {
        mutableIntStateOf(totalSeconds.coerceAtLeast(0))
    }
    var isPaused by remember { androidx.compose.runtime.mutableStateOf(false) }
    var ambiencePlayer by remember { androidx.compose.runtime.mutableStateOf<MediaPlayer?>(null) }
    var ambiencePlaybackJob by remember { androidx.compose.runtime.mutableStateOf<kotlinx.coroutines.Job?>(null) }
    val oneShotPlayers = remember { mutableListOf<MediaPlayer>() }

    DisposableEffect(Unit) {
        onDispose {
            ambiencePlaybackJob?.cancel()
            oneShotPlayers.forEach { player ->
                try {
                    if (player.isPlaying) player.stop()
                } catch (_: Exception) {
                }
                player.release()
            }
            oneShotPlayers.clear()
            ambiencePlayer?.run {
                try {
                    if (isPlaying) stop()
                } catch (_: Exception) {
                }
                release()
            }
        }
    }

    LaunchedEffect(totalSeconds, assetTreeUri, ambienceRelativePath, endingBellRelativePath) {
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

        suspend fun fadePlayer(
            player: MediaPlayer,
            from: Float,
            to: Float,
            durationMs: Long
        ) {
            val stepMs = 50L
            val steps = (durationMs / stepMs).coerceAtLeast(1L).toInt()
            repeat(steps) { step ->
                val t = (step + 1).toFloat() / steps.toFloat()
                val eased = (t * t * (3f - (2f * t))).coerceIn(0f, 1f)
                val v = from + ((to - from) * eased)
                try {
                    player.setVolume(v, v)
                } catch (_: Exception) {
                    return
                }
                delay(stepMs)
            }
        }

        suspend fun playOneShotAndWait(uri: Uri?) {
            if (uri == null) return
            try {
                suspendCancellableCoroutine { continuation ->
                    val player = MediaPlayer().apply {
                        setDataSource(context, uri)
                        isLooping = false
                        setOnCompletionListener {
                            try {
                                it.release()
                            } catch (_: Exception) {
                            }
                            oneShotPlayers.remove(it)
                            if (continuation.isActive) {
                                continuation.resume(Unit)
                            }
                        }
                        prepare()
                        setVolume(bellTargetVolume, bellTargetVolume)
                        start()
                    }
                    oneShotPlayers += player
                    launch { fadePlayer(player, from = 0.3f, to = bellTargetVolume, durationMs = bellFadeInMs) }
                    continuation.invokeOnCancellation {
                        try {
                            if (player.isPlaying) player.stop()
                        } catch (_: Exception) {
                        }
                        player.release()
                        oneShotPlayers.remove(player)
                    }
                }
            } catch (_: Exception) {
            }
        }

        fun playOneShot(uri: Uri?) {
            if (uri == null) return
            try {
                val player = MediaPlayer().apply {
                    setDataSource(context, uri)
                    isLooping = false
                    setOnCompletionListener {
                        try {
                            it.release()
                        } catch (_: Exception) {
                        }
                        oneShotPlayers.remove(it)
                    }
                    prepare()
                    setVolume(bellTargetVolume, bellTargetVolume)
                    start()
                }
                oneShotPlayers += player
                launch { fadePlayer(player, from = 0.3f, to = bellTargetVolume, durationMs = bellFadeInMs) }
            } catch (_: Exception) {
            }
        }

        suspend fun resolveDurationMs(uri: Uri?): Long {
            if (uri == null) return 3_000L
            return try {
                withContext(Dispatchers.IO) {
                    val player = MediaPlayer().apply {
                        setDataSource(context, uri)
                        prepare()
                    }
                    try {
                        player.duration.toLong().coerceAtLeast(1L)
                    } finally {
                        player.release()
                    }
                }
            } catch (_: Exception) {
                3_000L
            }
        }

        val ambienceUri = resolve(ambienceRelativePath)
        val ambience = if (ambienceUri != null) {
            try {
                val player = withContext(Dispatchers.IO) {
                    MediaPlayer().apply {
                        setDataSource(context, ambienceUri)
                        isLooping = false
                        prepare()
                        setVolume(0f, 0f)
                    }
                }
                player.start()
                player
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                null
            }
        } else {
            null
        }
        ambiencePlayer = ambience

        var finalSessionFadeStarted = false
        var ambienceFadeOutInProgress = false
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
                    try {
                        active.setVolume(v, v)
                    } catch (_: Exception) {
                        return@launch
                    }
                    if (t >= 1f) break
                }
                ambienceVolume = target
            }
        }

        if (ambience != null && totalSeconds > 0) {
            ambiencePlaybackJob = launch {
                var preloadedPlayer: MediaPlayer? = null
                Log.d("ZenAmbience", "Playback job started, remaining=$remaining")

                while (remaining > 0) {
                    Log.d("ZenAmbience", "Outer loop top: remaining=$remaining ambiencePlayer=${ambiencePlayer!=null} preloadedPlayer=${preloadedPlayer!=null}")
                    val playerCandidate: MediaPlayer? = when {
                        ambiencePlayer != null -> {
                            Log.d("ZenAmbience", "Branch: reusing existing ambiencePlayer")
                            ambiencePlayer!!
                        }
                        preloadedPlayer != null -> {
                            Log.d("ZenAmbience", "Branch: using preloadedPlayer")
                            preloadedPlayer!!.also {
                                preloadedPlayer = null
                                it.start()
                            }
                        }
                        ambienceUri == null -> {
                            Log.d("ZenAmbience", "Branch: ambienceUri null, breaking")
                            break
                        }
                        else -> {
                            Log.d("ZenAmbience", "Branch: creating new player from URI")
                            try {
                                withContext(Dispatchers.IO) {
                                    val mp = MediaPlayer()
                                    try {
                                        mp.setDataSource(context, ambienceUri)
                                        mp.isLooping = false
                                        mp.prepare()
                                        mp.setVolume(0f, 0f)
                                        mp
                                    } catch (e: Exception) {
                                        mp.release()
                                        throw e
                                    }
                                }.also { it.start() }
                            } catch (e: Exception) {
                                Log.d("ZenAmbience", "New player creation failed: $e")
                                if (e is CancellationException) throw e
                                null
                            }
                        }
                    }
                    if (playerCandidate == null) {
                        Log.d("ZenAmbience", "playerCandidate null, retrying in 1s")
                        delay(1_000L)
                        continue
                    }
                    val player = playerCandidate
                    Log.d("ZenAmbience", "Player ready: duration=${player.duration}ms isPlaying=${player.isPlaying}")

                    ambiencePlayer = player
                    ambienceVolume = 0f
                    ambienceFadeOutInProgress = false
                    startAmbienceFade(target = 1f, durationMs = ambienceLoopFadeMs)

                    // Poll playback position (driven by the audio decoder, not the Handler)
                    // so fade-out and preload trigger at the right time even under Doze mode.
                    var preloadLaunched = false
                    while (true) {
                        delay(200)
                        val pos: Int
                        val playing: Boolean
                        try {
                            pos = player.currentPosition
                            playing = player.isPlaying
                        } catch (_: Exception) {
                            Log.d("ZenAmbience", "Inner loop: exception reading player state, breaking")
                            break
                        }
                        val timeLeft = (player.duration - pos).toLong()
                        if (!finalSessionFadeStarted && timeLeft <= ambienceLoopFadeMs) {
                            if (!ambienceFadeOutInProgress) {
                                Log.d("ZenAmbience", "Triggering fade-out: timeLeft=${timeLeft}ms pos=${pos}ms dur=${player.duration}ms")
                                ambienceFadeOutInProgress = true
                                startAmbienceFade(target = 0f, durationMs = ambienceLoopFadeMs)
                            }
                            if (!preloadLaunched && preloadedPlayer == null) {
                                preloadLaunched = true
                                Log.d("ZenAmbience", "Launching preload")
                                launch {
                                    val loaded = try {
                                        withContext(Dispatchers.IO) {
                                            val mp = MediaPlayer()
                                            try {
                                                mp.setDataSource(context, ambienceUri!!)
                                                mp.isLooping = false
                                                mp.prepare()
                                                mp.setVolume(0f, 0f)
                                                mp
                                            } catch (e: Exception) {
                                                mp.release()
                                                throw e
                                            }
                                        }
                                    } catch (e: Exception) {
                                        Log.d("ZenAmbience", "Preload failed: $e")
                                        if (e is CancellationException) throw e
                                        null
                                    }
                                    Log.d("ZenAmbience", "Preload done: loaded=${loaded!=null} finalFade=$finalSessionFadeStarted")
                                    if (!finalSessionFadeStarted) preloadedPlayer = loaded
                                    else loaded?.release()
                                }
                            }
                        }
                        if (!playing) {
                            Log.d("ZenAmbience", "Inner loop: !playing detected, pos=${pos}ms dur=${player.duration}ms")
                            break
                        }
                    }
                    try { player.stop() } catch (_: Exception) {}
                    player.release()
                    ambiencePlayer = null
                    Log.d("ZenAmbience", "Track ended, released. finalSessionFadeStarted=$finalSessionFadeStarted remaining=$remaining")

                    // If session fade-out already started, do not restart ambience. Wait remaining time.
                    if (finalSessionFadeStarted) {
                        preloadedPlayer?.release()
                        preloadedPlayer = null
                        while (remaining > 0) {
                            delay(250)
                        }
                        break
                    }
                }
                Log.d("ZenAmbience", "Playback job exiting outer loop")
                preloadedPlayer?.release()
                preloadedPlayer = null
            }
        }

        val endingUri = resolve(endingBellRelativePath)
        val singleBellDurationMs = resolveDurationMs(endingUri)
        val canPlayFourBeforeEnd = totalSeconds >= 10 * 60
        val sequenceDurationMs = singleBellDurationMs * 4L
        val sequenceLeadSeconds = ((sequenceDurationMs + 999L) / 1_000L).toInt()
        var sequenceStarted = false

        var tickBase = SystemClock.elapsedRealtime()
        while (remaining > 0) {
            if (canPlayFourBeforeEnd && !sequenceStarted && remaining <= sequenceLeadSeconds) {
                sequenceStarted = true
                launch {
                    repeat(4) {
                        playOneShotAndWait(endingUri)
                    }
                }
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

        // At timer end: if session was too short for 4 bells, play a single ending bell.
        finalSessionFadeStarted = true
        if (!ambienceFadeOutInProgress) {
            ambienceFadeOutInProgress = true
            startAmbienceFade(target = 0f, durationMs = ambienceSessionEndFadeMs)
        }
        if (!canPlayFourBeforeEnd) {
            playOneShot(endingUri)
        }

        // Keep meditation screen visible briefly, then return to main.
        delay(10_000L)

        ambienceFadeJob?.cancel()
        ambiencePlaybackJob?.cancel()
        ambiencePlayer?.run {
            try {
                stop()
            } catch (_: Exception) {
            }
            release()
        }
        ambiencePlayer = null

        onSessionFinished()
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
