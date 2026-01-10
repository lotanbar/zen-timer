package com.allhailalona.ZenTimer

import android.content.Context
import android.os.PowerManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class ScreenStateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScreenStateModule"

    @ReactMethod
    fun isScreenInteractive(promise: Promise) {
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val isInteractive = powerManager.isInteractive
            promise.resolve(isInteractive)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
