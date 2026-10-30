import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { PageSetup } from '../../editor/page/pageSetup';
import type { DocJSON } from '../../editor/types';
import type { PrintTab } from '../../editor/export/printPages';
import { sheetTableDoc } from '../../editor/export/sheetTable';
import { PdfRenderer, type PdfRendererHandle } from '../../editor/PdfRenderer';
import { exportDocumentPdf } from '../../services/export.service';
import type { DocTab } from '../../services/document.service';
import type { TabInfo } from '../../services/document-tabs.service';
import { errorMessage } from '../../utils/errors';

/**
 * Export PDF… (step 4.8a), from the document menu on both devices: This tab
 * or All tabs (with more than one; each tab from a new page with its name as
 * a heading) and Page numbers (on by default, through the whole file). The
 * pages are the page view's, with the document's page setup. Laptop: the
 * print dialog, where Save as PDF writes the file; iPhone: the pages are
 * laid out in the PdfRenderer, then the share sheet.
 */
export function ExportPdfDialog({
  visible,
  onClose,
  title,
  tabs,
  current,
  setup,
  language,
  loadTab,
}: {
  visible: boolean;
  onClose: () => void;
  /** The document's name: the file's name and the print document's title. */
  title: string;
  tabs: TabInfo[];
  current: DocTab;
  setup: PageSetup;
  language?: string | null;
  /** A tab's content (the open one as it is now, unsaved edits too). */
  loadTab: (tab: TabInfo) => Promise<DocJSON>;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [all, setAll] = useState(false);
  const [numbers, setNumbers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renderer = useRef<PdfRendererHandle>(null);

  useEffect(() => {
    if (!visible) return;
    setAll(false);
    setNumbers(true);
    setError(null);
  }, [visible]);

  const open = tabs.find((t) => t.tab === current);
  const several = tabs.length > 1;

  /** iPhone: the renderer mounts with "Preparing the PDF…"; wait for it. */
  const rendererReady = async (): Promise<PdfRendererHandle> => {
    for (let i = 0; i < 100; i++) {
      if (renderer.current) return renderer.current;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Could not make the PDF.');
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const chosen = all && several ? tabs : open ? [open] : tabs.slice(0, 1);
      const printTabs: PrintTab[] = [];
      for (const t of chosen) {
        const content = await loadTab(t);
        printTabs.push({ title: t.title, content: t.kind === 'sheet' ? sheetTableDoc(content) : content });
      }
      await exportDocumentPdf({
        title,
        tabs: printTabs,
        options: { setup, numbers, tabHeadings: all && several, language },
        build: Platform.OS === 'web' ? undefined : async (...args) => (await rendererReady()).build(...args),
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not make the PDF. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const choice = (label: string, on: boolean, onPress: () => void, detail?: string) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ hovered }: { hovered?: boolean }) => [styles.row, hovered && styles.rowHover]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={label}
    >
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? c.accentDark : c.text.secondary} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={busy ? undefined : onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} accessibilityLabel="Close export" />
        <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel="Export PDF">
          <View style={styles.header}>
            <Text style={styles.title}>Export PDF</Text>
            <Pressable onPress={onClose} disabled={busy} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.text.secondary} />
            </Pressable>
          </View>
          <View style={styles.body}>
            {several ? (
              <>
                {choice('This tab', !all, () => setAll(false), open?.title)}
                {choice('All tabs', all, () => setAll(true), `${tabs.length} tabs, each from a new page with its name as a heading`)}
              </>
            ) : null}
            <Pressable
              onPress={() => setNumbers((n) => !n)}
              disabled={busy}
              style={({ hovered }: { hovered?: boolean }) => [styles.row, hovered && styles.rowHover]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: numbers }}
              aria-checked={numbers}
              accessibilityLabel="Page numbers"
            >
              <Ionicons name={numbers ? 'checkbox' : 'square-outline'} size={20} color={numbers ? c.accentDark : c.text.secondary} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Page numbers</Text>
                <Text style={styles.rowDetail}>Through the whole file, where the page setup puts them</Text>
              </View>
            </Pressable>
            <Text style={styles.hint}>
              {Platform.OS === 'web' ? 'The print window opens: choose Save as PDF.' : 'The share sheet opens to save or send it.'} The pages are as in the page view, with the document’s page setup.
            </Text>
            {busy ? (
              <View style={styles.busy} accessibilityLiveRegion="polite">
                <ActivityIndicator color={c.accentDark} />
                <Text style={styles.hint}>Preparing the PDF…</Text>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {busy && Platform.OS !== 'web' ? <PdfRenderer ref={renderer} /> : null}
          </View>
          <View style={styles.footer}>
            <View style={styles.flex} />
            <Pressable onPress={onClose} disabled={busy} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void run()} disabled={busy} style={[styles.primary, busy && styles.off]} accessibilityRole="button" accessibilityLabel="Export">
              <Text style={styles.primaryText}>Export</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', alignItems: 'center', backgroundColor: c.overlay },
    sheet: {
      width: '100%',
      maxWidth: 440,
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
    body: { paddingHorizontal: 12, paddingBottom: 12, gap: 2 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 10 },
    rowHover: { backgroundColor: c.cardMuted },
    rowText: { flex: 1, gap: 2 },
    rowLabel: { fontSize: Typography.size.base, color: c.text.primary },
    rowDetail: { fontSize: Typography.size.xs, color: c.text.secondary },
    hint: { paddingHorizontal: 6, paddingTop: 6, fontSize: Typography.size.sm, color: c.text.secondary },
    busy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingTop: 6 },
    error: { paddingHorizontal: 6, paddingTop: 6, fontSize: Typography.size.sm, color: c.error },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    flex: { flex: 1 },
    secondary: { height: 38, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
    primary: { height: 38, paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    off: { opacity: 0.5 },
  });
