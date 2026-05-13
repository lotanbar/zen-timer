package com.zentimer.app.ui

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import java.io.File

val AUDIO_EXTENSIONS = setOf("mp3", "wav", "ogg", "flac", "aac", "m4a", "opus")

/**
 * Returns a [DocumentFile] rooted at [path].
 * [path] may be:
 *  - An absolute filesystem path like `/sdcard/Download/zen-timer-assets`
 *    (requires MANAGE_EXTERNAL_STORAGE on Android 11+)
 *  - A content:// SAF tree URI string from [ActivityResultContracts.OpenDocumentTree]
 */
fun openAssetRoot(context: Context, path: String): DocumentFile? {
    if (path.isBlank()) return null
    return try {
        if (path.startsWith("/")) {
            DocumentFile.fromFile(File(path))
        } else {
            DocumentFile.fromTreeUri(context, Uri.parse(path))
        }
    } catch (_: Exception) {
        null
    }
}

fun collectRelativeFilePaths(
    node: DocumentFile,
    relativeParent: String,
    out: MutableList<String>
) {
    val children = try { node.listFiles() } catch (_: Exception) { return }
    for (child in children) {
        val name = child.name ?: continue
        val relative = if (relativeParent.isBlank()) name else "$relativeParent/$name"
        if (child.isDirectory) {
            collectRelativeFilePaths(child, relative, out)
        } else if (child.isFile) {
            out += relative
        }
    }
}
