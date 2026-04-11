package com.zentimer.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.filled.Forest
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

data class SelectableTrack(
    val relativePath: String,
    val thumbnailRelativePath: String
)

/**
 * Shared grid-picker used for both ambience and ending-bell selection.
 *
 * @param imagePadded  When true each image is rendered at 70 % of the tile and centred,
 *                     leaving a visible tile background (used for bell icons).
 * @param onTrackTapped       Called on every tap (first tap for bells = highlight/preview).
 * @param onTrackConfirmed    Optional second-tap callback; when non-null, tapping the already-
 *                            selected tile calls this instead of [onTrackTapped].
 * @param onRefresh    When non-null a Refresh button is shown next to Shuffle.
 */
@Composable
fun TrackSelectionScreen(
    assetPath: String,
    tracks: List<SelectableTrack>,
    selectedPath: String?,
    imagePadded: Boolean = false,
    showNoneOption: Boolean = false,
    isNoneSelected: Boolean = false,
    onNoneSelected: () -> Unit = {},
    bundledTracks: List<BundledAmbienceTrack> = emptyList(),
    onBundledSelected: (BundledAmbienceTrack) -> Unit = {},
    onTrackTapped: (SelectableTrack) -> Unit,
    onTrackConfirmed: ((SelectableTrack) -> Unit)? = null,
    onShuffle: () -> Unit,
    onRefresh: (() -> Unit)? = null,
    onScreenClosed: () -> Unit,
    submitText: String,
    submitEnabled: Boolean,
    onSubmit: () -> Unit
) {
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
        // Grid occupies all remaining space above the button row
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            val spacing = 10.dp
            LazyVerticalGrid(
                columns = GridCells.Fixed(4),
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(spacing),
                verticalArrangement = Arrangement.spacedBy(spacing)
            ) {
                if (showNoneOption) {
                    item(key = "none") {
                        val border = if (isNoneSelected) BorderStroke(3.dp, MaterialTheme.colorScheme.onSurface) else null
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .clickable { onNoneSelected() },
                            shape = MaterialTheme.shapes.medium,
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            border = border
                        ) {
                            Column(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.Center,
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.VolumeOff,
                                    contentDescription = "No ambience",
                                    modifier = Modifier.size(24.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = "None",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                bundledTracks.forEach { bundled ->
                    item(key = "bundled_${bundled.sentinelPath}") {
                        val isSelected = selectedPath == bundled.sentinelPath
                        val border = if (isSelected) BorderStroke(3.dp, MaterialTheme.colorScheme.onSurface) else null
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .clickable { onBundledSelected(bundled) },
                            shape = MaterialTheme.shapes.medium,
                            color = Color(0xFF2D6A4F),
                            border = border
                        ) {
                            Column(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.Center,
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Forest,
                                    contentDescription = bundled.label,
                                    modifier = Modifier.size(28.dp),
                                    tint = Color(0xFFB7E4C7)
                                )
                                Text(
                                    text = bundled.label,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFFB7E4C7)
                                )
                            }
                        }
                    }
                }
                items(tracks, key = { it.relativePath }) { track ->
                    val isSelected = selectedPath == track.relativePath
                    val border = if (isSelected) BorderStroke(3.dp, MaterialTheme.colorScheme.onSurface) else null
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                if (isSelected && onTrackConfirmed != null) {
                                    onTrackConfirmed(track)
                                } else {
                                    onTrackTapped(track)
                                }
                            },
                        shape = MaterialTheme.shapes.medium,
                        color = if (imagePadded) MaterialTheme.colorScheme.surfaceVariant
                                else MaterialTheme.colorScheme.background,
                        border = border
                    ) {
                        if (imagePadded) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(1f),
                                contentAlignment = Alignment.Center
                            ) {
                                AssetPreviewImage(
                                    assetTreeUri = assetPath,
                                    relativePath = track.thumbnailRelativePath,
                                    modifier = Modifier.fillMaxWidth(0.7f),
                                    square = true,
                                    shape = MaterialTheme.shapes.small
                                )
                            }
                        } else {
                            AssetPreviewImage(
                                assetTreeUri = assetPath,
                                relativePath = track.thumbnailRelativePath,
                                square = true,
                                shape = null
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.padding(top = 8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                IconButton(onClick = onShuffle, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Filled.Shuffle, contentDescription = "Shuffle")
                }
            }
            if (onRefresh != null) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    IconButton(onClick = onRefresh, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                }
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = onSubmit,
                enabled = submitEnabled
            ) {
                Text(submitText)
            }
        }
    }
}
