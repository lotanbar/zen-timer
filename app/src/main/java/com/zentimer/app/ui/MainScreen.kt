package com.zentimer.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.zentimer.app.R

@Composable
fun MainScreen(
    uiState: MainUiState,
    hasAllFilesPermission: Boolean,
    onPickTime: () -> Unit,
    onPickAmbience: () -> Unit,
    onPickBell: () -> Unit,
    onSetAssetsPath: (String) -> Unit,
    onPermissionMissing: () -> Unit,
    onStartMeditation: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val downloadUrl = stringResource(R.string.assets_download_url)
    val selectedAmbienceThumb = uiState.ambienceTracks
        .firstOrNull { it.relativePath == uiState.selectedAmbiencePath }
        ?.thumbnailRelativePath
    val selectedBellThumb = uiState.bellTracks
        .firstOrNull { it.relativePath == uiState.selectedBellPath }
        ?.thumbnailRelativePath

    var showFolderPicker by remember { mutableStateOf(false) }

    if (showFolderPicker) {
        FolderPickerDialog(
            initialPath = uiState.assetPath.takeIf { it.startsWith("/") }
                ?: "/storage/emulated/0",
            onFolderSelected = { path ->
                onSetAssetsPath(path)
                showFolderPicker = false
            },
            onDismiss = { showFolderPicker = false }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 10.dp, vertical = 16.dp)
            .navigationBarsPadding()
            .padding(bottom = 12.dp)
    ) {
        val gateReason = remember(uiState) {
            when {
                uiState.assetPath.isBlank() -> null
                uiState.isValidatingAssets -> null
                !uiState.isAssetsValid -> null
                !uiState.isTimeConfigured -> "Choose meditation duration."
                uiState.selectedAmbience == null -> "Choose ambience."
                uiState.selectedBell == null -> "Choose ending bell."
                else -> null
            }
        }

        Spacer(Modifier.weight(1f))

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            SelectionCard(
                modifier = Modifier.fillMaxWidth(),
                title = "Time",
                value = if (uiState.isTimeConfigured) formatDuration(uiState.durationSeconds) else "Not selected",
                assetTreeUri = null,
                thumbnailRelativePath = null,
                onAction = onPickTime
            )
            SelectionCard(
                modifier = Modifier.fillMaxWidth(),
                title = "Ambience",
                value = uiState.selectedAmbience ?: "Not selected",
                assetTreeUri = uiState.assetPath,
                thumbnailRelativePath = selectedAmbienceThumb,
                onAction = onPickAmbience
            )
            SelectionCard(
                modifier = Modifier.fillMaxWidth(),
                title = "Ending bell",
                value = uiState.selectedBell ?: "Not selected",
                assetTreeUri = uiState.assetPath,
                thumbnailRelativePath = selectedBellThumb,
                onAction = onPickBell
            )
        }

        Spacer(Modifier.weight(1f))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Download Assets",
                style = MaterialTheme.typography.titleMedium,
                color = androidx.compose.ui.graphics.Color(0xFF4D8DFF),
                textDecoration = TextDecoration.Underline,
                modifier = Modifier.clickable { uriHandler.openUri(downloadUrl) }
            )
            when {
                uiState.isValidatingAssets -> {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Text(
                            text = "Validating…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                }
                uiState.isAssetsValid -> {
                    Text(
                        text = "✓ Valid",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                uiState.assetBannerMessage != null -> {
                    Text(
                        text = uiState.assetBannerMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .alpha(if (uiState.isValidatingAssets) 0.5f else 1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val pathInvalid = !uiState.isAssetsValid && uiState.assetPath.isNotBlank() && !uiState.isValidatingAssets
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = uiState.assetPath,
                onValueChange = {},
                readOnly = true,
                enabled = !uiState.isValidatingAssets,
                singleLine = true,
                isError = pathInvalid,
                label = { Text("Config path") },
                placeholder = { Text("No folder selected") },
                trailingIcon = {
                    IconButton(
                        onClick = {
                            if (hasAllFilesPermission) showFolderPicker = true
                            else onPermissionMissing()
                        },
                        enabled = !uiState.isValidatingAssets
                    ) {
                        Icon(Icons.Filled.FolderOpen, contentDescription = "Browse for folder")
                    }
                }
            )
        }

        Spacer(Modifier.height(6.dp))

        Button(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp),
            onClick = onStartMeditation,
            enabled = uiState.canStartMeditation,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text("Start")
        }
    }
}

private fun formatDuration(totalSeconds: Int): String {
    val hh = totalSeconds / 3600
    val mm = (totalSeconds % 3600) / 60
    val ss = totalSeconds % 60
    return "%02d:%02d:%02d".format(hh, mm, ss)
}

@Composable
private fun SelectionCard(
    modifier: Modifier,
    title: String,
    value: String,
    assetTreeUri: String?,
    thumbnailRelativePath: String?,
    onAction: () -> Unit
) {
    Card(
        modifier = modifier
            .height(108.dp)
            .clickable(onClick = onAction),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.Center
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(4.dp))
                Text(
                    value,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            if (!thumbnailRelativePath.isNullOrBlank() && !assetTreeUri.isNullOrBlank()) {
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .size(58.dp)
                        .clip(RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    AssetPreviewImage(
                        assetTreeUri = assetTreeUri,
                        relativePath = thumbnailRelativePath,
                        square = true,
                        shape = null
                    )
                }
            } else {
                Icon(
                    imageVector = Icons.Filled.AccessTime,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
