/**
 * Hooks publicité — centralisent le fetch, l'impression et le click.
 * Remplacent les fetchNextAd / loadAdForSlot / useRef(impressionSent) dupliqués
 * dans FeedScreen, ReelsScreen et StoryViewer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { adIsPhone, type AdData } from './types';

type Placement = 'feed' | 'reels' | 'stories' | 'search';

/**
 * Tire la prochaine pub active pour un placement. `excludeIds` permet plusieurs
 * pubs différentes dans le même scroll (le backend les exclut du tirage).
 * Un seul tirage par montage sauf appel explicite à `refetch`.
 */
export function useNextAd(placement: Placement, excludeIds?: string[]) {
  const [ad, setAd] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(true);
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;
  const reqIdRef = useRef(0);

  const run = useCallback(() => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    apiClient
      .get<AdData | null>(Endpoints.ads.feedNext(placement, excludeRef.current))
      .then(r => {
        if (myReq === reqIdRef.current) setAd(r.data ?? null);
      })
      .catch(() => {
        if (myReq === reqIdRef.current) setAd(null);
      })
      .finally(() => {
        if (myReq === reqIdRef.current) setLoading(false);
      });
  }, [placement]);

  useEffect(() => { run(); }, [run]);

  return { ad, loading, refetch: run };
}

/**
 * Envoie POST /ads/:id/impression UNE fois, quand `active` devient true pour la
 * première fois. Réarme si l'id change.
 */
export function useAdImpression(adId: string | undefined, active: boolean): void {
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!adId || !active) return;
    if (firedFor.current === adId) return;
    firedFor.current = adId;
    apiClient.post(Endpoints.ads.impression(adId), {}).catch(() => {});
  }, [adId, active]);
}

/**
 * Retourne un handler `click(adId, url?)` : enregistre le clic puis ouvre l'URL
 * (ou le menu téléphone si l'URL est en fait un numéro).
 */
export function useAdClick(): (adId: string, url?: string) => void {
  return useCallback((adId: string, url?: string) => {
    apiClient.post(Endpoints.ads.click(adId), {}).catch(() => {});
    const raw = (url ?? '').trim();
    if (!raw) return;
    if (adIsPhone(raw)) {
      openPhoneMenu(raw.replace(/^tel:/i, ''));
      return;
    }
    Linking.openURL(raw).catch(() => {});
  }, []);
}
