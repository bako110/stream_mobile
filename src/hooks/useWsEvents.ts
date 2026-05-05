/**
 * Hook utilitaire — abonnement simple aux événements WS enrichis.
 *
 * Chaque callback est appelé automatiquement quand l'événement correspondant
 * est reçu du serveur. Idéal pour les écrans qui doivent réagir en temps réel.
 *
 * Usage:
 *   useWsEvents({
 *     onNewFollower: (d) => showToast(`${d.from_username} te suit`),
 *     onGiftReceived: (d) => refreshWallet(),
 *     onStoryAdded: () => reloadStories(),
 *   });
 */
import { useEffect, useRef } from 'react';
import { useWs } from '../context/WebSocketContext';
import type {
  NewFollowerPayload,
  CoinTransferPayload,
  GiftReceivedPayload,
  StoryAddedPayload,
  CommentOnContentPayload,
  ReactionOnContentPayload,
  PresencePayload,
  ConcertLivePayload,
} from '../services/wsEventHandler';

export interface WsEventOptions {
  onFeedUpdated?:           (kind: 'post' | 'reel' | 'event' | 'concert') => void;
  onNewFollower?:           (d: NewFollowerPayload) => void;
  onCoinTransferReceived?:  (d: CoinTransferPayload) => void;
  onGiftReceived?:          (d: GiftReceivedPayload) => void;
  onStoryAdded?:            (d: StoryAddedPayload) => void;
  onCommentOnContent?:      (d: CommentOnContentPayload) => void;
  onReactionOnContent?:     (d: ReactionOnContentPayload) => void;
  onPresence?:              (d: PresencePayload) => void;
  onConcertLive?:           (d: ConcertLivePayload) => void;
}

export function useWsEvents(options: WsEventOptions) {
  const {
    addListener, removeListener,
    lastNewFollower, lastCoinTransfer, lastGiftReceived,
    lastStoryAdded, lastCommentOnContent, lastReactionOnContent,
    lastPresenceUpdate, lastConcertLive,
  } = useWs();

  // Abonnement général feed_updated via addListener (évite re-render du provider)
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const handler = (payload: { type: string; kind?: string }) => {
      if (payload.type === 'feed_updated' && optsRef.current.onFeedUpdated) {
        optsRef.current.onFeedUpdated((payload.kind ?? 'post') as 'post' | 'reel');
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener]);

  // Réagit aux changements d'état (null = pas encore reçu → ignorer)
  useEffect(() => {
    if (lastNewFollower) optsRef.current.onNewFollower?.(lastNewFollower);
  }, [lastNewFollower]);

  useEffect(() => {
    if (lastCoinTransfer) optsRef.current.onCoinTransferReceived?.(lastCoinTransfer);
  }, [lastCoinTransfer]);

  useEffect(() => {
    if (lastGiftReceived) optsRef.current.onGiftReceived?.(lastGiftReceived);
  }, [lastGiftReceived]);

  useEffect(() => {
    if (lastStoryAdded) optsRef.current.onStoryAdded?.(lastStoryAdded);
  }, [lastStoryAdded]);

  useEffect(() => {
    if (lastCommentOnContent) optsRef.current.onCommentOnContent?.(lastCommentOnContent);
  }, [lastCommentOnContent]);

  useEffect(() => {
    if (lastReactionOnContent) optsRef.current.onReactionOnContent?.(lastReactionOnContent);
  }, [lastReactionOnContent]);

  useEffect(() => {
    if (lastPresenceUpdate) optsRef.current.onPresence?.(lastPresenceUpdate);
  }, [lastPresenceUpdate]);

  useEffect(() => {
    if (lastConcertLive) optsRef.current.onConcertLive?.(lastConcertLive);
  }, [lastConcertLive]);
}
