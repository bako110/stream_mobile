import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Image,
  Animated as RNAnimated, StatusBar, Linking, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';

interface Props { navigation: any }

type MsgSide = 'user' | 'agent';
interface SupportMsg {
  id:     string;
  side:   MsgSide;
  text:   string;
  time:   string;
  status?: 'sent' | 'read';
  options?: QuickOption[];
}
interface QuickOption { label: string; value: string }

// ─── Arbre de navigation du support ──────────────────────────────────────────

interface SupportNode {
  text:     string;
  options?: QuickOption[];
  reply?:   (input?: string) => SupportNode;
}

const MENU_PRINCIPAL: QuickOption[] = [
  { label: 'Paiement & Wallet',         value: 'paiement'   },
  { label: 'Connexion & Compte',         value: 'connexion'  },
  { label: 'Contenu & Lecture',          value: 'contenu'    },
  { label: 'Abonnement & Plans',         value: 'abonnement' },
  { label: 'Artiste & Verification',     value: 'artiste'    },
  { label: 'Social & Communautes',       value: 'social'     },
  { label: 'Notifications & Parametres', value: 'parametres' },
  { label: 'Parrainage & Coins',         value: 'parrainage' },
  { label: 'Parler a un agent',          value: 'agent'      },
];

const TREE: Record<string, SupportNode> = {

  // ── Paiement ──────────────────────────────────────────────────────────────
  paiement: {
    text: '*Paiement & Wallet*\n\nQuel est votre problème ?',
    options: [
      { label: 'Mon depot a echoue',           value: 'depot_echoue'    },
      { label: 'Je n\'ai pas recu mes coins',  value: 'coins_manquants' },
      { label: 'Probleme de retrait',          value: 'retrait'         },
      { label: 'Transfert de coins',           value: 'transfert'       },
      { label: 'Achat de boost',               value: 'boost'           },
      { label: 'Retour menu principal',        value: 'menu'            },
    ],
  },
  depot_echoue: {
    text: '*Depot echoue*\n\nVoici les causes les plus frequentes :\n\n- Solde insuffisant sur votre moyen de paiement\n- Limite journaliere depassee (Orange Money / CinetPay)\n- Connexion instable lors de la transaction\n- Carte refusee par votre banque\n\nQue faire ?\n1. Verifiez votre solde disponible\n2. Essayez un autre moyen de paiement (Stripe, CinetPay, Orange Money)\n3. Reessayez apres 5 minutes\n4. Si le montant a ete debite sans crediter vos coins, contactez-nous avec votre numero de transaction.\n\nVotre probleme est-il resolu ?',
    options: [
      { label: 'Oui, c\'est resolu',    value: 'resolu'   },
      { label: 'Non, besoin d\'aide',   value: 'agent'    },
      { label: 'Retour Paiement',       value: 'paiement' },
    ],
  },
  coins_manquants: {
    text: '*Coins non recus*\n\nApres un achat reussi, les coins sont credites immediatement. Si vous ne les voyez pas :\n\n1. Rafraichissez votre wallet (tirez vers le bas)\n2. Deconnectez-vous puis reconnectez-vous\n3. Verifiez l\'historique dans Wallet → Transactions\n\nSi la transaction apparait dans votre historique bancaire mais pas dans FoliX, envoyez-nous :\n- Le montant debite\n- La date et l\'heure\n- Le moyen de paiement utilise\n- Une capture d\'ecran de la transaction\n\nEmail : support@folix.app',
    options: [
      { label: 'Coins bien recus',    value: 'resolu'   },
      { label: 'Contacter un agent', value: 'agent'    },
      { label: 'Retour',             value: 'paiement' },
    ],
  },
  retrait: {
    text: '*Retrait de coins*\n\nLes retraits sur FoliX fonctionnent ainsi :\n\n- Minimum : 1 000 coins pour initier un retrait\n- Delai : 24–72h ouvrables apres validation\n- Statuts : En attente > En cours > Complete\n\nConditions :\n- Compte verifie requis\n- Moyen de paiement configure dans Parametres → Monetisation\n- Les retraits sont examines manuellement par notre equipe\n\nVoulez-vous en savoir plus ?',
    options: [
      { label: 'Mon retrait est bloque',       value: 'agent'    },
      { label: 'Comment configurer le payout', value: 'agent'    },
      { label: 'Retour',                       value: 'paiement' },
    ],
  },
  transfert: {
    text: '*Transfert de coins*\n\nVous pouvez envoyer des coins a n\'importe quel utilisateur FoliX :\n\n1. Allez sur le profil de l\'utilisateur\n2. Appuyez sur l\'icone Coins dans les boutons d\'action\n3. Entrez le montant et confirmez\n\nOu depuis Wallet → Transferer en recherchant par username ou FoliX ID.\n\nAttention : Les transferts sont irreversibles. Verifiez bien le destinataire avant de confirmer.',
    options: [
      { label: 'Compris',                  value: 'resolu'   },
      { label: 'Mon transfert a echoue',   value: 'agent'    },
      { label: 'Retour',                   value: 'paiement' },
    ],
  },
  boost: {
    text: '*Boost de contenu*\n\nLe boost permet d\'augmenter la visibilite de vos publications :\n\n- Disponible sur : Events, Concerts, Posts, Reels\n- Paiement : En coins FoliX\n- Effet : Votre contenu apparait en priorite dans les fils des utilisateurs\n- Duree : Plusieurs options (24h, 3 jours, 7 jours)\n\nPour booster : ouvrez votre publication → menu "..." → Booster.\n\nProbleme avec un boost ?',
    options: [
      { label: 'Compris',            value: 'resolu'   },
      { label: 'Probleme de boost',  value: 'agent'    },
      { label: 'Retour',             value: 'paiement' },
    ],
  },

  // ── Connexion ─────────────────────────────────────────────────────────────
  connexion: {
    text: '*Connexion & Compte*\n\nQuel est votre probleme ?',
    options: [
      { label: 'J\'ai oublie mon mot de passe',   value: 'mdp_oublie'       },
      { label: 'Mon compte est bloque/suspendu',  value: 'compte_bloque'    },
      { label: 'Connexion avec Google/Facebook',  value: 'oauth'            },
      { label: 'Modifier mon profil',             value: 'modifier_profil'  },
      { label: 'Supprimer mon compte',            value: 'supprimer_compte' },
      { label: 'Retour menu principal',           value: 'menu'             },
    ],
  },
  mdp_oublie: {
    text: '*Mot de passe oublie*\n\nPour reinitialiser votre mot de passe :\n\n1. Sur l\'ecran de connexion, appuyez sur "Mot de passe oublie"\n2. Entrez votre email ou numero de telephone\n3. Verifiez votre boite mail / SMS\n4. Suivez le lien recu (valable 30 minutes)\n5. Creez un nouveau mot de passe\n\nConseils :\n- Verifiez vos spams/indesirables\n- Le lien expire apres 30 minutes\n- Si vous n\'avez rien recu apres 5 min, reessayez\n\nBesoin d\'aide supplementaire ?',
    options: [
      { label: 'Probleme resolu',                 value: 'resolu'    },
      { label: 'Je n\'ai pas recu l\'email',      value: 'agent'     },
      { label: 'Retour',                          value: 'connexion' },
    ],
  },
  compte_bloque: {
    text: '*Compte bloque ou suspendu*\n\nVotre compte peut etre suspendu pour :\n\n- Violation des CGU : Contenu inapproprie, spam, harcelement\n- Activite suspecte : Tentatives de connexion inhabituelles\n- Signalements multiples par d\'autres utilisateurs\n\nProcedure de contestation :\n1. Envoyez un email a support@folix.app\n2. Objet : "Contestation suspension - [votre username]"\n3. Expliquez la situation\n4. Notre equipe repond sous 48–72h ouvrables\n\nSi vous pensez que c\'est une erreur, nous examinerons votre dossier.',
    options: [
      { label: 'Envoyer un email',   value: 'email_support' },
      { label: 'Parler a un agent', value: 'agent'         },
      { label: 'Retour',            value: 'connexion'     },
    ],
  },
  oauth: {
    text: '*Connexion Google / Facebook*\n\nSi vous avez un probleme de connexion sociale :\n\n- Assurez-vous d\'utiliser la meme methode qu\'a l\'inscription\n- Si vous avez cree le compte avec Google, vous ne pouvez pas vous connecter avec email/mot de passe (et inversement)\n- Verifiez que votre compte Google/Facebook est actif\n- Autorisez FoliX dans les parametres de votre compte Google/Facebook\n\nSi votre compte social a ete supprime ou pirate, contactez notre support pour recuperer l\'acces.',
    options: [
      { label: 'Compris',            value: 'resolu'    },
      { label: 'Contacter un agent', value: 'agent'     },
      { label: 'Retour',             value: 'connexion' },
    ],
  },
  modifier_profil: {
    text: '*Modifier votre profil*\n\nPour modifier votre profil :\n\n- Depuis l\'onglet Profil → "Modifier le profil"\n- Depuis le menu → votre avatar → "Modifier le profil"\n\nVous pouvez modifier :\n- Photo de profil et banniere\n- Nom, username, bio\n- Localisation, site web, telephone\n- Date de naissance, genre\n\nNote : Le username peut etre change une fois tous les 30 jours.\n\nProbleme lors de la modification ?',
    options: [
      { label: 'C\'est bon',                        value: 'resolu'    },
      { label: 'Erreur lors de la sauvegarde',      value: 'agent'     },
      { label: 'Retour',                            value: 'connexion' },
    ],
  },
  supprimer_compte: {
    text: '*Suppression de compte*\n\nAttention : cette action est irreversible.\n\nAvant de supprimer votre compte, sachez que :\n- Toutes vos donnees (posts, reels, stories, messages) seront supprimees\n- Votre solde de coins sera perdu definitivement\n- Vos abonnements actifs seront annules sans remboursement\n\nProcedure :\n1. Parametres → Compte → Danger\n2. "Supprimer mon compte"\n3. Confirmez avec votre mot de passe\n\nSi vous souhaitez juste une pause, vous pouvez desactiver temporairement votre compte (Parametres → Compte → Desactiver).',
    options: [
      { label: 'Je comprends',               value: 'resolu'    },
      { label: 'Parler a quelqu\'un d\'abord', value: 'agent'  },
      { label: 'Retour',                     value: 'connexion' },
    ],
  },

  // ── Contenu ───────────────────────────────────────────────────────────────
  contenu: {
    text: '*Contenu & Lecture*\n\nQuel est votre probleme ?',
    options: [
      { label: 'Video qui ne charge pas',   value: 'video_bug'   },
      { label: 'Film/Serie non disponible', value: 'contenu_abo' },
      { label: 'Probleme avec un live',     value: 'live_bug'    },
      { label: 'Signaler un contenu',       value: 'signaler'    },
      { label: 'Qualite video',             value: 'qualite'     },
      { label: 'Retour menu principal',     value: 'menu'        },
    ],
  },
  video_bug: {
    text: '*Video qui ne charge pas*\n\nEssayez ces solutions dans l\'ordre :\n\n1. Verifiez votre connexion internet (Wi-Fi ou donnees mobiles)\n2. Fermez et rouvrez l\'application\n3. Videz le cache : Parametres telephone → Apps → FoliX → Vider le cache\n4. Mettez a jour FoliX depuis le Play Store / App Store\n5. Essayez en mode Wi-Fi si vous utilisez la 4G (et inversement)\n\nNote : Les reels et stories necessitent au minimum une connexion 3G+. Les films en HD necessitent Wi-Fi ou 4G stable.',
    options: [
      { label: 'Probleme resolu',   value: 'resolu'  },
      { label: 'Toujours bloque',   value: 'agent'   },
      { label: 'Retour',            value: 'contenu' },
    ],
  },
  contenu_abo: {
    text: '*Contenu reserve aux abonnes*\n\nFoliX propose differents niveaux d\'acces :\n\nGratuit : 480p · 1 ecran · sans telechargement\nBasic : 720p · 1 ecran · sans telechargement\nPremium : 1080p · 2 ecrans · 10 telechargements/mois\nFamily : 4K · 5 ecrans · 30 telechargements/mois\n\nCertains films sont PPV (Pay-Per-View) et necessitent un achat individuel en coins.\n\nPour vous abonner : Menu → Abonnements → Choisir un plan.',
    options: [
      { label: 'Souscrire un abonnement', value: 'abonnement' },
      { label: 'Compris',                 value: 'resolu'     },
      { label: 'Retour',                  value: 'contenu'    },
    ],
  },
  live_bug: {
    text: '*Probleme avec un Live*\n\nPour les lives (concerts et spontanes) :\n\nSpectateur :\n- Connexion Wi-Fi recommandee pour les concerts LiveKit\n- Si le live rame, activez le mode economie de donnees\n- Fermez les autres applications en arriere-plan\n\nDiffuseur :\n- Verifiez vos permissions micro et camera\n- Assurez-vous d\'avoir une connexion upload stable (min 2 Mbps)\n- En cas de coupure, le live peut etre relance depuis GoLive\n\nSi un live a du contenu inapproprie, signalez-le via le bouton "..." dans le live.',
    options: [
      { label: 'Probleme resolu',    value: 'resolu'  },
      { label: 'Contacter un agent', value: 'agent'   },
      { label: 'Retour',             value: 'contenu' },
    ],
  },
  signaler: {
    text: '*Signaler un contenu*\n\nComment signaler sur FoliX :\n\n- Post / Reel / Story : Appuyez sur "..." → Signaler\n- Profil utilisateur : Ouvrez le profil → icone "..." → Signaler\n- Commentaire : Maintenez appuye → Signaler\n- Live : Bouton "..." dans le live → Signaler\n\nChaque signalement est examine sous 24–48h par notre equipe de moderation.\n\nNote : Les signalements abusifs peuvent entrainer une restriction de votre compte.',
    options: [
      { label: 'Compris',                        value: 'resolu'  },
      { label: 'Signalement urgent (illegal)',    value: 'agent'   },
      { label: 'Retour',                         value: 'contenu' },
    ],
  },
  qualite: {
    text: '*Qualite video*\n\nLa qualite depend de votre plan et de votre connexion :\n\n- Gratuit : max 480p\n- Basic : max 720p\n- Premium : max 1080p\n- Family : jusqu\'a 4K\n\nPour forcer la qualite :\nParametres → Lecture → Qualite video\n\nNote : En mobilite, FoliX adapte automatiquement la qualite a votre debit pour eviter les interruptions.',
    options: [
      { label: 'Compris',        value: 'resolu'     },
      { label: 'Changer de plan', value: 'abonnement' },
      { label: 'Retour',         value: 'contenu'    },
    ],
  },

  // ── Abonnement ────────────────────────────────────────────────────────────
  abonnement: {
    text: '*Abonnement & Plans*\n\nQue souhaitez-vous faire ?',
    options: [
      { label: 'Voir les plans disponibles', value: 'plans'        },
      { label: 'Annuler mon abonnement',     value: 'annuler_abo'  },
      { label: 'Probleme de facturation',    value: 'facturation'  },
      { label: 'S\'abonner a un createur',  value: 'abo_createur'  },
      { label: 'Retour menu principal',      value: 'menu'         },
    ],
  },
  plans: {
    text: '*Plans FoliX*\n\nGratuit\n480p · 1 ecran · 1 profil · sans telechargement\n\nBasic\n720p · 1 ecran · 1 profil · sans telechargement\n\nPremium\n1080p · 2 ecrans · 3 profils · 10 telechargements/mois\n\nFamily\n4K · 5 ecrans · 6 profils · 30 telechargements/mois\n\nPour souscrire : Menu → Abonnements → Choisir un plan\n\nPaiement via Stripe (carte bancaire internationale).',
    options: [
      { label: 'Compris',                   value: 'resolu'     },
      { label: 'Probleme lors du paiement', value: 'agent'      },
      { label: 'Retour',                    value: 'abonnement' },
    ],
  },
  annuler_abo: {
    text: '*Annulation d\'abonnement*\n\nPour annuler votre abonnement :\n\n1. Menu → Abonnements\n2. Appuyez sur "Gerer mon abonnement"\n3. Selectionnez "Annuler"\n4. Confirmez l\'annulation\n\nImportant :\n- Votre acces reste actif jusqu\'a la fin de la periode payee\n- Aucun remboursement pour la periode en cours\n- Vous pouvez vous reabonner a tout moment\n\nSi vous avez souscrit via l\'App Store (iOS) ou Play Store (Android), gerez depuis les parametres de votre store.',
    options: [
      { label: 'Compris',                   value: 'resolu'     },
      { label: 'Demander un remboursement', value: 'agent'      },
      { label: 'Retour',                    value: 'abonnement' },
    ],
  },
  facturation: {
    text: '*Probleme de facturation*\n\nSi vous avez un probleme de facturation :\n\n- Double facturation : Envoyez les 2 recus a support@folix.app\n- Facturation apres annulation : Verifiez la date d\'effet de l\'annulation\n- Montant incorrect : Comparez avec les tarifs affiches sur l\'ecran Abonnements\n\nPour tout litige de facturation, contactez-nous avec :\n- Votre username FoliX\n- La date et le montant debite\n- Votre releve bancaire (partie concernee)',
    options: [
      { label: 'Envoyer un email',   value: 'email_support' },
      { label: 'Parler a un agent', value: 'agent'         },
      { label: 'Retour',            value: 'abonnement'    },
    ],
  },
  abo_createur: {
    text: '*S\'abonner a un createur*\n\nCertains artistes et createurs FoliX proposent un abonnement mensuel :\n\n1. Ouvrez le profil du createur\n2. Appuyez sur "S\'abonner" (visible si le createur a active la monetisation)\n3. Le paiement se fait en coins FoliX\n4. Acces immediat au contenu exclusif\n\nNote : Le tarif mensuel est fixe par le createur lui-meme. Les coins sont debites automatiquement chaque mois.',
    options: [
      { label: 'Compris',                         value: 'resolu'     },
      { label: 'Probleme de paiement createur',   value: 'agent'      },
      { label: 'Retour',                          value: 'abonnement' },
    ],
  },

  // ── Artiste ───────────────────────────────────────────────────────────────
  artiste: {
    text: '*Artiste & Verification*\n\nQue souhaitez-vous savoir ?',
    options: [
      { label: 'Demander la verification',      value: 'demande_verif' },
      { label: 'Statut de ma demande',          value: 'statut_verif'  },
      { label: 'Activer la monetisation',       value: 'monetisation'  },
      { label: 'Creer un concert / evenement',  value: 'creer_event'   },
      { label: 'Retour menu principal',         value: 'menu'          },
    ],
  },
  demande_verif: {
    text: '*Demande de verification*\n\nPour obtenir le badge verifie FoliX :\n\nPrerequis :\n- Compte actif depuis au moins 30 jours\n- Photo de profil et bio completes (min 20 caracteres)\n- Contenu publie (au moins 3 posts/reels)\n\nProcedure :\n1. Parametres → Verification\n2. Choisissez votre categorie (Artiste, Createur, Marque, Journaliste...)\n3. Remplissez le formulaire et payez les frais de traitement : 500 coins\n4. Notre equipe examine la demande sous 72h ouvrables\n\nLe badge apparait sur votre profil, posts, reels et commentaires.',
    options: [
      { label: 'Compris, je vais essayer', value: 'resolu'  },
      { label: 'J\'ai une question',       value: 'agent'   },
      { label: 'Retour',                   value: 'artiste' },
    ],
  },
  statut_verif: {
    text: '*Statut de votre demande*\n\nVous pouvez verifier le statut dans :\nParametres → Verification\n\nStatuts possibles :\n- En attente : Demande recue, en cours d\'examen (72h)\n- Approuve : Badge active sur votre profil\n- Rejete : Conditions non remplies (la raison vous est communiquee)\n\nEn cas de rejet, vous pouvez soumettre une nouvelle demande apres avoir corrige les points mentionnes. Les 500 coins de frais ne sont pas rembourses en cas de rejet.',
    options: [
      { label: 'Compris',           value: 'resolu'  },
      { label: 'Contester un rejet', value: 'agent'  },
      { label: 'Retour',            value: 'artiste' },
    ],
  },
  monetisation: {
    text: '*Monetisation FoliX*\n\nEn tant qu\'artiste/createur, vous pouvez monetiser :\n\n- Revenus de vues : Coins selon le nombre de vues de vos reels\n- Cadeaux : Coins recus pendant vos lives et sur vos contenus\n- Abonnement : Tarif mensuel que vous fixez (paiement en coins)\n- Recompenses communaute : Bonus selon l\'engagement\n\nActiver la monetisation :\n1. Parametres → Monetisation\n2. Choisissez votre methode de payout (Stripe ou Mobile Money)\n3. Renseignez vos coordonnees bancaires\n4. Definissez votre tarif d\'abonnement mensuel (optionnel)\n\nSuivez vos revenus dans Wallet → Tableau de bord createur.',
    options: [
      { label: 'Compris',           value: 'resolu'  },
      { label: 'Probleme de setup', value: 'agent'   },
      { label: 'Retour',            value: 'artiste' },
    ],
  },
  creer_event: {
    text: '*Creer un evenement ou concert*\n\nEvenement :\nFeed → bouton + → Creer un evenement\n- Types : Concert, Festival, Conference, Anniversaire, Sport, Theatre...\n- Vous pouvez vendre des billets (en coins)\n- Invitations, RSVP, gestion des participants\n\nConcert live :\nFeed → bouton + → Concert live\n- Streaming en direct via LiveKit\n- Vente de billets avec acces au live\n- Cadeaux en temps reel\n\nAstuce : Boostez votre evenement avec des coins pour augmenter sa visibilite dans le feed.',
    options: [
      { label: 'Compris',                        value: 'resolu'  },
      { label: 'Probleme lors de la creation',   value: 'agent'   },
      { label: 'Retour',                         value: 'artiste' },
    ],
  },

  // ── Social ────────────────────────────────────────────────────────────────
  social: {
    text: '*Social & Communautes*\n\nQue souhaitez-vous savoir ?',
    options: [
      { label: 'Bloquer un utilisateur',        value: 'bloquer'     },
      { label: 'Signaler du harcelement',       value: 'harcelement' },
      { label: 'Communautes (rejoindre/creer)', value: 'communautes' },
      { label: 'Probleme de messagerie',        value: 'messagerie'  },
      { label: 'Retour menu principal',         value: 'menu'        },
    ],
  },
  bloquer: {
    text: '*Bloquer un utilisateur*\n\nPour bloquer un utilisateur :\n\n1. Ouvrez son profil\n2. Appuyez sur l\'icone Bloquer\n3. Confirmez\n\nEffets du blocage :\n- Il ne peut plus voir votre profil ni vos contenus\n- Il ne peut plus vous envoyer de messages\n- Ses commentaires sur vos contenus sont masques\n- Bidirectionnel : vous ne voyez plus ses contenus non plus\n\nGerez vos utilisateurs bloques dans :\nParametres → Utilisateurs bloques',
    options: [
      { label: 'Compris',         value: 'resolu' },
      { label: 'Signaler un abus', value: 'agent' },
      { label: 'Retour',          value: 'social' },
    ],
  },
  harcelement: {
    text: '*Signalement de harcelement*\n\nFoliX prend le harcelement tres au serieux.\n\nActions immediates :\n1. Bloquez l\'utilisateur (profil → Bloquer)\n2. Signalez son profil / ses messages\n3. Conservez des captures d\'ecran comme preuves\n\nEscalade urgente :\nEnvoyez a support@folix.app :\n- Objet : "Signalement harcelement urgent"\n- Screenshots des messages/commentaires\n- Username de l\'harceleur\n\nNotre equipe traite les cas urgents sous 12h.',
    options: [
      { label: 'Envoyer les preuves',  value: 'email_support' },
      { label: 'Contacter maintenant', value: 'agent'         },
      { label: 'Retour',              value: 'social'         },
    ],
  },
  communautes: {
    text: '*Communautes FoliX*\n\nRejoindre une communaute :\nMenu → Communautes → Rechercher → Rejoindre\n\nCreer une communaute :\nMenu → Communautes → + Creer\n- Publique ou privee\n- Avec ou sans approbation des membres\n- Payante (entree en coins) ou gratuite\n\nFonctionnalites :\n- Chat general et canaux thematiques\n- Evenements de la communaute\n- Leaderboard des membres actifs\n- Roles : Admin, Moderateur, Membre\n\nNote : Les communautes verifiees ont un badge special.',
    options: [
      { label: 'Compris',                 value: 'resolu' },
      { label: 'Probleme dans un groupe', value: 'agent'  },
      { label: 'Retour',                  value: 'social' },
    ],
  },
  messagerie: {
    text: '*Probleme de messagerie*\n\nTypes de messages supportes :\nTexte, photo, video, audio, fichier, localisation\n\nProblemes frequents :\n\n- Messages non recus : Verifiez que vous n\'etes pas bloque par le destinataire, et que vos parametres autorisent les messages (Parametres → Confidentialite → Autoriser les messages)\n\n- Notification sans message : Fermez et rouvrez l\'app, verifiez votre connexion\n\n- Fichier non envoye : Taille max 50 MB. Les videos doivent etre compressees.',
    options: [
      { label: 'Probleme resolu',        value: 'resolu' },
      { label: 'Contacter le support',   value: 'agent'  },
      { label: 'Retour',                 value: 'social' },
    ],
  },

  // ── Paramètres ────────────────────────────────────────────────────────────
  parametres: {
    text: '*Parametres & Notifications*\n\nQue souhaitez-vous faire ?',
    options: [
      { label: 'Desactiver les notifications', value: 'notifs'          },
      { label: 'Confidentialite du profil',    value: 'confidentialite' },
      { label: 'Mode sombre',                  value: 'apparence'       },
      { label: 'Probleme de permissions',      value: 'permissions'     },
      { label: 'Retour menu principal',        value: 'menu'            },
    ],
  },
  notifs: {
    text: '*Notifications*\n\nPour gerer vos notifications :\n\nParametres → Notifications\n\nVous pouvez desactiver :\n- Nouvelles stories\n- Likes et commentaires\n- Nouveaux abonnes\n- Messages directs\n- Lives en cours\n- Evenements a venir\n\nSi vous ne recevez plus aucune notification :\n1. Verifiez que les notifs FoliX sont activees dans les reglages de votre telephone\n2. Desactivez le mode "Ne pas deranger"\n3. Reconnectez-vous pour reenregistrer le token FCM',
    options: [
      { label: 'Compris',                  value: 'resolu'     },
      { label: 'Toujours pas de notifs',   value: 'agent'      },
      { label: 'Retour',                   value: 'parametres' },
    ],
  },
  confidentialite: {
    text: '*Confidentialite*\n\nParametres → Confidentialite\n\nVous controlez :\n\n- Profil public/prive : Si prive, seuls vos abonnes voient vos contenus\n- Activite : Masquer votre activite recente\n- Localisation : Masquer votre ville dans le profil\n- Messages : Limiter qui peut vous ecrire\n- Statut en ligne : Masquer le point vert\n- Telephone : Masquer votre numero dans le profil\n- Anniversaire : Masquer votre date de naissance',
    options: [
      { label: 'Compris',           value: 'resolu'     },
      { label: 'Option introuvable', value: 'agent'     },
      { label: 'Retour',            value: 'parametres' },
    ],
  },
  apparence: {
    text: '*Apparence*\n\nPour changer le theme de FoliX :\n\nParametres → Apparence → Mode sombre / Mode clair\n\nFoliX s\'adapte automatiquement au theme de votre systeme si vous n\'avez pas fait de choix manuel.',
    options: [
      { label: 'Compris', value: 'resolu'     },
      { label: 'Retour',  value: 'parametres' },
    ],
  },
  permissions: {
    text: '*Permissions requises*\n\nFoliX utilise ces permissions :\n\n- Camera : Stories, reels, lives\n- Micro : Messages vocaux, lives, appels\n- Galerie : Photos de profil, posts\n- Localisation : Evenements a proximite\n- Contacts : Suggerer des amis (optionnel)\n- Notifications : Alertes en temps reel\n\nPour gerer : Parametres telephone → Apps → FoliX → Permissions',
    options: [
      { label: 'Compris',           value: 'resolu'     },
      { label: 'Permission refusee', value: 'agent'     },
      { label: 'Retour',            value: 'parametres' },
    ],
  },

  // ── Parrainage ────────────────────────────────────────────────────────────
  parrainage: {
    text: '*Parrainage & Coins*\n\nQue souhaitez-vous savoir ?',
    options: [
      { label: 'Comment ca marche ?',          value: 'parrainage_info'  },
      { label: 'Mon code ne fonctionne pas',   value: 'code_invalide'    },
      { label: 'Je n\'ai pas recu mes coins',  value: 'parrainage_coins' },
      { label: 'Retour menu principal',        value: 'menu'             },
    ],
  },
  parrainage_info: {
    text: '*Programme de parrainage FoliX*\n\nVotre code :\nProfil → Menu → Parrainage\n\nComment ca marche :\n1. Partagez votre code unique avec vos amis\n2. Votre ami s\'inscrit avec votre code\n3. Bonus immediat : 20 coins pour lui a l\'inscription\n4. Vous gagnez des coins a chaque achat qu\'il realise\n\nPlafond : 500 coins maximum par mois via le parrainage\n\nPlus vous parrainez, plus vous gagnez ! Vos stats (filleuls, coins gagnes) sont visibles dans l\'ecran Parrainage.',
    options: [
      { label: 'Compris', value: 'resolu'     },
      { label: 'Retour',  value: 'parrainage' },
    ],
  },
  code_invalide: {
    text: '*Code de parrainage invalide*\n\nSi votre code ne fonctionne pas :\n\n- Le code doit etre entre lors de l\'inscription (impossible de l\'ajouter apres)\n- Verifiez l\'orthographe (majuscules/minuscules)\n- Le code est unique a chaque utilisateur\n- Un utilisateur ne peut parrainer que de nouveaux comptes\n\nSi vous etes certain que le code est valide et qu\'il ne fonctionne pas, contactez notre support avec le code concerne.',
    options: [
      { label: 'Compris',              value: 'resolu'     },
      { label: 'Contacter le support', value: 'agent'      },
      { label: 'Retour',               value: 'parrainage' },
    ],
  },
  parrainage_coins: {
    text: '*Coins de parrainage non recus*\n\nLes coins de parrainage sont credites :\n- 20 coins immediatement apres l\'inscription du filleul\n- Bonus filleul apres son premier achat de coins\n\nSi vous n\'avez pas recu vos coins :\n1. Verifiez que votre filleul a bien utilise votre code a l\'inscription\n2. Attendez jusqu\'a 1 heure (traitement asynchrone)\n3. Verifiez dans Wallet → Transactions → filtrer "Parrainage"\n\nSi rien n\'apparait apres 24h, contactez le support avec le username de votre filleul.',
    options: [
      { label: 'Coins recus',   value: 'resolu'     },
      { label: 'Toujours rien', value: 'agent'      },
      { label: 'Retour',        value: 'parrainage' },
    ],
  },

  // ── États finaux ──────────────────────────────────────────────────────────
  resolu: {
    text: 'Je suis content que ce soit resolu.\n\nY a-t-il autre chose que je puisse faire pour vous ?',
    options: [
      { label: 'Autre question', value: 'menu' },
      { label: 'Non, c\'est bon', value: 'fin' },
    ],
  },
  fin: {
    text: 'Merci d\'avoir contacte le support FoliX !\n\nN\'hesitez pas a revenir si vous avez d\'autres questions. Bonne utilisation de FoliX !',
    options: [],
  },
  email_support: {
    text: '*Contacter par email*\n\nEnvoyez votre demande a :\nsupport@folix.app\n\nPrecisez dans votre email :\n- Votre username FoliX\n- La description detaillee du probleme\n- Des captures d\'ecran si possible\n- La date du probleme\n\nNos equipes repondent sous 24–48h ouvrables (Lun–Ven 8h–20h).',
    options: [
      { label: 'Autre question',   value: 'menu'  },
      { label: 'Preferer un appel', value: 'agent' },
    ],
  },
  agent: {
    text: '*Mise en relation avec un agent*\n\nUn agent FoliX va prendre en charge votre demande.\n\nTemps d\'attente estime : 5–15 minutes\nDisponibilite : Lun–Ven 8h–20h · Sam 9h–17h\n\nEn attendant, vous pouvez aussi :\n- Ecrire a support@folix.app\n- Appeler le +226 70 00 00 00\n\nDecrivez votre probleme ci-dessous pour accelerer la prise en charge :',
    options: [
      { label: 'Retour au menu', value: 'menu' },
    ],
  },
  menu: {
    text: 'Comment puis-je vous aider ?',
    options: MENU_PRINCIPAL,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nowStr = () =>
  new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const INITIAL: SupportMsg[] = [{
  id:   'w0',
  side: 'agent',
  text: 'Bonjour ! Bienvenue sur le support FoliX.\n\nJe suis votre assistant virtuel. Selectionnez un sujet ou decrivez votre probleme.',
  time: nowStr(),
  options: MENU_PRINCIPAL,
}];

// ─── Composant ────────────────────────────────────────────────────────────────

export const SupportChatScreen: React.FC<Props> = ({ navigation }) => {
  const { theme }       = useTheme();
  const { colors }      = theme;
  const { currentUser } = useUser();
  const insets          = useSafeAreaInsets();
  const listRef         = useRef<FlatList>(null);

  const [messages,  setMessages]  = useState<SupportMsg[]>(INITIAL);
  const [text,      setText]      = useState('');
  const [typing,    setTyping]    = useState(false);
  const typingOpacity = useRef(new RNAnimated.Value(1)).current;

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
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const pushAgent = useCallback((node: SupportNode) => {
    setTyping(false);
    const msg: SupportMsg = {
      id:      Date.now().toString() + '_a',
      side:    'agent',
      text:    node.text,
      time:    nowStr(),
      options: node.options,
    };
    setMessages(prev => {
      // Effacer les options du dernier message agent
      const updated = prev.map((m, i) =>
        i === prev.length - 1 && m.side === 'agent' ? { ...m, options: [] } : m,
      );
      return [...updated, msg];
    });
    scrollBottom();
  }, [scrollBottom]);

  const handleSend = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setText('');

    // Message utilisateur
    const userMsg: SupportMsg = {
      id:     Date.now().toString() + '_u',
      side:   'user',
      text:   trimmed,
      time:   nowStr(),
      status: 'sent',
    };
    setMessages(prev => prev.map((m, i) =>
      i === prev.length - 1 && m.side === 'agent' ? { ...m, options: [] } : m,
    ).concat(userMsg));
    scrollBottom();

    // Réponse agent
    setTyping(true);
    setTimeout(() => {
      const node = TREE['agent'];
      pushAgent({
        ...node,
        text: node.text,
        options: [{ label: '↩ Retour au menu', value: 'menu' }],
      });
    }, 1200);
  }, [pushAgent, scrollBottom]);

  const handleOption = useCallback((opt: QuickOption) => {
    // Message utilisateur = label du chip
    const userMsg: SupportMsg = {
      id:     Date.now().toString() + '_u',
      side:   'user',
      text:   opt.label,
      time:   nowStr(),
      status: 'sent',
    };
    setMessages(prev => prev.map((m, i) =>
      i === prev.length - 1 && m.side === 'agent' ? { ...m, options: [] } : m,
    ).concat(userMsg));
    scrollBottom();

    // Action spéciale email
    if (opt.value === 'email_support') {
      Linking.openURL('mailto:support@folix.app?subject=Assistance%20FoliX');
    }

    const node = TREE[opt.value] ?? TREE['menu'];
    setTyping(true);
    setTimeout(() => pushAgent(node), 900 + Math.random() * 400);
  }, [pushAgent, scrollBottom]);

  // ── Rendu message ──────────────────────────────────────────────────────────

  const renderMsg = useCallback(({ item }: { item: SupportMsg }) => {
    const isUser = item.side === 'user';
    const initials = (currentUser?.display_name ?? currentUser?.username ?? '?')[0].toUpperCase();

    return (
      <View style={{ marginBottom: 4 }}>
        <View style={[s.msgRow, isUser ? s.rowUser : s.rowAgent]}>
          {/* Avatar agent */}
          {!isUser && (
            <LinearGradient colors={[colors.primary, '#E0389A']} style={s.agentAvt}>
              <Icon name="life-buoy" size={13} color="#fff" />
            </LinearGradient>
          )}

          <View style={{ maxWidth: '78%', gap: 3 }}>
            {/* Bulle */}
            <View style={[
              s.bubble,
              isUser
                ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                : { backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
            ]}>
              <Text style={[s.bubbleTxt, { color: isUser ? '#fff' : colors.textPrimary }]}>
                {item.text}
              </Text>
            </View>

            {/* Méta */}
            <View style={[s.meta, { alignSelf: isUser ? 'flex-end' : 'flex-start' }]}>
              <Text style={[s.metaTime, { color: colors.textTertiary }]}>{item.time}</Text>
              {isUser && <Icon name="check-check" size={11} color={colors.primary} />}
            </View>

            {/* Options rapides sous le message agent */}
            {!isUser && item.options && item.options.length > 0 && (
              <View style={s.optionsWrap}>
                {item.options.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.optChip, { borderColor: colors.primary, backgroundColor: colors.primary + '0F' }]}
                    activeOpacity={0.75}
                    onPress={() => handleOption(opt)}
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={[colors.primary, '#9B5CF6']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.header, { paddingTop: insets.top + 6 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <View style={s.headerAvtWrap}>
            <Icon name="life-buoy" size={17} color="#fff" />
          </View>
          <View>
            <Text style={s.headerName}>Support FoliX</Text>
            <View style={s.onlineRow}>
              <View style={s.onlineDot} />
              <Text style={s.onlineTxt}>Assistant virtuel · disponible 24h/24</Text>
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
          ListFooterComponent={typing ? (
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
            placeholder="Décrivez votre problème..."
            placeholderTextColor={colors.textDisabled}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            onSubmitEditing={() => handleSend(text)}
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.backgroundSecondary }]}
            onPress={() => handleSend(text)}
            disabled={!text.trim()}
            activeOpacity={0.8}
          >
            <Icon name="send" size={15} color={text.trim() ? '#fff' : colors.textDisabled} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const AVT = 28;

const s = StyleSheet.create({
  root: { flex: 1 },

  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 14 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerMid:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvtWrap:{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerName:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  onlineRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  onlineTxt:   { color: 'rgba(255,255,255,0.85)', fontSize: 10 },
  callBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  list:        { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 8, gap: 10 },

  msgRow:      { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  rowUser:     { justifyContent: 'flex-end' },
  rowAgent:    { justifyContent: 'flex-start' },
  agentAvt:    { width: AVT, height: AVT, borderRadius: AVT / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  userAvt:     { width: AVT, height: AVT, borderRadius: AVT / 2, flexShrink: 0 },

  bubble:      { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleTxt:   { fontSize: 14, lineHeight: 21 },

  meta:        { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaTime:    { fontSize: 10 },

  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6, maxWidth: '100%' },
  optChip:     { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  optTxt:      { fontSize: 12, fontWeight: '700' },

  typingDots:  { flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 2 },
  dot:         { width: 7, height: 7, borderRadius: 3.5 },

  bar:         { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input:       { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14, maxHeight: 100 },
  sendBtn:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
