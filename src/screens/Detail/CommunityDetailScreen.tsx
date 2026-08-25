import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, Modal,
  StyleSheet, ActivityIndicator, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Switch,
  StatusBar, Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, GofolyxLoader, PriceWithLocal } from '../../components/common';
import { ZoomableImage } from '../../components/common/ZoomableImage';

const { width: VIEWER_W, height: VIEWER_H } = Dimensions.get('window');
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { authService } from '../../services/authService';
import { apiClient, Endpoints } from '../../api';
import type {
  CommunityData,
  CommunityMemberData,
  BlockedMemberData,
} from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { useWs } from '../../context/WebSocketContext';
import { ExpandableText } from '../../components/common';
import { favoriteService } from '../../services/favoriteService';
import { toastService, showConfirm } from '../../services';

type Nav = NativeStackNavigationProp<MainStackParamList>;
interface Props { route: { params: { communityId: string; autoEnter?: boolean } }; }

type SettingsTab = 'info' | 'members' | 'security';

type BadgePlan = 'monthly' | 'quarterly' | 'yearly';

// Même grille tarifaire que le badge vérifié utilisateur — abonnement récurrent,
// débité automatiquement au wallet du créateur à chaque échéance (voir
// app/db/postgres/models/community.py:COMMUNITY_VERIFICATION_PLAN_CONFIG).
const BADGE_PLAN_INFO: Record<BadgePlan, { label: string; priceEur: number; months: number; badge?: string }> = {
  monthly:   { label: 'Mensuel', priceEur: 9,     months: 1 },
  quarterly: { label: '3 mois',  priceEur: 24.30, months: 3, badge: '-10%' },
  yearly:    { label: 'Annuel',  priceEur: 81,    months: 12, badge: '-25%' },
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Modérateur',
  member: 'Membre',
};

const ROLE_COLORS: Record<string, string> = {
  admin:     '#7B3FF2',
  moderator: '#F59E0B',
  member:    '#10B981',
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function gradientFor(_name: string): [string, string] {
  return ['#7B3FF2', '#9B65F5'];
}

// ─────────────────────────────────────────────────────────────────────────────
export const CommunityDetailScreen: React.FC<Props> = ({ route }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { communityId, autoEnter } = route.params;

  const [community,      setCommunity]      = useState<CommunityData | null>(null);
  const [members,        setMembers]        = useState<CommunityMemberData[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [joinStatus,     setJoinStatus]     = useState<'none' | 'pending' | 'member'>('none');
  const [myId,           setMyId]           = useState<string | null>(null);
  const [myName,         setMyName]         = useState<string>('');
  const [myRole,         setMyRole]         = useState<string | null>(null);
  const [myGoGold,        setMyGoGold]        = useState<number | null>(null);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [blockedMembers, setBlockedMembers] = useState<BlockedMemberData[]>([]);
  const [isGlobalAdmin,  setIsGlobalAdmin]  = useState(false);
  const [verifyLoading,  setVerifyLoading]  = useState(false);
  const [vrStatus,       setVrStatus]       = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [vrLoading,      setVrLoading]      = useState(false);
  const [vrModalOpen,    setVrModalOpen]    = useState(false);
  const [vrReason,       setVrReason]       = useState('');
  const [vrPlan,         setVrPlan]         = useState<BadgePlan>('monthly');
  const [pendingCount,   setPendingCount]   = useState(0);
  const [viewerUrl,      setViewerUrl]      = useState<string | null>(null);
  const [communitySaved, setCommunitySaved] = useState(false);
  const [tierLoading,    setTierLoading]    = useState(false);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<SettingsTab>('info');
  const [saving,       setSaving]       = useState(false);
  const pickingRef  = useRef(false);
  const joiningRef  = useRef(false);

  // Onglet Info
  const [editName,   setEditName]   = useState('');
  const [editDesc,   setEditDesc]   = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editBanner, setEditBanner] = useState<string | null>(null);

  // Onglet Sécurité
  const [editPrivate,              setEditPrivate]              = useState(false);
  const [editApproval,             setEditApproval]             = useState(false);
  const [editMembersOnly,          setEditMembersOnly]          = useState(false);
  const [editEntryPrice,           setEditEntryPrice]           = useState('0');
  const [editMembersHiddenPublic,  setEditMembersHiddenPublic]  = useState(true);
  const [editMembersHiddenAll,     setEditMembersHiddenAll]     = useState(true);
  const [editInviteOnlyAdmin,      setEditInviteOnlyAdmin]      = useState(true);

  // Onglet Membres
  const [roleLoading,    setRoleLoading]    = useState<string | null>(null);
  const [blockLoading,   setBlockLoading]   = useState<string | null>(null);
  const [unblockLoading, setUnblockLoading] = useState<string | null>(null);
  const [memberSearch,   setMemberSearch]   = useState('');

  const isAdmin  = myRole === 'admin';
  const isMod    = myRole === 'moderator';

  // Visibilité du bouton/section membres selon les flags de la communauté
  const canShowMembersBtn = isGlobalAdmin || isAdmin || isMod || (() => {
    if (!community) return true;
    const hiddenPublic  = !!community.members_list_hidden_public;
    const hiddenMembers = !!community.members_list_hidden_members;
    const isMemberOrAbove = joinStatus === 'member' || isAdmin || isMod;
    if (hiddenPublic  && !isMemberOrAbove) return false;
    if (hiddenMembers && !isAdmin && !isMod) return false;
    return true;
  })();

  const { addListener, removeListener } = useWs();
  const loadRef      = useRef<() => void>(() => {});
  const communityRef = useRef<CommunityData | null>(null);

  useEffect(() => { communityRef.current = community; }, [community]);

  useEffect(() => {
    const handler = (payload: { type: string; community_id?: string; community_name?: string }) => {
      if (payload.type === 'community_join_approved' && payload.community_id === communityId) {
        loadRef.current();
        nav.replace('CommunityChat', {
          communityId,
          communityName: payload.community_name ?? communityRef.current?.name ?? '',
        });
      }
      if (payload.type === 'community_join_request' && payload.community_id === communityId) {
        setPendingCount(prev => prev + 1);
      }
    };
    addListener(handler as any);
    return () => removeListener(handler as any);
  }, [addListener, removeListener, communityId, nav]);

  const load = useCallback(async () => {
    try {
      const [c, me, role] = await Promise.all([
        communityService.getById(communityId),
        authService.getMe(),
        communityService.getMyRole(communityId).catch(() => null),
      ]);
      setCommunity(c);
      favoriteService.check('community', communityId).then(setCommunitySaved).catch(() => {});
      const uid = String(me.id);
      setMyId(uid);
      setMyName((me as any).display_name || (me as any).username || '');
      setMyRole(role);
      const globalAdmin = (me as any).role === 'admin';
      setIsGlobalAdmin(globalAdmin);
      const js = (c as any).join_status ?? (role ? 'member' : 'none');
      setJoinStatus(js);
      if (autoEnter && (js === 'member' || role === 'admin' || role === 'moderator')) {
        nav.replace('CommunityChat', { communityId, communityName: c.name });
        return;
      }
      const hiddenPublic  = !!c.members_list_hidden_public;
      const hiddenMembers = !!c.members_list_hidden_members;
      const isMemberOrAbove = js === 'member' || role === 'admin' || role === 'moderator';
      const canSeeMembers =
        globalAdmin ||
        role === 'admin' || role === 'moderator' ||
        (
          (!c.is_private || isMemberOrAbove) &&
          !(hiddenPublic  && !isMemberOrAbove) &&
          !(hiddenMembers && role !== 'admin' && role !== 'moderator')
        );
      if (canSeeMembers) {
        communityService.getMembers(communityId)
          .then(list => setMembers(Array.isArray(list) ? list : []))
          .catch(() => {});
      } else {
        setMembers([]);
      }
      if ((c.entry_price_gogold ?? 0) > 0 && js !== 'member') {
        apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance)
          .then(r => setMyGoGold(r.data?.gogold_balance ?? 0))
          .catch(() => setMyGoGold(null));
      }
      if (role === 'admin' || role === 'moderator') {
        communityService.getBlockedMembers(communityId).then(setBlockedMembers).catch(() => {});
      }
      if (role === 'admin' || role === 'moderator' || globalAdmin) {
        communityService.getJoinRequests(communityId)
          .then(reqs => setPendingCount(Array.isArray(reqs) ? reqs.length : 0))
          .catch(() => {});
      }
      if (role === 'admin' || globalAdmin) {
        communityService.getVerificationRequest(communityId)
          .then(vr => setVrStatus(vr ? (vr.status as any) : 'none'))
          .catch(() => {});
      }
    } catch {}
    finally { setLoading(false); }
  }, [communityId]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { load(); }, [load]);

  function openSettings() {
    if (!community) return;
    console.log('[openSettings] community flags:', JSON.stringify({
      members_list_hidden_public:  community.members_list_hidden_public,
      members_list_hidden_members: community.members_list_hidden_members,
      invite_only_admin:           community.invite_only_admin,
    }));
    setEditName(community.name);
    setEditDesc(community.description ?? '');
    setEditAvatar(null);
    setEditBanner(null);
    setEditPrivate(community.is_private);
    setEditApproval(!!community.requires_approval);
    setEditMembersOnly(!!community.members_only_chat);
    setEditEntryPrice(String(community.entry_price_gogold ?? 0));
    setEditMembersHiddenPublic(!!community.members_list_hidden_public);
    setEditMembersHiddenAll(!!community.members_list_hidden_members);
    setEditInviteOnlyAdmin(!!community.invite_only_admin);
    setSettingsTab('info');
    setSettingsOpen(true);
  }

  async function pickImage(target: 'avatar' | 'banner') {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 1 }, (resp) => {
      pickingRef.current = false;
      if (resp.didCancel || resp.errorCode || !resp.assets?.length) return;
      const uri = resp.assets[0].uri ?? null;
      if (target === 'avatar') setEditAvatar(uri);
      else setEditBanner(uri);
    });
  }

  async function uploadImage(uri: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', { uri, name: `community_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    try {
      const res = await apiClient.upload<{ uploaded: { url: string }[] }>(
        Endpoints.upload.images('communities'),
        fd,
      );
      return res.data?.uploaded?.[0]?.url ?? null;
    } catch { return null; }
  }

  async function handleSaveSettings() {
    if (settingsTab === 'info') {
      if (!editName.trim()) { toastService.error('Erreur', 'Le nom est requis.'); return; }
      setSaving(true);
      try {
        const [avatarUrl, bannerUrl] = await Promise.all([
          editAvatar ? uploadImage(editAvatar) : Promise.resolve(null),
          editBanner ? uploadImage(editBanner) : Promise.resolve(null),
        ]);
        const updated = await communityService.update(communityId, {
          name:        editName.trim(),
          description: editDesc.trim() || undefined,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          ...(bannerUrl ? { banner_url: bannerUrl } : {}),
        });
        setCommunity(updated);
        setSettingsOpen(false);
      } catch (e: any) {
        toastService.error('Erreur', e?.message ?? 'Impossible de sauvegarder.');
      } finally { setSaving(false); }
    } else if (settingsTab === 'security') {
      const price = parseInt(editEntryPrice, 10);
      if (isNaN(price) || price < 0) {
        toastService.error('Erreur', 'Le prix d\'entrée doit être un entier positif ou 0.');
        return;
      }
      setSaving(true);
      const payload = {
        is_private:                  editPrivate,
        requires_approval:           editApproval,
        members_only_chat:           editMembersOnly,
        entry_price_gogold:           price,
        members_list_hidden_public:  editMembersHiddenPublic,
        members_list_hidden_members: editMembersHiddenAll,
        invite_only_admin:           editInviteOnlyAdmin,
      };
      console.log('[Settings] SEND payload:', JSON.stringify(payload));
      try {
        const updated = await communityService.update(communityId, payload);
        console.log('[Settings] RECV updated:', JSON.stringify({
          members_list_hidden_public:  updated.members_list_hidden_public,
          members_list_hidden_members: updated.members_list_hidden_members,
          invite_only_admin:           updated.invite_only_admin,
        }));
        setCommunity(updated);
        setSettingsOpen(false);
        toastService.success('Enregistré', 'Les paramètres ont été mis à jour.');
      } catch (e: any) {
        console.log('[Settings] ERROR:', e?.message, e?.response?.data);
        toastService.error('Erreur', e?.message ?? 'Impossible de sauvegarder.');
      } finally { setSaving(false); }
    }
  }

  async function handleChangeRole(member: CommunityMemberData, newRole: 'admin' | 'moderator' | 'member') {
    if (member.user_id === myId && newRole !== 'admin') {
      showConfirm(
        'Se rétrograder ?',
        'Tu vas perdre les droits d\'administration. Continuer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', style: 'destructive', onPress: () => doChangeRole(member.user_id, newRole) },
        ],
      );
      return;
    }
    if (newRole === 'admin' && member.user_id !== myId) {
      showConfirm(
        'Nommer admin',
        `Donner les droits admin à ${member.display_name || member.username} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: () => doChangeRole(member.user_id, newRole) },
        ],
      );
      return;
    }
    doChangeRole(member.user_id, newRole);
  }

  async function doChangeRole(userId: string, role: string) {
    setRoleLoading(userId);
    try {
      await communityService.updateMemberRole(communityId, userId, role);
      await load();
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Impossible de changer le rôle.');
    } finally { setRoleLoading(null); }
  }

  async function handleKick(member: CommunityMemberData) {
    showConfirm(
      'Exclure',
      `Exclure ${member.display_name || member.username} de la communauté ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exclure',
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.removeMember(communityId, member.user_id);
              load();
            } catch { toastService.error('Erreur', 'Impossible d\'exclure ce membre.'); }
          },
        },
      ],
    );
  }

  async function handleBlock(member: CommunityMemberData) {
    if (member.user_id === myId) return;
    if (member.role === 'admin') {
      toastService.warning('Impossible', 'Vous ne pouvez pas bloquer un administrateur.');
      return;
    }
    const name = member.display_name || member.username || 'Ce membre';
    showConfirm(
      'Bloquer',
      `Bloquer ${name} ? Cette personne sera exclue et ne pourra plus rejoindre.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            setBlockLoading(member.user_id);
            try {
              // 1. Éjecter d'abord — envoie community_member_kicked via WS → l'utilisateur est redirigé automatiquement
              await communityService.removeMember(communityId, member.user_id).catch(() => {});
              // 2. Bloquer pour l'empêcher de revenir
              await communityService.blockMember(communityId, member.user_id);
              // 3. Annonce visible dans le chat
              await communityService.sendMessage(
                communityId,
                `${name} a été bloqué par un administrateur.`,
                'announcement',
              ).catch(() => {});
              // 4. Mise à jour locale immédiate
              setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
              setBlockedMembers(prev => [
                ...prev,
                {
                  id: member.id,
                  user_id: member.user_id,
                  username: member.username,
                  display_name: member.display_name,
                  avatar_url: member.avatar_url,
                  blocked_at: new Date().toISOString(),
                  reason: null,
                },
              ]);
            } catch { toastService.error('Erreur', 'Impossible de bloquer.'); }
            finally { setBlockLoading(null); }
          },
        },
      ],
    );
  }

  async function handleUnblock(b: BlockedMemberData) {
    const name = b.display_name || b.username || 'Ce membre';
    showConfirm('Débloquer', `Débloquer ${name} ? Il pourra rejoindre librement la communauté.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Débloquer',
        onPress: async () => {
          setUnblockLoading(b.user_id);
          try {
            await communityService.unblockMember(communityId, b.user_id);
            await communityService.sendMessage(
              communityId,
              `${name} a été débloqué et peut à nouveau rejoindre la communauté.`,
              'announcement',
            ).catch(() => {});
            // Mise à jour locale immédiate
            setBlockedMembers(prev => prev.filter(x => x.user_id !== b.user_id));
          } catch { toastService.error('Erreur', 'Impossible de débloquer.'); }
          finally { setUnblockLoading(null); }
        },
      },
    ]);
  }

  const handleJoin = async () => {
    if (!community) return;
    if (joiningRef.current || actionLoading || joinStatus !== 'none') return;
    const price         = community.entry_price_gogold ?? 0;
    const needsApproval = community.is_private || community.requires_approval;
    const priceLabel    = (n: number) => `${n} GoGold`;

    if (price > 0 && myGoGold !== null && myGoGold < price) {
      const manque = price - myGoGold;
      showConfirm(
        'Solde insuffisant',
        `Vous avez ${myGoGold} GoGold mais il en faut ${price}.\nIl vous manque ${priceLabel(manque)}.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Recharger', onPress: () => nav.navigate('BuyGoGold') },
        ],
      );
      return;
    }

    const doJoin = async () => {
      if (joiningRef.current) return;
      joiningRef.current = true;
      setActionLoading(true);
      try {
        const res = await communityService.join(communityId);
        if (res.pending) {
          setJoinStatus('pending');
          if (myGoGold !== null) setMyGoGold(prev => (prev ?? 0) - price);
          const debitLine = price > 0
            ? `\n\n${price} GoGold ont été déduits de votre solde et enregistrés dans votre historique.`
            : '';
          toastService.success(
            price > 0 ? 'Paiement effectué — Demande envoyée' : 'Demande envoyée',
            needsApproval
              ? `Votre demande pour rejoindre "${community.name}" est en cours d'examen.${debitLine}\n\nVous serez redirigé automatiquement dès l'acceptation.`
              : `Votre demande est en attente.${debitLine}`,
          );
          load();
        } else if (res.joined) {
          setJoinStatus('member');
          if (price > 0 && myGoGold !== null) setMyGoGold(prev => (prev ?? 0) - price);
          load();
          nav.replace('CommunityChat', { communityId, communityName: community.name });
        }
      } catch (e: any) {
        const detail = (e?.response?.data?.detail ?? '').toLowerCase();
        if (detail.includes('insufficient') || detail.includes('gogold')) {
          const walletRes = await apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance).catch(() => null);
          const realBalance = walletRes?.data?.gogold_balance ?? 0;
          setMyGoGold(realBalance);
          showConfirm(
            'Solde insuffisant',
            `Votre solde est de ${realBalance} GoGold. Il vous manque ${priceLabel(price - realBalance)}.`,
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Recharger', onPress: () => nav.navigate('BuyGoGold') },
            ],
          );
        } else if (detail.includes('blocked')) {
          toastService.error('Accès refusé', 'Vous avez été bloqué de cette communauté.');
        } else {
          toastService.error('Erreur', 'Impossible de rejoindre cette communauté.');
        }
      } finally {
        joiningRef.current = false;
        setActionLoading(false);
      }
    };

    if (price > 0) {
      const soldeApres = myGoGold !== null ? myGoGold - price : null;
      const soldeInfo  = myGoGold !== null
        ? `\nVotre solde : ${myGoGold} GoGold → ${soldeApres} GoGold après déduction.`
        : '';
      const approvalNote = needsApproval
        ? '\n\nCes GoGold seront remboursés automatiquement en cas de refus de votre demande.'
        : '';
      const debitNote = needsApproval
        ? `${price} GoGold seront immédiatement déduits de votre solde et consignés dans votre historique de transactions.`
        : `${price} GoGold seront déduits de votre solde.`;
      showConfirm(
        `Adhésion payante — ${price} GoGold`,
        `${debitNote}${soldeInfo}${approvalNote}`,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => { joiningRef.current = false; } },
          { text: `Confirmer — ${priceLabel(price)}`, onPress: doJoin },
        ],
      );
    } else {
      doJoin();
    }
  };

  const handleLeave = () => {
    if (isAdmin) {
      toastService.warning('Impossible', 'L\'admin ne peut pas quitter sa communauté. Transférez les droits d\'abord.');
      return;
    }
    showConfirm('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try { await communityService.leave(communityId); load(); }
          catch { toastService.error('Erreur', 'Impossible de quitter.'); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  async function handleDeleteCommunity() {
    showConfirm(
      'Supprimer la communauté',
      'Action irréversible. Tous les membres et messages seront perdus.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.delete(communityId);
              nav.goBack();
            } catch { toastService.error('Erreur', 'Impossible de supprimer.'); }
          },
        },
      ],
    );
  }

  function handleUpgradeTier(tier: 'pro' | 'elite') {
    const prices: Record<string, { eur: number; GoGold: number }> = {
      pro:   { eur: 9.99,  GoGold: Math.ceil(9.99  * 100) }, // 1 € = 100 GoGold
      elite: { eur: 24.99, GoGold: Math.ceil(24.99 * 100) },
    };
    const p = prices[tier];
    const tierLabel = tier === 'pro' ? 'Pro' : 'Elite';

    if (myGoGold !== null && myGoGold < p.GoGold) {
      toastService.error(
        'Solde insuffisant',
        `Le tier ${tierLabel} coûte ${p.GoGold.toLocaleString('fr-FR')} GoGold (${p.eur}€/mois).\nTon solde : ${myGoGold.toLocaleString('fr-FR')} GoGold.`,
      );
      return;
    }

    showConfirm(
      `Passer en ${tierLabel}`,
      `${p.GoGold.toLocaleString('fr-FR')} GoGold (${p.eur}€) seront débités de ton wallet pour 30 jours.\n\nAvantages ${tierLabel} : ${tier === 'pro' ? 'channels illimités, analytics, badge Pro' : 'tout Pro + priorité feed, support dédié'}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: `Activer ${tierLabel}`, onPress: async () => {
            setTierLoading(true);
            try {
              const res = await apiClient.post<{ tier: string; gogold_debited: number; tier_expires_at: string }>(
                Endpoints.communities.upgradeTier(communityId), { tier }
              );
              setMyGoGold(prev => prev !== null ? prev - res.data.gogold_debited : null);
              setCommunity(prev => prev ? { ...prev, tier: res.data.tier as any, tier_expires_at: res.data.tier_expires_at } as any : prev);
              toastService.success('Activé !', `Ta communauté est maintenant en ${tierLabel} jusqu'au ${new Date(res.data.tier_expires_at).toLocaleDateString('fr-FR')}.`);
            } catch (e: any) {
              toastService.error('Erreur', e?.message ?? 'Impossible d\'upgrader le tier.');
            } finally {
              setTierLoading(false);
            }
          },
        },
      ],
    );
  }

  function handleRequestVerification() {
    setVrReason('');
    // Charger le solde si pas encore fait
    if (myGoGold === null) {
      apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance)
        .then(r => setMyGoGold(r.data?.gogold_balance ?? 0))
        .catch(() => setMyGoGold(0));
    }
    setVrModalOpen(true);
  }

  async function handleSubmitVerificationRequest() {
    setVrLoading(true);
    try {
      await communityService.requestVerification(communityId, vrReason.trim() || undefined, vrPlan);
      setMyGoGold(prev => prev !== null ? prev - 500 : null);
      setVrStatus('pending');
      setVrModalOpen(false);
      toastService.success('Demande envoyée', '500 GoGold ont été débités. Les administrateurs vont examiner votre demande.');
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail ?? e?.message ?? 'Impossible d\'envoyer la demande.';
      if (status === 402) {
        setVrModalOpen(false);
        showConfirm(
          'Solde insuffisant',
          `Il faut 500 GoGold pour demander la vérification.\n\n${detail}`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Acheter des GoGold', onPress: () => nav.navigate('Wallet') },
          ],
        );
      } else {
        toastService.error('Erreur', detail);
      }
    } finally { setVrLoading(false); }
  }

  async function handleToggleVerify() {
    if (!community) return;
    const willVerify = !community.is_verified;
    showConfirm(
      willVerify ? 'Vérifier la communauté' : 'Retirer la vérification',
      willVerify
        ? `Ajouter le badge officiel à "${community.name}" ?`
        : `Retirer le badge de "${community.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: willVerify ? 'Vérifier' : 'Retirer',
          onPress: async () => {
            setVerifyLoading(true);
            try {
              const updated = willVerify
                ? await communityService.verify(communityId)
                : await communityService.unverify(communityId);
              setCommunity(updated);
            } catch (e: any) {
              toastService.error('Erreur', e?.message ?? 'Impossible de modifier.');
            } finally { setVerifyLoading(false); }
          },
        },
      ],
    );
  }

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
        <GofolyxLoader />
      </View>
    );
  }
  if (!community) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="alert-circle" size={40} color={colors.textTertiary} />
        <Text style={[{ color: colors.textTertiary, marginTop: 12, fontSize: 15 }]}>
          Communauté introuvable
        </Text>
      </View>
    );
  }

  const filteredMembers = members.filter(m => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      (m.display_name || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q)
    );
  });

  const previewMembers = members.slice(0, 5);
  // Verrouillé si : communauté privée OU demande en attente (requires_approval) et pas encore membre
  const isLocked = (
    (community.is_private || community.requires_approval)
    && joinStatus !== 'member'
    && !isAdmin && !isMod && !isGlobalAdmin
  );

  // ── Onglet Info (settings) ───────────────────────────────────────────────────
  const renderTabInfo = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.sheetBody}>

        {/* Bannière */}
        <TouchableOpacity onPress={() => pickImage('banner')} activeOpacity={0.85}>
          <View style={[s.editBanner, { backgroundColor: colors.backgroundSecondary }]}>
            {editBanner ? (
              <Image source={{ uri: editBanner }} style={s.editBannerImg} resizeMode="cover" />
            ) : community.banner_url ? (
              <Image source={{ uri: community.banner_url }} style={s.editBannerImg} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#7B3FF220', '#E0389A20']} style={s.editBannerImg}>
                <Icon name="image" size={22} color={colors.textTertiary} />
              </LinearGradient>
            )}
            <View style={s.editCamBadge}>
              <Icon name="camera" size={12} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Bannière</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity onPress={() => pickImage('avatar')} style={s.editAvatarWrap} activeOpacity={0.85}>
          {editAvatar ? (
            <Image source={{ uri: editAvatar }} style={[s.editAvatar, { borderColor: colors.surface }]} />
          ) : community.avatar_url ? (
            <Image source={{ uri: community.avatar_url }} style={[s.editAvatar, { borderColor: colors.surface }]} />
          ) : (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={[s.editAvatar, { borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}
            >
              <Icon name="users" size={22} color="#fff" />
            </LinearGradient>
          )}
          <View style={s.editAvatarCam}>
            <Icon name="camera" size={11} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Nom */}
        <View style={{ marginTop: 16 }}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>NOM</Text>
          <View style={[s.fieldBox, { borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}>
            <TextInput
              style={[s.fieldInput, { color: colors.textPrimary }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nom de la communauté"
              placeholderTextColor={colors.textTertiary}
              maxLength={60}
            />
          </View>
          <Text style={[{ fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 3 }]}>
            {editName.length}/60
          </Text>
        </View>

        {/* Description */}
        <View style={{ marginTop: 14 }}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>DESCRIPTION</Text>
          <View style={[s.fieldBox, {
            borderColor: colors.divider,
            backgroundColor: colors.backgroundSecondary,
            minHeight: 88,
          }]}>
            <TextInput
              style={[s.fieldInput, { color: colors.textPrimary, textAlignVertical: 'top' }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Décrivez votre communauté (optionnel)"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={300}
            />
          </View>
          <Text style={[{ fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 3 }]}>
            {editDesc.length}/300
          </Text>
        </View>

        {/* Info résumée */}
        <View style={[s.infoSummaryBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, marginTop: 18 }]}>
          <View style={s.infoSummaryRow}>
            <Icon name="users" size={14} color={colors.textTertiary} />
            <Text style={[s.infoSummaryTxt, { color: colors.textSecondary }]}>
              {community.members_count} membre{community.members_count !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={[s.infoSummarySep, { backgroundColor: colors.divider }]} />
          <View style={s.infoSummaryRow}>
            <Icon name={community.is_private ? 'lock' : 'globe'} size={14} color={colors.textTertiary} />
            <Text style={[s.infoSummaryTxt, { color: colors.textSecondary }]}>
              {community.is_private ? 'Privée' : 'Publique'}
            </Text>
          </View>
          {(community.entry_price_gogold ?? 0) > 0 && (
            <>
              <View style={[s.infoSummarySep, { backgroundColor: colors.divider }]} />
              <View style={s.infoSummaryRow}>
                <Icon name="zap" size={14} color="#F59E0B" />
                <Text style={[s.infoSummaryTxt, { color: colors.warning }]}>
                  {community.entry_price_gogold} GoGold requis
                </Text>
              </View>
            </>
          )}
          {(community as any).tier && (community as any).tier !== 'free' && (
            <>
              <View style={[s.infoSummarySep, { backgroundColor: colors.divider }]} />
              <View style={s.infoSummaryRow}>
                <Icon
                  name="award"
                  size={14}
                  color={(community as any).tier === 'elite' ? colors.warning : '#7B3FF2'}
                />
                <Text style={[s.infoSummaryTxt, { color: (community as any).tier === 'elite' ? colors.warning : '#7B3FF2', fontWeight: '700' }]}>
                  {(community as any).tier === 'elite' ? 'Elite' : 'Pro'}
                </Text>
              </View>
            </>
          )}
          {community.is_verified && (
            <>
              <View style={[s.infoSummarySep, { backgroundColor: colors.divider }]} />
              <View style={s.infoSummaryRow}>
                <Icon name="check-circle" size={14} color="#1D9BF0" />
                <Text style={[s.infoSummaryTxt, { color: colors.info }]}>Communauté vérifiée</Text>
              </View>
            </>
          )}
        </View>

        {/* Boutons upgrade tier — admin uniquement */}
        {(myRole === 'admin' || isGlobalAdmin) && (!community || (community as any).tier === 'free' || (community as any).tier == null) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => handleUpgradeTier('pro')}
              disabled={tierLoading}
              style={{ flex: 1, backgroundColor: '#7B3FF222', borderWidth: 1.5, borderColor: '#7B3FF2', borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 4 }}
            >
              <Icon name="award" size={15} color="#7B3FF2" />
              <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 12 }}>PRO</Text>
              <PriceWithLocal amountEur={9.99} suffix="/mois" style={{ color: '#7B3FF2', fontSize: 10, opacity: 0.8 }} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleUpgradeTier('elite')}
              disabled={tierLoading}
              style={{ flex: 1, backgroundColor: '#F59E0B22', borderWidth: 1.5, borderColor: colors.warning, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 4 }}
            >
              <Icon name="star" size={15} color="#F59E0B" />
              <Text style={{ color: '#FF7A2F', fontWeight: '800', fontSize: 12 }}>ELITE</Text>
              <PriceWithLocal amountEur={24.99} suffix="/mois" style={{ color: colors.warning, fontSize: 10, opacity: 0.8 }} />
            </TouchableOpacity>
          </View>
        )}

      </View>
    </ScrollView>
  );

  // ── Onglet Membres (settings) ────────────────────────────────────────────────
  const renderTabMembers = () => (
    <View style={{ flex: 1 }}>
      <View style={[s.memberSearchBar, {
        backgroundColor: colors.backgroundSecondary,
        borderColor: colors.divider,
      }]}>
        <Icon name="search" size={14} color={colors.textTertiary} />
        <TextInput
          style={[s.memberSearchInput, { color: colors.textPrimary }]}
          placeholder="Rechercher un membre…"
          placeholderTextColor={colors.textTertiary}
          value={memberSearch}
          onChangeText={setMemberSearch}
        />
        {memberSearch.length > 0 && (
          <TouchableOpacity onPress={() => setMemberSearch('')}>
            <Icon name="x" size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.memberCountLbl, { color: colors.textTertiary }]}>
          {filteredMembers.length} membre{filteredMembers.length !== 1 ? 's' : ''}
        </Text>
        {filteredMembers.map(member => {
          const isSelf    = member.user_id === myId;
          const isLoading = roleLoading === member.user_id;
          return (
            <View key={member.id} style={[s.adminMemberRow, { borderBottomColor: colors.divider }]}>
              <TouchableOpacity onPress={() => nav.navigate('UserProfile', { userId: member.user_id })}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, {
                    backgroundColor: colors.primary + '22',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }]}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>
                      {(member.display_name || member.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[s.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {member.display_name || member.username}{isSelf ? ' (toi)' : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <View style={[s.roleDot, { backgroundColor: ROLE_COLORS[member.role as string] ?? colors.textTertiary }]} />
                  <Text style={[s.memberSub, { color: colors.textTertiary }]}>
                    {ROLE_LABELS[member.role as string] ?? member.role}
                  </Text>
                </View>
              </View>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
              ) : isAdmin && !isSelf ? (
                <View style={s.roleActions}>
                  {member.role !== 'admin' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: '#36D9A015', borderColor: '#36D9A040' }]}
                      onPress={() => handleChangeRole(member, 'admin')}
                    >
                      <Icon name="shield" size={12} color="#36D9A0" />
                      <Text style={[s.roleBtnTxt, { color: colors.success }]}>Admin</Text>
                    </TouchableOpacity>
                  )}
                  {member.role !== 'moderator' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: '#3B82F615', borderColor: '#3B82F640' }]}
                      onPress={() => handleChangeRole(member, 'moderator')}
                    >
                      <Icon name="star" size={12} color="#3B82F6" />
                      <Text style={[s.roleBtnTxt, { color: colors.info }]}>Mod</Text>
                    </TouchableOpacity>
                  )}
                  {member.role !== 'member' && (
                    <TouchableOpacity
                      style={[s.roleBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                      onPress={() => handleChangeRole(member, 'member')}
                    >
                      <Icon name="user" size={12} color={colors.textTertiary} />
                      <Text style={[s.roleBtnTxt, { color: colors.textTertiary }]}>Membre</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleKick(member)}
                  >
                    <Icon name="user-x" size={12} color="#EF4444" />
                    <Text style={[s.roleBtnTxt, { color: colors.error }]}>Exclure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440', opacity: blockLoading === member.user_id ? 0.5 : 1 }]}
                    onPress={() => handleBlock(member)}
                    disabled={blockLoading === member.user_id}
                  >
                    {blockLoading === member.user_id
                      ? <ActivityIndicator size="small" color="#EF4444" style={{ width: 12, height: 12 }} />
                      : <Icon name="slash" size={12} color="#EF4444" />
                    }
                    <Text style={[s.roleBtnTxt, { color: colors.error }]}>Bloquer</Text>
                  </TouchableOpacity>
                </View>
              ) : isMod && !isSelf && member.role === 'member' ? (
                <View style={s.roleActions}>
                  <TouchableOpacity
                    style={[s.roleBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
                    onPress={() => handleKick(member)}
                  >
                    <Icon name="user-x" size={12} color="#EF4444" />
                    <Text style={[s.roleBtnTxt, { color: colors.error }]}>Exclure</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* ── Membres bloqués ── */}
        {isAdmin && (
          <>
            <View style={[s.blockedSectionHeader, { borderTopColor: colors.divider, marginTop: 24 }]}>
              <View style={s.blockedSectionLeft}>
                <View style={s.blockedSectionDot} />
                <Text style={[s.memberCountLbl, { color: colors.error, marginTop: 0 }]}>
                  Membres bloqués
                </Text>
              </View>
              <View style={[s.blockedCountBadge, { backgroundColor: blockedMembers.length > 0 ? '#EF444420' : colors.backgroundSecondary }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: blockedMembers.length > 0 ? colors.error : colors.textTertiary }}>
                  {blockedMembers.length}
                </Text>
              </View>
            </View>

            {blockedMembers.length === 0 ? (
              <View style={[s.blockedEmpty, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                <Icon name="shield" size={18} color={colors.textTertiary} />
                <Text style={[s.blockedEmptyText, { color: colors.textTertiary }]}>
                  Aucun membre bloqué
                </Text>
              </View>
            ) : blockedMembers.map(b => (
              <View key={b.id} style={[s.adminMemberRow, { borderBottomColor: colors.divider }]}>
                {b.avatar_url ? (
                  <Image source={{ uri: b.avatar_url }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, {
                    backgroundColor: '#EF444420',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }]}>
                    <Text style={{ color: '#F0365A', fontWeight: '700' }}>
                      {(b.display_name || b.username || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, { color: colors.textPrimary }]}>
                    {b.display_name || b.username}
                  </Text>
                  <Text style={[s.memberSub, { color: colors.error }]}>Bloqué</Text>
                </View>
                <TouchableOpacity
                  style={[s.roleBtn, { backgroundColor: '#10B98115', borderColor: '#10B98140', opacity: unblockLoading === b.user_id ? 0.5 : 1 }]}
                  onPress={() => handleUnblock(b)}
                  disabled={unblockLoading === b.user_id}
                >
                  {unblockLoading === b.user_id
                    ? <ActivityIndicator size="small" color="#10B981" style={{ width: 12, height: 12 }} />
                    : <Icon name="user-check" size={12} color="#10B981" />
                  }
                  <Text style={[s.roleBtnTxt, { color: colors.success }]}>Débloquer</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>

    </View>
  );

  // ── Onglet Paramètres (settings) ─────────────────────────────────────────────
  const renderTabSecurity = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.sheetBody}>

        {/* ── VISIBILITÉ ── */}
        <Text style={[s.secSection, { color: colors.textTertiary }]}>VISIBILITÉ</Text>
        <View style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={[s.secIcon, { backgroundColor: editPrivate ? '#E0389A20' : '#3B82F620' }]}>
            <Icon name={editPrivate ? 'lock' : 'globe'} size={18} color={editPrivate ? colors.gradientEnd : colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>
              {editPrivate ? 'Communauté privée' : 'Communauté publique'}
            </Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              {editPrivate ? 'Seuls les membres approuvés peuvent rejoindre' : 'Tout le monde peut découvrir et rejoindre'}
            </Text>
          </View>
          <Switch
            value={editPrivate}
            onValueChange={setEditPrivate}
            trackColor={{ false: colors.divider, true: '#E0389A55' }}
            thumbColor={editPrivate ? colors.gradientEnd : colors.textTertiary}
          />
        </View>

        {/* ── ADHÉSION ── */}
        <Text style={[s.secSection, { color: colors.textTertiary, marginTop: 20 }]}>ADHÉSION</Text>
        <View style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <View style={[s.secIcon, { backgroundColor: '#F59E0B20' }]}>
            <Icon name="user-check" size={18} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Approbation requise</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              Chaque demande doit être validée manuellement par l'admin
            </Text>
          </View>
          <Switch
            value={editApproval}
            onValueChange={setEditApproval}
            trackColor={{ false: colors.divider, true: '#F59E0B55' }}
            thumbColor={editApproval ? colors.warning : colors.textTertiary}
          />
        </View>

        {/* Prix d'entrée */}
        <View style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, marginTop: 8 }]}>
          <View style={[s.secIcon, { backgroundColor: '#F59E0B20' }]}>
            <Icon name="zap" size={18} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Prix d'entrée (GoGold)</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              0 = gratuit — les membres paient ce montant pour rejoindre
            </Text>
          </View>
          <View style={[s.priceInputWrap, { borderColor: colors.primary + '60', backgroundColor: colors.surface }]}>
            <TextInput
              style={[s.priceInput, { color: colors.textPrimary }]}
              value={editEntryPrice}
              onChangeText={v => setEditEntryPrice(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* ── CHAT ── */}
        <Text style={[s.secSection, { color: colors.textTertiary, marginTop: 20 }]}>CHAT</Text>
        <View style={[s.secRow, {
          backgroundColor: editMembersOnly ? '#7B3FF210' : colors.backgroundSecondary,
          borderColor: editMembersOnly ? '#7B3FF240' : colors.divider,
        }]}>
          <View style={[s.secIcon, { backgroundColor: editMembersOnly ? '#7B3FF230' : '#7B3FF215' }]}>
            <Icon name={editMembersOnly ? 'lock' : 'message-circle'} size={18} color="#7B3FF2" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.secLabel, { color: colors.textPrimary }]}>Chat admins seulement</Text>
              {editMembersOnly && (
                <View style={{ backgroundColor: '#7B3FF2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>ACTIF</Text>
                </View>
              )}
            </View>
            <Text style={[s.secDesc, { color: editMembersOnly ? '#7B3FF2AA' : colors.textTertiary }]}>
              {editMembersOnly
                ? 'Les membres ne peuvent que lire — seuls admins et mods peuvent écrire'
                : 'Activer pour réserver l\'écriture aux admins et modérateurs'}
            </Text>
          </View>
          <Switch
            value={editMembersOnly}
            onValueChange={setEditMembersOnly}
            trackColor={{ false: colors.divider, true: '#7B3FF255' }}
            thumbColor={editMembersOnly ? '#7B3FF2' : colors.textTertiary}
          />
        </View>

        {/* ── MEMBRES ── */}
        <Text style={[s.secSection, { color: colors.textTertiary, marginTop: 20 }]}>MEMBRES</Text>

        <View style={[s.secRow, {
          backgroundColor: editMembersHiddenPublic ? '#7B3FF210' : colors.backgroundSecondary,
          borderColor: editMembersHiddenPublic ? '#7B3FF240' : colors.divider,
        }]}>
          <View style={[s.secIcon, { backgroundColor: '#7B3FF220' }]}>
            <Icon name="eye-off" size={18} color="#7B3FF2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Masqué aux non-membres</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              Les personnes extérieures ne voient pas la liste des membres
            </Text>
          </View>
          <Switch
            value={editMembersHiddenPublic}
            onValueChange={setEditMembersHiddenPublic}
            trackColor={{ false: colors.divider, true: '#7B3FF255' }}
            thumbColor={editMembersHiddenPublic ? '#7B3FF2' : colors.textTertiary}
          />
        </View>

        <View style={[s.secRow, {
          backgroundColor: editMembersHiddenAll ? '#E0389A10' : colors.backgroundSecondary,
          borderColor: editMembersHiddenAll ? '#E0389A40' : colors.divider,
          marginTop: 8,
        }]}>
          <View style={[s.secIcon, { backgroundColor: '#E0389A20' }]}>
            <Icon name="users" size={18} color="#E0389A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Masqué aux membres</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              Les membres ne voient pas les autres — seul l'admin voit tout
            </Text>
          </View>
          <Switch
            value={editMembersHiddenAll}
            onValueChange={setEditMembersHiddenAll}
            trackColor={{ false: colors.divider, true: '#E0389A55' }}
            thumbColor={editMembersHiddenAll ? '#E0389A' : colors.textTertiary}
          />
        </View>

        <View style={[s.secRow, {
          backgroundColor: editInviteOnlyAdmin ? '#10B98110' : colors.backgroundSecondary,
          borderColor: editInviteOnlyAdmin ? '#10B98140' : colors.divider,
          marginTop: 8,
        }]}>
          <View style={[s.secIcon, { backgroundColor: '#10B98120' }]}>
            <Icon name="user-plus" size={18} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Ajout par admin uniquement</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              Seul l'admin peut inviter de nouveaux membres
            </Text>
          </View>
          <Switch
            value={editInviteOnlyAdmin}
            onValueChange={setEditInviteOnlyAdmin}
            trackColor={{ false: colors.divider, true: '#10B98155' }}
            thumbColor={editInviteOnlyAdmin ? '#10B981' : colors.textTertiary}
          />
        </View>

        {/* ── ACCÈS RAPIDE ── */}
        <Text style={[s.secSection, { color: colors.textTertiary, marginTop: 20 }]}>ACCÈS RAPIDE</Text>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityJoinRequests', { communityId, communityName: community?.name ?? '' }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#7B3FF220' }]}>
            <Icon name="user-check" size={18} color="#7B3FF2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Demandes d'adhésion</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>
              {pendingCount > 0 ? `${pendingCount} demande${pendingCount > 1 ? 's' : ''} en attente` : 'Aucune demande en attente'}
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={[s.pendingBadge, { backgroundColor: '#7B3FF2', marginRight: 6 }]}>
              <Text style={s.pendingBadgeTxt}>{pendingCount}</Text>
            </View>
          )}
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityStats', { communityId, communityName: community?.name ?? '' }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#36D9A020' }]}>
            <Icon name="bar-chart-2" size={18} color="#36D9A0" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Statistiques</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>Activité, croissance et engagement</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityTreasury', { communityId, communityName: community?.name ?? '' }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#7B3FF220' }]}>
            <Icon name="briefcase" size={18} color="#7B3FF2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Trésorerie</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>Solde et historique du compte communautaire</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            if (!myId) return;
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityTreasurer', {
              communityId, communityName: community?.name ?? '', myRole, myId,
            }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#10B98120' }]}>
            <Icon name="user-check" size={18} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Trésorier & Retraits</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>Nommer le trésorier, gérer les demandes de retrait</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityFund', { communityId, communityName: community?.name ?? '', myRole, myId }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#10B98120' }]}>
            <Icon name="dollar-sign" size={18} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Cotisations</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>Lancer et gérer les cotisations des membres</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityEvents', { communityId, communityName: community?.name ?? '', myRole }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#FF7A2F20' }]}>
            <Icon name="calendar" size={18} color="#FF7A2F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Événements</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>Gérer les événements de la communauté</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.7}
          onPress={() => {
            setSettingsOpen(false);
            setTimeout(() => (nav as any).navigate('CommunityMemberCreatorStats', {
              communityId,
              communityName: community?.name ?? '',
              memberId: myId ?? '',
              memberName: myName,
            }), 250);
          }}
        >
          <View style={[s.secIcon, { backgroundColor: '#8B5CF620' }]}>
            <Icon name="trending-up" size={18} color="#8B5CF6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.textPrimary }]}>Statistiques créateur</Text>
            <Text style={[s.secDesc, { color: colors.textTertiary }]}>Vues, likes, réactions sur tout votre contenu</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* ── ZONE DE DANGER ── */}
        <Text style={[s.secSection, { color: colors.error, marginTop: 28 }]}>ZONE DE DANGER</Text>

        {isAdmin && (
          <TouchableOpacity
            onPress={() => {
              setSettingsTab('members');
              showConfirm(
                'Transférer l\'admin',
                'Dans l\'onglet Membres, promouvez un membre au rôle Admin. Vous perdrez alors vos droits d\'administration.',
                [{ text: 'Aller aux membres', onPress: () => setSettingsTab('members') }, { text: 'Annuler', style: 'cancel' }],
              );
            }}
            style={[s.secRow, { backgroundColor: '#F59E0B08', borderColor: '#F59E0B30', marginBottom: 8 }]}
            activeOpacity={0.7}
          >
            <View style={[s.secIcon, { backgroundColor: '#F59E0B20' }]}>
              <Icon name="repeat" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.secLabel, { color: colors.warning }]}>Transférer l'admin</Text>
              <Text style={[s.secDesc, { color: '#F59E0B99' }]}>Passer les droits admin à un autre membre</Text>
            </View>
            <Icon name="chevron-right" size={16} color="#F59E0B60" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleDeleteCommunity}
          style={[s.secRow, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}
          activeOpacity={0.7}
        >
          <View style={[s.secIcon, { backgroundColor: '#EF444420' }]}>
            <Icon name="trash-2" size={18} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.secLabel, { color: colors.error }]}>Supprimer la communauté</Text>
            <Text style={[s.secDesc, { color: '#EF444499' }]}>Action irréversible — toutes les données seront perdues</Text>
          </View>
          <Icon name="chevron-right" size={16} color="#EF444460" />
        </TouchableOpacity>

      </View>
    </ScrollView>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ── Header fixe ── */}
      <View style={[s.header, {
        paddingTop: insets.top + 8,
        backgroundColor: colors.surface,
        borderBottomColor: colors.divider,
      }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {community.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => {
              if (communitySaved) {
                setCommunitySaved(false);
                favoriteService.unsave('community', communityId).catch(() => setCommunitySaved(true));
              } else if (community) {
                setCommunitySaved(true);
                favoriteService.save({
                  target_type: 'community',
                  target_id: community.id,
                  target_title: community.name,
                  target_subtitle: community.description ?? null,
                  target_thumbnail: community.avatar_url ?? null,
                }).catch(() => setCommunitySaved(false));
              }
            }}
            style={s.headerIcon}
          >
            <Icon
              name="bookmark"
              size={20}
              color={communitySaved ? colors.primary : colors.textPrimary}
            />
          </TouchableOpacity>
          {(isAdmin || isMod) && (
            <TouchableOpacity
              onPress={() => (nav as any).navigate('CommunityInvite', {
                communityId,
                communityName: community.name,
                myRole,
              })}
              style={s.headerIcon}
            >
              <Icon name="user-plus" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          {(isAdmin || isMod) && (
            <TouchableOpacity onPress={openSettings} style={s.headerIcon}>
              <Icon name="settings" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Contenu principal ── */}
      <FlatList
        data={isLocked ? [] : previewMembers}
        keyExtractor={m => m.id}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* ── Bannière 160px ── */}
            <View style={s.bannerArea}>
              <TouchableOpacity
                activeOpacity={community.banner_url ? 0.85 : 1}
                onPress={() => community.banner_url && setViewerUrl(community.banner_url)}
              >
                {community.banner_url ? (
                  <Image source={{ uri: community.banner_url }} style={s.banner} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[colors.gradientStart, colors.primary, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.banner}
                  />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.45)']}
                  style={s.bannerGrad}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Avatar 72px centré en bas de la bannière */}
              <View style={s.avatarFrame}>
                <TouchableOpacity
                  activeOpacity={community.avatar_url ? 0.85 : 1}
                  onPress={() => community.avatar_url && setViewerUrl(community.avatar_url)}
                  style={[s.avatarBorder, { borderColor: colors.background }]}
                >
                  {community.avatar_url ? (
                    <Image source={{ uri: community.avatar_url }} style={s.bigAvatar} />
                  ) : (
                    <LinearGradient
                      colors={gradientFor(community.name)}
                      style={s.bigAvatar}
                    >
                      <Icon name="users" size={32} color="#fff" />
                    </LinearGradient>
                  )}
                </TouchableOpacity>
                {community.is_verified && (
                  <View style={s.verifiedBadge}>
                    <Icon name="check" size={10} color="#fff" />
                  </View>
                )}
              </View>
            </View>

            {/* ── Banner communauté bloquée (créateur uniquement) ── */}
            {(community as any).is_blocked && String((community as any).creator_id) === myId && (
              <View style={[s.blockedBanner, { backgroundColor: '#EF44441A', borderColor: '#EF444440' }]}>
                <Icon name="slash" size={16} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.blockedBannerTitle, { color: colors.error }]}>Communauté bloquée</Text>
                  <Text style={[s.blockedBannerSub, { color: colors.textSecondary }]}>
                    Cette communauté a été bloquée par un administrateur. Elle n'est plus visible par les membres.
                    Contactez le support pour plus d'informations.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Infos ── */}
            <View style={s.infoBlock}>
              {/* Nom + badge vérifié */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Text style={[s.communityName, { color: colors.textPrimary }]}>
                  {community.name}
                </Text>
              </View>

              {/* Description */}
              {community.description ? (
                <ExpandableText
                  text={community.description}
                  maxLines={3}
                  primaryColor={colors.primary}
                  textStyle={[s.communityDesc, { color: colors.textSecondary }]}
                />
              ) : null}

              {/* Stats row */}
              <View style={s.statsRow}>
                <Text style={[s.statItem, { color: colors.textSecondary }]}>
                  {fmtCount(community.members_count ?? 0)} membres
                </Text>
                <View style={[s.statSep, { backgroundColor: colors.divider }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon
                    name={community.is_private ? 'lock' : 'globe'}
                    size={12}
                    color={colors.textTertiary}
                  />
                  <Text style={[s.statItem, { color: colors.textTertiary }]}>
                    {community.is_private ? 'Privée' : 'Publique'}
                  </Text>
                </View>
                <View style={[s.statSep, { backgroundColor: colors.divider }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={s.activeDot} />
                  <Text style={[s.statItem, { color: colors.success }]}>Actif</Text>
                </View>
              </View>

              {/* Badge de rôle */}
              {myRole && (
                <View style={s.roleRow}>
                  <View style={[s.roleChip, { backgroundColor: (ROLE_COLORS[myRole] ?? colors.textTertiary) + '20' }]}>
                    <Icon
                      name={isAdmin ? 'shield' : isMod ? 'star' : 'user'}
                      size={12}
                      color={ROLE_COLORS[myRole] ?? colors.textTertiary}
                    />
                    <Text style={[s.roleChipText, { color: ROLE_COLORS[myRole] ?? colors.textTertiary }]}>
                      {ROLE_LABELS[myRole] ?? myRole}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Boutons action ── */}
              <View style={s.actionsRow}>
                {joinStatus === 'member' ? (
                  <>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                      onPress={() => (nav as any).navigate('CommunityChat', { communityId, communityName: community.name })}
                      activeOpacity={0.85}
                    >
                      <Icon name="message-circle" size={16} color="#fff" />
                      <Text style={[s.actionTxt, { color: '#fff' }]}>Discussion</Text>
                    </TouchableOpacity>
                    {canShowMembersBtn && (
                      <TouchableOpacity
                        style={[s.actionBtn, {
                          borderWidth: 1.5,
                          borderColor: colors.primary,
                          flex: 0,
                          paddingHorizontal: 16,
                        }]}
                        onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name, myRole, membersListHiddenPublic: community.members_list_hidden_public ?? false, membersListHiddenMembers: community.members_list_hidden_members ?? false })}
                        activeOpacity={0.8}
                      >
                        <Icon name="users" size={15} color={colors.primary} />
                        <Text style={[s.actionTxt, { color: colors.primary }]}>Membres</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.actionBtn, {
                        borderWidth: 1,
                        borderColor: colors.divider,
                        flex: 0,
                        paddingHorizontal: 14,
                      }]}
                      onPress={handleLeave}
                      disabled={actionLoading}
                      activeOpacity={0.7}
                    >
                      <Icon name="log-out" size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                ) : joinStatus === 'pending' ? (
                  <TouchableOpacity
                    style={[s.actionBtn, {
                      flex: 1,
                      backgroundColor: '#F59E0B15',
                      borderColor: colors.warning,
                      borderWidth: 1.5,
                    }]}
                    onPress={() => {
                      showConfirm(
                        'Demande en attente',
                        'Votre demande est en cours d\'examen. Vous serez automatiquement redirigé vers le chat dès qu\'elle sera acceptée.',
                        [
                          {
                            text: 'Annuler la demande',
                            style: 'destructive',
                            onPress: async () => {
                              try { await communityService.cancelJoinRequest(communityId); load(); }
                              catch { toastService.error('Erreur', 'Impossible d\'annuler la demande.'); }
                            },
                          },
                          { text: 'Fermer', style: 'cancel' },
                        ],
                      );
                    }}
                    disabled={actionLoading}
                    activeOpacity={0.85}
                  >
                    <Icon name="clock" size={15} color="#F59E0B" />
                    <Text style={[s.actionTxt, { color: colors.warning }]}>En attente d'approbation</Text>
                    <Icon name="x" size={13} color="#F59E0B80" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[s.actionBtn, { flex: 1, overflow: 'hidden', padding: 0 }]}
                    onPress={handleJoin}
                    disabled={actionLoading}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={[colors.gradientStart, colors.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 }}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Icon
                            name={(community.is_private || community.requires_approval) ? 'send' : 'user-plus'}
                            size={15}
                            color="#fff"
                          />
                          <Text style={[s.actionTxt, { color: '#fff' }]}>
                            {(community.is_private || community.requires_approval) ? 'Demander à rejoindre' : 'Rejoindre'}
                          </Text>
                          {(community.entry_price_gogold ?? 0) > 0 && (
                            <View style={s.coinPill}>
                              <Text style={s.coinPillTxt}>{community.entry_price_gogold}</Text>
                              <Icon name="zap" size={10} color="#F59E0B" />
                            </View>
                          )}
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Barre wallet si accès payant ── */}
              {joinStatus === 'none' && (community.entry_price_gogold ?? 0) > 0 && (() => {
                const price     = community.entry_price_gogold!;
                const isLow     = myGoGold !== null && myGoGold < price;
                const hasEnough = myGoGold !== null && myGoGold >= price;
                return (
                  <View style={[s.walletBar, {
                    borderColor: isLow ? '#EF444440' : '#F59E0B40',
                    backgroundColor: isLow ? '#EF444408' : '#F59E0B08',
                  }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                      <Icon name="zap" size={14} color={isLow ? colors.error : colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.walletTitle, { color: isLow ? colors.error : colors.warning }]}>
                          {price} coin{price > 1 ? 's' : ''} requis pour accéder
                        </Text>
                        {myGoGold !== null && (
                          <Text style={[s.walletSub, { color: isLow ? colors.error : colors.textTertiary }]}>
                            {isLow
                              ? `Solde insuffisant — vous avez ${myGoGold} GoGold (manque ${price - myGoGold})`
                              : `Votre solde : ${myGoGold} GoGold`}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isLow && (
                      <TouchableOpacity
                        onPress={() => nav.navigate('BuyGoGold')}
                        style={s.rechargeBtn}
                      >
                        <Text style={s.rechargeTxt}>Recharger</Text>
                      </TouchableOpacity>
                    )}
                    {hasEnough && <Icon name="check-circle" size={16} color="#10B981" />}
                  </View>
                );
              })()}

              {/* Message approbation */}
              {joinStatus === 'none' && (community.is_private || community.requires_approval) && (
                <View style={s.infoBar}>
                  <Icon name="lock" size={12} color={colors.textTertiary} />
                  <Text style={[s.infoBarTxt, { color: colors.textTertiary }]}>
                    {community.is_private
                      ? 'Communauté privée — accès sur approbation de l\'admin'
                      : 'Approbation requise — l\'admin examine chaque demande'}
                  </Text>
                </View>
              )}

              {/* Admin global — boutons vérification */}
              {isGlobalAdmin && (
                <>
                  <TouchableOpacity
                    style={[s.vrBtn, { backgroundColor: '#7B3FF215', borderColor: '#7B3FF240' }]}
                    onPress={() => (nav as any).navigate('AdminVerification')}
                    activeOpacity={0.7}
                  >
                    <Icon name="list" size={14} color="#7B3FF2" />
                    <Text style={[s.vrBtnTxt, { color: '#7B3FF2' }]}>
                      Gérer les demandes de vérification
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.vrBtn, {
                      backgroundColor: community.is_verified ? '#EF444415' : '#1D9BF015',
                      borderColor: community.is_verified ? '#EF444440' : '#1D9BF040',
                    }]}
                    onPress={handleToggleVerify}
                    disabled={verifyLoading}
                    activeOpacity={0.7}
                  >
                    {verifyLoading ? (
                      <ActivityIndicator size="small" color={community.is_verified ? colors.error : colors.info} />
                    ) : (
                      <>
                        <View style={[s.verifiedBadgeMini, {
                          backgroundColor: community.is_verified ? colors.error : colors.info,
                        }]}>
                          <Icon name="check" size={9} color="#fff" />
                        </View>
                        <Text style={[s.vrBtnTxt, {
                          color: community.is_verified ? colors.error : colors.info,
                        }]}>
                          {community.is_verified ? 'Retirer la vérification' : 'Vérifier la communauté'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Admin communauté — demande de vérification */}
              {isAdmin && !isGlobalAdmin && !community.is_verified && (
                <TouchableOpacity
                  style={[s.vrBtn, {
                    backgroundColor: vrStatus === 'pending'  ? '#F59E0B15'
                                   : vrStatus === 'rejected' ? '#EF444415' : '#1D9BF015',
                    borderColor:     vrStatus === 'pending'  ? '#F59E0B40'
                                   : vrStatus === 'rejected' ? '#EF444440' : '#1D9BF040',
                  }]}
                  onPress={vrStatus === 'none' || vrStatus === 'rejected' ? handleRequestVerification : undefined}
                  disabled={vrLoading || vrStatus === 'pending'}
                  activeOpacity={vrStatus === 'pending' ? 1 : 0.7}
                >
                  {vrLoading ? (
                    <ActivityIndicator size="small" color="#1D9BF0" />
                  ) : (
                    <>
                      <Icon
                        name={vrStatus === 'pending' ? 'clock' : vrStatus === 'rejected' ? 'x-circle' : 'shield'}
                        size={14}
                        color={vrStatus === 'pending' ? colors.warning : vrStatus === 'rejected' ? colors.error : colors.info}
                      />
                      <Text style={[s.vrBtnTxt, {
                        color: vrStatus === 'pending'  ? colors.warning
                             : vrStatus === 'rejected' ? colors.error : colors.info,
                      }]}>
                        {vrStatus === 'pending'  ? 'Demande en cours d\'examen…'
                        : vrStatus === 'rejected' ? 'Refusée (GoGold remboursés) — Renvoyer'
                        : 'Demander la vérification — 500 GoGold'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* ── Grille navigation + section membres (membres seulement pour communautés privées) ── */}
              {isLocked ? (
                <View style={[s.lockedBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Icon name="lock" size={28} color={colors.textTertiary} />
                  <Text style={[s.lockedTitle, { color: colors.textPrimary }]}>
                    Contenu réservé aux membres
                  </Text>
                  <Text style={[s.lockedSub, { color: colors.textTertiary }]}>
                    Rejoignez cette communauté pour accéder aux événements, à l'annuaire des membres et aux statistiques.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={s.navGrid}>
                    <TouchableOpacity
                      style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => (nav as any).navigate('CommunityEvents', { communityId, communityName: community.name, myRole })}
                      activeOpacity={0.75}
                    >
                      <View style={[s.navIcon, { backgroundColor: '#FF7A2F20' }]}>
                        <Icon name="calendar" size={20} color="#FF7A2F" />
                      </View>
                      <Text style={[s.navLabel, { color: colors.textPrimary }]}>Événements</Text>
                      <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {canShowMembersBtn && (
                      <TouchableOpacity
                        style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                        onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name, myRole, membersListHiddenPublic: community.members_list_hidden_public ?? false, membersListHiddenMembers: community.members_list_hidden_members ?? false })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.navIcon, { backgroundColor: '#3B82F620' }]}>
                          <Icon name="users" size={20} color="#3B82F6" />
                        </View>
                        <Text style={[s.navLabel, { color: colors.textPrimary }]}>Annuaire</Text>
                        <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}

                    {(isAdmin || isMod) && (
                      <TouchableOpacity
                        style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                        onPress={() => (nav as any).navigate('CommunityStats', { communityId, communityName: community.name })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.navIcon, { backgroundColor: '#36D9A020' }]}>
                          <Icon name="bar-chart-2" size={20} color="#36D9A0" />
                        </View>
                        <Text style={[s.navLabel, { color: colors.textPrimary }]}>Statistiques</Text>
                        <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => (nav as any).navigate('CommunityFund', { communityId, communityName: community.name, myRole, myId })}
                      activeOpacity={0.75}
                    >
                      <View style={[s.navIcon, { backgroundColor: '#10B98120' }]}>
                        <Icon name="dollar-sign" size={20} color="#10B981" />
                      </View>
                      <Text style={[s.navLabel, { color: colors.textPrimary }]}>Cotisations</Text>
                      <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                    </TouchableOpacity>
                    {(isAdmin || isMod || isGlobalAdmin) && (
                      <TouchableOpacity
                        style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                        onPress={() => (nav as any).navigate('CommunityJoinRequests', { communityId, communityName: community.name })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.navIcon, { backgroundColor: '#7B3FF220' }]}>
                          <Icon name="user-check" size={20} color="#7B3FF2" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.navLabel, { color: colors.textPrimary }]}>Demandes</Text>
                        </View>
                        {pendingCount > 0 && (
                          <View style={[s.pendingBadge, { backgroundColor: '#7B3FF2' }]}>
                            <Text style={s.pendingBadgeTxt}>{pendingCount}</Text>
                          </View>
                        )}
                        <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.navCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => (nav as any).navigate('CommunityChannels', { communityId, communityName: community.name, myRole })}
                      activeOpacity={0.75}
                    >
                      <View style={[s.navIcon, { backgroundColor: '#EC489920' }]}>
                        <Icon name="hash" size={20} color="#EC4899" />
                      </View>
                      <Text style={[s.navLabel, { color: colors.textPrimary }]}>Canaux</Text>
                      <Icon name="chevron-right" size={13} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>

                  {/* ── Section membres rapide ── */}
                  <View style={s.membersSectionHeader}>
                    <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>
                      MEMBRES ({fmtCount(community.members_count ?? 0)})
                    </Text>
                    {members.length > 5 && canShowMembersBtn && (
                      <TouchableOpacity
                        onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name, myRole, membersListHiddenPublic: community.members_list_hidden_public ?? false, membersListHiddenMembers: community.members_list_hidden_members ?? false })}
                      >
                        <Text style={[s.seeAll, { color: colors.primary }]}>Voir tous</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.memberRow, { borderBottomColor: colors.divider }]}
            onPress={() => nav.navigate('UserProfile', { userId: item.user_id })}
            activeOpacity={0.7}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={s.memberAvatarSm} />
            ) : (
              <View style={[s.memberAvatarSm, {
                backgroundColor: colors.primary + '22',
                alignItems: 'center',
                justifyContent: 'center',
              }]}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                  {(item.display_name || item.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.textPrimary }]}>
                {item.display_name || item.username}
              </Text>
              <Text style={[s.memberSub, { color: colors.textTertiary }]}>@{item.username}</Text>
            </View>
            {item.role === 'admin' && (
              <View style={[s.rolePill, { backgroundColor: '#36D9A022' }]}>
                <Text style={{ color: colors.success, fontSize: 10, fontWeight: '700' }}>ADMIN</Text>
              </View>
            )}
            {item.role === 'moderator' && (
              <View style={[s.rolePill, { backgroundColor: '#3B82F622' }]}>
                <Text style={{ color: colors.info, fontSize: 10, fontWeight: '700' }}>MOD</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          members.length > 5 ? (
            <TouchableOpacity
              style={[s.seeAllRow, { borderTopColor: colors.divider }]}
              onPress={() => (nav as any).navigate('CommunityMembers', { communityId, communityName: community.name, myRole, membersListHiddenPublic: community.members_list_hidden_public ?? false, membersListHiddenMembers: community.members_list_hidden_members ?? false })}
              activeOpacity={0.7}
            >
              <Text style={[s.seeAllTxt, { color: colors.primary }]}>
                Voir tous les {fmtCount(community.members_count ?? 0)} membres
              </Text>
              <Icon name="chevron-right" size={15} color={colors.primary} />
            </TouchableOpacity>
          ) : null
        }
      />

      {/* ── Viewer image plein écran ── */}
      <Modal
        visible={!!viewerUrl}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={s.viewer}>
          <StatusBar hidden />
          <TouchableOpacity
            style={s.viewerClose}
            onPress={() => setViewerUrl(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={s.viewerCloseInner}>
              <Icon name="x" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
          {viewerUrl && (
            <ZoomableImage uri={viewerUrl} width={VIEWER_W} height={VIEWER_H} />
          )}
        </View>
      </Modal>

      {/* ── Modal demande de vérification ── */}
      <Modal
        visible={vrModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !vrLoading && setVrModalOpen(false)}
      >
        <View style={s.modalRoot}>
          <TouchableOpacity
            style={s.modalBg}
            activeOpacity={1}
            onPress={() => !vrLoading && setVrModalOpen(false)}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={[s.vrBox, { backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1D9BF020', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="shield" size={18} color="#1D9BF0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }]}>
                    Demander la vérification
                  </Text>
                  <Text style={[{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }]}>
                    {community.name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setVrModalOpen(false)} disabled={vrLoading}>
                  <Icon name="x" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <Text style={[s.fieldLabel, { color: colors.textTertiary, marginBottom: 8 }]}>
                POURQUOI CETTE COMMUNAUTÉ MÉRITE-T-ELLE CE BADGE ? (optionnel)
              </Text>
              <TextInput
                style={[s.fieldInput, {
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundSecondary,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  minHeight: 72,
                  textAlignVertical: 'top',
                }]}
                placeholder="Ex : communauté active, contenu de qualité…"
                placeholderTextColor={colors.textTertiary}
                value={vrReason}
                onChangeText={setVrReason}
                multiline
                maxLength={300}
                autoFocus
              />
              <Text style={[{ fontSize: 10, color: colors.textTertiary, textAlign: 'right', marginTop: 4 }]}>
                {vrReason.length}/300
              </Text>

              {/* Choix de la durée d'abonnement au badge — récurrent, débité au wallet
                  de l'admin qui fait la demande à chaque échéance une fois approuvé */}
              <Text style={[s.fieldLabel, { color: colors.textTertiary, marginTop: 10, marginBottom: 8 }]}>
                DURÉE DE L'ABONNEMENT AU BADGE
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(Object.keys(BADGE_PLAN_INFO) as BadgePlan[]).map(key => {
                  const info = BADGE_PLAN_INFO[key];
                  const selected = vrPlan === key;
                  const perMonth = info.priceEur / info.months;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setVrPlan(key)}
                      style={[s.vrPlanCard, {
                        backgroundColor: selected ? '#1D9BF015' : colors.backgroundSecondary,
                        borderColor: selected ? '#1D9BF0' : colors.divider,
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      }]}
                      activeOpacity={0.8}
                    >
                      {info.badge && (
                        <View style={s.vrPlanBadge}>
                          <Text style={s.vrPlanBadgeText}>{info.badge}</Text>
                        </View>
                      )}
                      <Text style={[s.vrPlanLabel, { color: selected ? '#1D9BF0' : colors.textPrimary }]}>{info.label}</Text>
                      <Text style={[s.vrPlanPrice, { color: colors.textPrimary }]}>{info.priceEur.toFixed(2)} €</Text>
                      <Text style={{ fontSize: 10, color: colors.textTertiary }}>{perMonth.toFixed(2)} €/mois</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Boite frais */}
              {(() => {
                const fee = 500;
                const hasGoGold = myGoGold !== null;
                const canAfford = myGoGold !== null && myGoGold >= fee;
                const afterBalance = myGoGold !== null ? myGoGold - fee : null;
                return (
                  <View style={[s.vrFeeBox, { borderColor: canAfford ? '#1D9BF040' : '#EF444440', backgroundColor: canAfford ? '#1D9BF008' : '#EF444408' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: canAfford ? colors.info : colors.error }}>
                        Frais de vérification
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name="zap" size={13} color="#F59E0B" />
                        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.warning }}>500 GoGold</Text>
                      </View>
                    </View>
                    {hasGoGold && (
                      <View style={{ gap: 3 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>Votre solde</Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>{myGoGold} GoGold</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>Solde après</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: canAfford ? colors.success : colors.error }}>
                            {afterBalance} GoGold
                          </Text>
                        </View>
                      </View>
                    )}
                    <Text style={{ fontSize: 10, color: colors.success, marginTop: 6 }}>
                      Remboursement automatique si la demande est refusée
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
                      Une fois approuvée, l'abonnement {BADGE_PLAN_INFO[vrPlan].label.toLowerCase()} ({BADGE_PLAN_INFO[vrPlan].priceEur.toFixed(2)} €) démarre et se renouvelle automatiquement tous les {BADGE_PLAN_INFO[vrPlan].months} mois — débité de ton wallet en tant qu'admin.
                    </Text>
                  </View>
                );
              })()}

              {myGoGold !== null && myGoGold < 500 ? (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.error, marginTop: 10 }]}
                  onPress={() => { setVrModalOpen(false); nav.navigate('Wallet'); }}
                  activeOpacity={0.8}
                >
                  <Icon name="zap" size={16} color="#fff" />
                  <Text style={[s.actionTxt, { color: '#fff' }]}>Acheter des GoGold</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.info, marginTop: 10 }]}
                  onPress={handleSubmitVerificationRequest}
                  disabled={vrLoading}
                  activeOpacity={0.8}
                >
                  {vrLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="send" size={16} color="#fff" />
                      <Text style={[s.actionTxt, { color: '#fff' }]}>Envoyer la demande</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Panel Paramètres ── */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => !saving && setSettingsOpen(false)}
      >
        {/* fond semi-transparent cliquable */}
        <TouchableOpacity
          style={s.settingsOverlay}
          activeOpacity={1}
          onPress={() => !saving && setSettingsOpen(false)}
        />

        {/* sheet ancrée en bas, par-dessus le fond */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.settingsKav}
          pointerEvents="box-none"
        >
          <View style={[s.settingsSheet, { backgroundColor: colors.background }]}>
            {/* Handle */}
            <View style={s.handleWrap}>
              <View style={[s.handle, { backgroundColor: colors.divider }]} />
            </View>

            {/* Header */}
            <View style={[s.settingsHeader, { borderBottomColor: colors.divider }]}>
              <TouchableOpacity onPress={() => setSettingsOpen(false)} style={s.settingsNavBtn}>
                <Icon name="x" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[s.settingsTitle, { color: colors.textPrimary }]}>
                Gérer la communauté
              </Text>
              {settingsTab !== 'members' ? (
                <TouchableOpacity
                  onPress={handleSaveSettings}
                  disabled={saving}
                  style={[s.settingsNavBtn, { alignItems: 'flex-end' }]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                      Enregistrer
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={s.settingsNavBtn} />
              )}
            </View>

            {/* Onglets */}
            <View style={[s.tabBar, { borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
              {(['info', 'members', 'security'] as SettingsTab[]).map(tab => {
                const tabIcon =
                  tab === 'info'    ? 'edit-2' :
                  tab === 'members' ? 'users'  : 'shield';
                const tabLabel =
                  tab === 'info'    ? 'Infos'    :
                  tab === 'members' ? 'Membres'  : 'Paramètres';
                const active = settingsTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[s.tabBtn, active && { borderBottomWidth: 2.5, borderBottomColor: colors.primary }]}
                    onPress={() => setSettingsTab(tab)}
                  >
                    <Icon name={tabIcon} size={14} color={active ? colors.primary : colors.textTertiary} />
                    <Text style={[s.tabLabel, { color: active ? colors.primary : colors.textTertiary }]}>
                      {tabLabel}
                    </Text>
                    {tab === 'members' && pendingCount > 0 && (
                      <View style={[s.tabBadge, { backgroundColor: '#7B3FF2' }]}>
                        <Text style={s.tabBadgeTxt}>{pendingCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Contenu de l'onglet */}
            <View style={{ flex: 1 }}>
              {settingsTab === 'info'     && renderTabInfo()}
              {settingsTab === 'members'  && renderTabMembers()}
              {settingsTab === 'security' && renderTabSecurity()}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },

  // Bannière + avatar
  bannerArea: { position: 'relative', marginBottom: 44 },
  banner: { width: '100%', height: 160 },
  bannerGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  avatarFrame: {
    position: 'absolute',
    bottom: -36,
    alignSelf: 'center',
  },
  avatarBorder: {
    borderWidth: 4,
    borderRadius: 42,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    overflow: 'hidden',
  },
  bigAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  verifiedBadgeMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Infos
  infoBlock: { paddingHorizontal: 16, paddingTop: 6 },
  communityName: { fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  communityDesc: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  statItem: { fontSize: 13, fontWeight: '500' },
  statSep: { width: 1, height: 14 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#36D9A0' },

  // Rôle chip
  roleRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleChipText: { fontSize: 12, fontWeight: '700' },

  // Boutons action
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  actionTxt: { fontWeight: '700', fontSize: 14 },

  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
  },
  coinPillTxt: { color: '#FF7A2F', fontWeight: '800', fontSize: 11 },

  // Wallet bar
  walletBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  walletTitle: { fontSize: 13, fontWeight: '700' },
  walletSub: { fontSize: 11, marginTop: 2 },
  rechargeBtn: { backgroundColor: '#EF444420', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  rechargeTxt: { color: '#F0365A', fontWeight: '700', fontSize: 12 },

  // Info bar
  infoBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 6, marginBottom: 4 },
  infoBarTxt: { flex: 1, fontSize: 12, lineHeight: 17 },

  // VR buttons
  vrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  vrBtnTxt: { fontSize: 13, fontWeight: '600' },

  // Locked content placeholder
  lockedBox: {
    marginTop: 24,
    marginHorizontal: 0,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  lockedSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  pendingBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  pendingBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Nav grid 2 colonnes
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    width: '47.5%',
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: { flex: 1, fontSize: 13, fontWeight: '600' },

  // Section membres
  membersSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  seeAll: { fontSize: 13, fontWeight: '600' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  memberAvatarSm: { width: 42, height: 42, borderRadius: 21 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberSub: { fontSize: 12, marginTop: 1 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seeAllTxt: { fontSize: 14, fontWeight: '600' },

  // Viewer
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 52, right: 20, zIndex: 10 },
  viewerCloseInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal base
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },

  // VR box
  vrBox: { marginHorizontal: 20, borderRadius: 22, padding: 20 },
  vrFeeBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
  vrPlanCard: { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center', gap: 3, position: 'relative' },
  vrPlanBadge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#22C55E', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  vrPlanBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  vrPlanLabel: { fontSize: 12, fontWeight: '700' },
  vrPlanPrice: { fontSize: 15, fontWeight: '800' },

  // Settings sheet
  settingsSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    flex: 1,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  settingsNavBtn: { width: 90, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },

  // Onglets settings
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 13, fontWeight: '700' },

  // Contenu settings
  sheetBody: { paddingHorizontal: 16, paddingTop: 16 },

  // Bannière/avatar edit
  editBanner: { height: 110, borderRadius: 14, overflow: 'hidden' },
  editBannerImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  editCamBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  editAvatarWrap: { alignSelf: 'flex-start', marginTop: -28, marginLeft: 12, marginBottom: 16 },
  editAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, overflow: 'hidden' },
  editAvatarCam: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7B3FF2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Champs form
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 },
  fieldBox: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  fieldInput: { fontSize: 15, padding: 0 },

  // Membres (settings)
  memberSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberSearchInput: { flex: 1, fontSize: 14, padding: 0 },
  memberCountLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8 },
  adminMemberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 165 },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBtnTxt: { fontSize: 10, fontWeight: '700' },

  // Settings overlay + KAV
  // Info summary
  infoSummaryBox: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, alignItems: 'center',
  },
  infoSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoSummaryTxt: { fontSize: 12, fontWeight: '500' },
  infoSummarySep: { width: 1, height: 14, opacity: 0.5 },

  settingsOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },
  settingsKav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '92%' },

  // Tab badge
  tabBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, marginLeft: 2,
  },
  tabBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Prix d'entrée input
  priceInputWrap: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
    minWidth: 64, alignItems: 'center',
  },
  priceInput: { fontSize: 15, fontWeight: '700', textAlign: 'center', padding: 0 },

  // Sécurité
  secSection: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  secIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secLabel: { fontSize: 14, fontWeight: '600' },
  secDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },

  blockedSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 0 },
  blockedSectionLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockedSectionDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0365A' },
  blockedCountBadge:    { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  blockedEmpty:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  blockedEmptyText:     { fontSize: 13, fontWeight: '500' },
  blockedBanner:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  blockedBannerTitle:   { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  blockedBannerSub:     { fontSize: 12, lineHeight: 18 },
});
