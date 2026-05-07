package com.zentimer.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun MainScreen(
    uiState: MainUiState,
    hasAllFilesPermission: Boolean,
    onSetAssetsPath: (String) -> Unit,
    onPermissionMissing: () -> Unit,
    onStartMeditation: (hours: Int, minutes: Int, seconds: Int) -> Unit
) {
    var hours by remember { mutableIntStateOf((uiState.durationSeconds / 3600).coerceIn(0, 99)) }
    var minutes by remember { mutableIntStateOf(((uiState.durationSeconds % 3600) / 60).coerceIn(0, 59)) }
    var seconds by remember { mutableIntStateOf((uiState.durationSeconds % 60).coerceIn(0, 59)) }
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
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        // ── Timer inputs — centered in upper area ─────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 40.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TimeInput(value = hours, label = "HH", max = 99) { hours = it }
                Text(":", style = MaterialTheme.typography.displayMedium,
                    color = MaterialTheme.colorScheme.onSurface)
                TimeInput(value = minutes, label = "MM", max = 59) { minutes = it }
                Text(":", style = MaterialTheme.typography.displayMedium,
                    color = MaterialTheme.colorScheme.onSurface)
                TimeInput(value = seconds, label = "SS", max = 59) { seconds = it }
            }
        }

        // ── Validator + Start ─────────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                when {
                    uiState.isValidatingAssets -> Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        Text("Validating…", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary)
                    }
                    uiState.isAssetsValid -> Text(
                        text = "✓ Valid",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    uiState.assetBannerMessage != null -> Text(
                        text = uiState.assetBannerMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                    else -> Spacer(Modifier)
                }
            }
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = uiState.assetPath,
                onValueChange = {},
                readOnly = true,
                enabled = !uiState.isValidatingAssets,
                singleLine = true,
                isError = !uiState.isAssetsValid && uiState.assetPath.isNotBlank() && !uiState.isValidatingAssets,
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
            Button(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                onClick = { onStartMeditation(hours, minutes, seconds) },
                enabled = uiState.isAssetsValid && (hours > 0 || minutes > 0 || seconds > 0),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Start", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun TimeInput(value: Int, label: String, max: Int, onValueChange: (Int) -> Unit) {
    var text by remember(value) { mutableStateOf("%02d".format(value)) }
    OutlinedTextField(
        modifier = Modifier.width(76.dp),
        value = text,
        onValueChange = { raw ->
            val digits = raw.filter { it.isDigit() }.take(2)
            text = digits
            val parsed = digits.toIntOrNull() ?: 0
            onValueChange(parsed.coerceIn(0, max))
        },
        label = { Text(label) },
        singleLine = true,
        textStyle = MaterialTheme.typography.headlineMedium.copy(textAlign = TextAlign.Center),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        shape = RoundedCornerShape(12.dp)
    )
}
