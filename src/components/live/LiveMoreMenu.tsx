/**
 * LiveMoreMenu — Bottom sheet ouvert par le bouton "..." de l'écran live.
 * Regroupe TOUT ce qui n'est pas dans la barre principale :
 *  - Viewer : Suivre/Suivi(e) l'hôte, Copier le lien, Partager, Signaler
 *  - Host   : Paramètres du live, Copier le lien, Partager, Terminer le live
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import Clipboard from '@react-native-clipboard/clipboard';
import Share from 'react-native-share';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { userService } from '../../services/userService';
import { socialService } from '../../services/socialService';
import { useUser } from '../../context/UserContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { ReportModal } from '../common/ReportModal';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface Props {
  visible:  boolean;
  onClose:  () => void;
  isHost:   boolean;
  liveId:   string;
  hostId?:  string;
  hostName?: string;
  onOpenSettings?: () => void;
  onStopLive?:     () => void;
  onLeave?:        () => void;
  onOpenBattle?:   () => void;
}

export const LiveMoreMenu: React.FC<Props> = ({
  visible, onClose, isHost, liveId, hostId, hostName, onOpenSettings, onStopLive, onLeave, onOpenBattle,
}) => {
  const { currentUser } = useUser();
  const nav = useNavigation<Nav>();
  const [isFollowed, setIsFollowed] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (isHost || !hostId || !visible) return;
    userService.getPublicProfile(hostId)
      .then(p => setIsFollowed(!!p.is_followed))
      .catch(() => setIsFollowed(false));
  }, [isHost, hostId, visible]);

  const handleFollow = async () => {
    if (!hostId || followLoading || isFollowed === null) return;
    setFollowLoading(true);
    try {
      if (isFollowed) await userService.unfollow(hostId);
      else await userService.follow(hostId);
      setIsFollowed(v => !v);
    } catch {}
    finally { setFollowLoading(false); }
  };

  const run = (fn?: () => void) => {
    onClose();
    if (fn) setTimeout(fn, 200);
  };

  const shareUrl = `https://gofolyx.com/live/${liveId}`;

  const handleShare = () => {
    run(() => {
      Share.open({
        title: 'Rejoins ce live',
        message: hostName ? `${hostName} est en direct sur GoFolyX, viens voir !` : 'Rejoins ce live sur GoFolyX !',
        url: shareUrl,
        failOnCancel: false,
      }).catch(() => {});
      // Enregistrement du partage en base (compteur + intérêts) — le sheet natif OS
      // ne fait qu'ouvrir la fenêtre de partage, il ne remonte rien côté serveur.
      // Best-effort : un échec réseau ici ne doit jamais bloquer le partage lui-même.
      socialService.share({ platform: 'external', live_id: liveId }).catch(() => {});
    });
  };

  const handleCopyLink = () => {
    run(() => Clipboard.setString(shareUrl));
  };

  const handleReport = () => {
    onClose();
    setTimeout(() => setShowReport(true), 200);
  };

  const handleStop = () => {
    run(() => {
      Alert.alert('Terminer le live ?', 'Tous les viewers seront déconnectés.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Terminer', style: 'destructive', onPress: onStopLive },
      ]);
    });
  };

  const handleLeaveConfirm = () => {
    run(() => {
      Alert.alert('Quitter le live ?', 'Es-tu sûr de vouloir quitter ce live ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: onLeave },
      ]);
    });
  };

  const showFollow = !isHost && hostId && String(hostId) !== String(currentUser?.id ?? '');

  return (
    <>
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={s.sheet}>
              <View style={s.handle} />

              {showFollow && (
                <TouchableOpacity style={s.row} onPress={handleFollow} activeOpacity={0.75} disabled={followLoading}>
                  <View style={s.iconWrap}>
                    {followLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Icon name={isFollowed ? 'user-check' : 'user-plus'} size={18} color="#fff" />
                    }
                  </View>
                  <Text style={s.label}>
                    {isFollowed === null ? 'Suivre' : isFollowed ? `Suivi${hostName ? ` ${hostName}` : ''}` : `Suivre${hostName ? ` ${hostName}` : ''}`}
                  </Text>
                </TouchableOpacity>
              )}

              {isHost && (
                <TouchableOpacity style={s.row} onPress={() => run(onOpenSettings)} activeOpacity={0.75}>
                  <View style={s.iconWrap}>
                    <Icon name="settings" size={18} color="#fff" />
                  </View>
                  <Text style={s.label}>Paramètres du live</Text>
                </TouchableOpacity>
              )}

              {isHost && onOpenBattle && (
                <TouchableOpacity style={s.row} onPress={() => run(onOpenBattle)} activeOpacity={0.75}>
                  <View style={[s.iconWrap, s.iconWrapBattle]}>
                    <Icon name="zap" size={18} color="#7B3FF2" />
                  </View>
                  <Text style={s.label}>Défier un créateur (Battle)</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.row} onPress={() => run(() => nav.navigate('TournamentList'))} activeOpacity={0.75}>
                <View style={[s.iconWrap, s.iconWrapBattle]}>
                  <Icon name="award" size={18} color="#7B3FF2" />
                </View>
                <Text style={s.label}>Tournois</Text>
              </TouchableOpacity>

              {!isHost && onLeave && (
                <TouchableOpacity style={s.row} onPress={handleLeaveConfirm} activeOpacity={0.75}>
                  <View style={s.iconWrap}>
                    <Icon name="log-out" size={18} color="#fff" />
                  </View>
                  <Text style={s.label}>Quitter le live</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.row} onPress={handleCopyLink} activeOpacity={0.75}>
                <View style={s.iconWrap}>
                  <Icon name="link" size={18} color="#fff" />
                </View>
                <Text style={s.label}>Copier le lien</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.row} onPress={handleShare} activeOpacity={0.75}>
                <View style={s.iconWrap}>
                  <Icon name="share-2" size={18} color="#fff" />
                </View>
                <Text style={s.label}>Partager</Text>
              </TouchableOpacity>

              {!isHost && (
                <TouchableOpacity style={s.row} onPress={handleReport} activeOpacity={0.75}>
                  <View style={[s.iconWrap, s.iconWrapDanger]}>
                    <Icon name="flag" size={18} color="#F0365A" />
                  </View>
                  <Text style={[s.label, s.labelDanger]}>Signaler le live</Text>
                </TouchableOpacity>
              )}

              {isHost && (
                <TouchableOpacity style={s.row} onPress={handleStop} activeOpacity={0.75}>
                  <View style={[s.iconWrap, s.iconWrapDanger]}>
                    <Icon name="x-circle" size={18} color="#F0365A" />
                  </View>
                  <Text style={[s.label, s.labelDanger]}>Terminer le live</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={s.cancelText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>

    <ReportModal
      visible={showReport}
      contentType="live"
      contentId={liveId}
      onClose={() => setShowReport(false)}
    />
    </>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#14101f',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingBottom: 30, paddingHorizontal: 18,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapDanger: { backgroundColor: 'rgba(240,54,90,0.12)' },
  iconWrapBattle: { backgroundColor: 'rgba(123,63,242,0.15)' },
  label:       { color: '#fff', fontSize: 15, fontWeight: '600' },
  labelDanger: { color: '#F0365A' },
  cancelBtn: {
    marginTop: 8, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  cancelText: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' },
});
