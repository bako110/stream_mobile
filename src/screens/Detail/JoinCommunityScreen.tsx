import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert, ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

export const JoinCommunityScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { inviteCode } = route.params as { inviteCode: string };

  const [community, setCommunity] = useState<any | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [joining,   setJoining]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Toujours charger depuis l'API — ne jamais se fier au code passé en param
  useEffect(() => {
    const code = inviteCode?.trim().toUpperCase();
    if (!code) { setError('Code invalide.'); setLoading(false); return; }

    apiClient.get(`/api/v1/communities/join/${code}`)
      .then((r: any) => setCommunity(r.data))
      .catch((e: any) => {
        const msg = e?.response?.data?.detail ?? 'Code invalide ou expiré.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [inviteCode]);

  const handleJoin = async () => {
    if (!community) return;
    const code = inviteCode.trim().toUpperCase();

    if (community.join_status === 'member') {
      nav.replace('CommunityChat', { communityId: community.id, communityName: community.name });
      return;
    }

    const price: number = community.entry_price_coins ?? 0;
    if (price > 0) {
      Alert.alert(
        'Adhésion payante',
        `Cette communauté coûte ${price} coins pour rejoindre. Continuer ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: `Payer ${price} coins`, onPress: () => _doJoin(code) },
        ],
      );
      return;
    }

    _doJoin(code);
  };

  const _doJoin = async (code: string) => {
    setJoining(true);
    try {
      const res = await apiClient.post<any>(`/api/v1/communities/join/${code}`);
      if (res.data?.joined) {
        nav.replace('CommunityChat', { communityId: res.data.community_id, communityName: community.name });
      } else if (res.data?.pending) {
        Alert.alert(
          'Demande envoyee',
          "L'admin doit approuver ta demande. Tu seras notifie des que tu auras acces.",
          [{ text: 'OK', onPress: () => nav.goBack() }],
        );
      } else if (res.data?.error === 'insufficient_coins') {
        Alert.alert('Coins insuffisants', `Il te faut ${community.entry_price_coins} coins pour rejoindre cette communaute.`);
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? 'Impossible de rejoindre.';
      Alert.alert('Erreur', detail);
    } finally { setJoining(false); }
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7B3FF2" size="large" />
        <Text style={{ color: colors.textTertiary, marginTop: 12, fontSize: 14 }}>
          Chargement de la communaute...
        </Text>
      </View>
    );
  }

  // ── Erreur ──
  if (error || !community) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center',
        justifyContent: 'center', padding: 32, gap: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#EF444415',
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="alert-circle" size={36} color="#EF4444" />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
          Lien invalide
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          {error ?? "Ce code d'invitation est invalide ou a expire."}
        </Text>
        <TouchableOpacity onPress={() => nav.goBack()} style={{ marginTop: 8 }}>
          <Text style={{ color: '#7B3FF2', fontWeight: '700', fontSize: 15 }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const alreadyMember   = community.join_status === 'member';
  const pendingApproval = community.join_status === 'pending';
  const price: number   = community.entry_price_coins ?? 0;
  const needsApproval   = community.requires_approval || community.is_private;

  const joinLabel = () => {
    if (needsApproval) return 'Demander a rejoindre';
    if (price > 0) return `Rejoindre · ${price} coins`;
    return 'Rejoindre';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Banniere */}
      <View style={{ height: 220, backgroundColor: '#000' }}>
        {community.banner_url ? (
          <Image source={{ uri: community.banner_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#7B3FF2', '#E0389A']} style={{ flex: 1 }} />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }} />

        <TouchableOpacity onPress={() => nav.goBack()}
          style={{ position: 'absolute', top: insets.top + 12, right: 16,
            width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}>
        {/* Avatar + nom */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -20 }}>
          {community.avatar_url ? (
            <Image source={{ uri: community.avatar_url }}
              style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: colors.background }} />
          ) : (
            <LinearGradient colors={['#7B3FF2', '#E0389A']}
              style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: colors.background,
                alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="users" size={28} color="#fff" />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '900' }} numberOfLines={1}>
              {community.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Icon name={community.is_private ? 'lock' : 'globe'} size={12} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                {community.is_private ? 'Communaute privee' : 'Communaute publique'}
                {' · '}{community.members_count} membre{community.members_count !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          {community.is_verified && (
            <View style={{ backgroundColor: '#1D9BF020', borderRadius: 14, padding: 6 }}>
              <Icon name="check-circle" size={18} color="#1D9BF0" />
            </View>
          )}
        </View>

        {/* Description */}
        {community.description ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }} numberOfLines={4}>
            {community.description}
          </Text>
        ) : null}

        {/* Badge invitation */}
        <View style={[st.badge, { backgroundColor: '#7B3FF210', borderColor: '#7B3FF230' }]}>
          <Icon name="key" size={14} color="#7B3FF2" />
          <Text style={{ color: '#7B3FF2', fontSize: 13, fontWeight: '600' }}>
            Invite via le code{' '}
            <Text style={{ fontWeight: '900' }}>{inviteCode?.trim().toUpperCase()}</Text>
          </Text>
        </View>

        {/* Badge prix */}
        {price > 0 && !alreadyMember && !pendingApproval && (
          <View style={[st.badge, { backgroundColor: '#F59E0B10', borderColor: '#F59E0B30' }]}>
            <Icon name="zap" size={14} color="#F59E0B" />
            <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600' }}>
              Adhésion : <Text style={{ fontWeight: '900' }}>{price} coins</Text>
            </Text>
          </View>
        )}

        {/* Badge approbation */}
        {needsApproval && !alreadyMember && !pendingApproval && (
          <View style={[st.badge, { backgroundColor: '#3B82F610', borderColor: '#3B82F630' }]}>
            <Icon name="shield" size={14} color="#3B82F6" />
            <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '600' }}>
              Communaute sur approbation — l'admin doit accepter
            </Text>
          </View>
        )}

        {/* Bouton principal */}
        {alreadyMember ? (
          <TouchableOpacity onPress={handleJoin} activeOpacity={0.85} style={{ borderRadius: 16, overflow: 'hidden' }}>
            <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={st.mainBtn}>
              <Icon name="message-circle" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Ouvrir la discussion</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : pendingApproval ? (
          <View style={[st.mainBtn, { backgroundColor: '#F59E0B15', borderWidth: 1.5,
            borderColor: '#F59E0B40', borderRadius: 16 }]}>
            <Icon name="clock" size={18} color="#F59E0B" />
            <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 15 }}>
              Demande en cours d'examen
            </Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleJoin} disabled={joining} activeOpacity={0.85}
            style={{ borderRadius: 16, overflow: 'hidden' }}>
            <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={st.mainBtn}>
              {joining
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Icon name={price > 0 ? 'zap' : 'user-plus'} size={20} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                      {joinLabel()}
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        )}

        {needsApproval && !alreadyMember && !pendingApproval && price === 0 && (
          <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center', marginTop: -8 }}>
            L'admin devra approuver ta demande
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  mainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
});
