package com.zentimer.app.ui

import android.app.Application
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.random.Random

const val NO_AMBIENCE_PATH = "__none__"

data class BundledAmbienceTrack(val sentinelPath: String, val resName: String, val label: String)

val BUNDLED_TRACKS = listOf(
    BundledAmbienceTrack("__bundled__/forest_20s", "bundled_forest_20s", "Forest 20s"),
)

private fun bundledUri(sentinelPath: String): Uri? =
    BUNDLED_TRACKS.firstOrNull { it.sentinelPath == sentinelPath }
        ?.let { Uri.parse("android.resource://com.zentimer.app/raw/${it.resName}") }

private const val PREFS_NAME = "zen_timer_prefs"
private const val KEY_ASSET_TREE_URI = "asset_tree_uri"
private const val KEY_DURATION_SECONDS = "duration_seconds"
private const val KEY_SELECTED_AMBIENCE_PATH = "selected_ambience_path"
private const val KEY_SELECTED_BELL_PATH = "selected_bell_path"
private const val BELL_VM_TAG = "ZenBellVM"
private const val BELL_PREVIEW_TARGET_VOLUME = 0.2f
private const val AMBIENCE_BATCH_SIZE = 20

data class AmbienceTrack(
    val relativePath: String,
    val title: String,
    val thumbnailLabel: String,
    val thumbnailRelativePath: String
)

data class BellTrack(
    val relativePath: String,
    val title: String,
    val thumbnailLabel: String,
    val thumbnailRelativePath: String,
    val durationSeconds: Float? = null
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
    val bellTracks: List<BellTrack> = emptyList(),
    val bellSearchQuery: String = "",
    val selectedBellPath: String? = null,
    val bellPreviewPlayingPath: String? = null,
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
    private var allThumbnailPaths: List<String> = emptyList()
    private var bellCatalog: List<BellTrack> = emptyList()
    private var previewPlayer: MediaPlayer? = null
    private var bellPreviewDelayJob: Job? = null
    private var bellPreviewPlayJob: Job? = null
    private var bellPreviewFadeJob: Job? = null

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
            preloadVisibleThumbnails(savedUri)
        }
        initializeAmbienceCatalog()
        initializeBellCatalog()
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
        stopPreview()
        _uiState.update {
            it.copy(ambienceTracks = pickAmbienceBatch(System.currentTimeMillis()))
        }
    }

    fun onAppBackgrounded() {
        stopPreview()
        stopBellPreview()
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

    fun selectNoAmbience() {
        stopPreview()
        _uiState.update {
            it.copy(
                selectedAmbiencePath = NO_AMBIENCE_PATH,
                selectedAmbience = "No sound"
            )
        }
    }

    fun selectBundledAmbience(track: BundledAmbienceTrack) {
        val current = _uiState.value.selectedAmbiencePath
        if (current == track.sentinelPath) { stopPreview(); return }
        _uiState.update { it.copy(selectedAmbiencePath = track.sentinelPath, selectedAmbience = track.label) }
        startPreview(track.sentinelPath)
    }

    fun submitAmbienceSelection(): Boolean {
        val selectedPath = _uiState.value.selectedAmbiencePath ?: return false
        prefs.edit().putString(KEY_SELECTED_AMBIENCE_PATH, selectedPath).apply()
        stopPreview()
        return true
    }

    fun onAmbienceScreenClosed() {
        stopPreview()
    }

    fun setDemoBellConfigured() {
        _uiState.update { it.copy(selectedBell = "Tibetan Bowl") }
    }

    fun onBellHighlighted(track: BellTrack) {
        Log.d(BELL_VM_TAG, "onBellHighlighted path=${track.relativePath}")
        _uiState.update {
            it.copy(
                selectedBellPath = track.relativePath,
                selectedBell = track.title
            )
        }
        bellPreviewDelayJob?.cancel()
        startBellPreview(track.relativePath)
    }

    fun setBellSearchQuery(query: String) {
        _uiState.update { it.copy(bellSearchQuery = query) }
    }

    fun refreshBellTracks() {
        if (bellCatalog.isEmpty()) return
        _uiState.update { it.copy(bellTracks = bellCatalog.shuffled()) }
    }

    fun shuffleBellSelection() {
        val pool = filteredBellTracks(_uiState.value)
        if (pool.isEmpty()) return
        onBellTapped(pool.random())
    }

    fun onBellTapped(track: BellTrack) {
        Log.d(BELL_VM_TAG, "onBellTapped path=${track.relativePath}")
        _uiState.update {
            it.copy(
                selectedBellPath = track.relativePath,
                selectedBell = track.title
            )
        }
        bellPreviewDelayJob?.cancel()
        startBellPreview(track.relativePath)
    }

    fun submitBellSelection(): Boolean {
        val selectedPath = _uiState.value.selectedBellPath ?: return false
        Log.d(BELL_VM_TAG, "submitBellSelection path=$selectedPath")
        prefs.edit().putString(KEY_SELECTED_BELL_PATH, selectedPath).apply()
        stopBellPreview()
        return true
    }

    fun onBellScreenClosed() {
        Log.d(BELL_VM_TAG, "onBellScreenClosed")
        stopBellPreview()
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
        loadBellDurations(uriString)
        validateAssets(uriString)
        preloadVisibleThumbnails(uriString)
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
            val (tracks, thumbnails) = withContext(Dispatchers.IO) {
                val manifestLines = app.assets.open("expected_assets_manifest.txt")
                    .bufferedReader()
                    .useLines { lines -> lines.map { it.trim() }.filter { it.isNotBlank() }.toList() }

                val allThumbnails = manifestLines
                    .filter { it.startsWith("Thumbnails/") && it.endsWith(".jpg", ignoreCase = true) }
                    .distinct()
                    .sorted()

                val catalog = manifestLines
                    .filter { it.endsWith(".mp3", ignoreCase = true) }
                    .filter { !it.startsWith("bells/") }
                    .distinct()
                    .map { path ->
                        val fileName = path.substringAfterLast('/').substringBeforeLast('.')
                        AmbienceTrack(
                            relativePath = path,
                            title = prettifyTrackName(fileName),
                            thumbnailLabel = thumbnailFromName(fileName),
                            thumbnailRelativePath = ""
                        )
                    }
                Pair(catalog, allThumbnails)
            }

            allThumbnailPaths = thumbnails
            ambienceCatalog = tracks
            val savedSelection = prefs.getString(KEY_SELECTED_AMBIENCE_PATH, null)
            val noAmbienceSaved = savedSelection == NO_AMBIENCE_PATH
            val bundledSaved = BUNDLED_TRACKS.firstOrNull { it.sentinelPath == savedSelection }
            val selectedTrack = if (noAmbienceSaved || bundledSaved != null) null
                                else tracks.firstOrNull { it.relativePath == savedSelection }

            val displayed = pickAmbienceBatch(System.currentTimeMillis())

            _uiState.update {
                it.copy(
                    ambienceTracks = displayed,
                    selectedAmbiencePath = when {
                        noAmbienceSaved -> NO_AMBIENCE_PATH
                        bundledSaved != null -> bundledSaved.sentinelPath
                        else -> selectedTrack?.relativePath
                    },
                    selectedAmbience = when {
                        noAmbienceSaved -> "No sound"
                        bundledSaved != null -> bundledSaved.label
                        else -> selectedTrack?.title ?: it.selectedAmbience
                    }
                )
            }
            preloadVisibleThumbnails(_uiState.value.assetPath)
        }
    }

    private fun initializeBellCatalog() {
        viewModelScope.launch {
            val tracks = withContext(Dispatchers.IO) {
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
                                    title = prettifyTrackName(fileName),
                                    thumbnailLabel = thumbnailFromName(fileName),
                                    thumbnailRelativePath = "bells/bells_images/$fileName.png"
                                )
                            }
                            .toList()
                    }
            }
            bellCatalog = tracks
            val savedSelection = prefs.getString(KEY_SELECTED_BELL_PATH, null)
            val selectedTrack = tracks.firstOrNull { it.relativePath == savedSelection }

            _uiState.update { state ->
                state.copy(
                    bellTracks = tracks.shuffled(Random(System.currentTimeMillis())),
                    selectedBellPath = selectedTrack?.relativePath ?: state.selectedBellPath,
                    selectedBell = selectedTrack?.title ?: state.selectedBell
                )
            }
            preloadVisibleThumbnails(_uiState.value.assetPath)

            val assetUri = _uiState.value.assetPath
            if (assetUri.isNotBlank()) {
                loadBellDurations(assetUri)
            }
        }
    }

    private fun loadBellDurations(treeUriString: String) {
        if (bellCatalog.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            val hydrated = bellCatalog.map { bell ->
                val uri = resolveTrackUri(treeUriString, bell.relativePath)
                val sec = if (uri != null) extractDurationSeconds(uri) else null
                bell.copy(durationSeconds = sec)
            }
            bellCatalog = hydrated
            val hydratedByPath = hydrated.associateBy { it.relativePath }
            _uiState.update { state ->
                state.copy(
                    bellTracks = if (state.bellTracks.isEmpty()) {
                        hydrated.shuffled(Random(System.currentTimeMillis()))
                    } else {
                        state.bellTracks.mapNotNull { hydratedByPath[it.relativePath] }
                    }
                )
            }
        }
    }

    private fun extractDurationSeconds(uri: Uri): Float? {
        return try {
            val mmr = MediaMetadataRetriever()
            mmr.setDataSource(app, uri)
            val ms = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            mmr.release()
            ms?.let { it / 1000f }
        } catch (_: Exception) {
            null
        }
    }

    private fun filteredAmbienceTracks(state: MainUiState): List<AmbienceTrack> {
        val q = state.ambienceSearchQuery.trim()
        if (q.isBlank()) return state.ambienceTracks
        return state.ambienceTracks.filter { it.title.contains(q, ignoreCase = true) }
    }

    private fun filteredBellTracks(state: MainUiState): List<BellTrack> {
        val q = state.bellSearchQuery.trim()
        if (q.isBlank()) return state.bellTracks
        return state.bellTracks.filter { it.title.contains(q, ignoreCase = true) }
    }

    private fun preloadVisibleThumbnails(assetTreeUri: String) {
        if (assetTreeUri.isBlank()) return
        val ambienceThumbs = _uiState.value.ambienceTracks.map { it.thumbnailRelativePath }
        val bellThumbs = _uiState.value.bellTracks.map { it.thumbnailRelativePath }
        val allThumbs = (ambienceThumbs + bellThumbs).distinct()
        if (allThumbs.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            AssetThumbnailCache.preload(app, assetTreeUri, allThumbs)
        }
    }

    private fun startPreview(relativePath: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val uri = bundledUri(relativePath) ?: run {
                val treeUriString = _uiState.value.assetPath
                if (treeUriString.isBlank()) return@launch
                resolveTrackUri(treeUriString, relativePath) ?: return@launch
            }
            try {
                previewPlayer?.release()
                previewPlayer = MediaPlayer().apply {
                    setDataSource(app, uri)
                    isLooping = true
                    prepare()
                    start()
                }
                _uiState.update { it.copy(previewPlayingPath = relativePath, bellPreviewPlayingPath = null) }
            } catch (_: Exception) {
                _uiState.update { it.copy(previewPlayingPath = null) }
            }
        }
    }

    private fun startBellPreview(relativePath: String) {
        val treeUriString = _uiState.value.assetPath
        if (treeUriString.isBlank()) {
            Log.d(BELL_VM_TAG, "startBellPreview skipped_no_assets_path path=$relativePath")
            return
        }

        bellPreviewPlayJob?.cancel()
        bellPreviewFadeJob?.cancel()
        Log.d(BELL_VM_TAG, "startBellPreview begin path=$relativePath")
        bellPreviewPlayJob = viewModelScope.launch(Dispatchers.IO) {
            val uri = resolveTrackUri(treeUriString, relativePath) ?: return@launch
            try {
                previewPlayer?.release()
                previewPlayer = MediaPlayer().apply {
                    setDataSource(app, uri)
                    isLooping = false
                    prepare()
                    setVolume(0f, 0f)
                    start()
                }
                bellPreviewFadeJob = viewModelScope.launch(Dispatchers.IO) {
                    val player = previewPlayer ?: return@launch
                    val steps = 40 // 2 seconds / 50ms
                    repeat(steps) { step ->
                        val t = (step + 1).toFloat() / steps.toFloat()
                        val eased = (t * t * (3f - (2f * t))).coerceIn(0f, 1f)
                        val previewVolume = eased * BELL_PREVIEW_TARGET_VOLUME
                        try {
                            player.setVolume(previewVolume, previewVolume)
                        } catch (_: Exception) {
                            return@launch
                        }
                        delay(50)
                    }
                }
                Log.d(BELL_VM_TAG, "startBellPreview started path=$relativePath")
                _uiState.update { it.copy(bellPreviewPlayingPath = relativePath, previewPlayingPath = null) }
            } catch (_: Exception) {
                Log.d(BELL_VM_TAG, "startBellPreview failed path=$relativePath")
                _uiState.update { it.copy(bellPreviewPlayingPath = null) }
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

    private fun stopBellPreview() {
        Log.d(BELL_VM_TAG, "stopBellPreview")
        bellPreviewDelayJob?.cancel()
        bellPreviewDelayJob = null
        bellPreviewPlayJob?.cancel()
        bellPreviewPlayJob = null
        bellPreviewFadeJob?.cancel()
        bellPreviewFadeJob = null
        previewPlayer?.run {
            try {
                if (isPlaying) stop()
            } catch (_: Exception) {
            }
            release()
        }
        previewPlayer = null
        _uiState.update { it.copy(bellPreviewPlayingPath = null) }
    }

    private fun resolveTrackUri(treeUriString: String, relativePath: String): Uri? {
        val root = openAssetRoot(app, treeUriString) ?: return null

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

    private fun normalizeAssetKey(raw: String): String =
        raw.lowercase()
            .replace(Regex("[^a-z0-9]+"), "_")
            .trim('_')

    /**
     * Shuffles the full catalog, picks [AMBIENCE_BATCH_SIZE] tracks, then greedily assigns
     * the best *available* thumbnail to each — so every track in the batch gets a unique,
     * semantically relevant photo with no collisions.
     */
    private fun pickAmbienceBatch(seed: Long): List<AmbienceTrack> {
        if (ambienceCatalog.isEmpty() || allThumbnailPaths.isEmpty()) return emptyList()
        val subset = ambienceCatalog.shuffled(Random(seed)).take(AMBIENCE_BATCH_SIZE)
        val used = mutableSetOf<String>()
        return subset.map { track ->
            val fileName = track.relativePath.substringAfterLast('/').substringBeforeLast('.')
            val segments = track.relativePath.split("/")
            val parentFolder = if (segments.size >= 2) segments[segments.size - 2] else ""
            val thumbnail = findBestAvailableThumbnail(
                trackContext = "$parentFolder $fileName",
                folderName = parentFolder,
                thumbnails = allThumbnailPaths,
                used = used,
                seed = normalizeAssetKey(track.relativePath).hashCode().toLong() xor seed
            )
            used += thumbnail
            track.copy(thumbnailRelativePath = thumbnail)
        }
    }

    // When keyword score is 0, restrict the fallback pool to thumbnails that are
    // visually relevant for the Boom Library folder rather than picking from all 150.
    private val folderCategoryKeywords: Map<String, List<String>> = mapOf(
        "ocean-surf" to listOf(
            "ocean", "wave", "lapping", "crashing", "beach", "island", "sea", "windswept", "shore"
        ),
        "water-ambiences" to listOf(
            "brook", "bubbling", "flow", "stream", "river", "waterfall", "fountain", "lake",
            "spring", "water", "cave", "drip", "campfire", "fire", "pool", "creek"
        ),
        "weather-atmospheric" to listOf(
            "wind", "rain", "storm", "thunder", "forest", "pine", "tree",
            "jungle", "rainforest", "wood", "cloud"
        )
    )

    private fun findBestAvailableThumbnail(
        trackContext: String,
        folderName: String,
        thumbnails: List<String>,
        used: Set<String>,
        seed: Long
    ): String {
        val available = thumbnails.filter { it !in used }.ifEmpty { thumbnails }

        val stopwords = setOf(
            "the", "and", "for", "with", "from", "by", "in", "on", "at", "to", "of", "a", "an",
            "v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10"
        )
        fun keywords(s: String): List<String> =
            s.lowercase()
                .replace(Regex("[^a-z0-9]+"), " ")
                .trim()
                .split(Regex("\\s+"))
                .filter { it.length >= 3 && it !in stopwords }

        val trackWords = keywords(trackContext)
        fun thumbScore(path: String): Int {
            val thumbName = path.substringAfterLast('/').substringBeforeLast('.')
                .lowercase().replace('_', ' ')
            return trackWords.count { word -> thumbName.contains(word) }
        }

        val scored = available.map { it to thumbScore(it) }
        val maxScore = scored.maxOf { it.second }

        // Keyword hit — return best match
        if (maxScore > 0) {
            val best = scored.filter { it.second == maxScore }.map { it.first }
            return best.random(Random(seed))
        }

        // No keyword match — restrict to folder category pool to avoid absurd mismatches
        val categoryKeywords = folderCategoryKeywords[folderName.lowercase().replace(' ', '-')]
        if (categoryKeywords != null) {
            val categoryPool = available.filter { path ->
                val thumbName = path.substringAfterLast('/').substringBeforeLast('.')
                    .lowercase().replace('_', ' ')
                categoryKeywords.any { kw -> thumbName.contains(kw) }
            }
            if (categoryPool.isNotEmpty()) return categoryPool.random(Random(seed))
        }

        // Last resort — anything available
        return available.random(Random(seed))
    }

    override fun onCleared() {
        super.onCleared()
        bellPreviewDelayJob?.cancel()
        bellPreviewPlayJob?.cancel()
        bellPreviewFadeJob?.cancel()
        previewPlayer?.release()
        previewPlayer = null
    }
}
