package com.zentimer.app.ui

import android.app.Application
import android.media.MediaPlayer
import android.net.Uri
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
private const val KEY_SELECTED_AMBIENCE_PATH = "selected_ambience_path"

data class AmbienceTrack(
    val relativePath: String,
    val title: String,
    val thumbnailLabel: String
)

data class MainUiState(
    val assetPath: String = "",
    val isAssetsValid: Boolean = false,
    val isValidatingAssets: Boolean = false,
    val assetBannerMessage: String? = "Assets package path is not selected.",
    val durationSeconds: Int = 0,
    val isTimeConfigured: Boolean = false,
    val ambienceTracks: List<AmbienceTrack> = emptyList(),
    val ambienceSearchQuery: String = "",
    val selectedAmbiencePath: String? = null,
    val previewPlayingPath: String? = null,
    val selectedAmbience: String? = null,
    val selectedBell: String? = null
) {
    val canStartMeditation: Boolean
        get() = assetPath.isNotBlank() &&
            isAssetsValid &&
            isTimeConfigured &&
            selectedAmbience != null &&
            selectedBell != null
}

class ZenTimerViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences(PREFS_NAME, Application.MODE_PRIVATE)
    private val validator = AssetPackageValidator(application)
    private val app = application

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()
    private var ambienceCatalog: List<AmbienceTrack> = emptyList()
    private var previewPlayer: MediaPlayer? = null

    init {
        val savedDuration = prefs.getInt(KEY_DURATION_SECONDS, 0)
        if (savedDuration > 0) {
            _uiState.update {
                it.copy(
                    durationSeconds = savedDuration,
                    isTimeConfigured = true
                )
            }
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
            _uiState.update {
                it.copy(
                    assetPath = savedUri,
                    isValidatingAssets = true
                )
            }
            validateAssets(savedUri)
        }
        initializeAmbienceCatalog()
    }

    fun submitDuration(hours: Int, minutes: Int, seconds: Int): Boolean {
        val total = (hours * 3600) + (minutes * 60) + seconds
        if (total <= 0) return false

        prefs.edit().putInt(KEY_DURATION_SECONDS, total).apply()
        _uiState.update {
            it.copy(
                durationSeconds = total,
                isTimeConfigured = true
            )
        }
        return true
    }

    fun setAmbienceSearchQuery(query: String) {
        _uiState.update { it.copy(ambienceSearchQuery = query) }
    }

    fun refreshAmbienceTracks() {
        if (ambienceCatalog.isEmpty()) return
        _uiState.update { it.copy(ambienceTracks = ambienceCatalog.shuffled().take(20)) }
    }

    fun shuffleAmbienceSelection() {
        val pool = filteredAmbienceTracks(_uiState.value)
        if (pool.isEmpty()) return
        onAmbienceTileTapped(pool.random())
    }

    fun onAmbienceTileTapped(track: AmbienceTrack) {
        val current = _uiState.value.selectedAmbiencePath
        if (current == track.relativePath) {
            stopPreview()
            return
        }

        _uiState.update {
            it.copy(
                selectedAmbiencePath = track.relativePath,
                selectedAmbience = track.title
            )
        }
        startPreview(track.relativePath)
    }

    fun submitAmbienceSelection(): Boolean {
        val selectedPath = _uiState.value.selectedAmbiencePath ?: return false
        prefs.edit().putString(KEY_SELECTED_AMBIENCE_PATH, selectedPath).apply()
        return true
    }

    fun setDemoBellConfigured() {
        _uiState.update { it.copy(selectedBell = "Tibetan Bowl") }
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

    private fun validateAssets(uriString: String) {
        viewModelScope.launch {
            when (val result = validator.validate(Uri.parse(uriString))) {
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
            val tracks = withContext(Dispatchers.IO) {
                app.assets.open("expected_assets_manifest.txt")
                    .bufferedReader()
                    .useLines { lines ->
                        lines
                            .map { it.trim() }
                            .filter { it.endsWith(".mp3", ignoreCase = true) }
                            .filter { !it.startsWith("bells/") }
                            .distinct()
                            .map { path ->
                                val fileName = path.substringAfterLast('/').substringBeforeLast('.')
                                AmbienceTrack(
                                    relativePath = path,
                                    title = prettifyTrackName(fileName),
                                    thumbnailLabel = thumbnailFromName(fileName)
                                )
                            }
                            .toList()
                    }
            }

            ambienceCatalog = tracks
            val savedSelection = prefs.getString(KEY_SELECTED_AMBIENCE_PATH, null)
            val selectedTrack = tracks.firstOrNull { it.relativePath == savedSelection }

            _uiState.update {
                it.copy(
                    ambienceTracks = tracks.shuffled(Random(System.currentTimeMillis())).take(20),
                    selectedAmbiencePath = selectedTrack?.relativePath,
                    selectedAmbience = selectedTrack?.title ?: it.selectedAmbience
                )
            }
        }
    }

    private fun filteredAmbienceTracks(state: MainUiState): List<AmbienceTrack> {
        val q = state.ambienceSearchQuery.trim()
        if (q.isBlank()) return state.ambienceTracks
        return state.ambienceTracks.filter { it.title.contains(q, ignoreCase = true) }
    }

    private fun startPreview(relativePath: String) {
        val treeUriString = _uiState.value.assetPath
        if (treeUriString.isBlank()) return

        viewModelScope.launch(Dispatchers.IO) {
            val uri = resolveTrackUri(treeUriString, relativePath) ?: return@launch
            try {
                previewPlayer?.release()
                previewPlayer = MediaPlayer().apply {
                    setDataSource(app, uri)
                    isLooping = true
                    prepare()
                    start()
                }
                _uiState.update { it.copy(previewPlayingPath = relativePath) }
            } catch (_: Exception) {
                _uiState.update { it.copy(previewPlayingPath = null) }
            }
        }
    }

    private fun stopPreview() {
        previewPlayer?.run {
            try {
                if (isPlaying) stop()
            } catch (_: Exception) {
            }
            release()
        }
        previewPlayer = null
        _uiState.update { it.copy(previewPlayingPath = null) }
    }

    private fun resolveTrackUri(treeUriString: String, relativePath: String): Uri? {
        val root = try {
            DocumentFile.fromTreeUri(app, Uri.parse(treeUriString))
        } catch (_: Exception) {
            null
        } ?: return null

        val segments = relativePath.split("/").filter { it.isNotBlank() }
        var current: DocumentFile = root
        for (segment in segments) {
            val next = current.listFiles().firstOrNull { it.name == segment } ?: return null
            current = next
        }
        return if (current.isFile) current.uri else null
    }

    private fun prettifyTrackName(raw: String): String =
        raw.replace('_', ' ')
            .replace('-', ' ')
            .trim()
            .split(Regex("\\s+"))
            .joinToString(" ") { token ->
                token.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            }

    private fun thumbnailFromName(raw: String): String {
        val s = raw.lowercase()
        return when {
            "rain" in s || "storm" in s || "drip" in s -> "Rain"
            "ocean" in s || "surf" in s || "wave" in s || "water" in s -> "Water"
            "wind" in s || "breeze" in s || "air" in s -> "Wind"
            "forest" in s || "bird" in s || "tree" in s -> "Forest"
            "fire" in s || "campfire" in s -> "Fire"
            else -> "Zen"
        }
    }

    override fun onCleared() {
        super.onCleared()
        previewPlayer?.release()
        previewPlayer = null
    }
}
