/**
 * useWalletPinGate — orchestre la saisie du code PIN wallet autour d'une
 * mutation (cadeau / transfert / retrait).
 *
 * Usage dans un écran/modale appelant :
 *
 *   const { runWithPin, pinModal } = useWalletPinGate();
 *   ...
 *   await runWithPin(extra => apiClient.post(Endpoints.wallet.transfer, {
 *     receiver_id, gogold_amount, ...extra,   // extra = { transaction_pin? }
 *   }));
 *   ...
 *   return (<>{...votre JSX...}{pinModal}</>);
 *
 * Comportement : au montage on lit `GET /wallet/pin` (has_pin). Si l'utilisateur
 * a un PIN, on ouvre DIRECTEMENT la modale — sans le 1er appel voué à un
 * 403 pin_required (une requête inutile par transfert, qui polluait les logs et
 * consommait le rate-limiter de /transfer). Si has_pin est inconnu (API lente,
 * Redis absent), on retombe sur l'ancien flux : tenter sans PIN, puis réagir au
 * 403. Sur `pin_invalid` on met à jour le compteur d'essais et on reste. Sur
 * `pin_locked` on affiche le message, on ferme et on rejette. Toute autre
 * erreur est relancée telle quelle (gérée par le catch de l'appelant).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PinPromptModal } from '../components/wallet/PinPromptModal';
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

type PinExtra = { transaction_pin?: string };
type PinCode = 'pin_required' | 'pin_invalid' | 'pin_locked' | string;

function pinErr(e: any): { code?: PinCode; attempts_left?: number; retry_after_seconds?: number; message?: string } {
  const d = e?.data?.detail;
  return d && typeof d === 'object' ? d : {};
}

function lockMsg(retryAfter?: number): string {
  if (!retryAfter) return 'Trop de tentatives. Réessayez plus tard.';
  const min = Math.max(1, Math.round(retryAfter / 60));
  return `Trop de tentatives. Réessayez dans ~${min} min.`;
}

export function useWalletPinGate() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [attemptsLeft, setAttemptsLeft] = useState<number | undefined>();

  // null = pas encore su ; true/false = réponse de GET /wallet/pin.
  const hasPin = useRef<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    apiClient.get<{ has_pin?: boolean }>(Endpoints.wallet.pin)
      .then(r => { if (alive) hasPin.current = !!r.data?.has_pin; })
      .catch(() => { /* inconnu → on garde le fallback 403 */ });
    return () => { alive = false; };
  }, []);

  // Résout/rejette la promesse de la saisie en cours.
  const pending = useRef<{
    resolve: (v: any) => void;
    reject: (e: any) => void;
    fn: (extra: PinExtra) => Promise<any>;
  } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(undefined);
    setAttemptsLeft(undefined);
    const p = pending.current;
    pending.current = null;
    p?.reject(new Error('pin_cancelled'));
  }, []);

  const handleSubmit = useCallback(async (pin: string) => {
    const p = pending.current;
    if (!p) return;
    try {
      const res = await p.fn({ transaction_pin: pin });
      pending.current = null;
      setOpen(false);
      setError(undefined);
      setAttemptsLeft(undefined);
      p.resolve(res);
    } catch (e: any) {
      const { code, attempts_left, retry_after_seconds } = pinErr(e);
      if (code === 'pin_invalid') {
        setAttemptsLeft(attempts_left);
        setError(undefined); // le message « N essais restants » vient de attemptsLeft
        return; // on reste sur la modale
      }
      if (code === 'pin_locked') {
        pending.current = null;
        setOpen(false);
        setError(undefined);
        setAttemptsLeft(undefined);
        p.reject(new Error(lockMsg(retry_after_seconds)));
        return;
      }
      // Erreur non liée au PIN pendant le retry → on abandonne la saisie
      pending.current = null;
      setOpen(false);
      p.reject(e);
    }
  }, []);

  const runWithPin = useCallback(<T,>(fn: (extra: PinExtra) => Promise<T>): Promise<T> => {
    return new Promise<T>(async (resolve, reject) => {
      // On sait déjà que l'utilisateur a un PIN → ouvrir la modale tout de
      // suite. Évite le 403 pin_required systématique du 1er essai à vide
      // (une requête inutile par transfert + rate-limiter + bruit dans les logs).
      if (hasPin.current === true) {
        pending.current = { resolve, reject, fn };
        setAttemptsLeft(undefined);
        setError(undefined);
        setOpen(true);
        return;
      }
      try {
        // has_pin inconnu ou false → 1er essai sans PIN
        resolve(await fn({}));
      } catch (e: any) {
        const { code, attempts_left } = pinErr(e);
        if (code === 'pin_required' || code === 'pin_invalid') {
          // Le backend confirme qu'un PIN est requis : mémorise-le pour les
          // prochains appels de ce hook, et ouvre la modale.
          hasPin.current = true;
          pending.current = { resolve, reject, fn };
          setAttemptsLeft(code === 'pin_invalid' ? attempts_left : undefined);
          setError(undefined);
          setOpen(true);
          return;
        }
        reject(e); // autre erreur → au catch de l'appelant
      }
    });
  }, []);

  const pinModal = (
    <PinPromptModal
      visible={open}
      onClose={close}
      onSubmit={handleSubmit}
      error={error}
      attemptsLeft={attemptsLeft}
    />
  );

  return { runWithPin, pinModal };
}
