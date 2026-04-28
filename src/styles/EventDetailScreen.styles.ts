import { StyleSheet, Platform, Dimensions } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

const { width } = Dimensions.get('window');

export const eventDetailStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: 120 },

  // ── Banner ────────────────────────────────────────────────────────────────
  banner: {
    width,
    height: width * 0.55,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bannerGrad:    { ...StyleSheet.absoluteFill },
  bannerImage:   { ...StyleSheet.absoluteFill, resizeMode: 'cover' },
  bannerIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 10,
  },
  bannerBadgesRow: {
    position:      'absolute',
    top:           14,
    left:          14,
    right:         14,
    flexDirection: 'row',
    gap:           6,
  },
  badge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 9,
    paddingVertical:   4,
    borderRadius:     BorderRadius.full,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: '#fff' },
  bannerOrganizer: {
    position:      'absolute',
    bottom:        14,
    left:          14,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
  },
  organizerAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  organizerAvatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  organizerName: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // ── Titre + pills ─────────────────────────────────────────────────────────
  infoWrap: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               8,
  },
  title:   { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 9,
    paddingVertical:   4,
    borderRadius:     BorderRadius.full,
  },
  pillText: { fontSize: 11, fontWeight: '600' },

  // ── Barre sociale ─────────────────────────────────────────────────────────
  socialBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[3],
    gap:               4,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop:         Spacing[4],
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

  // ── Partage réseaux sociaux ───────────────────────────────────────────────
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
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:     BorderRadius.md,
    borderWidth:      1.5,
  },
  shareNetworkLabel: { fontSize: 11, fontWeight: '600' },

  // ── Description ───────────────────────────────────────────────────────────
  descSection: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               8,
  },
  descTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  descText:  { fontSize: 14, lineHeight: 22 },

  // ── Métadonnées ───────────────────────────────────────────────────────────
  metaSection: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               10,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  metaTexts:  { gap: 1 },
  metaLabel:  { fontSize: 11 },
  metaValue:  { fontSize: 13, fontWeight: '700' },

  // ── Capacité barre ────────────────────────────────────────────────────────
  capacitySection: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[4],
    gap:               8,
  },
  capacityLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  capacityBar:   { height: 8, borderRadius: 4, overflow: 'hidden' },
  capacityFill:  { height: '100%', borderRadius: 4 },
  capacityRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  capacityText:  { fontSize: 12 },

  // ── CTA billet ────────────────────────────────────────────────────────────
  ctaWrap: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[3],
    paddingBottom:     Platform.OS === 'ios' ? 34 : Spacing[4],
    borderTopWidth:    StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 15,
    borderRadius:   BorderRadius.xl,
    overflow:       'hidden',
  },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ctaPrice:   { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  // ── Owner actions ──────────────────────────────────────────────────────────
  ownerActions: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  ownerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: BorderRadius.xl,
  },
  ownerBtnText: { fontSize: 14, fontWeight: '700' },

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
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
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

  // ── Divers ────────────────────────────────────────────────────────────────
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14 },
});
