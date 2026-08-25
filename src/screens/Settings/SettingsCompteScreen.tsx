import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';
import { accountsService, toastService, showConfirm } from '../../services';
import type { StoredAccount } from '../../services';
import { MAX_ACCOUNTS } from '../../utils/constants';

interface Props {
  onRequestSwitch: (userId: string) => Promise<void>;
  onSessionRebuildNeeded: () => void;
  onAllAccountsRemoved: () => void;
  onAddAccount: () => void;
}

// ── AccountsSection — multi-compte façon TikTok (jusqu'à MAX_ACCOUNTS comptes) ─
const AccountsSection: React.FC<{
  accounts: StoredAccount[];
  onSwitch: (userId: string) => Promise<void>;
  onRemove: (userId: string) => void;
}> = ({ accounts, onSwitch, onRemove }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const canAdd = accounts.length < MAX_ACCOUNTS;

  const handleTap = async (account: StoredAccount) => {
    if (account.is_active || switchingId) return;
    setSwitchingId(account.user_id);
    try {
      await onSwitch(account.user_id);
    } catch (e: any) {
      showConfirm(
        'Connexion impossible',
        e?.message ?? 'Ce compte ne semble plus valide.',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'Retirer ce compte', style: 'destructive', onPress: () => onRemove(account.user_id) },
        ],
      );
    } finally {
      setSwitchingId(null);
    }
  };

  const confirmRemove = (account: StoredAccount) => {
    showConfirm(
      'Retirer ce compte ?',
      `Tu pourras ajouter à nouveau "${account.display_name || account.username}" plus tard.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => onRemove(account.user_id) },
      ],
    );
  };

  return (
    <>
      <Text style={[st.sectionTitle, { color: colors.textTertiary }]}>COMPTES</Text>
      <Card>
        {accounts.map((account, i) => {
          const isSwitching = switchingId === account.user_id;
          const initial = (account.display_name || account.username || '?')[0]?.toUpperCase() ?? '?';
          return (
            <TouchableOpacity
              key={account.user_id}
              style={[
                st.accountRow,
                i < accounts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
              ]}
              activeOpacity={account.is_active ? 1 : 0.7}
              onPress={() => handleTap(account)}
              disabled={account.is_active || !!switchingId}
            >
              <View style={[
                st.avatarWrap,
                account.is_active && { borderColor: colors.primary, borderWidth: 2 },
              ]}>
                {account.avatar_url ? (
                  <Image source={{ uri: account.avatar_url }} style={st.avatar} />
                ) : (
                  <View style={[st.avatar, st.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>{initial}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                  {account.display_name || account.username}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>
                  @{account.username}
                </Text>
              </View>
              {isSwitching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : account.is_active ? (
                <Icon name="check-circle" size={20} color={colors.primary} />
              ) : (
                <TouchableOpacity
                  onPress={() => confirmRemove(account)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 4 }}
                >
                  <Icon name="x-circle" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </Card>

      <Text style={[st.hint, { color: colors.textTertiary }]}>
        {canAdd ? `Ajoute jusqu'à ${MAX_ACCOUNTS} comptes et bascule entre eux sans te reconnecter.` : `Maximum ${MAX_ACCOUNTS} comptes atteint.`}
      </Text>
    </>
  );
};

export const SettingsCompteScreen: React.FC<Props> = ({
  onRequestSwitch, onSessionRebuildNeeded, onAllAccountsRemoved, onAddAccount,
}) => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => accountsService.listAccounts());
  const canAdd = accounts.length < 4;

  const handleRemove = async (userId: string) => {
    const wasActive = accountsService.getActiveAccount()?.user_id === userId;
    const newActive = await accountsService.removeAccount(userId);
    if (!wasActive) {
      setAccounts(accountsService.listAccounts());
      return;
    }
    if (newActive === null) {
      onAllAccountsRemoved();
    } else {
      onSessionRebuildNeeded();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Compte" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <AccountsSection accounts={accounts} onSwitch={onRequestSwitch} onRemove={handleRemove} />

        <TouchableOpacity
          activeOpacity={canAdd ? 0.7 : 1}
          disabled={!canAdd}
          onPress={onAddAccount}
          style={[st.addAccountBtn, { borderColor: colors.divider, opacity: canAdd ? 1 : 0.4 }]}
        >
          <Icon name="plus-circle" size={18} color={colors.primary} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Ajouter un compte</Text>
        </TouchableOpacity>

        <Card>
          <Row icon="user"     label="Modifier le profil"      color="#7B3FF2" onPress={() => nav.navigate('EditProfile')} />
          <Row icon="lock"     label="Changer le mot de passe" color="#9B65F5" onPress={() => nav.navigate('ChangePassword')} />
          <Row icon="shield"   label="Confidentialité"         color="#3B82F6" onPress={() => nav.navigate('Privacy')} />
          <Row icon="shield"   label="Appareils connectés"     color="#10B981" onPress={() => nav.navigate('SettingsSecurity')} />
          <Row icon="monitor"  label="Connecter le site web"   color="#7B3FF2" value="Scanner un QR" onPress={() => nav.navigate('WebQRScanner')} />
          <Row icon="slash"    label="Utilisateurs bloqués"    color="#EF4444" onPress={() => nav.navigate('BlockedUsers')} />
          <Row icon="users"    label="Abonnements / Abonnés"   color="#10B981" onPress={() => nav.navigate('Following')} />
          <Row icon="zap"      label="Booster mon compte"      color="#E0389A" value="Gagne des abonnés et des vues" onPress={() => nav.navigate('Boost')} />
          <Row icon="check-circle" label="Badge vérifié Gofolyx"  color="#1D9BF0" value="Obtenir le badge bleu" onPress={() => nav.navigate('SettingsVerification')} />
          <Row icon="download" label="Télécharger mes données" color="#6366F1"
            onPress={() => toastService.info('Bientôt disponible', 'Export de données disponible prochainement.')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  scroll:       { padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  accountRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  avatarWrap:   { borderRadius: 22, padding: 1 },
  avatar:       { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  hint:         { fontSize: 12, marginTop: 8, marginBottom: 4 },
  addAccountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 13,
    marginTop: 4, marginBottom: 20,
  },
});
