import { StyleSheet, Platform, Dimensions } from 'react-native';
import { Spacing, FontSize, FontWeight } from '../theme';
import { TAB_BAR_HEIGHT } from './layout';

const { width: SCREEN_W } = Dimensions.get('window');

// Hauteur banner responsive : ratio ~4:3 comme Facebook pour bien voir les images
export const BANNER_H = Math.round(SCREEN_W * 0.88);

export const feedStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingTop: 8, paddingBottom: TAB_BAR_HEIGHT + 20 },

  // ── Header ────────────────────────────────────────────────────────────────
  // paddingTop est fourni dynamiquement par insets.top (safe-area) dans le JSX —
  // ne PAS ajouter de valeur fixe ici (double comptage → header trop bas sur les
  // appareils à encoche).
  // Tailles (hauteur, paddings) inchangées — seul le design reprend la
  // référence : carte flottante blanche avec bordure légère + ombre violette,
  // au lieu d'un bloc plein collé en haut de l'écran.
  header: {
    marginHorizontal: 10,
    paddingHorizontal: Spacing[4],
    paddingBottom: 0,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#5B45B5',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    minHeight:      50,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
    maxWidth:      Math.round(SCREEN_W * 0.30),
    overflow:      'hidden',
    flexShrink:    1,
  },
  // Tailles d'origine de FeedScreen conservées — seul le design (couleurs,
  // formes des éléments autour) reprend la référence, pas le gabarit.
  avatar: {
    width: 31, height: 31, borderRadius: 16,
  },
  avatarFallback: {
    width: 31, height: 31, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },
  userName:   { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, flexShrink: 1 },
  headerCenter: {
    position: 'absolute', left: 0, right: 0, alignItems: 'center',
  },
  headerBrand: { fontSize: FontSize.mdPlus, fontWeight: FontWeight.black, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // Boutons d'icône nus (pas de fond ni de bordure "bouton sur bouton") — style
  // Instagram/X. La zone de tap reste compacte, l'icône visuellement légère.
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Pills sous le header (Mes amis · Favoris · Direct) ────────────────────
  // Hauteur d'origine conservée (34) — radius porté à 17 (moitié de la
  // hauteur, pilule complète) au lieu de 10 (coins arrondis modérés),
  // cf. référence.
  headerPills: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
    paddingBottom: 9,
  },
  headerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    borderRadius: 17,
  },
  // Variante navigable : contenu à gauche, chevron collé à droite (indique un
  // tap qui ouvre un écran).
  headerPillNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 9,
  },
  headerPillNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerPillText: {
    fontSize: FontSize.xsPlus,
    fontWeight: FontWeight.semiBold,
  },

  // ── Filtres ───────────────────────────────────────────────────────────────
  filtersWrap: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[2],
    paddingBottom:     Spacing[2],
  },
  filters: {
    flexDirection: 'row',
    gap:           8,
  },
  filterPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: Spacing[3],
    paddingVertical:   7,
    borderRadius:     4,
    borderWidth:      1.5,
  },
  filterText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },

  // ── Card — pleine largeur, 0 border radius ────────────────────────────────
  card: {
    width: SCREEN_W,
  },

  // Header auteur style réseau social
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: Spacing[4],
    paddingTop:     Spacing[3],
    paddingBottom:  Spacing[2],
  },
  cardAuthorAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  cardAuthorAvatarText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.md },
  cardAuthorName: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  cardTimeAgo:    { fontSize: FontSize.sm },

  // Bouton Suivre
  followBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      6,
    borderWidth:       1.5,
    marginRight:       8,
  },
  followBtnText: {
    fontSize:   FontSize.sm,
    fontWeight: FontWeight.bold,
  },

  // Titre + desc avant la bannière
  cardBody: {
    paddingHorizontal: Spacing[4],
    paddingTop:        4,
    paddingBottom:     Spacing[2],
  },
  cardTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.extraBold, lineHeight: 22 },
  cardDesc:     { fontSize: FontSize.smPlus, lineHeight: 19, marginTop: 4 },
  seeMoreText:  { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, marginTop: 4 },

  // ── Banner image — pleine largeur ─────────────────────────────────────────
  cardBanner: {
    width:  SCREEN_W,
    height: BANNER_H,
    alignItems:     'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardBannerGrad: { ...StyleSheet.absoluteFill },

  // Badges overlay (coin haut gauche du banner)
  badgesRow: {
    position:      'absolute',
    top:           12,
    left:          12,
    right:         12,
    flexDirection: 'row',
    gap:           6,
  },
  badge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:     4,
  },
  badgeDot:  { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.extraBold, letterSpacing: 0.6 },

  // Overlay bas du banner avec meta (date, lieu, prix)
  bannerOverlay: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    padding:        Spacing[4],
    gap:            4,
  },
  bannerTitle: {
    fontSize:   FontSize.xl,
    fontWeight: FontWeight.extraBold,
    color:      '#fff',
    lineHeight: 26,
  },
  bannerMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    flexWrap:      'wrap',
  },
  bannerMetaText: {
    fontSize:   FontSize.sm,
    color:      'rgba(255,255,255,0.9)',
    fontWeight: FontWeight.semiBold,
  },
  bannerMetaDot: {
    fontSize: FontSize.sm,
    color:    'rgba(255,255,255,0.5)',
  },

  // Compteur de likes / commentaires / partages
  likeCountRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeCountIcon: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  likeCountText: { fontSize: FontSize.sm },

  // ── Barre d'actions sociale ───────────────────────────────────────────────
  socialBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing[4],
    paddingVertical:   12,
    borderTopWidth:    StyleSheet.hairlineWidth,
    gap:               4,
  },
  socialBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    paddingHorizontal: 10,
    paddingVertical:    8,
    borderRadius:   0,
    flex:           1,
    justifyContent: 'center',
  },
  socialBtnText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold },

  saveBtn: {
    paddingHorizontal: 10,
    paddingVertical:    8,
  },

  // ── Commentaires sheet ────────────────────────────────────────────────────
  commentsSheet: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    maxHeight:      '75%',
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    overflow:       'hidden',
  },
  commentsHandle: {
    width: 40, height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  commentsTitle: {
    fontSize:    FontSize.md,
    fontWeight:  FontWeight.extraBold,
    paddingHorizontal: Spacing[4],
    paddingBottom:     Spacing[3],
  },
  commentItem: {
    flexDirection:     'row',
    gap:               10,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: '#fff' },
  commentBody:       { flex: 1, gap: 3 },
  commentAuthor:     { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  commentText:       { fontSize: FontSize.smPlus, lineHeight: 18 },
  commentDate:       { fontSize: FontSize.xsPlus },

  commentInput: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[3],
    borderTopWidth:    StyleSheet.hairlineWidth,
    paddingBottom:     Platform.OS === 'ios' ? 28 : Spacing[3],
  },
  commentInputField: {
    flex:              1,
    borderRadius:      20,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Platform.OS === 'ios' ? 10 : 6,
    fontSize:          FontSize.base,
  },
  commentSendBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    alignItems:   'center',
    justifyContent: 'center',
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     80,
    gap:            12,
  },
  emptyText:  { fontSize: FontSize.basePlus },

  // ── Menu Drawer ────────────────────────────────────────────────────────────
  menuOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  menuDrawer: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: '72%', maxWidth: 320,
    borderLeftWidth: StyleSheet.hairlineWidth,
    elevation: 24, shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  menuHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extraBold, letterSpacing: 0.5 },
  menuCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemIcon: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  menuItemLabel: { flex: 1, fontSize: FontSize.basePlus, fontWeight: FontWeight.semiBold },

  // ── Reel play overlay (Feed preview) ──────────────────────────────────────
  reelPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
  },
  reelPlayCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Styles barre filtres + actions (nouvelle barre unifiée) ──────────────────
export const fS = StyleSheet.create({
  // Icône filtre : cercle compact, icône seule
  filterIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },

  // Icône action (messages, notifs, bookmark, live) : s'étire sur toute la largeur restante
  actionIcon: {
    paddingVertical: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dropdown vertical du filtre "Tout"
  dropdownWrap: {
    position: 'absolute',
    top: 130,
    left: 14,
    zIndex: 999,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    minWidth: 180,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  dropdownIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownLabel: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
});
