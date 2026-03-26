package com.zentimer.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.zentimer.app.ui.MainScreen
import com.zentimer.app.ui.MeditationScreen
import com.zentimer.app.ui.TimePickerScreen
import com.zentimer.app.ui.ZenTimerViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    val viewModel: ZenTimerViewModel = viewModel()
                    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
                    val treePickerLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.OpenDocumentTree()
                    ) { uri ->
                        if (uri != null) {
                            val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                            try {
                                contentResolver.takePersistableUriPermission(uri, takeFlags)
                            } catch (_: Exception) {
                                // Validation step will surface permission/path errors in the UI banner.
                            }
                            viewModel.setAssetDirectory(uri.toString())
                        }
                    }

                    NavHost(
                        navController = navController,
                        startDestination = "main"
                    ) {
                        composable("main") {
                            MainScreen(
                                uiState = uiState,
                                onPickTime = { navController.navigate("time_picker") },
                                onPickAmbience = viewModel::setDemoAmbienceConfigured,
                                onPickBell = viewModel::setDemoBellConfigured,
                                onPickAssetsPath = { treePickerLauncher.launch(null) },
                                onStartMeditation = { navController.navigate("meditation") }
                            )
                        }
                        composable("time_picker") {
                            TimePickerScreen(
                                initialTotalSeconds = uiState.durationSeconds,
                                onSubmitDuration = viewModel::submitDuration,
                                onClose = { navController.popBackStack() }
                            )
                        }
                        composable("meditation") {
                            MeditationScreen(
                                totalSeconds = uiState.durationSeconds,
                                onSessionFinished = { navController.popBackStack("main", false) }
                            )
                        }
                    }
                }
            }
        }
    }
}
