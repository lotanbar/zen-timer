package com.zentimer.app.ui

import android.app.Application
import android.media.MediaPlayer
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.random.Random

private const val PREFS_NAME = "zen_timer_prefs"
private const val KEY_ASSET_TREE_URI = "asset_tree_uri"
private const val KEY_DURATION_SECONDS = "duration_seconds"

data class AmbienceTrack(
    val relativePath: String,
    val title: String
)

data class BellTrack(
    val relativePath: String,
    val title: String
)

data class MainUiState(
    val assetPath: String = "",
    val isAssetsValid: Boolean = false,
    val isValidatingAssets: Boolean = false,
    val assetBannerMessage: String? = "Assets package path is not selected.",
    val durationSeconds: Int = 0,
    val isTimeConfigured: Boolean = false,
) {
    val canStartMeditation: Boolean
        get() = assetPath.isNotBlank() && isAssetsValid && isTimeConfigured
}

class ZenTimerViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences(PREFS_NAME, Application.MODE_PRIVATE)
    private val validator = AssetPackageValidator(application, prefs)
    private val app = application

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    private var ambienceCatalog: List<AmbienceTrack> = emptyList()
    private var bellCatalog: List<BellTrack> = emptyList()

    init {
        val savedDuration = prefs.getInt(KEY_DURATION_SECONDS, 0)
        if (savedDuration > 0) {
            _uiState.update { it.copy(durationSeconds = savedDuration, isTimeConfigured = true) }
        }

        val savedUri = prefs.getString(KEY_ASSET_TREE_URI, null)
        if (savedUri.isNullOrBlank()) {
            _uiState.update {
                it.copy(
                    assetPath = "",
                    isAssetsValid = false,
                    isValidatingAssets = false,
                    assetBannerMessage = "Assets package path is not selected."
                )
            }
        } else {
            _uiState.update { it.copy(assetPath = savedUri, isValidatingAssets = true) }
            validateAssets(savedUri)
        }
        initializeAmbienceCatalog()
        initializeBellCatalog()
    }

    fun submitDuration(hours: Int, minutes: Int, seconds: Int): Boolean {
        val total = (hours * 3600) + (minutes * 60) + seconds
        if (total <= 0) return false
        prefs.edit().putInt(KEY_DURATION_SECONDS, total).apply()
        _uiState.update { it.copy(durationSeconds = total, isTimeConfigured = true) }
        return true
    }

    fun setAssetDirectory(uriString: String) {
        prefs.edit().putString(KEY_ASSET_TREE_URI, uriString).apply()
        _uiState.update {
            it.copy(
                assetPath = uriString,
                isAssetsValid = false,
                isValidatingAssets = true,
                assetBannerMessage = null
            )
        }
        validateAssets(uriString)
    }

    fun clearAssetDirectory() {
        prefs.edit().remove(KEY_ASSET_TREE_URI).apply()
        _uiState.update {
            it.copy(
                assetPath = "",
                isAssetsValid = false,
                isValidatingAssets = false,
                assetBannerMessage = null
            )
        }
    }

    /** Returns a random ambience track, excluding [exclude] if provided. */
    fun pickRandomAmbienceTrack(exclude: String? = null): AmbienceTrack? {
        val pool = if (exclude != null) ambienceCatalog.filter { it.relativePath != exclude }
                   else ambienceCatalog
        return pool.randomOrNull()
    }

    /** Returns a random bell track. */
    fun pickRandomBellTrack(): BellTrack? = bellCatalog.randomOrNull()

    /**
     * Records the removal of [relativePath] in SharedPreferences (so the validator keeps passing),
     * removes the track from the in-memory catalog, and deletes the file from disk.
     */
    fun removeAmbienceFile(relativePath: String, assetPath: String) {
        validator.recordRemoval(relativePath)
        ambienceCatalog = ambienceCatalog.filter { it.relativePath != relativePath }
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val root = openAssetRoot(app, assetPath) ?: return@launch
                val parts = relativePath.split('/').filter { it.isNotBlank() }
                var current: DocumentFile = root
                for (p in parts.dropLast(1)) {
                    current = current.listFiles().firstOrNull { it.name == p } ?: return@launch
                }
                current.listFiles().firstOrNull { it.name == parts.last() }?.delete()
            } catch (e: Exception) {
                Log.w("ZenTimerVM", "Failed to delete $relativePath: $e")
            }
        }
    }

    private fun validateAssets(uriString: String) {
        viewModelScope.launch {
            when (val result = validator.validate(uriString)) {
                is AssetValidationResult.Valid -> {
                    _uiState.update {
                        it.copy(
                            isAssetsValid = true,
                            isValidatingAssets = false,
                            assetBannerMessage = null
                        )
                    }
                }
                is AssetValidationResult.Invalid -> {
                    _uiState.update {
                        it.copy(
                            isAssetsValid = false,
                            isValidatingAssets = false,
                            assetBannerMessage = result.reason
                        )
                    }
                }
            }
        }
    }

    private fun initializeAmbienceCatalog() {
        viewModelScope.launch {
            ambienceCatalog = withContext(Dispatchers.IO) {
                app.assets.open("expected_assets_manifest.txt")
                    .bufferedReader()
                    .useLines { lines ->
                        lines
                            .map { it.trim() }
                            .filter { it.isNotBlank() && it.endsWith(".mp3", ignoreCase = true) && !it.startsWith("bells/") }
                            .distinct()
                            .map { path ->
                                val fileName = path.substringAfterLast('/').substringBeforeLast('.')
                                AmbienceTrack(
                                    relativePath = path,
                                    title = prettifyTrackName(fileName)
                                )
                            }
                            .toList()
                    }
            }
        }
    }

    private fun initializeBellCatalog() {
        viewModelScope.launch {
            bellCatalog = withContext(Dispatchers.IO) {
                app.assets.open("expected_assets_manifest.txt")
                    .bufferedReader()
                    .useLines { lines ->
                        lines
                            .map { it.trim() }
                            .filter { it.startsWith("bells/bells_audio/") && it.endsWith(".mp3", ignoreCase = true) }
                            .distinct()
                            .map { path ->
                                val fileName = path.substringAfterLast('/').substringBeforeLast('.')
                                BellTrack(
                                    relativePath = path,
                                    title = prettifyTrackName(fileName)
                                )
                            }
                            .toList()
                    }
            }
        }
    }

    private fun prettifyTrackName(raw: String): String =
        raw.replace('_', ' ')
            .replace('-', ' ')
            .trim()
            .split(Regex("\\s+"))
            .joinToString(" ") { token ->
                token.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            }
}

