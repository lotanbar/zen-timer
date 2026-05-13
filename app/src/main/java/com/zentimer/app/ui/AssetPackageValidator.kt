package com.zentimer.app.ui

import android.app.Application
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

sealed interface AssetValidationResult {
    data object Valid : AssetValidationResult
    data class Invalid(val reason: String) : AssetValidationResult
}

class AssetPackageValidator(private val application: Application) {

    suspend fun validate(path: String): AssetValidationResult = withContext(Dispatchers.IO) {
        try {
            val root = openAssetRoot(application, path)
            if (root == null || !root.exists() || !root.isDirectory) {
                return@withContext AssetValidationResult.Invalid("Path unavailable.")
            }
            checkDirectory(root, hasAudioRef = intArrayOf(0))
        } catch (_: Exception) {
            AssetValidationResult.Invalid("Failed to scan folder.")
        }
    }

    private fun checkDirectory(dir: DocumentFile, hasAudioRef: IntArray): AssetValidationResult {
        val children = try { dir.listFiles() } catch (_: Exception) {
            return AssetValidationResult.Invalid("Permission denied.")
        }
        for (child in children) {
            if (child.isDirectory) {
                val result = checkDirectory(child, hasAudioRef)
                if (result is AssetValidationResult.Invalid) return result
            } else if (child.isFile) {
                val name = child.name ?: continue
                val ext = name.substringAfterLast('.', "").lowercase()
                if (ext !in AUDIO_EXTENSIONS) {
                    return AssetValidationResult.Invalid("\"$name\" is not an audio file.")
                }
                hasAudioRef[0]++
            }
        }
        return if (hasAudioRef[0] == 0 && dir.listFiles().none { it.isDirectory }) {
            AssetValidationResult.Invalid("No audio files found.")
        } else {
            AssetValidationResult.Valid
        }
    }
}
