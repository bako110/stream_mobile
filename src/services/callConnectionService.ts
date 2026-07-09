/**
 * callConnectionService — pont JS vers le module natif Android CallConnectionModule
 * (ConnectionService self-managed), pour un vrai écran d'appel système comme WhatsApp :
 * par-dessus l'écran verrouillé, dans les réglages téléphone, routage audio natif.
 *
 * No-op silencieux sur iOS/si le module natif est absent — CallScreen.tsx (UI JS)
 * reste la source de vérité de l'appel dans tous les cas ; ce service ne fait que
 * refléter l'état auprès du système Android en plus.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { CallConnectionModule } = NativeModules;

const emitter = Platform.OS === 'android' && CallConnectionModule
  ? new NativeEventEmitter(CallConnectionModule)
  : null;

export type CallConnectionEvent = 'answer' | 'reject' | 'hangup' | 'failed';

const available = Platform.OS === 'android' && !!CallConnectionModule;

export const callConnectionService = {
  isAvailable: available,

  /** À appeler une fois au démarrage de l'app (RootNavigator). */
  async setup(): Promise<void> {
    if (!available) return;
    try { await CallConnectionModule.setup(); } catch { /* PhoneAccount déjà enregistré ou non supporté */ }
  },

  async reportIncomingCall(callId: string, callerName: string, isVideo: boolean): Promise<void> {
    if (!available) return;
    try { await CallConnectionModule.reportIncomingCall(callId, callerName, isVideo); } catch { /* fallback Notifee reste actif */ }
  },

  async reportOutgoingCall(callId: string, callerName: string): Promise<void> {
    if (!available) return;
    try { await CallConnectionModule.reportOutgoingCall(callId, callerName); } catch {}
  },

  reportCallActive(callId: string): void {
    if (!available) return;
    try { CallConnectionModule.reportCallActive(callId); } catch {}
  },

  reportCallDialing(callId: string): void {
    if (!available) return;
    try { CallConnectionModule.reportCallDialing(callId); } catch {}
  },

  /** L'autre pair a raccroché / appel terminé à distance — reflète côté système. */
  endCall(callId: string): void {
    if (!available) return;
    try { CallConnectionModule.endCall(callId); } catch {}
  },

  /** L'utilisateur a raccroché depuis l'UI JS de l'app (pas depuis l'écran natif). */
  endCallLocal(callId: string): void {
    if (!available) return;
    try { CallConnectionModule.endCallLocal(callId); } catch {}
  },

  endCallFailed(callId: string): void {
    if (!available) return;
    try { CallConnectionModule.endCallFailed(callId); } catch {}
  },

  /** Écoute les actions de l'utilisateur depuis l'écran d'appel natif (répondre/refuser/raccrocher). */
  addListener(handler: (event: CallConnectionEvent, callId: string) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('CallConnectionEvent', (payload: { event: CallConnectionEvent; callId: string }) => {
      handler(payload.event, payload.callId);
    });
    return () => sub.remove();
  },
};
