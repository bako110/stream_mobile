import { StyleSheet, Platform, Dimensions } from 'react-native';
import { Spacing } from '../theme';
import { TAB_BAR_HEIGHT } from './layout';

const { width: SCREEN_W } = Dimensions.get('window');

// Hauteur banner responsive : ratio ~4:3 comme Facebook pour bien voir les images
export const BANNER_H = Math.round(SCREEN_W * 0.88);

export const feedStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: TAB_BAR_HEIGHT + 20 },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing[4],
    paddingTop: Platform.OS === 'android' ? 44 : 52,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    minHeight:      44,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    maxWidth:      Math.round(SCREEN_W * 0.30),
    overflow:      'hidden',
    flexShrink:    1,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
  },
  avatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700' },
  userName:   { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  headerCenter: {
    position: 'absolute', left: 0, right: 0, alignItems: 'center',
  },
  headerBrand: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
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
  filterText: { fontSize: 13, fontWeight: '700' },

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
  cardAuthorAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cardAuthorName: { fontSize: 14, fontWeight: '700' },
  cardTimeAgo:    { fontSize: 12 },

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
    fontSize:   12,
    fontWeight: '700',
  },

  // Titre + desc avant la bannière
  cardBody: {
    paddingHorizontal: Spacing[4],
    paddingTop:        4,
    paddingBottom:     Spacing[2],
  },
  cardTitle:    { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  cardDesc:     { fontSize: 13, lineHeight: 19, marginTop: 4 },
  seeMoreText:  { fontSize: 13, fontWeight: '700', marginTop: 4 },

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
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

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
    fontSize:   20,
    fontWeight: '800',
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
    fontSize:   12,
    color:      'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  bannerMetaDot: {
    fontSize: 12,
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
  likeCountText: { fontSize: 12 },

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
  socialBtnText: { fontSize: 13, fontWeight: '600' },

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
    fontSize:    16,
    fontWeight:  '800',
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
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  commentBody:       { flex: 1, gap: 3 },
  commentAuthor:     { fontSize: 13, fontWeight: '700' },
  commentText:       { fontSize: 13, lineHeight: 18 },
  commentDate:       { fontSize: 11 },

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
    fontSize:          14,
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
  emptyText:  { fontSize: 15 },

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
  menuTitle: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
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
  menuItemLabel: { flex: 1, fontSize: 15, fontWeight: '600' },

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
    height: 36,
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
    fontSize: 14,
    fontWeight: '600',
  },
});
