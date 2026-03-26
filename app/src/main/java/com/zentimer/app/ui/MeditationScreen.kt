package com.zentimer.app.ui

import android.media.MediaPlayer
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun MeditationScreen(
    totalSeconds: Int,
    assetTreeUri: String,
    ambienceRelativePath: String?,
    endingBellRelativePath: String?,
    repeatBellsEnabled: Boolean,
    repeatStartBeforeSeconds: Int,
    repeatCount: Int,
    onSessionFinished: () -> Unit
) {
    val context = LocalContext.current
    var remaining by remember(totalSeconds) {
        mutableIntStateOf(totalSeconds.coerceAtLeast(0))
    }
    val oneShotPlayers = remember { mutableListOf<MediaPlayer>() }
    var ambiencePlayer by remember { androidx.compose.runtime.mutableStateOf<MediaPlayer?>(null) }
    var ambienceLoopJob by remember { androidx.compose.runtime.mutableStateOf<kotlinx.coroutines.Job?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            ambienceLoopJob?.cancel()
            ambiencePlayer?.release()
            oneShotPlayers.forEach { player ->
                try {
                    player.stop()
                } catch (_: Exception) {
                }
                player.release()
            }
            oneShotPlayers.clear()
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
                    start()
                }
                oneShotPlayers += player
            } catch (_: Exception) {
            }
        }

        val ambienceUri = resolve(ambienceRelativePath)
        if (ambienceUri != null) {
            ambienceLoopJob = launch {
                while (isActive && remaining > 0) {
                    val player = try {
                        MediaPlayer().apply {
                            setDataSource(context, ambienceUri)
                            isLooping = false
                            prepare()
                        }
                    } catch (_: Exception) {
                        null
                    } ?: break

                    ambiencePlayer?.release()
                    ambiencePlayer = player
                    // Fade in 5 seconds.
                    repeat(10) { step ->
                        player.setVolume((step + 1) / 10f, (step + 1) / 10f)
                        delay(500)
                    }
                    player.start()

                    val dur = player.duration.coerceAtLeast(10000)
                    val untilFadeOut = (dur - 5000).coerceAtLeast(1000).toLong()
                    delay(untilFadeOut)
                    // Fade out 5 seconds before loop edge.
                    repeat(10) { step ->
                        val v = ((9 - step).coerceAtLeast(0)) / 10f
                        player.setVolume(v, v)
                        delay(500)
                    }
                    try {
                        player.stop()
                    } catch (_: Exception) {
                    }
                    player.release()
                    ambiencePlayer = null
                }
            }
        }

        val endingBellUri = resolve(endingBellRelativePath)
        if (repeatBellsEnabled && endingBellUri != null && totalSeconds > 1) {
            val startBefore = repeatStartBeforeSeconds.coerceAtLeast(1)
            val count = repeatCount.coerceAtLeast(1)
            val sessionStartBefore = startBefore.coerceAtMost(totalSeconds)
            val intervalMs = ((sessionStartBefore * 1000L) / count).coerceAtLeast(500L)
            val firstDelay = ((totalSeconds - sessionStartBefore) * 1000L).coerceAtLeast(0L)
            launch {
                delay(firstDelay)
                repeat(count) { idx ->
                    if (remaining > 0) playOneShot(endingBellUri)
                    if (idx < count - 1) delay(intervalMs)
                }
            }
        }

        while (remaining > 0) {
            delay(1000)
            remaining -= 1
        }

        ambienceLoopJob?.cancel()
        ambiencePlayer?.run {
            try {
                stop()
            } catch (_: Exception) {
            }
            release()
        }
        ambiencePlayer = null

        // End bell + 15s tail then return.
        playOneShot(resolve(endingBellRelativePath))
        delay(15000)
        onSessionFinished()
    }

    val mm = remaining / 60
    val ss = remaining % 60
    val formatted = "%02d:%02d".format(mm, ss)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Meditation", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = formatted,
            style = MaterialTheme.typography.displayLarge,
            fontWeight = FontWeight.Bold
        )
        Button(onClick = onSessionFinished) {
            Text("Return to setup")
        }
    }
}
