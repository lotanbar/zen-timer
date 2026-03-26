package com.zentimer.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun AmbienceScreen(
    uiState: MainUiState,
    onSearchQueryChange: (String) -> Unit,
    onTrackTapped: (AmbienceTrack) -> Unit,
    onShuffle: () -> Unit,
    onRefreshConfirmed: () -> Unit,
    onSubmit: () -> Unit
) {
    var showRefreshConfirm by remember { mutableStateOf(false) }
    val visibleTracks = uiState.ambienceTracks.filter {
        uiState.ambienceSearchQuery.isBlank() || it.title.contains(uiState.ambienceSearchQuery, ignoreCase = true)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Pick ambience", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            modifier = Modifier.fillMaxWidth(),
            value = uiState.ambienceSearchQuery,
            onValueChange = onSearchQueryChange,
            label = { Text("Search ambience") },
            singleLine = true
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onShuffle) { Text("Shuffle") }
            Button(onClick = { showRefreshConfirm = true }) { Text("Refresh 20") }
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(visibleTracks, key = { it.relativePath }) { track ->
                val isSelected = uiState.selectedAmbiencePath == track.relativePath
                val isPlaying = uiState.previewPlayingPath == track.relativePath
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onTrackTapped(track) },
                    border = if (isSelected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                    colors = CardDefaults.cardColors(
                        containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(track.thumbnailLabel, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(4.dp))
                        Text(track.title, style = MaterialTheme.typography.bodyLarge)
                        if (isPlaying) {
                            Text("Preview playing", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onSubmit,
            enabled = uiState.selectedAmbiencePath != null
        ) {
            Text("Submit ambience")
        }
    }

    if (showRefreshConfirm) {
        AlertDialog(
            onDismissRequest = { showRefreshConfirm = false },
            title = { Text("Refresh ambience list?") },
            text = { Text("This will randomize 20 tracks again and you might lose current visible picks.") },
            confirmButton = {
                TextButton(onClick = {
                    showRefreshConfirm = false
                    onRefreshConfirmed()
                }) {
                    Text("Refresh")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRefreshConfirm = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
