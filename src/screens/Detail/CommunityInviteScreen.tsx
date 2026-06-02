/**
 * CommunityInviteScreen — Code d'invitation d'une communauté.
 * - Affiche le code et le QR textuel
 * - Partage via WhatsApp / SMS / autres
 * - Régénère le code (admin)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Share, Alert,
  Clipboard, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

export const CommunityInviteScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { communityId, communityName, myRole, inviteCode: initialCode } = route.params;
  const isAdmin = myRole === 'admin' || myRole === 'moderator';

  const [code,        setCode]        = useState<string>(initialCode ?? '');
  const [loading,     setLoading]     = useState(!initialCode);
  const [regenerating,setRegenerating]= useState(false);
  const [copied,      setCopied]      = useState(false);

  const BASE = `/api/v1/communities/${communityId}`;

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ invite_code: string }>(`${BASE}`);
      setCode((res.data as any).invite_code ?? '');
    } catch { }
    finally { setLoading(false); }
  }, [BASE]);

  useEffect(() => { if (!initialCode) load(); }, [load, initialCode]);

  const handleRegenerate = async () => {
    Alert.alert(
      'Nouveau code',
      'L\'ancien code ne fonctionnera plus. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Générer', onPress: async () => {
          setRegenerating(true);
          try {
            const res = await apiClient.post<{ invite_code: string }>(`${BASE}/invite-code`);
            setCode(res.data.invite_code);
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
          finally { setRegenerating(false); }
        }},
      ],
    );
  };

  const handleCopy = () => {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: `Rejoins ${communityName} sur Folix !`,
        message:
          `🔥 Rejoins notre communauté "${communityName}" sur Folix !\n\n` +
          `👉 Code d'invitation : *${code}*\n\n` +
          `Télécharge Folix et entre ce code pour rejoindre le groupe.\n` +
          `https://folix.app/join/${code}`,
      });
    } catch { }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>Code d'invitation</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{communityName}</Text>
        </View>
      </View>

      <View style={{ flex: 1, padding: 24, gap: 24, justifyContent: 'center' }}>

        {/* Explication */}
        <View style={[st.infoBox, { backgroundColor: '#7B3FF210', borderColor: '#7B3FF230' }]}>
          <Icon name="users" size={16} color="#7B3FF2" />
          <Text style={{ color: '#7B3FF2', fontSize: 13, flex: 1, lineHeight: 19 }}>
            Partage ce code avec qui tu veux inviter. Il suffira de le saisir dans Folix pour rejoindre ta communauté.
          </Text>
        </View>

        {/* Card code */}
        <LinearGradient
          colors={['#7B3FF2', '#E0389A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 24, padding: 32, alignItems: 'center', gap: 8 }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
            CODE D'INVITATION
          </Text>
          {loading ? (
            <ActivityIndicator color="#fff" size="large" style={{ marginVertical: 16 }} />
          ) : (
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: 4 }}>
              {code || '—'}
            </Text>
          )}
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
            folix.app/join/{code || '...'}
          </Text>
        </LinearGradient>

        {/* Boutons actions */}
        <View style={{ gap: 12 }}>
          {/* Copier */}
          <TouchableOpacity onPress={handleCopy} activeOpacity={0.85}
            style={[st.btn, { backgroundColor: copied ? '#10B981' : colors.surface,
              borderColor: copied ? '#10B981' : colors.divider }]}>
            <Icon name={copied ? 'check' : 'copy'} size={18} color={copied ? '#fff' : colors.textPrimary} />
            <Text style={{ color: copied ? '#fff' : colors.textPrimary, fontWeight: '700', fontSize: 15 }}>
              {copied ? 'Copié !' : 'Copier le code'}
            </Text>
          </TouchableOpacity>

          {/* Partager */}
          <TouchableOpacity onPress={handleShare} activeOpacity={0.85}
            style={{ borderRadius: 16, overflow: 'hidden' }}>
            <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[st.btn, { borderWidth: 0 }]}>
              <Icon name="share-2" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                Partager l'invitation
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Régénérer (admin) */}
          {isAdmin && (
            <TouchableOpacity onPress={handleRegenerate} disabled={regenerating}
              activeOpacity={0.7}
              style={[st.btn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              {regenerating
                ? <ActivityIndicator size="small" color={colors.textTertiary} />
                : <Icon name="refresh-cw" size={16} color={colors.textTertiary} />
              }
              <Text style={{ color: colors.textTertiary, fontWeight: '600', fontSize: 14 }}>
                Générer un nouveau code
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info régénération */}
        {isAdmin && (
          <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
            Régénérer invalide l'ancien code. Utile si tu veux limiter l'accès.
          </Text>
        )}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
});
