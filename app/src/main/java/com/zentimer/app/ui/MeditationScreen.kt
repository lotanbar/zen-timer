package com.zentimer.app.ui

import android.media.MediaPlayer
import android.net.Uri
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
    val bellTargetVolume = 0.2f

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
        val treeUri = assetTreeUri.takeIf { it.isNotBlank() }?.let { Uri.parse(it) }
        val root = treeUri?.let { uri ->
            try {
                DocumentFile.fromTreeUri(context, uri)
            } catch (_: Exception) {
                null
            }
        }

        fun resolve(relativePath: String?): Uri? {
            if (root == null || relativePath.isNullOrBlank()) return null
            val parts = relativePath.split('/').filter { it.isNotBlank() }
            var current: DocumentFile = root
            for (p in parts) {
                val next = current.listFiles().firstOrNull { it.name == p } ?: return null
                current = next
            }
            return if (current.isFile) current.uri else null
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

        fun resolveDurationMs(uri: Uri?): Long {
            if (uri == null) return 3_000L
            return try {
                val player = MediaPlayer().apply {
                    setDataSource(context, uri)
                    prepare()
                }
                val d = player.duration.toLong().coerceAtLeast(1L)
                player.release()
                d
            } catch (_: Exception) {
                3_000L
            }
        }

        val ambienceUri = resolve(ambienceRelativePath)
        val ambience = if (ambienceUri != null) {
            try {
                MediaPlayer().apply {
                    setDataSource(context, ambienceUri)
                    isLooping = false
                    prepare()
                    setVolume(0f, 0f)
                    start()
                }
            } catch (_: Exception) {
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
                val stepMs = 50L
                val steps = (durationMs / stepMs).coerceAtLeast(1L).toInt()
                repeat(steps) { step ->
                    val t = (step + 1).toFloat() / steps.toFloat()
                    val eased = (t * t * (3f - (2f * t))).coerceIn(0f, 1f)
                    val v = from + ((target - from) * eased)
                    ambienceVolume = v
                    try {
                        active.setVolume(v, v)
                    } catch (_: Exception) {
                        return@launch
                    }
                    delay(stepMs)
                }
                ambienceVolume = target
            }
        }

        if (ambience != null && totalSeconds > 0) {
            ambiencePlaybackJob = launch {
                var preloadedPlayer: MediaPlayer? = null

                while (remaining > 0) {
                    val player: MediaPlayer = when {
                        ambiencePlayer != null -> ambiencePlayer!!
                        preloadedPlayer != null -> preloadedPlayer!!.also {
                            preloadedPlayer = null
                            it.start()
                        }
                        else -> {
                            if (ambienceUri == null) break
                            try {
                                withContext(Dispatchers.IO) {
                                    MediaPlayer().apply {
                                        setDataSource(context, ambienceUri)
                                        isLooping = false
                                        prepare()
                                        setVolume(0f, 0f)
                                    }
                                }.also { it.start() }
                            } catch (_: Exception) {
                                null
                            }
                        }
                    } ?: break

                    ambiencePlayer = player
                    ambienceVolume = 0f
                    ambienceFadeOutInProgress = false
                    startAmbienceFade(target = 1f, durationMs = ambienceLoopFadeMs)

                    val durationMs = player.duration.coerceAtLeast(ambienceLoopFadeMs.toInt())
                    val loopFadeStartMs = (durationMs - ambienceLoopFadeMs.toInt()).coerceAtLeast(0)
                    if (!finalSessionFadeStarted) {
                        launch {
                            delay(loopFadeStartMs.toLong())
                            if (!finalSessionFadeStarted && !ambienceFadeOutInProgress) {
                                ambienceFadeOutInProgress = true
                                startAmbienceFade(target = 0f, durationMs = ambienceLoopFadeMs)
                            }
                            // Pre-load the next player during the fade-out window so it is
                            // ready immediately when the current track ends, avoiding a gap.
                            if (!finalSessionFadeStarted && ambienceUri != null && preloadedPlayer == null) {
                                val loaded = try {
                                    withContext(Dispatchers.IO) {
                                        MediaPlayer().apply {
                                            setDataSource(context, ambienceUri)
                                            isLooping = false
                                            prepare()
                                            setVolume(0f, 0f)
                                        }
                                    }
                                } catch (_: Exception) {
                                    null
                                }
                                if (!finalSessionFadeStarted) {
                                    preloadedPlayer = loaded
                                } else {
                                    loaded?.release()
                                }
                            }
                        }
                    }

                    delay(durationMs.toLong())
                    try {
                        player.stop()
                    } catch (_: Exception) {
                    }
                    player.release()
                    ambiencePlayer = null

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
                continue
            }
            delay(1000)
            if (!isPaused) remaining -= 1
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
