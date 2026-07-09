package com.gofolyx.mobile.callconnection

import android.net.Uri
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/**
 * ConnectionService self-managed — déclaré dans AndroidManifest.xml avec
 * l'action android.telecom.ConnectionService. Le système Android l'instancie
 * lui-même (jamais construit à la main) quand un appel entrant/sortant est
 * signalé via TelecomManager.addNewIncomingCall / placeCall.
 */
class CallConnectionService : ConnectionService() {

  companion object {
    // callId -> Connection, pour que CallConnectionModule/CallConnection
    // retrouvent la connexion en cours sans dépendre d'un singleton du service.
    private val connections = mutableMapOf<String, CallConnection>()

    fun getConnection(callId: String): CallConnection? = connections[callId]

    fun removeConnection(callId: String) {
      connections.remove(callId)
    }
  }

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ): Connection {
    val extras = request?.extras ?: Bundle()
    val callId = extras.getString("callId") ?: "unknown"
    val callerName = extras.getString("callerName") ?: "Appel"

    val connection = CallConnection(callId)
    connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
    connection.setAddress(Uri.fromParts("tel", callId, null), TelecomManager.PRESENTATION_ALLOWED)
    connection.setRinging()

    connections[callId] = connection
    return connection
  }

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ) {
    super.onCreateIncomingConnectionFailed(connectionManagerPhoneAccount, request)
    val callId = request?.extras?.getString("callId")
    if (callId != null) CallConnectionModule.emitToJs("failed", callId)
  }

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ): Connection {
    val extras = request?.extras ?: Bundle()
    val callId = extras.getString("callId") ?: "unknown"
    val callerName = extras.getString("callerName") ?: "Appel"

    val connection = CallConnection(callId)
    connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
    connection.setAddress(Uri.fromParts("tel", callId, null), TelecomManager.PRESENTATION_ALLOWED)
    connection.setDialing()

    connections[callId] = connection
    return connection
  }

  override fun onCreateOutgoingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ) {
    super.onCreateOutgoingConnectionFailed(connectionManagerPhoneAccount, request)
    val callId = request?.extras?.getString("callId")
    if (callId != null) CallConnectionModule.emitToJs("failed", callId)
  }
}
