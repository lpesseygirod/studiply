import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import {
  fitMargins,
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
 * Wide or typed in cm), page numbers and the gap between pages. OK saves it
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

  const segment = <T extends string | number>(label: string, value: T, current: T, onPress: () => void, a11y?: string) => (
    <Pressable
      key={String(value)}
      onPress={onPress}
      style={[styles.segment, current === value && styles.segmentOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: current === value }}
      accessibilityLabel={a11y ?? label}
    >
      <Text style={[styles.segmentText, current === value && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );

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

            <Text style={styles.label}>Orientation</Text>
            <View style={styles.segments}>
              {segment('Portrait', 'portrait', draft.orientation, () => set({ orientation: 'portrait' }))}
              {segment('Landscape', 'landscape', draft.orientation, () => set({ orientation: 'landscape' }))}
            </View>

            <Text style={styles.label}>Paper size</Text>
            <View style={styles.segments}>
              {(Object.keys(PAPER) as PaperSize[]).map((size) => segment(PAPER[size].label, size, draft.size, () => set({ size }), size === 'a4' ? 'A4' : 'Letter'))}
            </View>

            <Text style={styles.label}>Margins (cm)</Text>
            <View style={styles.segments}>
              {(Object.keys(MARGIN_PRESETS) as MarginPreset[]).map((key) =>
                segment(MARGIN_PRESETS[key].label, key, preset, () => {
                  set({ margins: MARGIN_PRESETS[key].margins });
                  setFields(textOf(MARGIN_PRESETS[key].margins));
                  setNote(null);
                }, `${MARGIN_PRESETS[key].label} margins`),
              )}
              {preset === 'custom' && <View style={[styles.segment, styles.segmentOn]}><Text style={[styles.segmentText, styles.segmentTextOn]}>Custom</Text></View>}
            </View>
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
            <View style={[styles.segments, styles.wrap]}>
              {PAGE_NUMBERS.map((n) => segment(n.label, n.value, draft.numbers, () => set({ numbers: n.value }), `Page numbers: ${n.label}`))}
            </View>

            <Text style={styles.label}>Gap between pages</Text>
            <View style={styles.segments}>{PAGE_GAPS.map((g) => segment(g.label, g.value, draft.gap, () => set({ gap: g.value }), `Gap between pages: ${g.label}`))}</View>

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
    segments: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    wrap: { flexWrap: 'wrap', alignSelf: 'stretch' },
    segment: { paddingHorizontal: 12, paddingVertical: 8 },
    segmentOn: { backgroundColor: c.accentLight },
    segmentText: { fontSize: Typography.size.sm, color: c.text.secondary },
    segmentTextOn: { color: c.accentDark, fontWeight: Typography.weight.semibold },
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
