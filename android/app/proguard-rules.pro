# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# App package
-keep class com.gofolyx.mobile.** { *; }

# Firebase / FCM
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Notifee
-keep class io.invertase.notifee.** { *; }
-dontwarn io.invertase.notifee.**

# AsyncStorage
-keep class com.facebook.react.modules.storage.** { *; }
-keep class com.zoontek.rnbootsplash.** { *; }

# MMKV (react-native-mmkv v4, base sur Nitro Modules — JSI direct, pas de pont
# bridge classique) + runtime Nitro partage par les autres libs Nitro du projet.
# Sans ces regles, R8 peut renommer/supprimer des classes liees en JNI, causant
# un crash au tout premier acces au storage (avant meme l'ecran de connexion).
-keep class com.margelo.nitro.** { *; }
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.margelo.nitro.**
-dontwarn com.tencent.mmkv.**

# react-native-screens (React Navigation native-stack) — NativeProxy.initHybrid()
# est un lien JNI natif↔Java ; sans regle -keep, R8 renomme/supprime les methodes
# et provoque UnsatisfiedLinkError au tout premier ecran (avant meme la connexion),
# exactement le crash release-only observe : "No implementation found for
# com.facebook.jni.HybridData com.swmansion.rnscreens.NativeProxy.initHybrid()".
-keep class com.swmansion.rnscreens.** { *; }
-dontwarn com.swmansion.rnscreens.**

# react-native-reanimated — meme famille de risque (JNI direct), navigation et
# animations en dependent des le premier ecran.
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.swmansion.reanimated.**

# react-native-gesture-handler — importe en tout premier dans index.js, JNI direct.
-keep class com.swmansion.gesturehandler.** { *; }
-dontwarn com.swmansion.gesturehandler.**

# react-native-worklets (dependance de reanimated v4+) — meme famille JNI direct.
-keep class com.swmansion.worklets.** { *; }
-dontwarn com.swmansion.worklets.**

# Stripe — le module Push Provisioning (ajout de carte a Apple/Google Pay,
# fonctionnalite non utilisee ici, seulement PaymentSheet) reference des
# classes du SDK Stripe natif absentes du bundle sans cette dependance
# optionnelle installee. R8 echoue le build release en les cherchant meme si
# le code correspondant n'est jamais execute.
-dontwarn com.stripe.android.pushProvisioning.**
-keep class com.stripe.android.** { *; }
-dontwarn com.stripe.android.**

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
