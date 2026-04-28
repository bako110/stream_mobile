import { StyleSheet } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

export const eventsStyles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: 32 },

  // ── Mes événements ────────────────────────────────────────────────────────
  mySection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[3], paddingBottom: Spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mySectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  myScroll: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], gap: 12 },
  myCard: {
    width: 160, borderRadius: BorderRadius.md, overflow: 'hidden',
  },
  myCardImg: {
    width: '100%', height: 90, alignItems: 'center', justifyContent: 'center',
  },
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
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[3],
  },
  filtersScroll: { flexDirection: 'row', gap: 8 },
  filterPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: Spacing[3],
    paddingVertical:   7,
    borderRadius:     BorderRadius.full,
    borderWidth:      1.5,
  },
  filterText: { fontSize: 12, fontWeight: '700' },

  // ── Bouton créer (FAB) ────────────────────────────────────────────────────
  fab: {
    position:       'absolute',
    bottom:         24,
    right:          20,
    borderRadius:   BorderRadius.full,
    overflow:       'hidden',
    elevation:      8,
    shadowColor:    '#7B3FF2',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.35,
    shadowRadius:   10,
  },
  fabInner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingHorizontal: Spacing[4],
    paddingVertical:   14,
  },
  fabText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // ── Event card ────────────────────────────────────────────────────────────
  card: {
    borderRadius:  BorderRadius.xl,
    overflow:      'hidden',
  },
  cardImageWrap: {
    width:          '100%',
    height:         140,
    position:       'relative',
  },
  cardImage: {
    width:          '100%',
    height:         '100%',
    resizeMode:     'cover',
  },
  cardImageOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent:  'flex-end',
    padding:         Spacing[3],
  },
  cardIconWrap: {
    width:          48,
    height:         48,
    borderRadius:   BorderRadius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cardIconEmoji: { fontSize: 24 },

  cardContent: { padding: Spacing[3], gap: 6 },

  organizerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  organizerAvatar: { width: 24, height: 24, borderRadius: 12 },
  organizerAvatarFallback: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  organizerInitials: { fontSize: 11, fontWeight: '700' },
  organizerName: { fontSize: 12, fontWeight: '600', flex: 1 },

  cardTopRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  typePill: {
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:     BorderRadius.full,
  },
  typePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  cardTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },

  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flex: 1, fontSize: 12 },

  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attendeeBar: {
    flex:         1,
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  attendeeBarFill: { height: '100%', borderRadius: 2 },
  attendeeText: { fontSize: 10, fontWeight: '600' },

  price: { fontSize: 13, fontWeight: '700' },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 4 },
  cardActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm,
  },
  cardActionText: { fontSize: 11, fontWeight: '600' },

  dateBadge: {
    position:       'absolute',
    top:            Spacing[2],
    right:          Spacing[2],
    alignItems:     'center',
    paddingHorizontal: 8,
    paddingVertical:   5,
    borderRadius:     BorderRadius.md,
  },
  dateDay: { fontSize: 18, fontWeight: '900', lineHeight: 20, color: '#fff' },
  dateMon: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: '#fff' },

  // ── Empty ─────────────────────────────────────────────────────────────────
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
