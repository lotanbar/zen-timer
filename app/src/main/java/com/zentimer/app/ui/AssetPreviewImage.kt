package com.zentimer.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun AssetPreviewImage(
    assetTreeUri: String,
    relativePath: String,
    modifier: Modifier = Modifier,
    square: Boolean = false,
    shape: Shape? = RoundedCornerShape(12.dp)
) {
    val context = LocalContext.current
    val bitmap by produceState<Bitmap?>(initialValue = null, assetTreeUri, relativePath) {
        value = withContext(Dispatchers.IO) {
            AssetThumbnailCache.getOrLoad(context, assetTreeUri, relativePath)
        }
    }

    val baseModifier = if (square) {
        modifier.fillMaxWidth().aspectRatio(1f)
    } else {
        modifier.fillMaxWidth().height(120.dp)
    }
    val imageModifier = if (shape != null) baseModifier.clip(shape) else baseModifier

    if (bitmap != null) {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = imageModifier
        )
    } else {
        Box(
            modifier = imageModifier.background(Color(0xFF121212))
        )
    }
}

object AssetThumbnailCache {
    private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    fun preload(context: Context, assetTreeUri: String, relativePaths: List<String>) {
        relativePaths.forEach { path ->
            getOrLoad(context, assetTreeUri, path)
        }
    }

    fun getOrLoad(context: Context, assetTreeUri: String, relativePath: String): Bitmap? {
        if (assetTreeUri.isBlank() || relativePath.isBlank()) return null
        val key = "$assetTreeUri|$relativePath"
        synchronized(cache) {
            cache.get(key)?.let { return it }
        }

        val fileUri = resolveAssetFileUri(assetTreeUri, relativePath, context) ?: return null
        val bitmap = decodeThumbnail(context, fileUri) ?: return null
        synchronized(cache) {
            cache.put(key, bitmap)
        }
        return bitmap
    }

    private fun decodeThumbnail(context: Context, fileUri: Uri): Bitmap? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(fileUri).use { input ->
                BitmapFactory.decodeStream(input, null, bounds)
            }
            val sampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, 320, 320)
            val opts = BitmapFactory.Options().apply { inSampleSize = sampleSize.coerceAtLeast(1) }
            context.contentResolver.openInputStream(fileUri).use { input ->
                BitmapFactory.decodeStream(input, null, opts)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun calculateInSampleSize(srcWidth: Int, srcHeight: Int, reqWidth: Int, reqHeight: Int): Int {
        var inSampleSize = 1
        var width = srcWidth
        var height = srcHeight
        while (width / 2 >= reqWidth && height / 2 >= reqHeight) {
            width /= 2
            height /= 2
            inSampleSize *= 2
        }
        return inSampleSize
    }
}

private fun resolveAssetFileUri(assetTreeUri: String, relativePath: String, context: Context): Uri? {
    val root = openAssetRoot(context, assetTreeUri) ?: return null

    var current: DocumentFile = root
    val segments = relativePath.split('/').filter { it.isNotBlank() }
    for (segment in segments) {
        val next = current.listFiles().firstOrNull { it.name == segment } ?: return null
        current = next
    }
    return if (current.isFile) current.uri else null
}