package com.zentimer.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.clickable
import androidx.compose.ui.unit.dp
import com.zentimer.app.R

@Composable
fun MainScreen(
    uiState: MainUiState,
    onPickTime: () -> Unit,
    onPickAmbience: () -> Unit,
    onPickBell: () -> Unit,
    onPickAssetsPath: () -> Unit,
    onStartMeditation: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val downloadUrl = stringResource(R.string.assets_download_url)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Zen Timer", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)

        SelectionCard(
            title = "Time",
            value = if (uiState.isTimeConfigured) formatDuration(uiState.durationSeconds) else "Not selected",
            actionLabel = "Pick duration",
            onAction = onPickTime
        )
        SelectionCard(
            title = "Ambience",
            value = uiState.selectedAmbience ?: "Not selected",
            actionLabel = "Pick ambience",
            onAction = onPickAmbience
        )
        SelectionCard(
            title = "Ending bell",
            value = uiState.selectedBell ?: "Not selected",
            actionLabel = "Pick bell",
            onAction = onPickBell
        )

        Spacer(Modifier.height(8.dp))
        Text("Configure assets", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
        Button(onClick = onPickAssetsPath) {
            Text("Pick assets folder")
        }
        Text(
            text = if (uiState.assetPath.isBlank()) "No assets folder selected." else "Selected: ${uiState.assetPath}",
            style = MaterialTheme.typography.bodySmall
        )
        if (uiState.isValidatingAssets) {
            AssistChip(
                onClick = {},
                enabled = false,
                label = { Text("Validating selected package...") }
            )
        }

        val gateReason = remember(uiState) {
            when {
                uiState.assetPath.isBlank() -> "Set assets path to continue."
                !uiState.isAssetsValid -> "Assets package validation is required."
                !uiState.isTimeConfigured -> "Choose meditation duration."
                uiState.selectedAmbience == null -> "Choose ambience."
                uiState.selectedBell == null -> "Choose ending bell."
                else -> null
            }
        }

        if (gateReason != null) {
            Text(
                text = "Meditation blocked: $gateReason",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Spacer(Modifier.weight(1f))
        if (uiState.assetBannerMessage != null) {
            Text(
                text = uiState.assetBannerMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }
        Text(
            text = stringResource(R.string.assets_download_label),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.clickable {
                uriHandler.openUri(downloadUrl)
            }
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onStartMeditation,
            enabled = uiState.canStartMeditation
        ) {
            Text("Start meditation")
        }
    }
}

private fun formatDuration(totalSeconds: Int): String {
    val hh = totalSeconds / 3600
    val mm = (totalSeconds % 3600) / 60
    val ss = totalSeconds % 60
    return "%02d:%02d:%02d selected".format(hh, mm, ss)
}

@Composable
private fun SelectionCard(
    title: String,
    value: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            Text(value, style = MaterialTheme.typography.bodyMedium)
            Button(onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}
