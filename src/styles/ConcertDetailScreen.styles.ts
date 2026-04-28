import { StyleSheet, Platform, Dimensions } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

const { width } = Dimensions.get('window');

export const concertDetailStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: 120 },

  // ── Player / Hero ──────────────────────────────────────────────────────────
  playerWrap: {
    width,
    height: width * 0.58,
    backgroundColor: '#000',
    alignItems:      'center',
    justifyContent:  'center',
  },
  playerGrad:     { ...StyleSheet.absoluteFill },
  playerIcon:     { marginBottom: 12 },
  playerLiveBadge: {
    position:      'absolute',
    top:           16,
    left:          16,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:  BorderRadius.full,
  },
  playerLiveDot:  { width: 7, height: 7, borderRadius: 3.5 },
  playerLiveText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: '#fff' },
  playerViewers: {
    position:  'absolute',
    top:       16,
    right:     16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius: BorderRadius.full,
  },
  playerViewersText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  watchBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    paddingHorizontal: 28,
    paddingVertical:   13,
    borderRadius:     BorderRadius.full,
    marginTop:        8,
  },
  watchBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // ── Infos principales ─────────────────────────────────────────────────────
  infoWrap: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               6,
  },
  titleRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            8,
  },
  title:    { fontSize: 22, fontWeight: '800', flex: 1, lineHeight: 28 },
  subRow:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  pill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 9,
    paddingVertical:   4,
    borderRadius:     BorderRadius.full,
  },
  pillText: { fontSize: 11, fontWeight: '600' },

  // ── Artiste ───────────────────────────────────────────────────────────────
  artistRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: Spacing[4],
    paddingTop:     Spacing[4],
    paddingBottom:  Spacing[3],
  },
  artistAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  artistAvatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  artistInfo:  { flex: 1, gap: 2 },
  artistName:  { fontSize: 15, fontWeight: '700' },
  artistLabel: { fontSize: 12 },

  // ── Barre sociale ─────────────────────────────────────────────────────────
  socialBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[3],
    gap:               4,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  socialBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            5,
    paddingVertical: 8,
    borderRadius:   BorderRadius.md,
  },
  socialBtnText: { fontSize: 12, fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical:    8,
    borderRadius:      BorderRadius.md,
  },

  // ── Partage réseaux ───────────────────────────────────────────────────────
  shareSection: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               12,
  },
  shareSectionTitle: {
    fontSize:      12,
    fontWeight:    '700',
    letterSpacing: 1,
  },
  shareNetworks: {
    flexDirection: 'row',
    gap:           10,
  },
  shareNetworkBtn: {
    alignItems:     'center',
    gap:            6,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:   BorderRadius.md,
    borderWidth:    1.5,
  },
  shareNetworkLabel: { fontSize: 11, fontWeight: '600' },

  // ── Description ───────────────────────────────────────────────────────────
  descSection: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               8,
  },
  descTitle: {
    fontSize:      12,
    fontWeight:    '700',
    letterSpacing: 1,
  },
  descText: { fontSize: 14, lineHeight: 22 },

  // ── Métadonnées ───────────────────────────────────────────────────────────
  metaSection: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  metaIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  metaTexts:    { gap: 1 },
  metaLabel:    { fontSize: 11 },
  metaValue:    { fontSize: 13, fontWeight: '700' },

  // ── Owner actions bar ──────────────────────────────────────────────────────
  ownerBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ownerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: BorderRadius.xl,
  },
  ownerBtnText: { fontSize: 14, fontWeight: '700' },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: BorderRadius.xl,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ctaPrice:   { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginLeft: 4 },

  // ── Commentaires sheet ────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    maxHeight:            '75%',
    borderTopLeftRadius:  BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow:             'hidden',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf:    'center',
    marginTop:    10,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize:          16,
    fontWeight:        '800',
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
  commentInputRow: {
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
    borderRadius:      BorderRadius.full,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Platform.OS === 'ios' ? 10 : 6,
    fontSize:          14,
  },
  commentSendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Empty / loading ───────────────────────────────────────────────────────
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14 },
});
