package com.zentimer.app.ui

import android.widget.NumberPicker
import android.view.ViewGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp

@Composable
fun TimePickerScreen(
    initialTotalSeconds: Int,
    onSubmitDuration: (hours: Int, minutes: Int, seconds: Int) -> Boolean,
    onClose: () -> Unit
) {
    var hours by remember(initialTotalSeconds) { mutableIntStateOf((initialTotalSeconds / 3600).coerceIn(0, 99)) }
    var minutes by remember(initialTotalSeconds) { mutableIntStateOf(((initialTotalSeconds % 3600) / 60).coerceIn(0, 59)) }
    var seconds by remember(initialTotalSeconds) { mutableIntStateOf((initialTotalSeconds % 60).coerceIn(0, 59)) }
    var showValidationError by remember { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Set Duration", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.weight(1f))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                NumberWheel(label = "HH", value = hours, min = 0, max = 99) { hours = it }
                NumberWheel(label = "MM", value = minutes, min = 0, max = 59) { minutes = it }
                NumberWheel(label = "SS", value = seconds, min = 0, max = 59) { seconds = it }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth()
        ) {
            if (showValidationError == 1) {
                Text(
                    text = "Duration must be greater than 0.",
                    color = MaterialTheme.colorScheme.error
                )
            }
        }

        Spacer(Modifier.weight(1f))

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val accepted = onSubmitDuration(hours, minutes, seconds)
                if (accepted) {
                    onClose()
                } else {
                    showValidationError = 1
                }
            }
        ) {
            Text("Submit")
        }
    }
}

@Composable
private fun NumberWheel(
    label: String,
    value: Int,
    min: Int,
    max: Int,
    onValueChange: (Int) -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Box(modifier = Modifier.width(96.dp)) {
            AndroidView(
                factory = { context ->
                    NumberPicker(context).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                        )
                        minValue = min
                        maxValue = max
                        wrapSelectorWheel = true
                        setFormatter { pickerValue -> "%02d".format(pickerValue) }
                        descendantFocusability = NumberPicker.FOCUS_BLOCK_DESCENDANTS
                        setOnValueChangedListener { _, _, newVal -> onValueChange(newVal) }
                    }
                },
                update = { picker ->
                    if (picker.value != value) {
                        picker.value = value
                    }
                }
            )
        }
    }
}
