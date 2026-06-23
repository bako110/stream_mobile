import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Image,
  Animated as RNAnimated, StatusBar, Linking, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { BackButton } from '../../components/common';

interface Props { navigation: any }

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApiMessage {
  id: string;
  body: string;
  is_staff: boolean;
  created_at: string;
  sender_name: string | null;
  sender_role: string | null;
}

interface ApiTicket {
  id: string;
  subject: string;
  status: string;
  messages: ApiMessage[];
}

type Phase = 'menu' | 'bot' | 'agent';

interface LocalMsg {
  id: string;
  side: 'user' | 'agent' | 'staff';
  text: string;
  time: string;
  options?: { label: string; value: string }[];
  staffName?: string;
}

// ── Menu bot ───────────────────────────────────────────────────────────────────

const MENU_OPTIONS = [
  { label: 'Paiement & Wallet',          value: 'paiement'   },
  { label: 'Connexion & Compte',          value: 'connexion'  },
  { label: 'Contenu & Lecture',           value: 'contenu'    },
  { label: 'Abonnement & Plans',          value: 'abonnement' },
  { label: 'Artiste & Vérification',      value: 'artiste'    },
  { label: 'Social & Communautés',        value: 'social'     },
  { label: 'Notifications & Paramètres',  value: 'parametres' },
  { label: 'Parrainage & Coins',          value: 'parrainage' },
  { label: 'Parler à un agent',           value: 'agent'      },
];

interface BotNode { text: string; options?: { label: string; value: string }[] }

const BOT: Record<string, BotNode> = {
  menu: {
    text: 'Comment puis-je vous aider ?',
    options: MENU_OPTIONS,
  },
  paiement: {
    text: 'Paiement & Wallet\n\nQuel est votre problème ?',
    options: [
      { label: 'Mon dépôt a échoué',          value: 'depot_echoue'    },
      { label: "Je n'ai pas reçu mes coins",   value: 'coins_manquants' },
      { label: 'Problème de retrait',          value: 'retrait'         },
      { label: 'Autre',                        value: 'agent'           },
      { label: 'Retour menu',                  value: 'menu'            },
    ],
  },
  depot_echoue: {
    text: "Dépôt échoué\n\nCauses fréquentes :\n• Solde insuffisant\n• Limite journalière dépassée\n• Connexion instable\n\nQue faire ?\n1. Vérifiez votre solde\n2. Essayez un autre moyen de paiement\n3. Réessayez après 5 minutes\n\nSi le montant a été débité sans créditer vos coins, contactez un agent avec votre numéro de transaction.",
    options: [
      { label: "C'est résolu",       value: 'resolu' },
      { label: 'Besoin d\'aide',     value: 'agent'  },
      { label: 'Retour',             value: 'paiement' },
    ],
  },
  coins_manquants: {
    text: "Coins non reçus\n\nAprès un achat réussi, les coins sont crédités immédiatement.\n\n1. Rafraîchissez votre wallet\n2. Déconnectez-vous puis reconnectez-vous\n3. Vérifiez l'historique Wallet → Transactions\n\nSi le problème persiste, un agent peut vous aider.",
    options: [
      { label: 'Coins bien reçus',  value: 'resolu'   },
      { label: 'Besoin d\'un agent', value: 'agent'   },
      { label: 'Retour',            value: 'paiement' },
    ],
  },
  retrait: {
    text: "Retrait de gains\n\nConditions :\n• Minimum : 1 000 coins\n• Délai : 24–72h ouvrables\n• Compte vérifié requis\n• Moyen de paiement configuré dans Paramètres → Monétisation\n\nBesoin d'aide ?",
    options: [
      { label: 'Mon retrait est bloqué', value: 'agent' },
      { label: 'Compris',                value: 'resolu' },
      { label: 'Retour',                 value: 'paiement' },
    ],
  },
  connexion: {
    text: 'Connexion & Compte\n\nQuel est votre problème ?',
    options: [
      { label: 'Mot de passe oublié',    value: 'mdp'        },
      { label: 'Compte bloqué',          value: 'agent'      },
      { label: 'Changer mon email',      value: 'agent'      },
      { label: 'Retour menu',            value: 'menu'       },
    ],
  },
  mdp: {
    text: "Réinitialiser votre mot de passe\n\n1. Allez sur l'écran de connexion\n2. Appuyez sur \"Mot de passe oublié\"\n3. Entrez votre email\n4. Vérifiez vos emails (et spams)\n5. Suivez le lien reçu",
    options: [
      { label: 'Ça fonctionne',         value: 'resolu'    },
      { label: "Je n'ai pas reçu l'email", value: 'agent' },
      { label: 'Retour',                value: 'connexion' },
    ],
  },
  contenu: {
    text: 'Contenu & Lecture\n\nQuel est votre problème ?',
    options: [
      { label: 'Vidéo ne charge pas',   value: 'agent' },
      { label: 'Son ou image défaillant', value: 'agent' },
      { label: 'Contenu manquant',      value: 'agent' },
      { label: 'Retour menu',           value: 'menu'  },
    ],
  },
  abonnement: {
    text: 'Abonnement & Plans\n\nQuel est votre problème ?',
    options: [
      { label: 'Mon abonnement ne fonctionne pas', value: 'agent' },
      { label: 'Annuler mon abonnement',           value: 'agent' },
      { label: 'Changer de plan',                  value: 'agent' },
      { label: 'Retour menu',                      value: 'menu'  },
    ],
  },
  artiste: {
    text: 'Artiste & Vérification\n\nQuel est votre problème ?',
    options: [
      { label: 'Soumettre une vérification',  value: 'agent' },
      { label: 'Demande de monétisation',     value: 'agent' },
      { label: 'Badge non reçu',              value: 'agent' },
      { label: 'Retour menu',                 value: 'menu'  },
    ],
  },
  social: {
    text: 'Social & Communautés\n\nQuel est votre problème ?',
    options: [
      { label: 'Signaler un contenu',   value: 'agent' },
      { label: 'Problème de messages',  value: 'agent' },
      { label: 'Communauté introuvable', value: 'agent' },
      { label: 'Retour menu',           value: 'menu'  },
    ],
  },
  parametres: {
    text: 'Notifications & Paramètres\n\nQuel est votre problème ?',
    options: [
      { label: 'Notifications désactivées', value: 'agent' },
      { label: 'Problème de confidentialité', value: 'agent' },
      { label: 'Retour menu',               value: 'menu'  },
    ],
  },
  parrainage: {
    text: 'Parrainage & Coins\n\nQuel est votre problème ?',
    options: [
      { label: 'Code de parrainage invalide',   value: 'agent' },
      { label: 'Coins de parrainage non reçus', value: 'agent' },
      { label: 'Retour menu',                   value: 'menu'  },
    ],
  },
  resolu: {
    text: 'Ravi que ce soit résolu ! Y a-t-il autre chose ?',
    options: [
      { label: 'Autre question',    value: 'menu' },
      { label: "Non, c'est bon",    value: 'fin'  },
    ],
  },
  fin: {
    text: 'Merci d\'avoir contacté le support GoFolyX ! Bonne utilisation de l\'application.',
    options: [],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const nowStr = () =>
  new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

// ── Composant ──────────────────────────────────────────────────────────────────

export const SupportChatScreen: React.FC<Props> = ({ navigation }) => {
  const { theme }       = useTheme();
  const { colors }      = theme;
  const { currentUser } = useUser();
  const insets          = useSafeAreaInsets();
  const listRef         = useRef<FlatList>(null);

  const [phase,    setPhase]    = useState<Phase>('menu');
  const [messages, setMessages] = useState<LocalMsg[]>([{
    id:   'w0',
    side: 'agent',
    text: 'Bonjour ! Bienvenue sur le support GoFolyX.\n\nJe suis votre assistant virtuel. Sélectionnez un sujet ou décrivez votre problème.',
    time: nowStr(),
    options: MENU_OPTIONS,
  }]);
  const [text,         setText]         = useState('');
  const [typing,       setTyping]       = useState(false);
  const [ticket,       setTicket]       = useState<ApiTicket | null>(null);
  const [sending,      setSending]      = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [subject,      setSubject]      = useState('');

  const typingOpacity = useRef(new RNAnimated.Value(1)).current;
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling quand ticket ouvert
  useEffect(() => {
    if (!ticket) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get<ApiTicket>(Endpoints.support.getTicket(ticket.id));
        const t = res.data;
        setTicket(t);
        // Sync messages staff
        const staffMsgs: LocalMsg[] = t.messages
          .filter(m => m.is_staff)
          .map(m => ({
            id:        m.id,
            side:      'staff' as const,
            text:      m.body,
            time:      fmtTime(m.created_at),
            staffName: m.sender_name ?? 'Support',
          }));
        setMessages(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = staffMsgs.filter(m => !existingIds.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      } catch { /* silently ignore */ }
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ticket?.id]);

  // Typing animation
  useEffect(() => {
    if (!typing) return;
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(typingOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        RNAnimated.timing(typingOpacity, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [typing]);

  const scrollBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const pushBot = useCallback((node: BotNode) => {
    setTyping(false);
    setMessages(prev => {
      const cleared = prev.map((m, i) =>
        i === prev.length - 1 && m.side === 'agent' ? { ...m, options: [] } : m,
      );
      return [...cleared, {
        id:      Date.now().toString() + '_a',
        side:    'agent' as const,
        text:    node.text,
        time:    nowStr(),
        options: node.options,
      }];
    });
    scrollBottom();
  }, [scrollBottom]);

  const handleOption = useCallback((value: string, label: string) => {
    // Message user visible
    setMessages(prev => {
      const cleared = prev.map((m, i) =>
        i === prev.length - 1 && m.side === 'agent' ? { ...m, options: [] } : m,
      );
      return [...cleared, { id: Date.now().toString() + '_u', side: 'user' as const, text: label, time: nowStr() }];
    });
    scrollBottom();

    if (value === 'agent') {
      // Transition vers mode agent
      setSubject(label);
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setPhase('agent');
        setMessages(prev => [...prev, {
          id:   Date.now().toString() + '_a',
          side: 'agent',
          text: 'Je vous mets en relation avec un agent GoFolyX.\n\nDécrivez votre problème ci-dessous et un membre de notre équipe vous répondra dans les plus brefs délais (Lun–Ven 8h–20h · Sam 9h–17h).',
          time: nowStr(),
          options: [],
        }]);
        scrollBottom();
      }, 900);
      return;
    }

    const node = BOT[value] ?? BOT['menu'];
    setTyping(true);
    setTimeout(() => pushBot(node), 800 + Math.random() * 300);
  }, [pushBot, scrollBottom]);

  // Envoi message bot (phase menu/bot)
  const handleBotSend = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setText('');
    setMessages(prev => {
      const cleared = prev.map((m, i) =>
        i === prev.length - 1 && m.side === 'agent' ? { ...m, options: [] } : m,
      );
      return [...cleared, { id: Date.now().toString() + '_u', side: 'user' as const, text: trimmed, time: nowStr() }];
    });
    scrollBottom();
    // Bascule vers agent sur texte libre
    setSubject(trimmed.slice(0, 100));
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setPhase('agent');
      setMessages(prev => [...prev, {
        id:   Date.now().toString() + '_a',
        side: 'agent',
        text: 'Je transmets votre demande à un agent.\n\nDécrivez votre problème en détail et nous vous répondrons rapidement.',
        time: nowStr(),
        options: [],
      }]);
      scrollBottom();
    }, 900);
  }, [scrollBottom]);

  // Envoi message agent (crée ticket si besoin, puis envoie message)
  const handleAgentSend = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setText('');
    setSending(true);

    const optimisticId = Date.now().toString() + '_u';
    setMessages(prev => [
      ...prev,
      { id: optimisticId, side: 'user' as const, text: trimmed, time: nowStr() },
    ]);
    scrollBottom();

    try {
      let currentTicket = ticket;
      if (!currentTicket) {
        // Créer le ticket avec ce premier message
        setLoadingAgent(true);
        const res = await apiClient.post<ApiTicket>(Endpoints.support.createTicket, {
          subject: subject || trimmed.slice(0, 100),
          body: trimmed,
        });
        currentTicket = res.data;
        setTicket(currentTicket);
        setLoadingAgent(false);
      } else {
        // Envoyer un message sur le ticket existant
        await apiClient.post(Endpoints.support.sendMessage(currentTicket.id), { body: trimmed });
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id:   Date.now().toString() + '_err',
          side: 'agent' as const,
          text: 'Erreur de connexion. Vérifiez votre réseau et réessayez.',
          time: nowStr(),
          options: [],
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [ticket, subject, sending, scrollBottom]);

  const handleSend = useCallback((content: string) => {
    if (phase === 'agent') {
      handleAgentSend(content);
    } else {
      handleBotSend(content);
    }
  }, [phase, handleAgentSend, handleBotSend]);

  // ── Rendu message ────────────────────────────────────────────────────────────

  const renderMsg = useCallback(({ item }: { item: LocalMsg }) => {
    const isUser  = item.side === 'user';
    const isStaff = item.side === 'staff';
    const initials = (currentUser?.display_name ?? currentUser?.username ?? '?')[0]?.toUpperCase() ?? '?';

    return (
      <View style={{ marginBottom: 4 }}>
        <View style={[s.msgRow, isUser ? s.rowUser : s.rowAgent]}>
          {/* Avatar gauche (agent bot ou staff) */}
          {!isUser && (
            isStaff ? (
              <View style={[s.agentAvt, { backgroundColor: '#7B3FF2' + '33', alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="user" size={13} color="#7B3FF2" />
              </View>
            ) : (
              <LinearGradient colors={[colors.primary, '#E0389A']} style={s.agentAvt}>
                <Icon name="life-buoy" size={13} color="#fff" />
              </LinearGradient>
            )
          )}

          <View style={{ maxWidth: '78%', gap: 3 }}>
            {/* Nom du staff */}
            {isStaff && item.staffName && (
              <Text style={[s.staffName, { color: '#7B3FF2' }]}>{item.staffName} · Support</Text>
            )}

            {/* Bulle */}
            <View style={[
              s.bubble,
              isUser
                ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                : isStaff
                  ? { backgroundColor: '#7B3FF2' + '18', borderColor: '#7B3FF2' + '40', borderWidth: 1, borderBottomLeftRadius: 4 }
                  : { backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
            ]}>
              <Text style={[s.bubbleTxt, { color: isUser ? '#fff' : colors.textPrimary }]}>
                {item.text}
              </Text>
            </View>

            {/* Méta */}
            <View style={[s.meta, { alignSelf: isUser ? 'flex-end' : 'flex-start' }]}>
              <Text style={[s.metaTime, { color: colors.textTertiary }]}>{item.time}</Text>
              {isUser && <Icon name="check-circle" size={11} color={colors.primary} />}
            </View>

            {/* Options rapides */}
            {!isUser && item.options && item.options.length > 0 && (
              <View style={s.optionsWrap}>
                {item.options.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.optChip, { borderColor: colors.primary, backgroundColor: colors.primary + '12' }]}
                    activeOpacity={0.75}
                    onPress={() => handleOption(opt.value, opt.label)}
                  >
                    <Text style={[s.optTxt, { color: colors.primary }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Avatar user */}
          {isUser && (
            currentUser?.avatar_url
              ? <Image source={{ uri: currentUser.avatar_url }} style={s.userAvt} />
              : <View style={[s.userAvt, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>{initials}</Text>
                </View>
          )}
        </View>
      </View>
    );
  }, [colors, currentUser, handleOption]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const headerSubtitle = phase === 'agent' && ticket
    ? `Ticket #${ticket.id.slice(0, 8).toUpperCase()} · En cours`
    : phase === 'agent'
      ? 'Connexion avec un agent…'
      : 'Assistant virtuel · disponible 24h/24';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={[colors.primary, '#9B5CF6']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.header, { paddingTop: insets.top + 6 }]}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <View style={s.headerMid}>
          <View style={s.headerAvtWrap}>
            <Icon name={phase === 'agent' ? 'headphones' : 'life-buoy'} size={17} color="#fff" />
          </View>
          <View>
            <Text style={s.headerName}>Support GoFolyX</Text>
            <View style={s.onlineRow}>
              <View style={[s.onlineDot, { backgroundColor: phase === 'agent' && loadingAgent ? '#FBBF24' : '#4ADE80' }]} />
              <Text style={s.onlineTxt}>{headerSubtitle}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={s.callBtn}
          onPress={() => Linking.openURL('tel:+22670000000')}
        >
          <Icon name="phone" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMsg}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onLayout={scrollBottom}
          ListFooterComponent={(typing || loadingAgent) ? (
            <View style={[s.msgRow, s.rowAgent, { marginBottom: 4 }]}>
              <LinearGradient colors={[colors.primary, '#E0389A']} style={s.agentAvt}>
                <Icon name="life-buoy" size={13} color="#fff" />
              </LinearGradient>
              <View style={[s.bubble, { backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 }]}>
                <RNAnimated.View style={[s.typingDots, { opacity: typingOpacity }]}>
                  {[0, 1, 2].map(i => (
                    <View key={i} style={[s.dot, { backgroundColor: colors.textTertiary }]} />
                  ))}
                </RNAnimated.View>
              </View>
            </View>
          ) : null}
        />

        {/* Barre saisie */}
        <View style={[s.bar, { backgroundColor: colors.surface, borderTopColor: colors.divider, paddingBottom: insets.bottom || 14 }]}>
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
            placeholder={phase === 'agent' ? 'Décrivez votre problème…' : 'Posez votre question…'}
            placeholderTextColor={colors.textDisabled}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            onSubmitEditing={() => handleSend(text)}
            editable={!sending}
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: (text.trim() && !sending) ? colors.primary : colors.backgroundSecondary }]}
            onPress={() => handleSend(text)}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Icon name="send" size={15} color={text.trim() ? '#fff' : colors.textDisabled} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const AVT = 28;

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 14 },
  headerMid:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvtWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerName:    { color: '#fff', fontSize: 15, fontWeight: '800' },
  onlineRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot:     { width: 6, height: 6, borderRadius: 3 },
  onlineTxt:     { color: 'rgba(255,255,255,0.85)', fontSize: 10 },
  callBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  list:          { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 8, gap: 10 },

  msgRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  rowUser:       { justifyContent: 'flex-end' },
  rowAgent:      { justifyContent: 'flex-start' },
  agentAvt:      { width: AVT, height: AVT, borderRadius: AVT / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  userAvt:       { width: AVT, height: AVT, borderRadius: AVT / 2, flexShrink: 0 },

  staffName:     { fontSize: 10, fontWeight: '700', marginBottom: 2 },

  bubble:        { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleTxt:     { fontSize: 14, lineHeight: 21 },

  meta:          { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaTime:      { fontSize: 10 },

  optionsWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6, maxWidth: '100%' },
  optChip:       { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  optTxt:        { fontSize: 12, fontWeight: '700' },

  typingDots:    { flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 2 },
  dot:           { width: 7, height: 7, borderRadius: 3.5 },

  bar:           { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input:         { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14, maxHeight: 100 },
  sendBtn:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
