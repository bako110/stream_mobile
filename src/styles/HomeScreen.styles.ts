import { StyleSheet, Platform, StatusBar } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 44) : 44;

export const homeStyles = StyleSheet.create({
  root: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing[4],
    paddingTop:        STATUS_H + 6,
    paddingBottom:     Spacing[3],
    gap:               10,
    zIndex:            10,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.06,
    shadowRadius:      4,
    elevation:         3,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    flex:          1,
  },
  headerAvatar: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  headerAvatarText: {
    color:      '#fff',
    fontSize:   14,
    fontWeight: '800',
  },
  headerGreeting: {
    fontSize:   11,
    fontWeight: '500',
  },
  headerName: {
    fontSize:   14,
    fontWeight: '700',
    maxWidth:   110,
  },
  headerLogoWrap: {
    position: 'absolute',
    left:     0,
    right:    0,
    alignItems: 'center',
  },
  headerLogo: {
    fontSize:      22,
    fontWeight:    '900',
    letterSpacing: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  iconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
  badge: {
    position:         'absolute',
    top:              4,
    right:            4,
    minWidth:         16,
    height:           16,
    borderRadius:     8,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: 2,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  // ── Recherche ────────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection:    'row',
    alignItems:       'center',
    height:           42,
    borderRadius:     BorderRadius.full,
    paddingHorizontal: Spacing[3],
    gap:              8,
    borderWidth:      1,
  },
  searchInput: {
    flex:     1,
    fontSize: 14,
    padding:  0,
  },

  // ── Live banner ──────────────────────────────────────────────────────────────
  liveBanner: {
    marginTop:    12,
    marginBottom: 4,
  },
  liveBannerScroll: {
    paddingHorizontal: Spacing[4],
    gap:               10,
  },
  liveCard: {
    width:        220,
    height:       120,
    borderRadius: BorderRadius.md,
    overflow:     'hidden',
    position:     'relative',
  },
  liveCardImg: {
    width:  '100%',
    height: '100%',
    alignItems:     'center',
    justifyContent: 'center',
  },
  liveCardGrad: {
    ...StyleSheet.absoluteFillObject,
  },
  liveCardContent: {
    position: 'absolute',
    bottom:   10,
    left:     10,
    right:    10,
    gap:      3,
  },
  livePill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    alignSelf:        'flex-start',
    backgroundColor:  '#FF3B30',
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:     4,
    marginBottom:     2,
  },
  liveDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  livePillText: {
    color:      '#fff',
    fontSize:   9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  liveCardTitle: {
    color:      '#fff',
    fontSize:   13,
    fontWeight: '800',
  },
  liveCardSub: {
    color:    'rgba(255,255,255,0.75)',
    fontSize: 11,
  },

  // ── Filtres ──────────────────────────────────────────────────────────────────
  listHeader: { paddingTop: 0 },
  filtersRow: {
    height:     50,
    flexShrink: 0,
    marginTop:  8,
  },
  filtersScroll: {
    paddingHorizontal: Spacing[4],
    alignItems:        'center',
    gap:               8,
  },
  filterChip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: 14,
    paddingVertical:  8,
    borderRadius:     20,
    borderWidth:      1.5,
  },
  filterChipText: {
    fontSize:   13,
    fontWeight: '700',
  },

  // ── Post card ────────────────────────────────────────────────────────────────
  post: {
    marginBottom:    10,
    marginHorizontal: Spacing[3],
    borderRadius:    BorderRadius.md,
    overflow:        'hidden',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.07,
    shadowRadius:    6,
    elevation:       2,
  },

  // En-tête auteur
  postHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: Spacing[4],
    paddingVertical:  11,
    gap:              10,
  },
  postAvatar: {
    width:          42,
    height:         42,
    borderRadius:   21,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  postAvatarText: { fontSize: 15, fontWeight: '800' },
  postMeta:       { flex: 1, gap: 1 },
  postAuthor:     { fontSize: 14, fontWeight: '700' },
  postTime:       { fontSize: 11, marginTop: 1 },
  postSaveBtn: {
    width:          34,
    height:         34,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Description
  postDesc: {
    fontSize:         13,
    lineHeight:       19,
    paddingHorizontal: Spacing[4],
    paddingBottom:    8,
  },

  // Média
  postMedia: {
    width:          '100%',
    height:         220,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  postMediaImg:     { width: '100%', height: '100%' },
  postMediaGrad:    { ...StyleSheet.absoluteFillObject },
  postMediaOverlay: {
    position: 'absolute',
    bottom:   12,
    left:     12,
    right:    12,
    gap:      3,
  },
  postMediaTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  postMediaSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  // Badges
  postBadgesRow: {
    position:      'absolute',
    top:           10,
    left:          10,
    flexDirection: 'row',
    gap:           5,
  },
  postBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 7,
    paddingVertical:  4,
    borderRadius:     5,
  },
  postBadgeDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  postBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },

  // Bouton play
  playBtn: {
    position:       'absolute',
    alignSelf:      'center',
    top:            '35%',
    width:          52,
    height:         52,
    borderRadius:   26,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  // Viewers live chip
  viewersChip: {
    position:         'absolute',
    bottom:           10,
    right:            10,
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: 8,
    paddingVertical:  4,
    borderRadius:     20,
  },

  // Meta row
  postMetaRow: {
    flexDirection:    'row',
    alignItems:       'center',
    flexWrap:         'wrap',
    gap:              10,
    paddingHorizontal: Spacing[4],
    paddingVertical:  8,
  },
  postMetaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postMetaText:  { fontSize: 12 },
  attendeesChip: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      10,
  },

  // Capacité
  capacityWrap: {
    paddingHorizontal: Spacing[4],
    paddingBottom:     8,
    gap:               4,
  },
  capacityTrack: {
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  capacityFill: {
    height:       4,
    borderRadius: 2,
  },
  capacityLabel: { fontSize: 11 },

  // Compteur likes
  postCounts: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: Spacing[4],
    paddingBottom:    4,
  },
  postCountText: { fontSize: 12 },
  likeCountDot: {
    width:          18,
    height:         18,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Actions
  postActions: {
    flexDirection:    'row',
    borderTopWidth:   StyleSheet.hairlineWidth,
    marginHorizontal: Spacing[4],
  },
  actionBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 10,
  },
  actionText: { fontSize: 13, fontWeight: '600' },

  // ── Recherche résultats ───────────────────────────────────────────────────────
  searchRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 10,
    gap:            12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchAvatar: {
    width:          44,
    height:         44,
    borderRadius:   22,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  searchAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  searchThumb: {
    width:          50,
    height:         38,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  searchRowTitle: { fontSize: 15, fontWeight: '600' },
  searchRowSub:   { fontSize: 12, marginTop: 1 },

  // ── Vide ─────────────────────────────────────────────────────────────────────
  empty: {
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 80,
    paddingHorizontal: Spacing[4],
    gap:             14,
  },
  emptyIcon: {
    width:          72,
    height:         72,
    borderRadius:   36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyDesc:  { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },

  bottomSpacer: { paddingBottom: 80 },
});
