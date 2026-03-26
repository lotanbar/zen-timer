package com.zentimer.app.ui

import android.widget.NumberPicker
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
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
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Pick duration", style = MaterialTheme.typography.headlineSmall)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            NumberWheel(label = "HH", value = hours, min = 0, max = 99) { hours = it }
            NumberWheel(label = "MM", value = minutes, min = 0, max = 59) { minutes = it }
            NumberWheel(label = "SS", value = seconds, min = 0, max = 59) { seconds = it }
        }

        if (showValidationError == 1) {
            Text(
                text = "Duration must be greater than 0.",
                color = MaterialTheme.colorScheme.error
            )
        }

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
        AndroidView(
            factory = { context ->
                NumberPicker(context).apply {
                    minValue = min
                    maxValue = max
                    wrapSelectorWheel = true
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
