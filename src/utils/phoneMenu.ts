import { Linking } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { showConfirm } from '../services/confirmService';
import { toastService } from '../services/toastService';

/**
 * Menu de contact (WhatsApp / Appeler / Copier) pour un numéro de téléphone
 * affiché ou détecté dans l'app — même comportement partout (RichText, CTA pub,
 * profils...) plutôt qu'une simple Text non cliquable.
 */
export function openPhoneMenu(rawPhone: string): void {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  showConfirm(rawPhone, undefined, [
    {
      text: 'WhatsApp',
      onPress: async () => {
        const phone = digits.replace(/^\+/, '');
        const url = `whatsapp://send?phone=${phone}`;
        const supported = await Linking.canOpenURL(url).catch(() => false);
        if (supported) Linking.openURL(url).catch(() => {});
        else toastService.warning('WhatsApp non disponible', "WhatsApp n'est pas installé sur cet appareil.");
      },
    },
    { text: 'Appeler', onPress: () => Linking.openURL(`tel:${digits}`).catch(() => {}) },
    { text: 'Copier', onPress: () => Clipboard.setString(rawPhone) },
    { text: 'Annuler', style: 'cancel' },
  ]);
}
