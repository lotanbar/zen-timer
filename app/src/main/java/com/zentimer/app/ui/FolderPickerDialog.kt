package com.zentimer.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import java.io.File

@Composable
fun FolderPickerDialog(
    initialPath: String,
    onFolderSelected: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val startFile = remember(initialPath) {
        val f = File(initialPath)
        when {
            f.isDirectory -> f
            f.parentFile?.isDirectory == true -> f.parentFile!!
            else -> File("/storage/emulated/0")
        }
    }
    var currentDir by remember { mutableStateOf(startFile) }
    val subDirs = remember(currentDir) {
        currentDir.listFiles()
            ?.filter { it.isDirectory && !it.name.startsWith(".") }
            ?.sortedBy { it.name.lowercase() }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 6.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp, start = 20.dp, end = 20.dp, bottom = 8.dp)
            ) {
                Text("Select folder", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    text = currentDir.absolutePath,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()

                LazyColumn(modifier = Modifier.fillMaxWidth().height(420.dp)) {
                    // ".." row
                    currentDir.parentFile?.let { parent ->
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { currentDir = parent }
                                    .padding(vertical = 12.dp, horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Go up",
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(Modifier.width(12.dp))
                                Text("..")
                            }
                            HorizontalDivider()
                        }
                    }

                    if (subDirs == null) {
                        item {
                            Text(
                                "No access. Grant \"All files access\" in Settings first.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    } else if (subDirs.isEmpty()) {
                        item {
                            Text(
                                "No subfolders here.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    } else {
                        items(subDirs) { dir ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { currentDir = dir }
                                    .padding(vertical = 12.dp, horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Filled.Folder,
                                    contentDescription = null,
                                    modifier = Modifier.size(20.dp),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    dir.name,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                HorizontalDivider()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    TextButton(onClick = { onFolderSelected(currentDir.absolutePath) }) {
                        Text("Select")
                    }
                }
            }
        }
    }
}
