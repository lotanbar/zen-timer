package com.zentimer.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.zentimer.app.ui.MainScreen
import com.zentimer.app.ui.MeditationScreen
import com.zentimer.app.ui.ZenAppTheme
import com.zentimer.app.ui.ZenTimerViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ZenAppTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    val viewModel: ZenTimerViewModel = viewModel()
                    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

                    var hasAllFilesPermission by remember { mutableStateOf(Environment.isExternalStorageManager()) }
                    val lifecycleOwner = LocalLifecycleOwner.current
                    DisposableEffect(lifecycleOwner) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME) {
                                hasAllFilesPermission = Environment.isExternalStorageManager()
                            }
                        }
                        lifecycleOwner.lifecycle.addObserver(observer)
                        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                    }

                    var showAllFilesDialog by remember { mutableStateOf(!hasAllFilesPermission) }
                    fun promptForPermission() { showAllFilesDialog = true }

                    val allFilesSettingsLauncher = rememberLauncherForActivityResult(
                        ActivityResultContracts.StartActivityForResult()
                    ) { /* ON_RESUME above will update hasAllFilesPermission */ }

                    if (showAllFilesDialog) {
                        AlertDialog(
                            onDismissRequest = { showAllFilesDialog = false },
                            title = { Text("Allow full file access?") },
                            text = { Text(
                                "Zen Timer needs \"All files access\" to browse and read " +
                                "your asset folder. Tap Open Settings, enable the toggle, " +
                                "then come back."
                            )},
                            confirmButton = {
                                TextButton(onClick = {
                                    showAllFilesDialog = false
                                    allFilesSettingsLauncher.launch(
                                        Intent(
                                            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                            Uri.parse("package:$packageName")
                                        )
                                    )
                                }) { Text("Open Settings") }
                            },
                            dismissButton = {
                                TextButton(onClick = { showAllFilesDialog = false }) {
                                    Text("Not now")
                                }
                            }
                        )
                    }

                    // Randomly selected tracks for the current/upcoming session
                    var sessionAmbiencePath by remember { mutableStateOf<String?>(null) }
                    var sessionBellPath by remember { mutableStateOf<String?>(null) }

                    NavHost(navController = navController, startDestination = "main") {
                        composable("main") {
                            MainScreen(
                                uiState = uiState,
                                hasAllFilesPermission = hasAllFilesPermission,
                                onSetAssetsPath = { viewModel.setAssetDirectory(it) },
                                onPermissionMissing = ::promptForPermission,
                                onStartMeditation = { hours, minutes, seconds ->
                                    val accepted = viewModel.submitDuration(hours, minutes, seconds)
                                    if (accepted) {
                                        sessionAmbiencePath = viewModel.pickRandomAmbienceTrack()?.relativePath
                                        sessionBellPath = viewModel.pickRandomBellTrack()?.relativePath
                                        navController.navigate("meditation")
                                    }
                                }
                            )
                        }
                        composable("meditation") {
                            MeditationScreen(
                                totalSeconds = uiState.durationSeconds,
                                assetTreeUri = uiState.assetPath,
                                initialAmbienceRelativePath = sessionAmbiencePath,
                                endingBellRelativePath = sessionBellPath,
                                onNextAmbience = {
                                    viewModel.pickRandomAmbienceTrack(exclude = sessionAmbiencePath)
                                        ?.relativePath
                                        ?.also { sessionAmbiencePath = it }
                                },
                                onRemoveAmbience = { path ->
                                    viewModel.removeAmbienceFile(path, uiState.assetPath)
                                },
                                onSessionFinished = { navController.popBackStack("main", false) }
                            )
                        }
                    }
                }
            }
        }
    }
}
