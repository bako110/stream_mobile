/**
 * downloadToastService — état global du téléchargement en cours, affiché par un
 * toast unique rendu au niveau racine de l'app (voir components/common/DownloadToast).
 * Permet d'avoir la même barre de progression visible sur TOUS les écrans qui
 * téléchargent un média (Reels, posts, messages, viewer image/vidéo...), plutôt
 * qu'un affichage local par écran qui disparaît dès qu'on ferme un menu/modal.
 *
 * Même pattern que networkService.ts : module + listeners, pas de dépendance React.
 */

export interface DownloadToastState {
  id: string;
  progress: number;   // 0-100
  done: boolean;       // true pendant le court délai d'affichage "Terminé" avant disparition
  error: boolean;
}

let _current: DownloadToastState | null = null;
const listeners = new Set<(state: DownloadToastState | null) => void>();
let _hideTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  listeners.forEach(l => l(_current));
}

function clearHideTimer(): void {
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

export const downloadToastService = {
  /** Démarre/actualise la progression d'un téléchargement. */
  start(id: string): void {
    clearHideTimer();
    _current = { id, progress: 0, done: false, error: false };
    notify();
  },

  update(id: string, progress: number): void {
    if (!_current || _current.id !== id) return;
    _current = { ..._current, progress };
    notify();
  },

  /** Téléchargement terminé — reste affiché brièvement ("100% / Terminé") puis disparaît seul. */
  finish(id: string): void {
    if (!_current || _current.id !== id) return;
    clearHideTimer();
    _current = { ..._current, progress: 100, done: true };
    notify();
    _hideTimer = setTimeout(() => {
      if (_current?.id === id) { _current = null; notify(); }
      _hideTimer = null;
    }, 1500);
  },

  /** Échec — affiche brièvement l'erreur puis disparaît, comme finish(). */
  fail(id: string): void {
    if (!_current || _current.id !== id) return;
    clearHideTimer();
    _current = { ..._current, done: true, error: true };
    notify();
    _hideTimer = setTimeout(() => {
      if (_current?.id === id) { _current = null; notify(); }
      _hideTimer = null;
    }, 2200);
  },

  getState(): DownloadToastState | null {
    return _current;
  },

  subscribe(listener: (state: DownloadToastState | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
