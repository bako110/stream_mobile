package com.gofolyx.mobile.callconnection

import android.telecom.Connection
import android.telecom.DisconnectCause

/**
 * Représente UN appel auprès du système Telecom (écran d'appel natif, bouton
 * volume/écouteur Bluetooth système, etc.). Les actions de l'utilisateur sur
 * l'écran natif (répondre, raccrocher, mute) remontent ici, puis sont relayées
 * en JS via CallConnectionModule.emitToJs(...).
 */
class CallConnection(private val callId: String) : Connection() {

  init {
    connectionProperties = PROPERTY_SELF_MANAGED
    audioModeIsVoip = true
  }

  override fun onAnswer() {
    super.onAnswer()
    setActive()
    CallConnectionModule.emitToJs("answer", callId)
  }

  override fun onReject() {
    super.onReject()
    CallConnectionModule.emitToJs("reject", callId)
    setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
    destroy()
    CallConnectionService.removeConnection(callId)
  }

  override fun onDisconnect() {
    super.onDisconnect()
    CallConnectionModule.emitToJs("hangup", callId)
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
    CallConnectionService.removeConnection(callId)
  }

  override fun onAbort() {
    super.onAbort()
    CallConnectionModule.emitToJs("hangup", callId)
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
    CallConnectionService.removeConnection(callId)
  }

  override fun onStateChanged(state: Int) {
    super.onStateChanged(state)
  }

  override fun onCallAudioStateChanged(state: android.telecom.CallAudioState) {
    super.onCallAudioStateChanged(state)
    CallConnectionModule.emitAudioStateToJs(state.isMuted, state.route)
  }

  /** Marque l'appel comme actif — appelé par le module JS une fois la connexion WebRTC établie. */
  fun markActive() {
    setActive()
  }

  /** Marque l'appel comme sonnant (côté sortant, avant que le distant décroche). */
  fun markDialing() {
    setDialing()
  }

  fun endWithCause(cause: Int) {
    setDisconnected(DisconnectCause(cause))
    destroy()
    CallConnectionService.removeConnection(callId)
  }
}
