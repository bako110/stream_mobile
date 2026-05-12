# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# App package
-keep class com.folix.mobile.** { *; }

# Firebase / FCM
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Notifee
-keep class io.invertase.notifee.** { *; }
-dontwarn io.invertase.notifee.**

# AsyncStorage / MMKV
-keep class com.facebook.react.modules.storage.** { *; }
-keep class com.zoontek.rnbootsplash.** { *; }

# WebRTC
-keep class org.webrtc.** { *; }

# LiveKit
-keep class io.livekit.** { *; }
-keep class livekit.** { *; }

# OkHttp / Retrofit
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# Kotlin coroutines
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# Keep enums
-keepclassmembers enum * { *; }

# Keep Parcelables
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}
