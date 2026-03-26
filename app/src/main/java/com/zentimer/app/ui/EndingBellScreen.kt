package com.zentimer.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun EndingBellScreen(
    uiState: MainUiState,
    onBellHighlighted: (BellTrack) -> Unit,
    onBellTapped: (BellTrack) -> Unit,
    onRepeatEnabledChanged: (Boolean) -> Unit,
    onStartBeforeChanged: (String) -> Unit,
    onRepeatCountChanged: (String) -> Unit,
    onScreenClosed: () -> Unit,
    onSubmit: () -> Unit
) {
    DisposableEffect(Unit) {
        onDispose { onScreenClosed() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Pick ending bell", style = MaterialTheme.typography.headlineSmall)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(uiState.bellTracks, key = { it.relativePath }) { bell ->
                val selected = uiState.selectedBellPath == bell.relativePath
                Card(
                    modifier = Modifier
                        .clickable { onBellHighlighted(bell) },
                    border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                    colors = CardDefaults.cardColors(
                        containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .padding(if (selected) 16.dp else 12.dp)
                            .clickable { onBellTapped(bell) }
                    ) {
                        Text(bell.thumbnailLabel, fontWeight = FontWeight.SemiBold)
                        Text(bell.title)
                        if (uiState.bellPreviewPlayingPath == bell.relativePath) {
                            Text("Preview playing", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
            Checkbox(
                checked = uiState.repeatBellsEnabled,
                onCheckedChange = onRepeatEnabledChanged
            )
            Text("Repeat bells", modifier = Modifier.padding(top = 12.dp))
        }
        OutlinedTextField(
            value = uiState.repeatStartBeforeSeconds.toString(),
            onValueChange = onStartBeforeChanged,
            label = { Text("Start playing bells xxx before timer ends") },
            singleLine = true,
            enabled = uiState.repeatBellsEnabled,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = uiState.repeatCount.toString(),
            onValueChange = onRepeatCountChanged,
            label = { Text("Play x bells in that time") },
            singleLine = true,
            enabled = uiState.repeatBellsEnabled,
            modifier = Modifier.fillMaxWidth()
        )
        if (uiState.repeatWarning != null) {
            Text(uiState.repeatWarning, color = MaterialTheme.colorScheme.error)
        }

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onSubmit,
            enabled = uiState.selectedBellPath != null
        ) {
            Text("Submit ending bell")
        }
    }
}
