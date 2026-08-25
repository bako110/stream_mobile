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

  /** true si l'app est déjà exemptée de l'optimisation de batterie (Android uniquement). */
  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (!available) return true;
    try { return await CallConnectionModule.isIgnoringBatteryOptimizations(); } catch { return true; }
  },

  /**
   * true si le PhoneAccount Gofolyx est actif dans les réglages système. addNewIncomingCall()
   * peut résoudre sans erreur même si le compte n'est pas active — Android crée la Connection
   * en interne de façon asynchrone et peut échouer silencieusement plus tard (l'utilisateur n'a
   * jamais activé le compte dans Réglages > Appli tél. > Comptes d'appel). Sans cette vérification
   * en amont, un appel entrant pouvait rester totalement invisible (ni écran natif, ni fallback
   * Notifee, car le JS croyait le natif réussi).
   */
  async isAccountEnabled(): Promise<boolean> {
    if (!available) return false;
    try { return await CallConnectionModule.isAccountEnabled(); } catch { return false; }
  },

  /**
   * Ouvre le dialogue système demandant d'exempter l'app de l'optimisation de batterie.
   * Certains fabricants (Xiaomi/MIUI, Huawei, Samsung...) tuent l'app en arrière-plan
   * même pour un appel entrant prioritaire sans cette exemption — sans elle, l'app peut
   * ne jamais se réveiller quand elle est complètement fermée.
   */
  async requestIgnoreBatteryOptimizations(): Promise<void> {
    if (!available) return;
    try { await CallConnectionModule.requestIgnoreBatteryOptimizations(); } catch {}
  },

  /**
   * Depuis Android 14, une notification plein écran (appel entrant) nécessite une
   * autorisation explicite en plus de la déclaration manifest — sinon le système la
   * dégrade silencieusement en notification normale (visible dans le tiroir mais sans
   * réveil d'écran ni sonnerie prioritaire). true sur Android < 14 (rien à demander).
   */
  async canUseFullScreenIntent(): Promise<boolean> {
    if (!available) return true;
    try { return await CallConnectionModule.canUseFullScreenIntent(); } catch { return true; }
  },

  /** Ouvre le réglage système dédié à cette autorisation (no-op sur Android < 14). */
  async requestFullScreenIntentPermission(): Promise<void> {
    if (!available) return;
    try { await CallConnectionModule.requestFullScreenIntentPermission(); } catch {}
  },

  /**
   * Lance l'écran d'appel natif. Propage l'erreur (ne l'avale pas) — l'appelant
   * (fcmService.ts) doit savoir si ça a réellement échoué pour afficher la
   * notification Notifee de secours, sinon un échec silencieux ici laisse
   * l'appel entrant totalement invisible côté destinataire.
   *
   * Vérifie d'abord que le PhoneAccount est actif : addNewIncomingCall() peut
   * résoudre sans lever d'erreur même si le compte n'est pas active côté système
   * (la Connection echoue de façon asynchrone, apres coup) — sans ce garde-fou,
   * l'appel restait invisible (ni ecran natif, ni Notifee).
   */
  async reportIncomingCall(callId: string, callerName: string, isVideo: boolean): Promise<void> {
    if (!available) throw new Error('CallConnectionModule unavailable');
    const enabled = await this.isAccountEnabled();
    if (!enabled) throw new Error('PhoneAccount not enabled');
    await CallConnectionModule.reportIncomingCall(callId, callerName, isVideo);
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
