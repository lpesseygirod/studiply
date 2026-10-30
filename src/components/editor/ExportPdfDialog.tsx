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
import { exportDocumentPdf, exportDocumentWord } from '../../services/export.service';
import type { DocTab } from '../../services/document.service';
import type { TabInfo } from '../../services/document-tabs.service';
import { errorMessage } from '../../utils/errors';

export type ExportFormat = 'pdf' | 'word';

/**
 * Export PDF… and Export Word… (steps 4.8a, 4.8b), from the document menu on
 * both devices: one dialog, opened with that format chosen (PDF / Word
 * at its top). This tab or All tabs (with more than one; each tab from a new
 * page with its name as a heading) and Page numbers (on by default, through
 * the whole file), with the document's page setup.
 * - PDF: the page view's pages. Laptop: the print dialog, where Save as PDF
 *   writes the file; iPhone: laid out in the PdfRenderer, then the share sheet.
 * - Word: a .docx (export.service); formulas and graphs as pictures (on the
 *   iPhone drawn in the PdfRenderer). Laptop: it downloads; iPhone: the share sheet.
 */
export function ExportPdfDialog({
  visible,
  format: initialFormat = 'pdf',
  onClose,
  title,
  tabs,
  current,
  setup,
  language,
  loadTab,
}: {
  visible: boolean;
  /** The format chosen when it opens. */
  format?: ExportFormat;
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
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [all, setAll] = useState(false);
  const [numbers, setNumbers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const renderer = useRef<PdfRendererHandle>(null);
  const word = format === 'word';

  useEffect(() => {
    if (!visible) return;
    setFormat(initialFormat);
    setAll(false);
    setNumbers(true);
    setError(null);
    setNotice(null);
  }, [visible, initialFormat]);

  const open = tabs.find((t) => t.tab === current);
  const several = tabs.length > 1;

  /** iPhone: the renderer mounts with "Preparing the PDF…"; wait for it. */
  const rendererReady = async (): Promise<PdfRendererHandle> => {
    for (let i = 0; i < 100; i++) {
      if (renderer.current) return renderer.current;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(word ? 'Could not make the Word file.' : 'Could not make the PDF.');
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const chosen = all && several ? tabs : open ? [open] : tabs.slice(0, 1);
      const printTabs: PrintTab[] = [];
      for (const t of chosen) {
        const content = await loadTab(t);
        printTabs.push({ title: t.title, content: t.kind === 'sheet' ? sheetTableDoc(content) : content });
      }
      const options = { setup, numbers, tabHeadings: all && several, language };
      if (word) {
        const { missing } = await exportDocumentWord({
          title,
          tabs: printTabs,
          options,
          draw: Platform.OS === 'web' ? undefined : async (requests) => (await rendererReady()).drawPictures(requests),
        });
        // Said, not hidden (a formula's LaTeX is in its place, a photo is left out).
        if (missing) {
          setNotice(`The Word file is ready, but ${missing === 1 ? '1 picture' : `${missing} pictures`} couldn’t be put in.`);
          return;
        }
      } else {
        await exportDocumentPdf({
          title,
          tabs: printTabs,
          options,
          build: Platform.OS === 'web' ? undefined : async (...args) => (await rendererReady()).build(...args),
        });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err, word ? 'Could not make the Word file. Please try again.' : 'Could not make the PDF. Please try again.'));
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
        <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel={word ? 'Export Word' : 'Export PDF'}>
          <View style={styles.header}>
            <Text style={styles.title}>{word ? 'Export Word' : 'Export PDF'}</Text>
            <Pressable onPress={onClose} disabled={busy} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={c.text.secondary} />
            </Pressable>
          </View>
          <View style={styles.body}>
            <View style={styles.formats} accessibilityRole="radiogroup" accessibilityLabel="Format">
              {(['pdf', 'word'] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => {
                    setFormat(f);
                    setNotice(null);
                  }}
                  disabled={busy}
                  style={[styles.format, format === f && styles.formatOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: format === f }}
                  aria-checked={format === f}
                  accessibilityLabel={f === 'pdf' ? 'PDF' : 'Word'}
                >
                  <Ionicons name={f === 'pdf' ? 'document-outline' : 'document-text-outline'} size={16} color={format === f ? c.accentDark : c.text.secondary} />
                  <Text style={[styles.formatText, format === f && styles.formatTextOn]}>{f === 'pdf' ? 'PDF' : 'Word (.docx)'}</Text>
                </Pressable>
              ))}
            </View>
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
              {word
                ? `${Platform.OS === 'web' ? 'The file downloads.' : 'The share sheet opens to save or send it.'} Its text stays editable in Word; formulas and graphs are pictures in it.`
                : `${Platform.OS === 'web' ? 'The print window opens: choose Save as PDF.' : 'The share sheet opens to save or send it.'} The pages are as in the page view, with the document’s page setup.`}
            </Text>
            {busy ? (
              <View style={styles.busy} accessibilityLiveRegion="polite">
                <ActivityIndicator color={c.accentDark} />
                <Text style={styles.hint}>{word ? 'Preparing the Word file…' : 'Preparing the PDF…'}</Text>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? (
              <Text style={styles.hint} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {busy && Platform.OS !== 'web' ? <PdfRenderer ref={renderer} /> : null}
          </View>
          <View style={styles.footer}>
            <View style={styles.flex} />
            <Pressable onPress={onClose} disabled={busy} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{notice ? 'Close' : 'Cancel'}</Text>
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
    formats: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6 },
    format: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    formatOn: { borderColor: c.accentDark, backgroundColor: c.cardMuted },
    formatText: { fontSize: Typography.size.sm, color: c.text.secondary },
    formatTextOn: { color: c.accentDark, fontWeight: Typography.weight.semibold },
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
