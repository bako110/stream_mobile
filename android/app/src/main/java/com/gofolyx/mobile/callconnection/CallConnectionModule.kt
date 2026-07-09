package com.gofolyx.mobile.callconnection

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Pont JS <-> ConnectionService natif Android, pour un vrai écran d'appel
 * système (comme WhatsApp) : par-dessus l'écran verrouillé, dans les réglages
 * téléphone du système, avec le routage audio natif (bouton volume, casque
 * Bluetooth, etc.) — au lieu d'une simple notification qu'il faut ouvrir.
 *
 * Auto-géré ("self-managed") car l'app n'a pas d'accord opérateur télécom —
 * c'est l'approche utilisée par WhatsApp/Messenger/Signal sur Android.
 */
class CallConnectionModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val ACCOUNT_ID = "gofolyx_calls"
    private var instance: CallConnectionModule? = null

    fun emitToJs(event: String, callId: String) {
      val params = Arguments.createMap().apply {
        putString("event", event)
        putString("callId", callId)
      }
      instance?.sendEvent("CallConnectionEvent", params)
    }

    fun emitAudioStateToJs(isMuted: Boolean, route: Int) {
      val params = Arguments.createMap().apply {
        putBoolean("isMuted", isMuted)
        putInt("route", route)
      }
      instance?.sendEvent("CallConnectionAudioState", params)
    }
  }

  private val telecomManager: TelecomManager
    get() = reactApplicationContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

  private val phoneAccountHandle: PhoneAccountHandle
    get() = PhoneAccountHandle(
      ComponentName(reactApplicationContext, CallConnectionService::class.java),
      ACCOUNT_ID,
    )

  init {
    instance = this
  }

  override fun getName(): String = "CallConnectionModule"

  private fun sendEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  /**
   * À appeler une fois au démarrage de l'app (avant tout appel). Enregistre le
   * PhoneAccount auprès du système — nécessaire pour que registerPhoneAccount
   * fonctionne, mais l'utilisateur doit encore l'activer manuellement une fois
   * dans Réglages > Comptes d'appel si le système ne l'active pas seul.
   */
  @ReactMethod
  fun setup(promise: Promise) {
    try {
      val account = PhoneAccount.builder(phoneAccountHandle, "GoFolyX")
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .build()
      telecomManager.registerPhoneAccount(account)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SETUP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isAccountEnabled(promise: Promise) {
    try {
      val account = telecomManager.getPhoneAccount(phoneAccountHandle)
      promise.resolve(account?.isEnabled == true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun reportIncomingCall(callId: String, callerName: String, isVideo: Boolean, promise: Promise) {
    try {
      val extras = Bundle().apply {
        putString("callId", callId)
        putString("callerName", callerName)
      }
      val callExtras = Bundle().apply {
        putBoolean("isVideo", isVideo)
      }
      extras.putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, callExtras)
      telecomManager.addNewIncomingCall(phoneAccountHandle, extras)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("INCOMING_CALL_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun reportOutgoingCall(callId: String, callerName: String, promise: Promise) {
    try {
      val extras = Bundle().apply {
        putString("callId", callId)
        putString("callerName", callerName)
      }
      val uri = android.net.Uri.fromParts("tel", callId, null)
      telecomManager.placeCall(uri, extras)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OUTGOING_CALL_ERROR", e.message, e)
    }
  }

  /** Appelé côté JS une fois la connexion WebRTC établie (offer/answer/ICE ok). */
  @ReactMethod
  fun reportCallActive(callId: String) {
    CallConnectionService.getConnection(callId)?.markActive()
  }

  @ReactMethod
  fun reportCallDialing(callId: String) {
    CallConnectionService.getConnection(callId)?.markDialing()
  }

  /** Termine l'appel côté JS (ex: l'autre pair a raccroché) — reflète l'état sur l'écran natif. */
  @ReactMethod
  fun endCall(callId: String) {
    CallConnectionService.getConnection(callId)?.endWithCause(android.telecom.DisconnectCause.REMOTE)
  }

  @ReactMethod
  fun endCallLocal(callId: String) {
    CallConnectionService.getConnection(callId)?.endWithCause(android.telecom.DisconnectCause.LOCAL)
  }

  @ReactMethod
  fun endCallFailed(callId: String) {
    CallConnectionService.getConnection(callId)?.endWithCause(android.telecom.DisconnectCause.ERROR)
  }

  // Requis par RN pour les modules qui émettent des events (NativeEventEmitter côté JS)
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}
}
