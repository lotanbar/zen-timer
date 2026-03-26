package com.zentimer.app.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val PREFS_NAME = "zen_timer_prefs"
private const val KEY_ASSET_TREE_URI = "asset_tree_uri"

data class MainUiState(
    val assetPath: String = "",
    val isAssetsValid: Boolean = false,
    val isValidatingAssets: Boolean = false,
    val assetBannerMessage: String? = "Assets package path is not selected.",
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

class ZenTimerViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences(PREFS_NAME, Application.MODE_PRIVATE)
    private val validator = AssetPackageValidator(application)

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
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
        }
    }

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
        validateAssets(uriString)
    }

    private fun validateAssets(uriString: String) {
        viewModelScope.launch {
            when (val result = validator.validate(Uri.parse(uriString))) {
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
}
