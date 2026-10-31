import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { lecturesForPicker, type PickLecture } from '../../services/summaryCombine.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { closeLecturePicker, useLecturePicker, type PickRequest } from './combineState';
import { openSummarize } from './summarizePanelState';

const TITLES = { extend: 'Extend with next lecture', merge: 'Merge lectures', exam_pack: 'Make exam pack' } as const;
const HINTS = {
  extend: 'Pick the lecture to add. Only what’s new is added; repeats become comments on what’s there.',
  merge: 'Pick the lectures to combine into one Unit summary (each needs a summary).',
  exam_pack: 'The exam pack is built from these lectures’ summaries.',
} as const;

/**
 * Step 7.9: which lectures (MoveToModal's list, the summarize panel's check rows): Extend picks one
 * later lecture (the next one chosen), Merge two or more with a summary, Exam pack all with a summary
 * (chosen). Then the summarize panel, as for a summary. Drawn once by the app's layout.
 */
export function LecturePicker() {
  const request = useLecturePicker();
  if (!request) return null;
  return <Picker key={`${request.mode}:${request.courseId}:${request.folderId}:${request.baseLectureId}`} request={request} />;
}

function Picker({ request }: { request: PickRequest }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useLayoutMode() === 'wide';
  const { mode, baseLectureId } = request;
  const [lectures, setLectures] = useState<PickLecture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    lecturesForPicker(request.courseId, request.folderId)
      .then((list) => {
        setLectures(list);
        const base = list.findIndex((l) => l.id === baseLectureId);
        if (mode === 'extend') {
          const next = list.slice(base + 1)[0];
          setPicked(new Set(next ? [next.id] : []));
        } else if (mode === 'exam_pack') setPicked(new Set(list.filter((l) => l.hasSummary).map((l) => l.id)));
      })
      .catch((err) => setError(errorMessage(err, 'Could not load the lectures.')));
  }, [request.courseId, request.folderId, baseLectureId, mode]);

  const base = lectures?.find((l) => l.id === baseLectureId) ?? null;
  // Extend: the lectures after the one extended (any later one); Merge and Exam pack: all.
  const rows = useMemo(() => {
    if (!lectures) return [];
    if (mode !== 'extend') return lectures;
    const at = lectures.findIndex((l) => l.id === baseLectureId);
    return lectures.slice(at + 1);
  }, [lectures, mode, baseLectureId]);
  const can = (l: PickLecture) => mode === 'extend' || l.hasSummary;
  const toggle = (l: PickLecture) => {
    if (!can(l)) return;
    setPicked((p) => {
      if (mode === 'extend') return new Set([l.id]);
      const next = new Set(p);
      if (next.has(l.id)) next.delete(l.id);
      else next.add(l.id);
      return next;
    });
  };
  const chosen = (lectures ?? []).filter((l) => picked.has(l.id));
  // Extend needs the lecture extended to have a summary (the one added may not: it's written first).
  const ready = mode === 'extend' ? !!base?.hasSummary && chosen.length === 1 : mode === 'merge' ? chosen.length >= 2 : chosen.length >= 1;
  const go = () => {
    if (!ready || !lectures) return;
    const list = mode === 'extend' ? [base!, ...chosen] : chosen;
    closeLecturePicker();
    openSummarize({
      lectureId: list[0].id,
      recording: false,
      combine: { mode, lectureIds: list.map((l) => l.id), numbers: list.map((l) => l.number), titles: list.map((l) => `${l.number} · ${l.title}`), courseId: request.courseId, folderId: request.folderId },
    });
  };

  const row = (l: PickLecture) => {
    const on = picked.has(l.id);
    const off = !can(l);
    return (
      <Pressable
        key={l.id}
        onPress={() => toggle(l)}
        disabled={off}
        style={[styles.row, on && styles.rowOn, off && styles.rowOff]}
        accessibilityRole={mode === 'extend' ? 'radio' : 'checkbox'}
        accessibilityState={{ checked: on, disabled: off }}
        {...{ dataSet: { picker: 'lecture', checked: String(on), summary: String(l.hasSummary) } }}
      >
        <View style={[mode === 'extend' ? styles.radio : styles.box, on && styles.markOn]}>{on && <Ionicons name="checkmark" size={14} color={c.accentOn} />}</View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            Lecture {l.number} · {l.title}
          </Text>
          <Text style={styles.rowDetail}>{l.hasSummary ? 'Has a summary' : mode === 'extend' ? 'No summary yet: it’s written first' : 'No summary yet'}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={closeLecturePicker}>
      <View style={[styles.backdrop, !wide && styles.backdropNarrow]}>
        {wide && <Pressable style={StyleSheet.absoluteFill} onPress={closeLecturePicker} accessibilityLabel="Cancel" />}
        <View style={wide ? styles.card : [styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal {...{ dataSet: { picker: 'panel', mode } }}>
          <Text style={styles.title} accessibilityRole="header">
            {TITLES[mode]}
          </Text>
          <Text style={styles.hint}>{HINTS[mode]}</Text>
          {base && (
            <View style={[styles.row, styles.rowBase]} {...{ dataSet: { picker: 'base', summary: String(base.hasSummary) } }}>
              <Ionicons name="document-text-outline" size={18} color={c.text.secondary} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  Lecture {base.number} · {base.title}
                </Text>
                <Text style={styles.rowDetail}>{base.hasSummary ? 'The summary it’s added to' : 'No summary yet: summarize it first'}</Text>
              </View>
            </View>
          )}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {error ? <Text style={styles.error}>{error}</Text> : !lectures ? <ActivityIndicator color={c.accent} /> : rows.length ? rows.map(row) : <Text style={styles.hint}>{mode === 'extend' ? 'No later lecture in this course yet.' : 'No lectures here yet.'}</Text>}
          </ScrollView>
          <View style={styles.buttons}>
            <Pressable onPress={closeLecturePicker} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { picker: 'cancel' } }}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={go} disabled={!ready} style={({ pressed }) => [styles.primary, !ready && styles.dim, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { picker: 'continue' } }}>
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay },
    backdropNarrow: { justifyContent: 'flex-end', alignItems: 'stretch' },
    card: { width: 520, maxWidth: '92%', maxHeight: '86%', padding: 24, gap: 12, borderRadius: 20, backgroundColor: c.card },
    sheet: { maxHeight: '88%', paddingHorizontal: 20, paddingTop: 20, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: c.card },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    hint: { fontSize: Typography.size.sm, color: c.text.secondary },
    error: { fontSize: Typography.size.sm, color: c.error },
    list: { flexGrow: 0, flexShrink: 1 },
    listContent: { gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: c.offWhite },
    rowOn: { backgroundColor: c.accentLight },
    rowOff: { opacity: 0.5 },
    rowBase: { backgroundColor: c.status.success.bg },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    rowDetail: { fontSize: Typography.size.xs, color: c.text.secondary },
    box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    markOn: { backgroundColor: c.accent, borderColor: c.accent },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
    secondary: { height: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    dim: { opacity: 0.6 },
    pressed: { opacity: 0.7 },
  });
