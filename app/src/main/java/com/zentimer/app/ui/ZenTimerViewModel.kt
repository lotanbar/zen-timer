package com.zentimer.app.ui

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class MainUiState(
    val assetPath: String = "",
    val isAssetsValid: Boolean = false,
    val durationSeconds: Int = 0,
    val isTimeConfigured: Boolean = false,
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

class ZenTimerViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    fun setDemoTimeConfigured() {
        _uiState.update {
            it.copy(
                durationSeconds = 10 * 60,
                isTimeConfigured = true
            )
        }
    }

    fun setDemoAmbienceConfigured() {
        _uiState.update { it.copy(selectedAmbience = "Forest Rain") }
    }

    fun setDemoBellConfigured() {
        _uiState.update { it.copy(selectedBell = "Tibetan Bowl") }
    }

    fun setAssetPath(path: String) {
        _uiState.update { it.copy(assetPath = path) }
    }

    fun toggleAssetValidation() {
        _uiState.update { it.copy(isAssetsValid = !it.isAssetsValid) }
    }
}
