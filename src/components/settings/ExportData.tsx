import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { isOffline, probe, useConnectivity } from '../../lib/connectivity';
import {
  EXPORT_OFFLINE_MESSAGE,
  ExportCancelled,
  prepareExport,
  progressLine,
  runExport,
  type ExportProgress,
  type PreparedExport,
} from '../../services/dataExport';
import { sizeText } from '../../services/dataExport/files';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { showAlert } from '../dialogs/dialogs';

/**
 * Export my data (step 10.1b-4; D4: Settings → Account and Settings → Your data, as the legal texts
 * name them). One sheet: it reads her library first and says what comes and how big ("About 1.2 GB
 * (380 MB of recordings). This can take a few minutes."; in parts of up to 500 MB when bigger),
 * Export, then a progress line and Cancel; the laptop downloads the ZIP, the iPhone opens the share
 * sheet. Needs a connection (greyed offline; checked when pressed). Also its own row in the iPhone
 * Settings list (iphone-07, after Appearance). No mockup for the sheet: Settings' rows.
 */
/**
 * Opening the sheet: the backend is asked once, now (the app's health probe), because the web only
 * learns it is offline when a request fails; offline she is told why and the sheet stays closed.
 * Shared by the row here and the iPhone Settings list's own row (iphone-07).
 */
export function useExportData(): { offline: boolean; checking: boolean; open: () => void; sheet: React.ReactNode } {
  const offline = useConnectivity() === 'offline';
  const [shown, setShown] = useState(false);
  const [checking, setChecking] = useState(false);
  const open = () => {
    if (checking) return;
    setChecking(true);
    probe()
      .catch(() => {})
      .finally(() => {
        setChecking(false);
        if (isOffline()) showAlert('Export my data', EXPORT_OFFLINE_MESSAGE);
        else setShown(true);
      });
  };
  return { offline, checking, open, sheet: shown ? <ExportDataSheet onClose={() => setShown(false)} /> : null };
}

export function ExportDataButton() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { offline, open: press, sheet } = useExportData();
  return (
    <>
      <TouchableOpacity
        style={[styles.row, offline && styles.dim]}
        onPress={press}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityHint={offline ? EXPORT_OFFLINE_MESSAGE : 'Downloads everything you have in Studiply as a ZIP file'}
        {...{ dataSet: { exportData: 'open' } }}
      >
        <Ionicons name="download-outline" size={18} color={c.accentDark} />
        <View style={styles.rowTexts}>
          <Text style={styles.rowText}>Export my data</Text>
          <Text style={styles.rowSub}>{offline ? EXPORT_OFFLINE_MESSAGE : 'Everything as a ZIP: notes, recordings, files'}</Text>
        </View>
      </TouchableOpacity>
      {sheet}
    </>
  );
}

type State =
  | { kind: 'preparing' }
  | { kind: 'ready'; prepared: PreparedExport }
  | { kind: 'running'; prepared: PreparedExport; line: string }
  | { kind: 'done'; names: string[] }
  | { kind: 'error'; message: string };

export function ExportDataSheet({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [state, setState] = useState<State>({ kind: 'preparing' });
  const controller = useRef(new AbortController());
  const busy = state.kind === 'preparing' || state.kind === 'running';

  useEffect(() => {
    const signal = controller.current.signal;
    prepareExport(signal)
      .then((prepared) => !signal.aborted && setState({ kind: 'ready', prepared }))
      .catch((err) => !signal.aborted && setState({ kind: 'error', message: errorMessage(err, 'Your data couldn’t be read. Please try again.') }));
    const ctrl = controller.current;
    return () => ctrl.abort();
  }, []);

  const cancel = () => {
    controller.current.abort();
    onClose();
  };

  const start = (prepared: PreparedExport) => {
    const signal = controller.current.signal;
    setState({ kind: 'running', prepared, line: 'Starting…' });
    const onProgress = (p: ExportProgress) => !signal.aborted && setState({ kind: 'running', prepared, line: progressLine(p) });
    runExport(prepared, { signal, onProgress })
      .then((names) => !signal.aborted && setState({ kind: 'done', names }))
      .catch((err) => {
        if (err instanceof ExportCancelled || signal.aborted) return;
        setState({ kind: 'error', message: errorMessage(err, 'The export didn’t finish. Please try again.') });
      });
  };

  const what = 'Your courses, lectures and documents (as Markdown), transcripts, marks, flashcards, quizzes and settings, your photos and PDFs, and the recordings still kept.';
  const about = (p: PreparedExport) => {
    const parts = p.parts.length;
    const size = `About ${sizeText(p.size.total)}${p.size.recordings ? ` (${sizeText(p.size.recordings)} of recordings)` : ''}. This can take a few minutes.`;
    if (parts === 1) return size;
    return `${size} It comes in ${parts} parts of up to 500 MB, ${Platform.OS === 'web' ? 'downloaded' : 'shared'} one after another.`;
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <Pressable style={styles.overlay} onPress={() => !busy && onClose()}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal {...{ dataSet: { exportData: 'sheet', state: state.kind } }}>
          <ScrollView contentContainerStyle={styles.cardBody}>
            <Text style={styles.title} accessibilityRole="header">
              Export my data
            </Text>
            <Text style={styles.text}>{what}</Text>

            {state.kind === 'preparing' && (
              <View style={styles.progress}>
                <ActivityIndicator size="small" color={c.accentDark} />
                <Text style={styles.line} {...{ dataSet: { exportData: 'line' } }}>
                  Reading your library…
                </Text>
              </View>
            )}
            {state.kind === 'ready' && (
              <Text style={styles.text} {...{ dataSet: { exportData: 'size' } }}>
                {about(state.prepared)}
              </Text>
            )}
            {state.kind === 'running' && (
              <View style={styles.progress} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={c.accentDark} />
                <Text style={styles.line} {...{ dataSet: { exportData: 'line' } }}>
                  {state.line}
                </Text>
              </View>
            )}
            {state.kind === 'done' && (
              <Text style={styles.text} {...{ dataSet: { exportData: 'done' } }}>
                {Platform.OS === 'web' ? 'Downloaded' : 'Done'}: {state.names.join(', ')}.
              </Text>
            )}
            {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}

            <View style={styles.buttons}>
              {state.kind === 'done' || state.kind === 'error' ? (
                <Pressable onPress={onClose} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { exportData: 'close' } }}>
                  <Text style={styles.primaryText}>Close</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable onPress={cancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { exportData: 'cancel' } }}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => state.kind === 'ready' && start(state.prepared)}
                    disabled={state.kind !== 'ready'}
                    style={({ pressed }) => [styles.primary, state.kind !== 'ready' && styles.off, pressed && styles.pressed]}
                    accessibilityRole="button"
                    aria-disabled={state.kind !== 'ready'}
                    {...{ dataSet: { exportData: 'start' } }}
                  >
                    <Text style={styles.primaryText}>Export</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
    rowTexts: { flex: 1, gap: 2 },
    rowText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    rowSub: { fontSize: Typography.size.sm, color: c.text.secondary },
    dim: { opacity: 0.5 },
    overlay: { flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', padding: Platform.OS === 'web' ? 24 : 0 },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '90%',
      backgroundColor: c.card,
      borderRadius: 20,
      ...(Platform.OS === 'web' ? {} : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }),
    },
    cardBody: { padding: 24, gap: 14 },
    title: { fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: c.text.primary },
    text: { fontSize: Typography.size.base, color: c.text.primary, lineHeight: 22 },
    progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    line: { flex: 1, fontSize: Typography.size.base, color: c.text.secondary },
    error: { fontSize: Typography.size.sm, color: c.error },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 4 },
    cancel: { height: 44, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    cancelText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, minWidth: 120, paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    off: { opacity: 0.4 },
    pressed: { opacity: 0.75 },
  });
