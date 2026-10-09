import { Linking } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { showConfirm } from '../services/confirmService';
import { toastService } from '../services/toastService';

export interface PhoneMenuOptions {
  // Par défaut (undefined), les deux sont proposés — un annonceur de pub peut
  // ne cocher qu'un seul canal (ex: WhatsApp uniquement), auquel cas l'autre
  // n'apparaît pas dans le menu.
  call?: boolean;
  whatsapp?: boolean;
}

/**
 * Menu de contact (WhatsApp / Appeler / Copier) pour un numéro de téléphone
 * affiché ou détecté dans l'app — même comportement partout (RichText, CTA pub,
 * profils...) plutôt qu'une simple Text non cliquable.
 */
export function openPhoneMenu(rawPhone: string, options?: PhoneMenuOptions): void {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  const showCall     = options?.call     ?? true;
  const showWhatsapp = options?.whatsapp ?? true;

  const actions: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [];
  if (showWhatsapp) {
    actions.push({
      text: 'WhatsApp',
      onPress: async () => {
        const phone = digits.replace(/^\+/, '');
        const url = `whatsapp://send?phone=${phone}`;
        const supported = await Linking.canOpenURL(url).catch(() => false);
        if (supported) Linking.openURL(url).catch(() => {});
        else toastService.warning('WhatsApp non disponible', "WhatsApp n'est pas installé sur cet appareil.");
      },
    });
  }
  if (showCall) {
    actions.push({ text: 'Appeler', onPress: () => Linking.openURL(`tel:${digits}`).catch(() => {}) });
  }
  actions.push({ text: 'Copier', onPress: () => Clipboard.setString(rawPhone) });
  actions.push({ text: 'Annuler', style: 'cancel' });

  // Un seul canal coché (pas de choix à faire) : agit directement au lieu
  // d'afficher un menu à une seule vraie option + Copier/Annuler.
  if (showCall !== showWhatsapp && actions.length === 3) {
    actions[0].onPress?.();
    return;
  }

  showConfirm(rawPhone, undefined, actions);
}

/** Lance un appel direct — aucun menu, action immédiate. */
export function callPhone(rawPhone: string): void {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  Linking.openURL(`tel:${digits}`).catch(() => {});
}

/** Ouvre WhatsApp sur ce numéro — aucun menu, action immédiate. */
export async function openWhatsapp(rawPhone: string): Promise<void> {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  const phone  = digits.replace(/^\+/, '');
  const url    = `whatsapp://send?phone=${phone}`;
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (supported) Linking.openURL(url).catch(() => {});
  else toastService.warning('WhatsApp non disponible', "WhatsApp n'est pas installé sur cet appareil.");
}
