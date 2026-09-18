/**
 * Retrait de fonds : pas encore disponible sur mobile. Au lieu d'ouvrir un
 * écran « maintenance », on affiche une simple alerte + lien vers le web.
 * Un seul point d'appel pour tous les boutons « Retirer » de l'app.
 */
import { Linking } from 'react-native';
import { showConfirm } from '../services';

export function showWithdrawUnavailable(): void {
  showConfirm(
    'Retrait bientôt disponible',
    'Le retrait de fonds n\'est pas encore disponible dans l\'application.\nEn attendant, utilise la version web sur gofolyx.com (rubrique Wallet).',
    [
      { text: 'Fermer', style: 'cancel' },
      { text: 'Ouvrir gofolyx.com', onPress: () => Linking.openURL('https://gofolyx.com/wallet').catch(() => {}) },
    ],
  );
}
