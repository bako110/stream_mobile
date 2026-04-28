import { StyleSheet, Platform } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

export const createEventStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: Spacing[4], paddingBottom: 120 },

  // ── Bannière hero ─────────────────────────────────────────────────────────
  heroBanner: {
    marginBottom:   Spacing[6],
    marginTop:      Spacing[2],
    height:         130,
    borderRadius:   BorderRadius.xl,
    overflow:       'hidden',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },
  heroTitle: { fontSize: 20, fontWeight: '800' },
  heroSub:   { fontSize: 13 },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    marginBottom: Spacing[6],
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1.2,
    marginBottom:  Spacing[3],
  },

  // ── Champ simple ──────────────────────────────────────────────────────────
  fieldWrap: {
    borderRadius:  BorderRadius.md,
    borderWidth:   1.5,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Platform.OS === 'ios' ? 14 : 10,
    marginBottom:  Spacing[3],
  },
  fieldLabel: {
    fontSize:    11,
    fontWeight:  '600',
    marginBottom: 4,
  },
  fieldInput: {
    fontSize:   15,
    padding:    0,
    margin:     0,
  },
  fieldInputMulti: {
    minHeight:  80,
    textAlignVertical: 'top',
  },

  // ── Type selector (pills) ─────────────────────────────────────────────────
  typeGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  typePill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: Spacing[3],
    paddingVertical:   7,
    borderRadius:     BorderRadius.full,
    borderWidth:      1.5,
  },
  typePillText:  { fontSize: 12, fontWeight: '700' },

  // ── Accès selector ────────────────────────────────────────────────────────
  accessRow: {
    flexDirection: 'row',
    gap:           8,
  },
  accessBtn: {
    flex:             1,
    alignItems:       'center',
    paddingVertical:  10,
    borderRadius:     BorderRadius.md,
    borderWidth:      1.5,
    gap:              4,
  },
  accessBtnLabel: { fontSize: 12, fontWeight: '700' },
  accessBtnSub:   { fontSize: 10 },

  // ── Switch en ligne ───────────────────────────────────────────────────────
  switchRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  switchLeft: { gap: 2 },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  switchSub:   { fontSize: 12 },
  toggle: {
    width: 44, height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 22, height: 22,
    borderRadius: 11,
    position: 'absolute',
  },

  // ── Barre d'actions flottante ─────────────────────────────────────────────
  actionBar: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    flexDirection:  'row',
    gap:            10,
    paddingHorizontal: Spacing[4],
    paddingTop:     Spacing[3],
    paddingBottom:  Platform.OS === 'ios' ? 34 : Spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  draftBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 13,
    borderRadius:   BorderRadius.md,
    borderWidth:    1.5,
  },
  draftBtnText: { fontSize: 14, fontWeight: '700' },
  publishBtn: {
    flex:           2,
    borderRadius:   BorderRadius.md,
    overflow:       'hidden',
  },
  publishBtnInner: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 13,
  },
  publishBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // ── Prix ──────────────────────────────────────────────────────────────────
  priceRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
  },
  currencyTag: {
    paddingHorizontal: Spacing[3],
    paddingVertical:   10,
    borderRadius:     BorderRadius.md,
    borderWidth:      1.5,
  },
  currencyText: { fontSize: 15, fontWeight: '700' },
});
