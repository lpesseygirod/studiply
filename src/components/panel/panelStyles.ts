import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

/**
 * The look of the settings panels (docs/design desktop-02 and iphone-05): Stop & summarize (step 7.3)
 * and New quiz (step 9.1b). Laptop: a centred card; iPhone (and the web below 1024 px): a full-screen
 * sheet with the buttons fixed at the bottom. Moved here unchanged from SummarizePanel.tsx.
 */
export const makePanelStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay },
    backdropNarrow: { justifyContent: 'flex-start', alignItems: 'stretch' },
    panel: { maxHeight: '92%', backgroundColor: c.card, borderRadius: 20, overflow: 'hidden' },
    sheet: { flex: 1, backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: c.border },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8, gap: 4 },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    counts: { fontSize: Typography.size.sm, color: c.text.secondary },
    // The card is as tall as its content (up to 92 %); the sheet's list fills it, the bar stays at the bottom.
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollSheet: { flex: 1 },
    body: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
    loading: { minHeight: 200, justifyContent: 'center', alignItems: 'center' },
    error: { fontSize: Typography.size.sm, color: c.error },
    label: { marginTop: 8, fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 0.8, color: c.text.secondary },
    // The laptop's resources: a 2 × 2 grid of cards.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    card: { flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: c.offWhite },
    cardHover: { backgroundColor: c.cardMuted },
    cardText: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    cardDetail: { fontSize: Typography.size.xs, color: c.text.secondary },
    always: { color: c.status.success.text },
    box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: c.accent, borderColor: c.accent },
    boxLocked: { backgroundColor: c.button.disabled, borderColor: c.button.disabled },
    // The iPhone's resources: full-width rows.
    list: { gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.offWhite },
    rowNotes: { backgroundColor: c.status.success.bg },
    rowTitle: { fontSize: Typography.size.base, color: c.text.primary },
    rowTitleBold: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    alwaysStrong: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.status.success.text },
    muted: { color: c.text.placeholder },
    adds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    add: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: c.salmon, backgroundColor: c.salmonLight, justifyContent: 'center' },
    addLater: { opacity: 0.6 },
    addText: { fontSize: Typography.size.sm, color: c.text.primary },
    tuneRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
    tuneLabel: { marginTop: 0, marginRight: 4 },
    chipsScroll: { flexGrow: 0, flexShrink: 0 },
    chips: { gap: 8, paddingVertical: 2, alignItems: 'center' },
    chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: c.accentLight, justifyContent: 'center' },
    chipText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.accentDark },
    pair: { flexDirection: 'row', gap: 28 },
    slider: { flex: 1, minWidth: 0 },
    sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    sliderName: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    sliderValue: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: c.accentDark },
    ends: { flexDirection: 'row', justifyContent: 'space-between' },
    end: { fontSize: Typography.size.xs, color: c.text.secondary },
    note: { marginTop: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: c.cardMuted },
    targets: { gap: 8 },
    target: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    targetOn: { borderColor: c.accent, backgroundColor: c.accentLight },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: c.accent },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
    noteText: { fontSize: Typography.size.sm, color: c.text.secondary },
    bold: { fontWeight: Typography.weight.bold, color: c.text.primary },
    saveWide: { gap: 2 },
    saveNarrow: { alignItems: 'center', gap: 2, paddingVertical: 4 },
    link: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    small: { fontSize: Typography.size.xs, color: c.text.secondary },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 16 },
    flex: { flex: 1, alignItems: 'center' },
    preview: { fontSize: Typography.size.xs, color: c.text.secondary, textAlign: 'center' },
    bottom: { gap: 8, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.card },
    buttons: { flexDirection: 'row', gap: 10 },
    buttonsNarrow: { width: '100%' },
    grow: { flex: 1 },
    secondary: { height: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    dim: { opacity: 0.6 },
    pressed: { opacity: 0.7 },
    // Cancel recording (Lea, 6 Nov): Discard recording, a red text button (at least 44 pt).
    discard: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
    discardNarrow: { alignSelf: 'center', paddingHorizontal: 12 },
    discardText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.error },
  });

export type PanelStyles = ReturnType<typeof makePanelStyles>;
