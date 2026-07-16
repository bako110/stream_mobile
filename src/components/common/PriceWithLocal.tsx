import React from 'react';
import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { useCurrency } from '../../hooks/useCurrency';

function formatLocalAmount(amount: number): string {
  // Devises comme XOF/GNF n'ont pas de décimales à l'usage courant — on arrondit
  // à l'entier pour éviter un affichage du type "6 559,60 F" qui n'a pas de sens.
  return Math.round(amount).toLocaleString('fr-FR');
}

interface Props {
  amountEur: number;
  style?: StyleProp<TextStyle>;
  localStyle?: StyleProp<TextStyle>;
  /** Préfixe/suffixe autour du montant EUR, ex: "/mois" */
  suffix?: string;
}

// Affiche un montant en euro, avec la conversion en devise locale à côté si
// l'utilisateur en a choisi une dans Réglages > Devise. Le prix EUR reste
// toujours la valeur de référence (celle réellement facturée) — la devise
// locale n'est qu'une indication, jamais utilisée pour le calcul du paiement.
export const PriceWithLocal: React.FC<Props> = ({ amountEur, style, localStyle, suffix }) => {
  const { selected, convertFromEur } = useCurrency();
  const local = convertFromEur(amountEur);

  return (
    <Text style={style}>
      {amountEur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €{suffix}
      {selected && local !== null && (
        <Text style={[st.local, localStyle]}> · {formatLocalAmount(local)} {selected.symbol}</Text>
      )}
    </Text>
  );
};

const st = StyleSheet.create({
  local: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
});
