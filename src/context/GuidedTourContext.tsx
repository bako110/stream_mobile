import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * Tour guidé — une main animée pointe les éléments clés (bouton Créer, geste de
 * swipe sur Reels...) une seule fois, au tout premier lancement de l'app sur cet
 * appareil (jamais lancée avant = flag GUIDED_TOUR_DONE absent du stockage).
 * Indépendant de la connexion/inscription : se déclenche même sans compte, dès
 * l'écran "Rejoindre GoFolyX". Distinct de ONBOARDING_DONE (celui-ci suit l'écran
 * marketing lui-même, pas le tour interactif).
 *
 * Fonctionnement : chaque étape a un nom fixe (TourStepName). L'écran qui possède
 * l'élément à mettre en avant appelle useTourTarget(name) sur ce élément — dès que
 * le tour atteint cette étape ET que l'élément a mesuré sa position (onLayout),
 * TourSpotlight (rendu une fois au niveau racine) affiche l'overlay + la main.
 */

export type TourStepName = 'feed_create_button' | 'reels_swipe';

// Ordre fixe de progression — 'feed_create_button' doit être vu avant 'reels_swipe'
// pour rester cohérent avec le parcours réel (Accueil est le 1er écran après login).
const TOUR_ORDER: TourStepName[] = ['feed_create_button', 'reels_swipe'];

export interface TourTargetLayout {
  x: number; y: number; width: number; height: number;
}

interface GuidedTourContextValue {
  currentStep: TourStepName | null;
  isTourActive: boolean;
  registerTarget: (step: TourStepName, layout: TourTargetLayout) => void;
  getTargetLayout: (step: TourStepName) => TourTargetLayout | null;
  advance: () => void;
  skipTour: () => void;
  markFirstLaunchIfNeeded: () => void;
  activateTourIfPending: () => void;
  setScreenPresence: (step: TourStepName, present: boolean) => void;
  isScreenPresent: (step: TourStepName) => boolean;
}

const GuidedTourContext = createContext<GuidedTourContextValue | null>(null);

export const GuidedTourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentStep, setCurrentStep] = useState<TourStepName | null>(null);
  // Layouts mesurés par les écrans — ref (pas de state) car mis à jour à chaque
  // onLayout sans qu'un re-render de tout l'arbre soit nécessaire ; TourSpotlight
  // relit la valeur au moment où currentStep change.
  const layoutsRef = useRef<Partial<Record<TourStepName, TourTargetLayout>>>({});
  const [, forceLayoutTick] = useState(0);

  // Un écran signale sa présence/focus réel (ex: ReelsScreen au focus) — évite
  // qu'une étape plein écran sans cible mesurable (comme 'reels_swipe') s'affiche
  // par erreur sur un autre écran pendant que l'utilisateur navigue encore.
  const presenceRef = useRef<Partial<Record<TourStepName, boolean>>>({});
  const [, forcePresenceTick] = useState(0);

  const registerTarget = useCallback((step: TourStepName, layout: TourTargetLayout) => {
    layoutsRef.current[step] = layout;
    forceLayoutTick(t => t + 1); // notifie TourSpotlight qu'un layout est dispo
  }, []);

  const getTargetLayout = useCallback((step: TourStepName) => {
    return layoutsRef.current[step] ?? null;
  }, []);

  const setScreenPresence = useCallback((step: TourStepName, present: boolean) => {
    presenceRef.current[step] = present;
    forcePresenceTick(t => t + 1);
  }, []);

  const isScreenPresent = useCallback((step: TourStepName) => {
    return !!presenceRef.current[step];
  }, []);

  const finishTour = useCallback(() => {
    setCurrentStep(null);
    storage.setBoolean(STORAGE_KEYS.GUIDED_TOUR_DONE, true);
  }, []);

  const advance = useCallback(() => {
    setCurrentStep(prev => {
      if (!prev) return null;
      const idx = TOUR_ORDER.indexOf(prev);
      const next = TOUR_ORDER[idx + 1];
      if (!next) {
        storage.setBoolean(STORAGE_KEYS.GUIDED_TOUR_DONE, true);
        return null;
      }
      return next;
    });
  }, []);

  const skipTour = useCallback(() => {
    finishTour();
  }, [finishTour]);

  // Appelée au tout premier lancement de l'app (avant le splash) — si le flag
  // n'existe pas encore du tout (ni true ni false), c'est la toute première fois
  // que l'app tourne sur cet appareil : on écrit `false` explicitement pour marquer
  // "un tour est dû" sans encore l'activer (le bouton Créer n'existe pas avant
  // connexion). Si le flag existe déjà (true ou false), on ne touche à rien —
  // l'app a déjà été lancée avant, jamais de redéclenchement.
  const markFirstLaunchIfNeeded = useCallback(() => {
    if (storage.contains(STORAGE_KEYS.GUIDED_TOUR_DONE)) return;
    storage.setBoolean(STORAGE_KEYS.GUIDED_TOUR_DONE, false);
  }, []);

  // Appelée à l'entrée réelle sur l'écran principal — active le tour SEULEMENT
  // s'il a été marqué comme dû (flag présent et à false) et pas déjà en cours.
  const activateTourIfPending = useCallback(() => {
    if (storage.getBoolean(STORAGE_KEYS.GUIDED_TOUR_DONE) !== false) return;
    setCurrentStep(prev => prev ?? TOUR_ORDER[0]);
  }, []);

  const value = useMemo<GuidedTourContextValue>(() => ({
    currentStep,
    isTourActive: currentStep !== null,
    registerTarget,
    getTargetLayout,
    advance,
    skipTour,
    markFirstLaunchIfNeeded,
    activateTourIfPending,
    setScreenPresence,
    isScreenPresent,
  }), [currentStep, registerTarget, getTargetLayout, advance, skipTour, markFirstLaunchIfNeeded, activateTourIfPending, setScreenPresence, isScreenPresent]);

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
    </GuidedTourContext.Provider>
  );
};

export function useGuidedTour(): GuidedTourContextValue {
  const ctx = useContext(GuidedTourContext);
  if (!ctx) throw new Error('useGuidedTour must be used within GuidedTourProvider');
  return ctx;
}

/**
 * À poser sur l'élément à mettre en avant (via onLayout + un ref pour measureInWindow,
 * measureInWindow est nécessaire car onLayout seul donne des coordonnées relatives au
 * parent, pas à l'écran — l'overlay du spotlight doit positionner le trou en
 * coordonnées écran absolues).
 */
export function useTourTarget(step: TourStepName) {
  const { registerTarget } = useGuidedTour();
  const viewRef = useRef<any>(null);

  const measure = useCallback(() => {
    const node = viewRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x: number, y: number, width: number, height: number) => {
      if (width > 0 && height > 0) {
        registerTarget(step, { x, y, width, height });
      }
    });
  }, [step, registerTarget]);

  return { viewRef, onLayout: measure };
}
