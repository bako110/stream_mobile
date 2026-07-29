/**
 * toastService — état global du toast de message affiché au niveau racine
 * de l'app (voir components/common/Toast). Remplace Alert.alert pour les
 * messages simples (succès/erreur/info/warning) sans action à confirmer.
 *
 * Même pattern que downloadToastService.ts : module + listeners, pas de dépendance React.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastState {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
}

let _current: ToastState | null = null;
let _seq = 0;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(state: ToastState | null) => void>();

function notify(): void {
  listeners.forEach(l => l(_current));
}

function clearHideTimer(): void {
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

function show(type: ToastType, title: string, message?: string, durationMs?: number): void {
  clearHideTimer();
  const duration = durationMs ?? (type === 'error' ? 4500 : 3200);
  _current = { id: ++_seq, type, title, message, duration };
  notify();
  _hideTimer = setTimeout(() => {
    _current = null;
    notify();
    _hideTimer = null;
  }, duration);
}

export const toastService = {
  success(title: string, message?: string, durationMs?: number): void { show('success', title, message, durationMs); },
  error(title: string, message?: string, durationMs?: number): void { show('error', title, message, durationMs); },
  info(title: string, message?: string, durationMs?: number): void { show('info', title, message, durationMs); },
  warning(title: string, message?: string, durationMs?: number): void { show('warning', title, message, durationMs); },

  hide(): void {
    clearHideTimer();
    _current = null;
    notify();
  },

  getState(): ToastState | null {
    return _current;
  },

  subscribe(listener: (state: ToastState | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
