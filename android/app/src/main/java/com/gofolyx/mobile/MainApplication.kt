package com.gofolyx.mobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.gofolyx.mobile.callconnection.CallConnectionPackage
import com.livekit.reactnative.LiveKitReactNative

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(CallConnectionPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Doit etre appele avant toute autre initialisation react-native — sinon
    // AudioSession.configureAudio()/startAudioSession() plantent au premier
    // live avec "Audio device module is not initialized".
    LiveKitReactNative.setup(this)
    loadReactNative(this)
  }
}
