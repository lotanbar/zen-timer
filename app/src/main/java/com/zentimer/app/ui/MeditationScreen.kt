package com.zentimer.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun MeditationScreen(
    totalSeconds: Int,
    onSessionFinished: () -> Unit
) {
    var remaining by remember(totalSeconds) {
        mutableIntStateOf(totalSeconds.coerceAtLeast(0))
    }

    LaunchedEffect(totalSeconds) {
        while (remaining > 0) {
            delay(1000)
            remaining -= 1
        }
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
