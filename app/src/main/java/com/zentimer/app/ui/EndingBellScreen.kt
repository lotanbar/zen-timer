package com.zentimer.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

@Composable
fun EndingBellScreen(
    uiState: MainUiState,
    onShuffle: () -> Unit,
    onBellHighlighted: (BellTrack) -> Unit,
    onBellTapped: (BellTrack) -> Unit,
    onScreenClosed: () -> Unit,
    onSubmit: () -> Unit
) {
    val visibleTracks = uiState.bellTracks

    DisposableEffect(Unit) {
        onDispose { onScreenClosed() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                IconButton(onClick = onShuffle, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Filled.Shuffle, contentDescription = "Shuffle")
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center
        ) {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth(0.98f)) {
                val spacing = 10.dp
                val density = LocalDensity.current
                val tileSize = with(density) { ((maxWidth - (spacing * 3)) / 4).toPx() }
                val gridRows = ((visibleTracks.size + 3) / 4).coerceAtLeast(1)
                val gridHeight = with(density) { (tileSize * gridRows.toFloat()).toDp() + (spacing * (gridRows - 1)) }

                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(gridHeight),
                    horizontalArrangement = Arrangement.spacedBy(spacing),
                    verticalArrangement = Arrangement.spacedBy(spacing)
                ) {
                    items(visibleTracks, key = { it.relativePath }) { bell ->
                        val selected = uiState.selectedBellPath == bell.relativePath
                        val border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.onSurface) else null
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(MaterialTheme.shapes.medium)
                                .clickable {
                                    if (selected) onBellTapped(bell) else onBellHighlighted(bell)
                                },
                            shape = MaterialTheme.shapes.medium,
                            color = MaterialTheme.colorScheme.background,
                            border = border
                        ) {
                            AssetPreviewImage(
                                assetTreeUri = uiState.assetPath,
                                relativePath = bell.thumbnailRelativePath,
                                square = true
                            )
                        }
                    }
                }
            }
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
