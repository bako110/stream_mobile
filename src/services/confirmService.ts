/**
 * confirmService — état global du modal de confirmation affiché au niveau
 * racine de l'app (voir components/common/ConfirmModal). Remplace Alert.alert
 * pour les confirmations avant action (Annuler/Confirmer, suppressions...).
 *
 * Signature de showConfirm calquée sur Alert.alert(title, message, buttons)
 * pour permettre une migration mécanique quasi 1:1.
 *
 * Même pattern que downloadToastService.ts : module + listeners, pas de dépendance React.
 */

export type ConfirmButtonStyle = 'default' | 'cancel' | 'destructive';

export interface ConfirmButton {
  text: string;
  style?: ConfirmButtonStyle;
  onPress?: () => void | Promise<void>;
}

export interface ConfirmState {
  id: number;
  title: string;
  message?: string;
  buttons: ConfirmButton[];
}

let _current: ConfirmState | null = null;
let _seq = 0;
const listeners = new Set<(state: ConfirmState | null) => void>();

function notify(): void {
  listeners.forEach(l => l(_current));
}

export const confirmService = {
  getState(): ConfirmState | null {
    return _current;
  },

  subscribe(listener: (state: ConfirmState | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Ferme le modal — mais seulement s'il affiche encore l'état `id` passé.
   * Nécessaire quand un bouton ouvre lui-même un second showConfirm de façon
   * synchrone (menu → sous-confirmation) : le dismiss() du premier modal ne doit
   * pas effacer le second qui vient de le remplacer dans _current.
   */
  dismiss(id?: number): void {
    if (id !== undefined && _current?.id !== id) return;
    _current = null;
    notify();
  },
};

export function showConfirm(title: string, message?: string, buttons?: ConfirmButton[]): void {
  const finalButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' as const }];
  _current = { id: ++_seq, title, message, buttons: finalButtons };
  notify();
}
