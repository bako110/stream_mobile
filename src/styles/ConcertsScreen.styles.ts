import { StyleSheet } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

export const concertsStyles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: 32 },

  // ── Mes concerts ──────────────────────────────────────────────────────────
  mySection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[3], paddingBottom: Spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mySectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  myScroll: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], gap: 12 },
  myCard: { width: 160, borderRadius: BorderRadius.md, overflow: 'hidden' },
  myCardImg: { width: '100%', height: 90, alignItems: 'center', justifyContent: 'center' },
  myCardBadge: {
    alignSelf: 'flex-start', marginHorizontal: 8, marginTop: 6,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.xs,
  },
  myCardBadgeText: { fontSize: 9, fontWeight: '800' },
  myCardTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6 },
  myCardActions: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingBottom: 8 },
  myCardBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 5, borderRadius: BorderRadius.sm,
  },
  myCardBtnText: { fontSize: 11, fontWeight: '600' },
  myAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full,
  },
  myAddBtnText: { fontSize: 12, fontWeight: '700' },
  myEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: Spacing[4], marginVertical: Spacing[2],
    padding: Spacing[3], borderRadius: BorderRadius.md,
  },
  myEmptyText: { fontSize: 13, flex: 1 },

  // ── Filtres ───────────────────────────────────────────────────────────────
  filtersWrap: {
    flexDirection:    'row',
    gap:              8,
    paddingHorizontal: Spacing[4],
    paddingVertical:  Spacing[3],
  },
  filterBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: Spacing[3],
    paddingVertical:   8,
    borderRadius:     BorderRadius.full,
    borderWidth:      1.5,
    overflow:         'hidden',
    elevation:        2,
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.15,
    shadowRadius:     4,
  },
  filterBtnGrad: { ...StyleSheet.absoluteFill },
  filterText:    { fontSize: 13, fontWeight: '700' },

  // ── Concert card ──────────────────────────────────────────────────────────
  card: {
    borderRadius: BorderRadius.xl,
    overflow:     'hidden',
  },

  thumbWrap: { position: 'relative' },
  thumb: {
    width:          '100%',
    height:         160,
    alignItems:     'center',
    justifyContent: 'center',
  },
  thumbEmoji:   { fontSize: 52 },
  thumbOverlay: { ...StyleSheet.absoluteFill },

  liveBadge: {
    position:         'absolute',
    top:              10,
    left:             10,
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:     BorderRadius.full,
  },
  liveDot:       { width: 7, height: 7, borderRadius: 3.5 },
  liveBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  viewersBadge: {
    position:         'absolute',
    bottom:           10,
    right:            10,
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:     BorderRadius.full,
  },
  viewersText: { fontSize: 10, fontWeight: '600', color: '#fff' },

  cardBody: { padding: Spacing[4], gap: 6 },
  cardTopRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            8,
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSub:   { fontSize: 13 },

  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: 12 },

  pricePill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  priceText:    { fontSize: 11, fontWeight: '700' },
  typePill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  typePillText: { fontSize: 11, fontWeight: '600' },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 4 },
  cardActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm,
  },
  cardActionText: { fontSize: 11, fontWeight: '600' },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: 12,
  },
  emptyText: { fontSize: 15 },

  // ── Recherche ─────────────────────────────────────────────────────────────
  searchWrap: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    paddingHorizontal: Spacing[4],
    paddingVertical:  10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex:     1,
    fontSize: 14,
    padding:  0,
  },
});
