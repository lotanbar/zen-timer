package com.zentimer.app.ui

import android.app.Application
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val EXPECTED_MANIFEST_PATH = "expected_assets_manifest.txt"

sealed interface AssetValidationResult {
    data object Valid : AssetValidationResult
    data class Invalid(val reason: String) : AssetValidationResult
}

class AssetPackageValidator(
    private val application: Application
) {
    private val expectedFiles: Set<String> by lazy {
        application.assets.open(EXPECTED_MANIFEST_PATH).bufferedReader().useLines { lines ->
            lines.map { it.trim() }
                .filter { it.isNotBlank() }
                .toSet()
        }
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

            if (actualFiles == expectedFiles) {
                AssetValidationResult.Valid
            } else {
                val missing = expectedFiles.size - actualFiles.size
                val msg = if (missing > 0) "$missing/${expectedFiles.size} tracks missing"
                          else "${actualFiles.size}/${expectedFiles.size} files found"
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
