import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { PAGE_COLORS } from '../../editor/editorCss';
import StudiplyEditor from '../../editor/StudiplyEditor';
import { SheetTab } from '../sheet/SheetTab';
import type { DocJSON, StudiplyEditorHandle } from '../../editor/types';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { isOffline } from '../../lib/connectivity';
import { syncEnabled } from '../../lib/sync';
import { getVersion, listVersions, MAX_VERSION_NAME, nameVersion, type DocTab, type VersionSummary } from '../../services/document.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { confirmAction } from '../../utils/confirm';
import { errorMessage } from '../../utils/errors';
import { promptText, showAlert } from '../dialogs/dialogs';
import { SettingSwitch } from '../settings/PreferenceSettings';
import { IconButton } from '../IconButton';

const REASONS: Record<string, string> = {
  session_end: 'Edited',
  ai_generation: 'AI summary',
  restore: 'Before restore',
  conflict: 'Copy kept after a conflict',
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function dayLabel(iso: string, now = new Date()): string {
  const day = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day.toDateString() === now.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A document tab's version history: the versions grouped by day,
 * newest first, each with its kind ("Edited", "AI summary", "Before
 * restore", "Copy kept after a conflict") or the name the student gave it;
 * a read-only preview; Restore this version; Name this version (named
 * versions are never thinned out). A panel over the page on the laptop, a
 * full-screen sheet on the iPhone. Needs a connection.
 */
export function VersionHistory({
  visible,
  fileId,
  tab,
  tabName,
  sheet = false,
  onClose,
  onRestore,
}: {
  visible: boolean;
  fileId: string;
  tab: DocTab;
  /** The tab's name, said in the title when the document has more than one tab. */
  tabName?: string;
  /** A spreadsheet tab: the preview is its grid, read only. */
  sheet?: boolean;
  onClose: () => void;
  /** Brings the version's text back into the open document. */
  onRestore: (doc: DocJSON) => Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyNamed, setOnlyNamed] = useState(false);
  const [selected, setSelected] = useState<VersionSummary | null>(null);
  const [preview, setPreview] = useState<DocJSON | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<StudiplyEditorHandle>(null);
  const [previewReady, setPreviewReady] = useState(false);

  const load = useCallback(async () => {
    if (syncEnabled && isOffline()) {
      setError('Version history needs a connection.');
      return;
    }
    try {
      setError(null);
      setVersions(await listVersions(fileId, tab));
    } catch (err) {
      setError(errorMessage(err, 'Could not load the version history.'));
    }
  }, [fileId, tab]);

  useEffect(() => {
    if (!visible) return;
    setVersions(null);
    setSelected(null);
    setPreview(null);
    void load();
  }, [visible, load]);

  const select = (v: VersionSummary) => {
    setSelected(v);
    setPreview(null);
    getVersion(v.id)
      .then(setPreview)
      .catch((err) => showAlert('Could not open this version', errorMessage(err, 'Please try again.')));
  };

  useEffect(() => {
    if (preview && previewReady) previewRef.current?.loadDoc(preview);
  }, [preview, previewReady]);

  const shown = useMemo(() => (versions ?? []).filter((v) => !onlyNamed || v.name), [versions, onlyNamed]);
  const groups = useMemo(() => {
    const out: { day: string; items: VersionSummary[] }[] = [];
    for (const v of shown) {
      const day = dayLabel(v.created_at);
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(v);
    }
    return out;
  }, [shown]);

  const name = async (v: VersionSummary) => {
    const value = await promptText(v.name ? 'Rename version' : 'Name this version', {
      defaultValue: v.name ?? '',
      placeholder: 'e.g. Before the exam',
      message: `Named versions are always kept. At most ${MAX_VERSION_NAME} characters.`,
    });
    if (!value || value === v.name) return;
    try {
      const saved = await nameVersion(v.id, value);
      setVersions((list) => list?.map((x) => (x.id === v.id ? { ...x, name: saved } : x)) ?? null);
      setSelected((s) => (s?.id === v.id ? { ...s, name: saved } : s));
    } catch (err) {
      showAlert('Could not name the version', errorMessage(err, err instanceof Error ? err.message : 'Please try again.'));
    }
  };

  const removeName = async (v: VersionSummary) => {
    try {
      await nameVersion(v.id, null);
      setVersions((list) => list?.map((x) => (x.id === v.id ? { ...x, name: null } : x)) ?? null);
      setSelected((s) => (s?.id === v.id ? { ...s, name: null } : s));
    } catch (err) {
      showAlert('Could not remove the name', errorMessage(err, 'Please try again.'));
    }
  };

  const restore = async () => {
    if (!preview || !selected) return;
    const ok = await confirmAction('Restore this version?', 'The text you have now is kept in version history as "Before restore".', 'Restore');
    if (!ok) return;
    setBusy(true);
    try {
      await onRestore(preview);
      onClose();
    } catch (err) {
      showAlert('Could not restore it', errorMessage(err, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const label = (v: VersionSummary) => `${dayLabel(v.created_at)}, ${time(v.created_at)} · ${REASONS[v.reason] ?? v.reason}`;

  const list = (
    <View style={[styles.list, wide ? styles.listWide : styles.listFull]}>
      <View style={styles.listHeader}>
        <Text style={styles.heading} numberOfLines={1}>
          {tabName ? `Version history · ${tabName}` : 'Version history'}
        </Text>
        <IconButton icon="close" label="Close version history" onPress={onClose} color={c.text.primary} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Only named versions</Text>
        <SettingSwitch value={onlyNamed} onValueChange={setOnlyNamed} accessibilityLabel="Only named versions" />
      </View>
      <ScrollView contentContainerStyle={styles.listContent}>
        {error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : versions === null ? (
          <ActivityIndicator color={c.accent} style={styles.spinner} />
        ) : shown.length === 0 ? (
          <Text style={styles.empty}>{onlyNamed ? 'No named versions yet.' : 'No versions yet. One is kept each time you finish editing.'}</Text>
        ) : (
          groups.map((g) => (
            <View key={g.day}>
              <Text style={styles.day}>{g.day.toUpperCase()}</Text>
              {g.items.map((v) => {
                const active = selected?.id === v.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => select(v)}
                    style={[styles.row, active && styles.rowActive]}
                    accessibilityRole="button"
                    {...a11yState({ selected: active })}
                    accessibilityLabel={v.name ? `${v.name}, ${label(v)}` : label(v)}
                  >
                    {v.name ? <Text style={styles.rowName}>{v.name}</Text> : null}
                    <Text style={styles.rowTime}>{time(v.created_at)}</Text>
                    <Text style={styles.rowReason}>{REASONS[v.reason] ?? v.reason}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  const actions = selected && (
    <View style={styles.actions}>
      <Pressable onPress={() => name(selected)} style={styles.secondary} accessibilityRole="button">
        <Text style={styles.secondaryText}>{selected.name ? 'Rename…' : 'Name this version…'}</Text>
      </Pressable>
      {selected.name ? (
        <Pressable onPress={() => removeName(selected)} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Remove name</Text>
        </Pressable>
      ) : null}
      <View style={styles.flex} />
      <Pressable onPress={restore} disabled={!preview || busy} style={[styles.primary, (!preview || busy) && styles.disabled]} accessibilityRole="button">
        <Text style={styles.primaryText}>{busy ? 'Restoring…' : 'Restore this version'}</Text>
      </Pressable>
    </View>
  );

  const previewPane = selected ? (
    <View style={styles.preview}>
      <View style={styles.previewHeader}>
        {!wide && (
          <Pressable onPress={() => setSelected(null)} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to the versions">
            <Ionicons name="chevron-back" size={20} color={c.accentDark} />
            <Text style={styles.backText}>Versions</Text>
          </Pressable>
        )}
        <Text style={styles.previewTitle} numberOfLines={1}>
          {selected.name ?? label(selected)}
        </Text>
        {selected.name ? <Text style={styles.previewSub}>{label(selected)}</Text> : null}
      </View>
      <View style={styles.previewPage}>
        {preview && sheet ? (
          <SheetTab key={selected.id} compact={!wide} editable={false} doc={preview} />
        ) : preview ? (
          <StudiplyEditor key={selected.id} ref={previewRef} editable={false} onReady={() => setPreviewReady(true)} />
        ) : (
          <ActivityIndicator color={c.accent} style={styles.spinner} />
        )}
      </View>
      {actions}
    </View>
  ) : wide ? (
    <View style={[styles.preview, styles.center]}>
      <Text style={styles.empty}>Choose a version to see it here.</Text>
    </View>
  ) : null;

  if (wide) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.panel}>
            {list}
            {previewPane}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>{selected ? previewPane : list}</View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    overlay: { flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 32 },
    panel: {
      flexDirection: 'row',
      width: '100%',
      maxWidth: 1120,
      height: '100%',
      maxHeight: 820,
      borderRadius: Layout.cardRadius.laptop,
      overflow: 'hidden',
      backgroundColor: c.card,
    },
    sheet: { flex: 1, backgroundColor: c.card },
    list: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.border },
    listWide: { width: 320 },
    listFull: { flex: 1, borderRightWidth: 0 },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 6, paddingTop: 10 },
    heading: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8 },
    switchLabel: { fontSize: Typography.size.sm, color: c.text.secondary },
    listContent: { paddingHorizontal: 10, paddingBottom: 24 },
    day: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 0.8, color: c.text.secondary, marginTop: 14, marginBottom: 4, marginLeft: 8 },
    row: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, gap: 2 },
    rowActive: { backgroundColor: c.accentLight },
    rowName: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    rowTime: { fontSize: Typography.size.base, color: c.text.primary },
    rowReason: { fontSize: Typography.size.sm, color: c.text.secondary },
    empty: { fontSize: Typography.size.sm, color: c.text.secondary, padding: 12, lineHeight: 20 },
    spinner: { marginTop: 24 },
    center: { alignItems: 'center', justifyContent: 'center' },
    preview: { flex: 1, backgroundColor: c.cardMuted },
    previewHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 2 },
    back: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginLeft: -6 },
    backText: { fontSize: Typography.size.md, color: c.accentDark },
    previewTitle: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    previewSub: { fontSize: Typography.size.sm, color: c.text.secondary },
    previewPage: { flex: 1, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', backgroundColor: PAGE_COLORS.card },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 14 },
    secondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    secondaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    disabled: { opacity: 0.5 },
  });
