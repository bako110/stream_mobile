/**
 * Ecoute globalement les invitations de battle recues (evenement WS "battle_invite")
 * et affiche un modal Accepter/Refuser, quel que soit l'ecran actuellement affiche —
 * meme pattern que IncomingCallHandler pour les appels.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Vibration } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { useTheme } from '../../hooks/useTheme';
import { battleService } from '../../services/battleService';

interface BattleInvitePayload extends WsPayload {
  type:         'battle_invite';
  battle_id:    string;
  from_live_id: string;
  from_host_id: string;
  from_name:    string;
  from_avatar:  string | null;
  timeout_sec:  number;
}

export const BattleInviteModal: React.FC = () => {
  const { addListener, removeListener } = useWs();
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();

  const [invite, setInvite] = useState<BattleInvitePayload | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    const handler = (payload: WsPayload) => {
      if (payload.type === 'battle_invite') {
        setInvite(payload as BattleInvitePayload);
        Vibration.vibrate([0, 300, 200, 300]);
      }
      if (payload.type === 'battle_invite_response' || payload.type === 'battle_cancelled') {
        // L'invitation qu'on avait envoyee a ete traitee (refusee/expiree/annulee) —
        // rien a afficher ici, c'est l'ecran de live qui gere ce retour pour l'auteur A.
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener]);

  const close = useCallback(() => setInvite(null), []);

  const handleRespond = useCallback(async (accept: boolean) => {
    if (!invite) return;
    setResponding(true);
    try {
      const battle = await battleService.respond(invite.battle_id, accept);
      close();
      if (accept && battle.status === 'active') {
        // replace (pas navigate) : sinon l'ecran de live reste monte en dessous avec son
        // propre LiveKitRoom connecte en parallele de celui du battle.
        nav.replace('BattleScreen', { battleId: battle.id });
      }
    } catch {
      close();
    } finally {
      setResponding(false);
    }
  }, [invite, close, nav]);

  if (!invite) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.iconWrap, { backgroundColor: '#7B3FF222' }]}>
            <Icon name="zap" size={28} color="#7B3FF2" />
          </View>

          {invite.from_avatar ? (
            <Image source={{ uri: invite.from_avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="user" size={28} color={colors.textTertiary} />
            </View>
          )}

          <Text style={[styles.title, { color: colors.textPrimary }]}>Invitation à un battle</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            <Text style={{ fontWeight: '700' }}>{invite.from_name}</Text> vous invite à un battle en direct !
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.declineBtn, { borderColor: colors.border }]}
              onPress={() => handleRespond(false)}
              disabled={responding}
              activeOpacity={0.8}
            >
              <Icon name="x" size={18} color={colors.textSecondary} />
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={() => handleRespond(true)}
              disabled={responding}
              activeOpacity={0.8}
            >
              <Icon name="check" size={18} color="#fff" />
              <Text style={[styles.btnText, { color: '#fff' }]}>Accepter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 24, padding: 24, alignItems: 'center', gap: 10 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 13 },
  declineBtn: { borderWidth: 1.5 },
  acceptBtn: { backgroundColor: '#10B981' },
  btnText: { fontSize: 14, fontWeight: '700' },
});
