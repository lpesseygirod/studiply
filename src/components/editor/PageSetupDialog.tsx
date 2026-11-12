import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { PAGE_COLORS } from '../../editor/editorCss';
import {
  fitMargins,
  paperCm,
  MARGIN_PRESETS,
  PAGE_GAPS,
  PAGE_NUMBERS,
  PAPER,
  presetOf,
  type MarginPreset,
  type Margins,
  type PageSetup,
  type PaperSize,
} from '../../editor/page/pageSetup';

const SIDES: { key: keyof Margins; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
];

/** "2,54" or "2.54" → 2.54; null when it isn't a number. */
const parseCm = (text: string): number | null => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(n) ? n : null;
};
const showCm = (n: number) => String(n);

/**
 * Page setup (after test D), Google Docs style, from the document's …
 * menu on both devices: orientation, paper size, margins (Normal, Narrow,
 * Wide or typed in cm), page numbers and the space between pages. Each
 * choice is a small drawn tile, and the page as set is drawn at the top
 * (the simplicity pass). OK saves it
 * on the document; "Set as default" keeps it for new documents. A centred
 * dialog on the laptop, a sheet on the iPhone.
 */
export function PageSetupDialog({
  visible,
  setup,
  pageless,
  onClose,
  onApply,
  onSetDefault,
}: {
  visible: boolean;
  setup: PageSetup;
  /** Shown in Pageless: these apply to pages and printing. */
  pageless: boolean;
  onClose: () => void;
  onApply: (setup: PageSetup) => void;
  onSetDefault: (setup: PageSetup) => Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [draft, setDraft] = useState(setup);
  const [fields, setFields] = useState<Record<keyof Margins, string>>(() => textOf(setup.margins));
  const [note, setNote] = useState<string | null>(null);

  // Opening shows the document's current setup.
  useEffect(() => {
    if (!visible) return;
    setDraft(setup);
    setFields(textOf(setup.margins));
    setNote(null);
  }, [visible, setup]);

  /** The draft with the typed margins, fitted to the paper (a note when lowered). */
  const settled = (d: PageSetup = draft): PageSetup => {
    const typed = { ...d.margins };
    for (const side of SIDES) {
      const n = parseCm(fields[side.key]);
      if (n !== null) typed[side.key] = n;
    }
    const { margins, lowered } = fitMargins(typed, d);
    if (lowered) setNote('Some margins were lowered to leave at least 5 × 5 cm of text.');
    setFields(textOf(margins));
    return { ...d, margins };
  };
  const set = (change: Partial<PageSetup>) => setDraft((d) => ({ ...d, ...change }));
  const preset = presetOf(draft.margins);

  /** A choice: its small picture, its name (and a detail under it). */
  const tile = <T extends string | number>(label: string, value: T, current: T, onPress: () => void, picture: React.ReactNode, a11y?: string, detail?: string) => (
    <Pressable
      key={String(value)}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => [styles.tile, hovered && styles.tileHover, current === value && styles.tileOn]}
      accessibilityRole="radio"
      {...a11yState({ checked: current === value })}
      accessibilityLabel={a11y ?? label}
    >
      <View style={styles.tilePicture}>{picture}</View>
      <Text style={[styles.tileText, current === value && styles.tileTextOn]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={styles.tileDetail}>{detail}</Text> : null}
    </Pressable>
  );
  const pic = (change: Partial<PageSetup>, height = TILE_PICTURE) => <PagePicture setup={{ ...draft, ...change }} height={height} />;

  const apply = () => {
    onApply(settled());
    onClose();
  };
  const setDefault = async () => {
    const s = settled();
    setDraft(s);
    try {
      await onSetDefault(s);
      setNote('Saved as the default for new documents.');
    } catch {
      setNote("The default couldn't be saved. Please try again.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close page setup" />
        <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel="Page setup">
          <View style={styles.header}>
            <Text style={styles.title}>Page setup</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.text.secondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {pageless && <Text style={styles.hint}>You&apos;re in Pageless: these apply to Pages and printing.</Text>}
            {/* The page as it is set: its shape, its text area, where the number goes. */}
            <View style={styles.preview}>
              <PagePicture setup={draft} height={PREVIEW} />
              <Text style={styles.previewText}>
                {PAPER[draft.size].label.split(' (')[0]} · {draft.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
                {'\n'}
                {preset === 'custom' ? 'Custom margins' : `${MARGIN_PRESETS[preset].label} margins`}
                {'\n'}
                {PAGE_NUMBERS.find((n) => n.value === draft.numbers)?.label === 'Off' ? 'No page numbers' : `Page numbers: ${PAGE_NUMBERS.find((n) => n.value === draft.numbers)?.label.toLowerCase()}`}
              </Text>
            </View>

            <Text style={styles.label}>Orientation</Text>
            <View style={styles.tiles}>
              {tile('Portrait', 'portrait', draft.orientation, () => set({ orientation: 'portrait' }), pic({ orientation: 'portrait' }))}
              {tile('Landscape', 'landscape', draft.orientation, () => set({ orientation: 'landscape' }), pic({ orientation: 'landscape' }))}
            </View>

            <Text style={styles.label}>Paper size</Text>
            <View style={styles.tiles}>
              {(Object.keys(PAPER) as PaperSize[]).map((size) =>
                tile(size === 'a4' ? 'A4' : 'Letter', size, draft.size, () => set({ size }), pic({ size }), size === 'a4' ? 'A4' : 'Letter', PAPER[size].label.split('(')[1].replace(')', '')),
              )}
            </View>

            <Text style={styles.label}>Margins</Text>
            <View style={styles.tiles}>
              {(Object.keys(MARGIN_PRESETS) as MarginPreset[]).map((key) =>
                tile(
                  MARGIN_PRESETS[key].label,
                  key,
                  preset,
                  () => {
                    set({ margins: MARGIN_PRESETS[key].margins });
                    setFields(textOf(MARGIN_PRESETS[key].margins));
                    setNote(null);
                  },
                  pic({ margins: MARGIN_PRESETS[key].margins }),
                  `${MARGIN_PRESETS[key].label} margins`,
                  key === 'wide' ? '2.54 / 5.08 cm' : `${MARGIN_PRESETS[key].margins.top} cm`,
                ),
              )}
            </View>
            <Text style={styles.small}>Or type them, in cm{preset === 'custom' ? ' (custom)' : ''}:</Text>
            <View style={styles.marginRow}>
              {SIDES.map((side) => (
                <View key={side.key} style={styles.marginField}>
                  <Text style={styles.small}>{side.label}</Text>
                  <TextInput
                    value={fields[side.key]}
                    onChangeText={(text) => {
                      setFields((f) => ({ ...f, [side.key]: text }));
                      const n = parseCm(text);
                      if (n !== null) set({ margins: { ...draft.margins, [side.key]: n } });
                    }}
                    onBlur={() => setDraft((d) => settled(d))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    selectTextOnFocus
                    style={styles.input}
                    accessibilityLabel={`${side.label} margin (cm)`}
                  />
                </View>
              ))}
            </View>

            <Text style={styles.label}>Page numbers</Text>
            <View style={styles.tiles}>
              {PAGE_NUMBERS.map((n) => tile(n.label, n.value, draft.numbers, () => set({ numbers: n.value }), pic({ numbers: n.value }), `Page numbers: ${n.label}`))}
            </View>

            <Text style={styles.label}>Space between pages</Text>
            <View style={styles.tiles}>
              {PAGE_GAPS.map((g) => tile(g.label, g.value, draft.gap, () => set({ gap: g.value }), <TwoPages gap={g.value} />, `Space between pages: ${g.label}`))}
            </View>

            {note && <Text style={styles.note}>{note}</Text>}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={() => void setDefault()} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Set as default</Text>
            </Pressable>
            <View style={styles.flex} />
            <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={apply} style={styles.primary} accessibilityRole="button" accessibilityLabel="Apply page setup">
              <Text style={styles.primaryText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const TILE_PICTURE = 40;
const PREVIEW = 96;

/**
 * A page drawn small: the paper's shape (to scale), its text area inside the
 * margins (with a few lines of "text"), and a dot where the page number goes.
 */
function PagePicture({ setup, height }: { setup: PageSetup; height: number }) {
  const styles = useThemedStyles(makeStyles);
  const paper = paperCm(setup);
  const k = height / Math.max(paper.height, paper.width * 0.75);
  const w = paper.width * k;
  const h = paper.height * k;
  const m = setup.margins;
  const dot = 3;
  const numberAt =
    setup.numbers === 'off'
      ? null
      : setup.numbers === 'top-right'
        ? { right: m.right * k, top: Math.max(1, (m.top * k - dot) / 2) }
        : setup.numbers === 'bottom-right'
          ? { right: m.right * k, bottom: Math.max(1, (m.bottom * k - dot) / 2) }
          : { left: (w - dot) / 2, bottom: Math.max(1, (m.bottom * k - dot) / 2) };
  const textH = Math.max(2, h - (m.top + m.bottom) * k);
  const lines = Math.max(1, Math.min(height > 60 ? 24 : 6, Math.floor(textH / 5)));
  return (
    <View style={[styles.paper, { width: w, height: h }]}>
      <View style={[styles.textArea, { left: m.left * k, right: m.right * k, top: m.top * k, bottom: m.bottom * k }]}>
        {Array.from({ length: lines }, (_, i) => (
          <View key={i} style={[styles.textLine, i === lines - 1 && { width: '60%' }]} />
        ))}
      </View>
      {numberAt && <View style={[styles.numberDot, { width: dot, height: dot }, numberAt]} />}
    </View>
  );
}

/** Two pages one under the other, `gap` apart (to scale). */
function TwoPages({ gap }: { gap: number }) {
  const styles = useThemedStyles(makeStyles);
  const space = Math.round(gap / 6);
  return (
    <View style={styles.twoPages}>
      <View style={[styles.paper, styles.halfPage]} />
      <View style={{ height: space }} />
      <View style={[styles.paper, styles.halfPage]} />
    </View>
  );
}

function textOf(m: Margins): Record<keyof Margins, string> {
  return { top: showCm(m.top), bottom: showCm(m.bottom), left: showCm(m.left), right: showCm(m.right) };
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', alignItems: 'center', backgroundColor: c.overlay },
    sheet: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '90%',
      backgroundColor: c.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: Platform.OS === 'web' ? 16 : 0,
      borderBottomRightRadius: Platform.OS === 'web' ? 16 : 0,
      overflow: 'hidden',
    },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
    title: { flex: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    close: { padding: 4 },
    body: { paddingHorizontal: 18, paddingBottom: 12, gap: 8 },
    hint: { fontSize: Typography.size.sm, color: c.text.secondary },
    label: { marginTop: 8, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    small: { fontSize: Typography.size.xs, color: c.text.secondary },
    preview: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: 12, backgroundColor: c.cardMuted },
    previewText: { flex: 1, fontSize: Typography.size.sm, lineHeight: 20, color: c.text.primary },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { minWidth: 76, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', gap: 4 },
    tileHover: { backgroundColor: c.cardMuted },
    tileOn: { borderColor: c.accentDark, backgroundColor: c.accentLight },
    tilePicture: { height: TILE_PICTURE + 2, justifyContent: 'center', alignItems: 'center' },
    tileText: { fontSize: Typography.size.sm, color: c.text.primary },
    tileTextOn: { color: c.accentDark, fontWeight: Typography.weight.semibold },
    tileDetail: { fontSize: 10, color: c.text.secondary },
    // White paper in dark mode too (the page palette, as the editor's pages).
    paper: { backgroundColor: PAGE_COLORS.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.text.placeholder, borderRadius: 1 },
    textArea: { position: 'absolute', gap: 2, paddingTop: 1, overflow: 'hidden' },
    textLine: { height: 2, borderRadius: 1, backgroundColor: PAGE_COLORS.border },
    numberDot: { position: 'absolute', borderRadius: 2, backgroundColor: c.accentDark },
    twoPages: { alignItems: 'center' },
    halfPage: { width: 26, height: 16 },
    marginRow: { flexDirection: 'row', gap: 10 },
    marginField: { flex: 1, gap: 4 },
    input: {
      height: 38,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.base,
      color: c.text.primary,
      backgroundColor: c.card,
    },
    note: { marginTop: 6, fontSize: Typography.size.sm, color: c.text.secondary },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    flex: { flex: 1 },
    secondary: { height: 38, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
    primary: { height: 38, paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
  });
