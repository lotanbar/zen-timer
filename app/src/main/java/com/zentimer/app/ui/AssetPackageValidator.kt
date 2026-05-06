package com.zentimer.app.ui

import android.app.Application
import android.content.SharedPreferences
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val EXPECTED_MANIFEST_PATH = "expected_assets_manifest.txt"
private const val PREFS_REMOVED_FILES_KEY = "removed_asset_files"

sealed interface AssetValidationResult {
    data object Valid : AssetValidationResult
    data class Invalid(val reason: String) : AssetValidationResult
}

class AssetPackageValidator(
    private val application: Application,
    private val prefs: SharedPreferences
) {
    private val baseExpectedFiles: Set<String> by lazy {
        application.assets.open(EXPECTED_MANIFEST_PATH).bufferedReader().useLines { lines ->
            lines.map { it.trim() }
                .filter { it.isNotBlank() }
                .toSet()
        }
    }

    /** Files that have been removed by the user at runtime. */
    private fun removedFiles(): Set<String> =
        prefs.getStringSet(PREFS_REMOVED_FILES_KEY, emptySet()) ?: emptySet()

    /** The effective set the validator checks against, excluding runtime removals. */
    private fun effectiveExpectedFiles(): Set<String> = baseExpectedFiles - removedFiles()

    /** Record a runtime removal so the validator keeps passing after the file is deleted. */
    fun recordRemoval(relativePath: String) {
        val current = prefs.getStringSet(PREFS_REMOVED_FILES_KEY, emptySet())?.toMutableSet()
            ?: mutableSetOf()
        current += relativePath
        prefs.edit().putStringSet(PREFS_REMOVED_FILES_KEY, current).apply()
    }

    suspend fun validate(path: String): AssetValidationResult = withContext(Dispatchers.IO) {
        try {
            val root = openAssetRoot(application, path)

            if (root == null || !root.exists() || !root.isDirectory) {
                return@withContext AssetValidationResult.Invalid("Path unavailable.")
            }

            val actualFiles = mutableSetOf<String>()
            val collectResult = collectRelativeFiles(root, "", actualFiles)
            if (collectResult != null) {
                return@withContext collectResult
            }

            val expected = effectiveExpectedFiles()
            if (actualFiles == expected) {
                AssetValidationResult.Valid
            } else {
                val missing = expected.size - actualFiles.size
                val msg = if (missing > 0) "$missing/${expected.size} tracks missing"
                          else "${actualFiles.size}/${expected.size} files found"
                AssetValidationResult.Invalid(msg)
            }
        } catch (_: Exception) {
            AssetValidationResult.Invalid("Failed to scan folder.")
        }
    }

    private fun collectRelativeFiles(
        node: DocumentFile,
        relativeParent: String,
        out: MutableSet<String>
    ): AssetValidationResult.Invalid? {
        val children = try {
            node.listFiles()
        } catch (_: Exception) {
            return AssetValidationResult.Invalid("Permission denied.")
        }

        children.forEach { child ->
            val name = child.name ?: return@forEach
            val relative = if (relativeParent.isBlank()) name else "$relativeParent/$name"

            if (child.isDirectory) {
                val nestedError = collectRelativeFiles(child, relative, out)
                if (nestedError != null) {
                    return nestedError
                }
            } else if (child.isFile) {
                out += relative
            }
        }
        return null
    }
}
