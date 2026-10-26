import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_AUTO_HIDE_MS = 4000;

/** Overlays (header, contrôles, bandeaux) visibles au départ, puis masqués
 * après quelques secondes d'inactivité — comme un lecteur vidéo classique
 * (YouTube). Un tap sur la vidéo les ré-affiche et relance le minuteur ; un
 * tap alors qu'ils sont déjà visibles les masque immédiatement. */
export function useAutoHideControls(delayMs: number = DEFAULT_AUTO_HIDE_MS) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), delayMs);
  }, [delayMs]);

  useEffect(() => {
    scheduleHide();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleHide]);

  const onTapVideo = useCallback(() => {
    setVisible(v => {
      if (!v) { scheduleHide(); return true; }
      if (timerRef.current) clearTimeout(timerRef.current);
      return false;
    });
  }, [scheduleHide]);

  return { controlsVisible: visible, onTapVideo };
}
