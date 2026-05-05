import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

type TransferRouteParams = {
  Transfer: { recipientId?: string; recipientName?: string; recipientAvatar?: string };
};

export default function TransferScreen() {
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<TransferRouteParams, 'Transfer'>>();

  const prefilled = route.params?.recipientId
    ? {
        id: route.params.recipientId,
        username: route.params.recipientName ?? route.params.recipientId,
        display_name: route.params.recipientName,
        avatar_url: route.params.recipientAvatar,
      }
    : null;

  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState<UserResult[]>([]);
  const [selected,   setSelected]   = useState<UserResult | null>(prefilled);
  const [amount,     setAmount]     = useState('');
  const [note,       setNote]       = useState('');
  const [searching,  setSearching]  = useState(false);
  const [sending,    setSending]    = useState(false);
  const [balance,    setBalance]    = useState<number | null>(null);

  React.useEffect(() => {
    apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance)
      .then(r => setBalance(r.data?.coins_balance ?? 0))
      .catch(() => {});
  }, []);

  const searchUsers = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await apiClient.get<any>(`${Endpoints.search.query}?q=${encodeURIComponent(q)}&type=users&limit=8`);
      const list = res.data?.users ?? res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
      setResults(list);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  const handleSend = async () => {
    if (!selected) return Alert.alert('Destinataire manquant', 'Sélectionne un utilisateur.');
    const coins = parseInt(amount, 10);
    if (!coins || coins < 1) return Alert.alert('Montant invalide', 'Entre un nombre de coins valide.');
    if (balance !== null && coins > balance) return Alert.alert('Solde insuffisant', `Tu as ${balance} coins disponibles.`);

    Alert.alert(
      'Confirmer le transfert',
      `Envoyer ${coins} coins à ${selected.display_name || selected.username} ?${note ? `\nNote : ${note}` : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer', onPress: async () => {
            setSending(true);
            try {
              const res = await apiClient.post<{ new_balance: number; message: string }>(
                Endpoints.wallet.transfer,
                { receiver_id: selected.id, coins_amount: coins, note: note || null },
              );
              setBalance(res.data?.new_balance ?? null);
              Alert.alert('Transfert réussi ✓', res.data?.message ?? `${coins} coins envoyés.`, [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Transfert échoué');
            } finally { setSending(false); }
          },
        },
      ],
    );
  };

  const coins = parseInt(amount, 10) || 0;
  const eur   = ((coins / 100) * 0.5).toFixed(2);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.textPrimary }]}>Transférer des coins</Text>
        {balance !== null && (
          <View style={[s.balancePill, { backgroundColor: colors.surface }]}>
            <Text style={s.balanceText}>{balance} 🪙</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Recherche utilisateur */}
        <Text style={[s.label, { color: colors.textSecondary }]}>Destinataire</Text>
        {selected ? (
          <TouchableOpacity
            style={[s.selectedUser, { backgroundColor: colors.surface }]}
            onPress={() => { setSelected(null); setQuery(''); }}
          >
            {selected.avatar_url
              ? <Image source={{ uri: selected.avatar_url }} style={s.avatar} />
              : <View style={[s.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                  <Text style={s.avatarLetter}>{(selected.display_name || selected.username)[0].toUpperCase()}</Text>
                </View>
            }
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.textPrimary }]}>{selected.display_name || selected.username}</Text>
              <Text style={[s.userSub, { color: colors.textSecondary }]}>@{selected.username}</Text>
            </View>
            <Icon name="x" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <>
            <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                placeholder="Rechercher un utilisateur…"
                placeholderTextColor={colors.textTertiary}
                value={query}
                onChangeText={searchUsers}
                autoCapitalize="none"
              />
              {searching && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
            {(results ?? []).map(u => (
              <TouchableOpacity
                key={u.id}
                style={[s.resultRow, { backgroundColor: colors.surface }]}
                onPress={() => { setSelected(u); setResults([]); setQuery(''); }}
              >
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={s.avatar} />
                  : <View style={[s.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                      <Text style={s.avatarLetter}>{(u.display_name || u.username)[0].toUpperCase()}</Text>
                    </View>
                }
                <View>
                  <Text style={[s.userName, { color: colors.textPrimary }]}>{u.display_name || u.username}</Text>
                  <Text style={[s.userSub, { color: colors.textSecondary }]}>@{u.username}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Montant */}
        <Text style={[s.label, { color: colors.textSecondary, marginTop: 24 }]}>Montant</Text>
        <View style={[s.amountBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={s.coinIcon}>🪙</Text>
          <TextInput
            style={[s.amountInput, { color: colors.textPrimary }]}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={[s.eurLabel, { color: colors.textSecondary }]}>≈ {eur} €</Text>
        </View>

        {/* Raccourcis montant */}
        <View style={s.quickRow}>
          {[100, 500, 1000, 2000].map(v => (
            <TouchableOpacity
              key={v}
              style={[s.quickBtn, { backgroundColor: colors.surface }]}
              onPress={() => setAmount(String(v))}
            >
              <Text style={[s.quickText, { color: colors.textPrimary }]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Note */}
        <Text style={[s.label, { color: colors.textSecondary, marginTop: 24 }]}>Note (optionnel)</Text>
        <TextInput
          style={[s.noteInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          placeholder="Ajoute un message…"
          placeholderTextColor={colors.textTertiary}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          multiline
        />

        {/* Bouton envoyer */}
        <TouchableOpacity
          style={[s.sendBtn, (!selected || !coins || sending) && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!selected || !coins || sending}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.sendInner}
          >
            {sending
              ? <ActivityIndicator size={18} color="#fff" />
              : <>
                  <Icon name="send" size={16} color="#fff" />
                  <Text style={s.sendText}>
                    {coins > 0 ? `Envoyer ${coins} 🪙` : 'Envoyer'}
                  </Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16, gap: 12 },
  backBtn:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, fontSize: 18, fontWeight: '700' },
  balancePill:{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  balanceText:{ color: '#FFD700', fontWeight: '700', fontSize: 13 },
  scroll:     { paddingHorizontal: 20, paddingBottom: 48 },
  label:      { fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  searchInput:{ flex: 1, fontSize: 15 },
  resultRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, marginBottom: 6 },
  selectedUser:{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginBottom: 8 },
  avatar:     { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 18 },
  userName:   { fontSize: 15, fontWeight: '600' },
  userSub:    { fontSize: 12, marginTop: 2 },
  amountBox:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  coinIcon:   { fontSize: 22 },
  amountInput:{ flex: 1, fontSize: 28, fontWeight: '800' },
  eurLabel:   { fontSize: 14 },
  quickRow:   { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn:   { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  quickText:  { fontSize: 13, fontWeight: '700' },
  noteInput:  { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15, minHeight: 80, marginBottom: 8, textAlignVertical: 'top' },
  sendBtn:    { marginTop: 32, borderRadius: 28, overflow: 'hidden' },
  sendInner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  sendText:   { color: '#fff', fontSize: 17, fontWeight: '800' },
});
