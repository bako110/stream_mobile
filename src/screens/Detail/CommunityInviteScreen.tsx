import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Share, Alert,
  ActivityIndicator, Linking, ScrollView,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

const SHARE_BASE = 'https://gofolyx.com/join';

export const CommunityInviteScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { communityId, communityName, myRole } = route.params;
  const isAdmin = myRole === 'admin' || myRole === 'moderator';

  const [code,         setCode]         = useState<string>('');
  const [loading,      setLoading]      = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copiedCode,   setCopiedCode]   = useState(false);
  const [copiedLink,   setCopiedLink]   = useState(false);

  const shareUrl  = code ? `${SHARE_BASE}/${code}` : '';
  const shareText =
    `Rejoins "${communityName}" sur GoFolyX !\n\n` +
    `Code : ${code}\n` +
    `Lien : ${shareUrl}`;

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<any>(`/api/v1/communities/${communityId}`);
      const fetchedCode: string = res.data?.invite_code ?? '';
      if (!fetchedCode && isAdmin) {
        // Aucun code en base — en générer un automatiquement
        const gen = await apiClient.post<{ invite_code: string }>(
          `/api/v1/communities/${communityId}/invite-code`,
        );
        setCode(gen.data.invite_code ?? '');
      } else {
        setCode(fetchedCode);
      }
    } catch { }
    finally { setLoading(false); }
  }, [communityId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleRegenerate = () => {
    Alert.alert(
      'Nouveau code',
      "L'ancien code ne fonctionnera plus. Continuer ?",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Générer', onPress: async () => {
          setRegenerating(true);
          try {
            const res = await apiClient.post<{ invite_code: string }>(
              `/api/v1/communities/${communityId}/invite-code`,
            );
            setCode(res.data.invite_code);
          } catch (e: any) {
            Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.');
          } finally { setRegenerating(false); }
        }},
      ],
    );
  };

  const copyCode = () => {
    Clipboard.setString(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    Clipboard.setString(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareGeneral = async () => {
    try {
      await Share.share({ message: shareText, url: shareUrl });
    } catch { }
  };

  const shareWhatsApp = async () => {
    const encoded = encodeURIComponent(shareText);
    const url = `whatsapp://send?text=${encoded}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp non disponible', 'WhatsApp n\'est pas installé sur cet appareil.');
    }
  };

  const shareSms = async () => {
    const encoded = encodeURIComponent(shareText);
    const url = `sms:?body=${encoded}`;
    await Linking.openURL(url).catch(() =>
      Alert.alert('Erreur', 'Impossible d\'ouvrir les SMS.')
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[st.header, {
        paddingTop: insets.top + 8,
        borderBottomColor: colors.divider,
        backgroundColor: colors.surface,
      }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>
            Inviter des membres
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{communityName}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card principale — code + lien */}
        <LinearGradient
          colors={['#7B3FF2', '#E0389A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 24, padding: 24, gap: 16 }}
        >
          {/* Code */}
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
              CODE D'INVITATION
            </Text>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" style={{ marginVertical: 8 }} />
            ) : (
              <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 5 }}>
                {code || '—'}
              </Text>
            )}
          </View>

          {/* Séparateur */}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.25)' }} />

          {/* Lien */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
              LIEN DE PARTAGE
            </Text>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' }}
              numberOfLines={1}>
              {shareUrl || `${SHARE_BASE}/...`}
            </Text>
          </View>
        </LinearGradient>

        {/* Boutons copier */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={copyCode}
            activeOpacity={0.85}
            style={[st.copyBtn, {
              flex: 1,
              backgroundColor: copiedCode ? '#10B98120' : colors.surface,
              borderColor: copiedCode ? '#10B981' : colors.divider,
            }]}
          >
            <Icon name={copiedCode ? 'check' : 'copy'} size={16}
              color={copiedCode ? '#10B981' : colors.textPrimary} />
            <Text style={{ color: copiedCode ? '#10B981' : colors.textPrimary, fontWeight: '700', fontSize: 13 }}>
              {copiedCode ? 'Code copié !' : 'Copier le code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={copyLink}
            activeOpacity={0.85}
            style={[st.copyBtn, {
              flex: 1,
              backgroundColor: copiedLink ? '#7B3FF220' : colors.surface,
              borderColor: copiedLink ? '#7B3FF2' : colors.divider,
            }]}
          >
            <Icon name={copiedLink ? 'check' : 'link'} size={16}
              color={copiedLink ? '#7B3FF2' : colors.textPrimary} />
            <Text style={{ color: copiedLink ? '#7B3FF2' : colors.textPrimary, fontWeight: '700', fontSize: 13 }}>
              {copiedLink ? 'Lien copié !' : 'Copier le lien'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Partage rapide */}
        <View style={[st.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <Text style={[st.sectionTitle, { color: colors.textTertiary }]}>PARTAGER VIA</Text>

          {/* WhatsApp */}
          <TouchableOpacity
            onPress={shareWhatsApp}
            activeOpacity={0.8}
            style={[st.shareRow, { borderBottomColor: colors.divider }]}
          >
            <View style={[st.shareIcon, { backgroundColor: '#25D36620' }]}>
              <Icon name="message-circle" size={20} color="#25D366" />
            </View>
            <Text style={[st.shareLabel, { color: colors.textPrimary }]}>WhatsApp</Text>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* SMS */}
          <TouchableOpacity
            onPress={shareSms}
            activeOpacity={0.8}
            style={[st.shareRow, { borderBottomColor: colors.divider }]}
          >
            <View style={[st.shareIcon, { backgroundColor: '#3B82F620' }]}>
              <Icon name="message-square" size={20} color="#3B82F6" />
            </View>
            <Text style={[st.shareLabel, { color: colors.textPrimary }]}>SMS</Text>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Autres apps */}
          <TouchableOpacity
            onPress={shareGeneral}
            activeOpacity={0.8}
            style={[st.shareRow, { borderBottomColor: 'transparent' }]}
          >
            <View style={[st.shareIcon, { backgroundColor: '#7B3FF220' }]}>
              <Icon name="share-2" size={20} color="#7B3FF2" />
            </View>
            <Text style={[st.shareLabel, { color: colors.textPrimary }]}>Autres applications</Text>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Info comment rejoindre */}
        <View style={[st.infoBox, { backgroundColor: '#7B3FF210', borderColor: '#7B3FF230' }]}>
          <Icon name="info" size={15} color="#7B3FF2" />
          <Text style={{ color: '#7B3FF2', fontSize: 12, flex: 1, lineHeight: 18 }}>
            La personne invitée peut ouvrir le lien directement, ou saisir le code dans GoFolyX depuis
            Communautés — Rejoindre par code.
          </Text>
        </View>

        {/* Régénérer (admin) */}
        {isAdmin && (
          <TouchableOpacity
            onPress={handleRegenerate}
            disabled={regenerating}
            activeOpacity={0.7}
            style={[st.regenBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          >
            {regenerating
              ? <ActivityIndicator size="small" color={colors.textTertiary} />
              : <Icon name="refresh-cw" size={15} color={colors.textTertiary} />
            }
            <Text style={{ color: colors.textTertiary, fontWeight: '600', fontSize: 13 }}>
              Générer un nouveau code
            </Text>
          </TouchableOpacity>
        )}
        {isAdmin && (
          <Text style={{ color: colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: -12 }}>
            Régénérer invalide l'ancien code et crée un nouveau lien.
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1,
  },
  section: {
    borderRadius: 18, borderWidth: 1, overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shareIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  shareLabel: {
    flex: 1, fontSize: 15, fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
  },
});
