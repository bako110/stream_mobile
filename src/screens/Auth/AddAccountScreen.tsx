/**
 * AddAccountScreen — wrapper fin de LoginScreen pour le mode "ajout de compte"
 * (multi-compte façon TikTok). LoginScreen n'a aucune notion de mode "ajout" :
 * on intercepte simplement son unique point de sortie en cas de succès
 * (onLoginSuccess, déclenché pour login classique ET Google). Le parent
 * (MainNavigator) enregistre alors la session fraîchement connectée comme un
 * nouveau compte dans la liste, via accountsService.addCurrentSessionAsAccount().
 *
 * L'inscription (RegisterScreen) en mode ajout est hors scope — on invite
 * l'utilisateur à créer son compte depuis l'écran de connexion principal.
 */
import React from 'react';
import { LoginScreen } from './LoginScreen';
import { toastService } from '../../services';

interface Props {
  onAccountAdded: () => void;
}

export const AddAccountScreen: React.FC<Props> = ({ onAccountAdded }) => {
  return (
    <LoginScreen
      onLoginSuccess={onAccountAdded}
      onNeedsVerification={() => {
        toastService.info(
          'Compte non vérifié',
          'Ce compte doit d\'abord être vérifié depuis l\'écran de connexion principal.',
        );
      }}
      onGoRegister={() => {
        toastService.info(
          'Créer un compte',
          "Crée d'abord ton compte depuis l'écran de connexion principal, puis ajoute-le ici.",
        );
      }}
    />
  );
};
