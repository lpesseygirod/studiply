import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';

import StudiplyEditor from '../../../src/editor/StudiplyEditor';
import type { StudiplyEditorHandle } from '../../../src/editor/types';
import { PAGE_COLORS } from '../../../src/editor/editorCss';
import { chipLabel } from '../../../src/editor/schema/timestampChip';
import { pasteLosses, pasteReportLine, type PasteReport } from '../../../src/editor/pasteReport';
import { chipCount, sameDocument, twentyPages, wordCount } from '../../../src/editor/spikeSample';
import { deleteSpikeDocument, loadSpikeDocument, saveSpikeDocument, SPIKE_TITLE } from '../../../src/services/editorSpike.service';
import { showAlert } from '../../../src/components/dialogs/dialogs';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';

/**
 * Step 4.2 spike (development only; removed when 4.3 starts): the editor on
 * both devices with one schema. Save here, Load on the other device, and the
 * JSON must come back identical, chips included. Paste from Google Docs or
 * Word and read the paste report; Load 20 pages to time a long document.
 */
export default function EditorSpikeScreen() {
  if (!__DEV__) return <Redirect href="/settings/account" />;
  return <EditorSpike />;
}

const kb = (json: unknown) => `${(JSON.stringify(json).length / 1024).toFixed(0)} KB`;
const ms = (start: number) => `${Math.round(performance.now() - start)} ms`;

function EditorSpike() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wide = useLayoutMode() === 'wide';
  const editor = useRef<StudiplyEditorHandle>(null);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Write something, insert a chip, then Save.');
  const [paste, setPaste] = useState<PasteReport | null>(null);
  const [typing, setTyping] = useState<{ last: number; slowest: number } | null>(null);
  const [json, setJson] = useState<string | null>(null);

  // A tap outside the editor closes the keyboard (Insert chip keeps it).
  const closeKeyboard = () => editor.current?.blur();

  const run = useCallback(async (label: string, task: () => Promise<string>) => {
    editor.current?.blur();
    setBusy(true);
    try {
      setStatus(await task());
    } catch (err) {
      setStatus(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const insertChip = () => {
    const at = Math.floor(Math.random() * 90 * 60) * 1000;
    editor.current?.insertTimestampChip(at);
    setStatus(`Inserted a chip at ${chipLabel(at)}.`);
  };

  const save = () =>
    run('Save', async () => {
      const start = performance.now();
      const doc = await editor.current!.getJSON();
      const read = ms(start);
      const writeStart = performance.now();
      await saveSpikeDocument(doc);
      return `Saved ${kb(doc)}, ${chipCount(doc)} chips · read ${read} · write ${ms(writeStart)}`;
    });

  const load = () =>
    run('Load', async () => {
      const fetchStart = performance.now();
      const saved = await loadSpikeDocument();
      if (!saved) return 'Nothing saved yet: Save on one device first.';
      const fetched = ms(fetchStart);
      const start = performance.now();
      editor.current!.setContent(saved.content);
      const back = await editor.current!.getJSON();
      const same = sameDocument(back, saved.content);
      const time = new Date(saved.updatedAt).toLocaleTimeString();
      return `Loaded (saved ${time}) · ${chipCount(back)} chips · fetch ${fetched} · editor ${ms(start)} · ${same ? 'identical to the saved JSON ✓' : 'DIFFERENT from the saved JSON ✗ (Show JSON)'}`;
    });

  const loadPages = () =>
    run('Load 20 pages', async () => {
      const doc = twentyPages();
      const start = performance.now();
      editor.current!.setContent(doc);
      await editor.current!.getJSON();
      return `20 pages: ${wordCount(doc).toLocaleString()} words, ${chipCount(doc)} chips, ${kb(doc)} · in the editor in ${ms(start)}`;
    });

  const toggleJson = async () => {
    closeKeyboard();
    if (json !== null) return setJson(null);
    const doc = await editor.current?.getJSON();
    const text = JSON.stringify(doc, null, 1) ?? '';
    setJson(text.length > 20000 ? `${text.slice(0, 20000)}\n… (${kb(doc)} in all)` : text);
  };

  const remove = () => {
    closeKeyboard();
    showAlert('Delete the spike document?', `"${SPIKE_TITLE}" is deleted for good on every device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => run('Delete', async () => ((await deleteSpikeDocument()) ? 'Spike document deleted.' : 'There was no spike document.')),
      },
    ]);
  };

  const onTyping = useCallback((t: number) => {
    setTyping((prev) => ({ last: Math.round(t), slowest: Math.max(prev?.slowest ?? 0, Math.round(t)) }));
  }, []);

  const buttons: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }[] = [
    { label: 'Insert chip', icon: 'time-outline', onPress: insertChip },
    { label: 'Save', icon: 'cloud-upload-outline', onPress: save },
    { label: 'Load', icon: 'cloud-download-outline', onPress: load },
    { label: 'Load 20 pages', icon: 'documents-outline', onPress: loadPages },
    { label: json === null ? 'Show JSON' : 'Hide JSON', icon: 'code-slash-outline', onPress: toggleJson },
    { label: 'Delete spike document', icon: 'trash-outline', onPress: remove },
  ];

  return (
    <View style={[styles.container, { paddingTop: wide ? 16 : insets.top + 4 }]}>
      {/* Everything above the editor: a tap on its empty space closes the keyboard (buttons answer their own taps). */}
      <View onStartShouldSetResponder={() => true} onResponderRelease={closeKeyboard} style={styles.above}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings/development'))} accessibilityRole="button" style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={c.accentDark} />
            <Text style={styles.backText}>Development</Text>
          </Pressable>
          <Text style={styles.title}>Editor spike</Text>
        </View>

        <View style={styles.buttons}>
          {buttons.map((b) => (
            <Pressable
              key={b.label}
              onPress={b.onPress}
              disabled={!ready || busy}
              style={[styles.button, (!ready || busy) && styles.buttonDisabled]}
              accessibilityRole="button"
              accessibilityLabel={b.label}
            >
              <Ionicons name={b.icon} size={15} color={c.accentDark} />
              <Text style={styles.buttonText}>{b.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.status} accessibilityLiveRegion="polite">{ready ? status : 'Starting the editor…'}</Text>
        {paste && (
          <Text style={styles.status}>
            Paste — {pasteReportLine(paste)}
            {pasteLosses(paste).length > 0 ? ` · lost: ${pasteLosses(paste).join(', ')}` : ' · nothing lost'}
          </Text>
        )}
        {typing && <Text style={styles.status}>Typing: last {typing.last} ms · slowest {typing.slowest} ms (key press to update)</Text>}

        {json !== null && (
          <ScrollView style={styles.json}>
            <Text selectable style={styles.jsonText}>{json}</Text>
          </ScrollView>
        )}
      </View>

      <View style={[styles.editor, { marginBottom: wide ? 16 : 0 }]}>
        <StudiplyEditor
          ref={editor}
          onReady={() => setReady(true)}
          onChipPress={(at) => setStatus(`Chip ${chipLabel(at)} tapped: would play from ${chipLabel(at)}.`)}
          onPaste={setPaste}
          onTyping={onTyping}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.cardMuted, paddingHorizontal: 12, gap: 6 },
    above: { gap: 6 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    back: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    backText: { color: c.accentDark, fontSize: Typography.size.base },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontSize: Typography.size.sm, color: c.accentDark, fontWeight: Typography.weight.medium },
    status: { fontSize: Typography.size.sm, color: c.text.secondary },
    json: { maxHeight: 180, backgroundColor: c.card, borderRadius: 8, padding: 8 },
    jsonText: { fontSize: Typography.size.xs, color: c.text.primary, fontFamily: 'Menlo' },
    // The document page is white in both appearances (editorCss).
    editor: { flex: 1, backgroundColor: PAGE_COLORS.card, borderRadius: 12, overflow: 'hidden' },
  });
