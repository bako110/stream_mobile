import { StyleSheet, Platform } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

export const createConcertStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: Spacing[4], paddingBottom: 120 },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroBanner: {
    marginBottom:   Spacing[6],
    marginTop:      Spacing[2],
    height:         150,
    borderRadius:   BorderRadius.xl,
    overflow:       'hidden',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroSub:   { fontSize: 13 },

  liveIndicator: {
    position:      'absolute',
    top:           12,
    right:         12,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:  BorderRadius.full,
  },
  liveDot:  { width: 7, height: 7, borderRadius: 3.5 },
  liveText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },

  // ── Sections ──────────────────────────────────────────────────────────────
  section:      { marginBottom: Spacing[6] },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1.2,
    marginBottom:  Spacing[3],
  },

  // ── Champs ────────────────────────────────────────────────────────────────
  fieldWrap: {
    borderRadius:      BorderRadius.md,
    borderWidth:       1.5,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Platform.OS === 'ios' ? 14 : 10,
    marginBottom:      Spacing[3],
  },
  fieldLabel:      { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  fieldInput:      { fontSize: 15, padding: 0, margin: 0 },
  fieldInputMulti: { minHeight: 80, textAlignVertical: 'top' },

  // ── Concert type selector ─────────────────────────────────────────────────
  typeRow: {
    flexDirection: 'row',
    gap:           8,
  },
  typeBtn: {
    flex:           1,
    alignItems:     'center',
    paddingVertical: 12,
    borderRadius:   BorderRadius.md,
    borderWidth:    1.5,
    gap:            4,
  },
  typeBtnEmoji: { fontSize: 20 },
  typeBtnLabel: { fontSize: 11, fontWeight: '700' },
  typeBtnSub:   { fontSize: 10 },

  // ── Accès ─────────────────────────────────────────────────────────────────
  accessGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  accessPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: Spacing[3],
    paddingVertical:   8,
    borderRadius:     BorderRadius.full,
    borderWidth:      1.5,
  },
  accessPillText: { fontSize: 12, fontWeight: '700' },

  // ── Prix ──────────────────────────────────────────────────────────────────
  priceRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  currencyTag: {
    paddingHorizontal: Spacing[3],
    paddingVertical:   Platform.OS === 'ios' ? 22 : 18,
    borderRadius:     BorderRadius.md,
    borderWidth:      1.5,
  },
  currencyText: { fontSize: 16, fontWeight: '700' },

  // ── Switch ────────────────────────────────────────────────────────────────
  switchRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom:   Spacing[3],
  },
  switchLeft:  { gap: 2 },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  switchSub:   { fontSize: 12 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, position: 'absolute' },

  // ── Action bar ────────────────────────────────────────────────────────────
  actionBar: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    flexDirection:     'row',
    gap:               10,
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[3],
    paddingBottom:     Platform.OS === 'ios' ? 34 : Spacing[4],
    borderTopWidth:    StyleSheet.hairlineWidth,
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
  publishBtn:   { flex: 2, borderRadius: BorderRadius.md, overflow: 'hidden' },
  publishBtnInner: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 13,
  },
  publishBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
