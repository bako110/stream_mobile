/**
 * stackHygiene — évite l'accumulation illimitée d'écrans dans le Stack
 * principal (MainNavigator), qui grandissait à chaque navigate() sans
 * jamais être vidée. Sur le long terme, les grandes apps (Instagram,
 * TikTok, Facebook) gèrent ce même problème de deux façons complémentaires,
 * toutes deux réimplémentées ici sans casser l'architecture stack unique
 * existante :
 *
 *  1. navigateFresh(name, params) — pour un point d'entrée logique (ex:
 *     ouvrir une communauté, un profil, une conversation depuis une liste),
 *     repart d'une pile courte [Tabs, écranCible] au lieu d'empiler sur
 *     l'historique existant. À utiliser pour les navigations "destination",
 *     PAS pour les flux volontaires en plusieurs étapes (A→B→C où revenir
 *     à B doit fonctionner).
 *
 *  2. capStackDepth() — filet de sécurité : si la pile dépasse
 *     MAX_STACK_DEPTH malgré tout (flux légitimement profond), compresse
 *     automatiquement à [Tabs, ...derniers écrans] avant la prochaine
 *     navigation, pour que le bouton retour ne demande jamais plus de
 *     quelques appuis.
 */
import { CommonActions, StackActions } from '@react-navigation/native';
import { navigationRef } from './navigationRef';

const MAX_STACK_DEPTH = 12;
const KEEP_LAST_N = 3;

// Anti-réentrance : capStackDepth() est appelée depuis onStateChange du
// NavigationContainer (cf. RootNavigator), qui se redéclenche après CHAQUE
// dispatch — y compris celui du reset() émis par capStackDepth() elle-même.
// Le reset ramène toujours la pile largement sous MAX_STACK_DEPTH, donc la
// garde de longueur suffit en théorie à couper la récursion dès le 2e appel,
// mais ce flag évite tout risque de double-dispatch/flash visuel le temps
// que l'état se propage.
let compressing = false;

/**
 * Navigue vers un écran en réinitialisant la pile à [Tabs, écranCible] —
 * la destination devient le seul niveau au-dessus des Tabs, donc "retour"
 * ramène toujours directement à l'accueil de l'onglet actif, peu importe
 * la profondeur d'où l'utilisateur venait.
 */
export function navigateFresh(name: string, params?: any) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        { name: 'Tabs' },
        { name, params },
      ],
    }),
  );
}

/**
 * Filet de sécurité — à appeler avant une navigation classique (navigate/push)
 * sur les points d'entrée les plus fréquents. Si la pile est anormalement
 * profonde, la compresse en gardant [Tabs, ...KEEP_LAST_N derniers écrans]
 * pour que le retour reste toujours court, sans perdre le fil du flux en cours.
 */
export function capStackDepth() {
  if (compressing || !navigationRef.isReady()) return;
  const state = navigationRef.getRootState();
  if (!state || state.routes.length <= MAX_STACK_DEPTH) return;

  // Le premier écran de la pile racine est toujours 'Tabs' (jamais repoussé
  // une 2e fois) — on le préserve explicitement puis on garde les derniers
  // écrans du flux en cours, pour ne pas perdre le fil de ce que fait
  // l'utilisateur tout en ramenant la profondeur à un niveau raisonnable.
  const kept = state.routes
    .slice(-KEEP_LAST_N)
    .filter(r => r.name !== 'Tabs')
    .map(r => ({ name: r.name, params: r.params }));

  compressing = true;
  navigationRef.dispatch(
    CommonActions.reset({
      index: kept.length,
      routes: [{ name: 'Tabs' }, ...kept],
    }),
  );
  // Laisse l'état se propager avant de réarmer — évite qu'un onStateChange
  // synchrone déclenché par ce dispatch ne relance un 2e reset() en cascade.
  setTimeout(() => { compressing = false; }, 0);
}

/**
 * Revient à la racine du Tab actif (équivalent d'un tap sur un onglet déjà
 * sélectionné dans Instagram/TikTok) — vide toute la pile stack au-dessus
 * de Tabs ET remet l'onglet lui-même sur son propre écran racine.
 */
export function popToTabRoot() {
  if (!navigationRef.isReady()) return;
  const state = navigationRef.getRootState();
  // StackActions.popToTop() n'est traitée que par un stack navigator avec
  // plus d'une route accumulée — si l'utilisateur est déjà sur Tabs seul
  // (rien empilé au-dessus), la dispatcher quand même remonte l'action
  // jusqu'au Tab.Navigator focalisé, qui ne sait pas la gérer ("The action
  // 'POP_TO_TOP' was not handled by any navigator"). Rien à faire dans ce
  // cas : on est déjà à la racine du stack.
  if (!state || state.routes.length <= 1) return;
  navigationRef.dispatch(StackActions.popToTop());
}
