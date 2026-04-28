import { StyleSheet, Dimensions } from 'react-native';
import { BorderRadius, Spacing } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

export const profileStyles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 40 },

  // ── Avatar section ────────────────────────────────────────────────────────
  avatarSection: {
    alignItems:        'center',
    paddingVertical:   Spacing[7],
    paddingHorizontal: Spacing[6],
    marginHorizontal:  Spacing[4],
    marginTop:         Spacing[4],
    borderRadius:      BorderRadius.xl,
    overflow:          'hidden',
    gap:               8,
  },
  avatarCircle: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 3, overflow: 'hidden',
  },
  avatarGrad:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitials:  { fontSize: 34, fontWeight: '900' },
  profileName:     { fontSize: 21, fontWeight: '800', marginTop: 4 },
  profileHandle:   { fontSize: 14, fontWeight: '600' },
  profileBio:      { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },

  roleBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              5,
    paddingHorizontal: 12,
    paddingVertical:   5,
    borderRadius:     BorderRadius.full,
    borderWidth:      1,
    marginTop:        4,
  },
  roleText: { fontSize: 12, fontWeight: '700' },

  // Boutons d'action (modifier + partager)
  actionRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginTop:     6,
  },
  editBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: Spacing[4],
    paddingVertical:   9,
    borderRadius:     BorderRadius.md,
    borderWidth:      1.5,
  },
  editBtnText: { fontSize: 13, fontWeight: '700' },
  shareProfileBtn: {
    width: 38, height: 38,
    borderRadius: BorderRadius.md,
    borderWidth:  1.5,
    alignItems:   'center',
    justifyContent: 'center',
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection:    'row',
    gap:              10,
    marginHorizontal: Spacing[4],
    marginTop:        Spacing[4],
  },
  statCard: {
    flex:           1,
    alignItems:     'center',
    paddingVertical: 14,
    borderRadius:   BorderRadius.lg,
    gap:            3,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // ── Sections ──────────────────────────────────────────────────────────────
  section:      { marginHorizontal: Spacing[4], marginTop: Spacing[6] },
  sectionHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   Spacing[3],
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  sectionCount: {
    fontSize:    12,
    fontWeight:  '700',
    width:       22,
    height:      22,
    borderRadius: 11,
    textAlign:   'center',
    lineHeight:  22,
  },

  // ── À propos ──────────────────────────────────────────────────────────────
  aboutList: { gap: 12, marginTop: 4 },
  aboutRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  aboutText: { fontSize: 14, flex: 1 },

  // ── Amis (grille) ──────────────────────────────────────────────────────────
  friendsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    marginTop:     4,
  },
  friendItem: {
    width:         (SCREEN_W - Spacing[4] * 2 - 20) / 3,
    alignItems:    'center',
    paddingVertical: 12,
    borderRadius:  BorderRadius.lg,
    gap:           6,
  },
  friendAvatar: {
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden',
  },
  friendName: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },

  // ── Publications récentes ─────────────────────────────────────────────────
  pubCard: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    padding:        10,
    borderRadius:   BorderRadius.lg,
  },
  pubThumb: {
    width: 56, height: 56,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  pubBody: { flex: 1, gap: 3 },
  pubTypeBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:     BorderRadius.xs,
    alignSelf:        'flex-start',
  },
  pubTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },

  // ── Tab switch créations ───────────────────────────────────────────────────
  tabSwitch: { flexDirection: 'row', gap: 6 },
  tabSwitchBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:     BorderRadius.full,
    borderWidth:      1.5,
  },
  tabSwitchText: { fontSize: 11, fontWeight: '700' },

  subLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  subLabel:    { fontSize: 12, fontWeight: '600' },

  // ── Créations cards ───────────────────────────────────────────────────────
  creationsScroll: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  creationCard: {
    width:        160,
    borderRadius: BorderRadius.lg,
    overflow:     'hidden',
  },
  creationBanner: {
    height:         90,
    alignItems:     'center',
    justifyContent: 'center',
  },
  creationIconWrap: {
    width:          50,
    height:         50,
    borderRadius:   25,
    alignItems:     'center',
    justifyContent: 'center',
  },
  creationBody:     { padding: 10, gap: 5 },
  creationTitle:    { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  creationBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    alignSelf:        'flex-start',
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:     BorderRadius.xs,
    marginTop:        2,
  },
  creationBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // ── CTA vide ──────────────────────────────────────────────────────────────
  emptyCreation: {
    alignItems:    'center',
    paddingVertical: Spacing[6],
    gap:           12,
  },
  emptyCreationIcon: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCreationText: { fontSize: 14 },
  createCta: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: Spacing[4],
    paddingVertical:   10,
    borderRadius:     BorderRadius.full,
  },
  createCtaText: { fontSize: 13, fontWeight: '700' },
});
