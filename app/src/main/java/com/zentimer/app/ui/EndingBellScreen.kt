package com.zentimer.app.ui

import android.util.Log
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.abs

private const val BELL_UI_TAG = "ZenBellUI"
private const val LOOP_MULTIPLIER = 200

@Composable
fun EndingBellScreen(
    uiState: MainUiState,
    onBellHighlighted: (BellTrack) -> Unit,
    onBellTapped: (BellTrack) -> Unit,
    onScreenClosed: () -> Unit,
    onSubmit: () -> Unit
) {
    DisposableEffect(Unit) {
        Log.d(BELL_UI_TAG, "screen_open")
        onDispose { onScreenClosed() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Pick ending bell", style = MaterialTheme.typography.headlineSmall)
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val scope = rememberCoroutineScope()
            val realCount = uiState.bellTracks.size
            val virtualCount = if (realCount == 0) 0 else realCount * LOOP_MULTIPLIER
            val initialVirtualIndex = remember(realCount) {
                if (realCount == 0) 0 else (virtualCount / 2) - ((virtualCount / 2) % realCount)
            }
            val listState = rememberLazyListState(initialFirstVisibleItemIndex = initialVirtualIndex)
            val snapFlingBehavior = rememberSnapFlingBehavior(
                lazyListState = listState,
                snapPosition = SnapPosition.Center
            )
            val sidePadding = maxWidth * 0.25f

            val centeredBell by remember(realCount, listState, uiState.bellTracks) {
                derivedStateOf { closestToCenter(uiState.bellTracks, listState, realCount) }
            }
            var userInteracted by remember { mutableStateOf(false) }
            var lastHandledCenterPath by remember { mutableStateOf<String?>(null) }

            LaunchedEffect(listState.isScrollInProgress, centeredBell?.relativePath) {
                Log.d(
                    BELL_UI_TAG,
                    "scroll_state inProgress=${listState.isScrollInProgress} centered=${centeredBell?.relativePath}"
                )
                if (listState.isScrollInProgress) {
                    userInteracted = true
                }
                if (!listState.isScrollInProgress) {
                    centeredBell?.let { bell ->
                        if (userInteracted && bell.relativePath != lastHandledCenterPath) {
                            Log.d(BELL_UI_TAG, "center_lock_select path=${bell.relativePath}")
                            onBellHighlighted(bell)
                            lastHandledCenterPath = bell.relativePath
                        }
                    }
                }
            }

            LazyRow(
                state = listState,
                flingBehavior = snapFlingBehavior,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = sidePadding),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (virtualCount > 0) {
                    items(virtualCount, key = { it }) { virtualIndex ->
                        val realIndex = virtualIndex % realCount
                        val bell = uiState.bellTracks[realIndex]
                        val selected = uiState.selectedBellPath == bell.relativePath
                        Card(
                            modifier = Modifier
                                .width(220.dp)
                                .clickable {
                                    if (selected) {
                                        Log.d(BELL_UI_TAG, "tap_selected_replay path=${bell.relativePath}")
                                        onBellTapped(bell)
                                    } else {
                                        userInteracted = true
                                        val targetVirtualIndex = nearestVirtualIndexForReal(
                                            currentVirtualIndex = currentCenterVirtualIndex(listState),
                                            realCount = realCount,
                                            targetRealIndex = realIndex
                                        )
                                        Log.d(BELL_UI_TAG, "tap_neighbor_scroll_to_center path=${bell.relativePath} virtualIdx=$targetVirtualIndex")
                                        scope.launch {
                                            animateItemToCenter(listState, targetVirtualIndex)
                                        }
                                    }
                                },
                            border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp)
                            ) {
                                Text(bell.thumbnailLabel, fontWeight = FontWeight.SemiBold)
                                Text(bell.title)
                                if (uiState.bellPreviewPlayingPath == bell.relativePath) {
                                    Text("Preview playing", color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }
            }
        }

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onSubmit,
            enabled = uiState.selectedBellPath != null
        ) {
            Text("Submit ending bell")
        }
    }
}

private fun closestToCenter(
    tracks: List<BellTrack>,
    state: LazyListState,
    realCount: Int
): BellTrack? {
    if (tracks.isEmpty() || realCount <= 0) return null
    val layout = state.layoutInfo
    val viewportCenter = (layout.viewportStartOffset + layout.viewportEndOffset) / 2
    val nearest = layout.visibleItemsInfo.minByOrNull { item ->
        kotlin.math.abs((item.offset + item.size / 2) - viewportCenter)
    } ?: return null

    return tracks.getOrNull(nearest.index % realCount)
}

private suspend fun animateItemToCenter(
    state: LazyListState,
    targetIndex: Int
) {
    val layout = state.layoutInfo
    val viewportCenter = (layout.viewportStartOffset + layout.viewportEndOffset) / 2
    val targetVisible = layout.visibleItemsInfo.firstOrNull { it.index == targetIndex }

    if (targetVisible != null) {
        val itemCenter = targetVisible.offset + (targetVisible.size / 2)
        val delta = (itemCenter - viewportCenter).toFloat()
        Log.d(BELL_UI_TAG, "animate_center visible targetIndex=$targetIndex delta=$delta")
        if (abs(delta) > 1f) {
            state.animateScrollBy(delta)
        }
    } else {
        Log.d(BELL_UI_TAG, "animate_center jump_to_item targetIndex=$targetIndex")
        state.animateScrollToItem(targetIndex)
        val layoutAfter = state.layoutInfo
        val viewportCenterAfter = (layoutAfter.viewportStartOffset + layoutAfter.viewportEndOffset) / 2
        val nowVisible = layoutAfter.visibleItemsInfo.firstOrNull { it.index == targetIndex } ?: return
        val deltaAfter = (nowVisible.offset + (nowVisible.size / 2) - viewportCenterAfter).toFloat()
        Log.d(BELL_UI_TAG, "animate_center post_jump targetIndex=$targetIndex delta=$deltaAfter")
        if (abs(deltaAfter) > 1f) {
            state.animateScrollBy(deltaAfter)
        }
    }
}

private fun currentCenterVirtualIndex(state: LazyListState): Int {
    val layout = state.layoutInfo
    val viewportCenter = (layout.viewportStartOffset + layout.viewportEndOffset) / 2
    return layout.visibleItemsInfo.minByOrNull { item ->
        abs((item.offset + item.size / 2) - viewportCenter)
    }?.index ?: state.firstVisibleItemIndex
}

private fun nearestVirtualIndexForReal(
    currentVirtualIndex: Int,
    realCount: Int,
    targetRealIndex: Int
): Int {
    if (realCount <= 0) return currentVirtualIndex
    val baseCycle = currentVirtualIndex / realCount
    val candidates = listOf(
        (baseCycle - 1) * realCount + targetRealIndex,
        baseCycle * realCount + targetRealIndex,
        (baseCycle + 1) * realCount + targetRealIndex
    )
    return candidates.minByOrNull { abs(it - currentVirtualIndex) } ?: currentVirtualIndex
}
