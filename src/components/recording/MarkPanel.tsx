import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { MARK_NOTE_MAX, type MarkKind } from '../../editor/schema/markChip';
import { formatHitTime } from '../../utils/searchText';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { MARK_HINT_LATER, MARK_LEVEL_DEFAULT, MARK_TEXT, markHint } from '../../utils/markHints';
import { LevelSlider } from './LevelSlider';

/**
 * The mark panel (step 5.5, DESIGN "While recording"), as the mockups draw it:
 * - `row` (the laptop, docs/design desktop-01): one slim row the width of the
 *   window under the strip: "CONFUSED · AT 34:12" and the question; the
 *   slider with "1 · a bit unsure", "7 / 10" and "10 · completely lost" above
 *   it; the note; Cancel / Save mark; the hint on a line below.
 * - `sheet` (the iPhone and the web below 1024 px, docs/design iphone-03; also
 *   the laptop's popover on a mark chip): "CONFUSED · AT 34:12", the question,
 *   a large "7 / 10", the slider with its ends' words under it, the hint in a
 *   grey box, the note, one Save mark button. It is closed by dragging the
 *   sheet down or tapping outside it (the sheet's own), so it has no Cancel.
 * Opened from a mark chip in My notes it changes that mark: Done, and Remove
 * mark. A light haptic on Save (iPhone). Opening it never touches the recording.
 */
export function MarkPanel({
  kind,
  ms,
  level: startLevel,
  note: startNote,
  editing = false,
  layout = 'sheet',
  onSave,
  onCancel,
  onRemove,
}: {
  kind: MarkKind;
  /** The recording time the mark is at. */
  ms: number;
  level?: number | null;
  note?: string | null;
  /** A mark already in My notes (Done, Remove mark). */
  editing?: boolean;
  layout?: 'row' | 'sheet';
  onSave: (level: number, note: string | null) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [level, setLevel] = useState(startLevel ?? MARK_LEVEL_DEFAULT);
  const [note, setNote] = useState(startNote ?? '');
  useEffect(() => {
    setLevel(startLevel ?? MARK_LEVEL_DEFAULT);
    setNote(startNote ?? '');
  }, [kind, ms, startLevel, startNote]);

  const text = MARK_TEXT[kind];
  const save = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSave(level, note.trim() ? note.trim() : null);
  };
  const action = editing ? 'Done' : 'Save mark';
  // Shown in capitals (CSS), read as words.
  const moment = (
    <Text style={styles.moment} {...{ dataSet: { mark: 'moment' } }}>
      {text.name} · at {formatHitTime(ms)}
    </Text>
  );
  const remove = editing && onRemove && (
    <Pressable onPress={onRemove} style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Remove mark">
      <Text style={styles.remove}>Remove mark</Text>
    </Pressable>
  );
  const noteField = (placeholder: string, style: object) => (
    <TextInput
      value={note}
      onChangeText={setNote}
      placeholder={placeholder}
      placeholderTextColor={c.text.secondary}
      maxLength={MARK_NOTE_MAX}
      style={[styles.note, style]}
      returnKeyType="done"
      onSubmitEditing={save}
      accessibilityLabel="Note"
      {...{ dataSet: { mark: 'note' } }}
    />
  );

  if (layout === 'row') {
    return (
      <View style={styles.row} accessibilityLabel={`${text.name} mark`} {...{ dataSet: { mark: 'panel', kind, layout } }}>
        <View style={styles.rowMain}>
          <View style={styles.rowLeft}>
            {moment}
            <Text style={styles.rowQuestion} numberOfLines={1} {...{ dataSet: { mark: 'question' } }}>
              {text.question}
            </Text>
          </View>
          <View style={styles.rowMiddle}>
            <View style={styles.rowEnds}>
              <Text style={[styles.end, styles.rowEnd]} numberOfLines={1}>
                1 · {text.low}
              </Text>
              <Text style={styles.rowValue} {...{ dataSet: { mark: 'level' } }}>
                {level} / 10
              </Text>
              <Text style={[styles.end, styles.rowEnd, styles.endRight]} numberOfLines={1}>
                10 · {text.high}
              </Text>
            </View>
            <LevelSlider value={level} onChange={setLevel} label={text.question} thumb={16} />
          </View>
          <View style={styles.rowNote}>
            <Text style={styles.noteLabel}>Note (optional)</Text>
            {noteField(text.noteExample, styles.rowNoteField)}
          </View>
          <View style={styles.rowActions}>
            {remove}
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.outlined, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.outlinedText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} style={({ pressed }) => [styles.dark, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={action}>
              <Text style={styles.darkText}>{action}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.rowHint} {...{ dataSet: { mark: 'hint' } }}>
          {markHint(kind, level)} {MARK_HINT_LATER}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.sheet} accessibilityLabel={`${text.name} mark`} {...{ dataSet: { mark: 'panel', kind, layout } }}>
      {moment}
      <Text style={styles.sheetQuestion}>{text.question}</Text>
      <View style={styles.sheetValue} {...{ dataSet: { mark: 'level' } }}>
        <Text style={styles.sheetLevel}>{level}</Text>
        <Text style={styles.sheetOf}> / 10</Text>
      </View>
      <View>
        <LevelSlider value={level} onChange={setLevel} label={text.question} thumb={22} />
        <View style={styles.sheetEnds}>
          <Text style={styles.end} numberOfLines={1}>
            {text.low}
          </Text>
          <Text style={[styles.end, styles.endRight]} numberOfLines={1}>
            {text.high}
          </Text>
        </View>
      </View>
      <View style={styles.hintBox}>
        <Text style={styles.sheetHint} {...{ dataSet: { mark: 'hint' } }}>
          {markHint(kind, level)}
        </Text>
      </View>
      {noteField('Add a note (optional)', styles.sheetNoteField)}
      <Pressable onPress={save} style={({ pressed }) => [styles.sheetSave, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={action}>
        <Text style={styles.sheetSaveText}>{action}</Text>
      </Pressable>
      {remove}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    moment: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.bold,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.accentDark,
      fontVariant: ['tabular-nums'],
    },
    end: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.secondary },
    endRight: { textAlign: 'right' },
    note: { fontSize: Typography.size.base, color: c.text.primary, backgroundColor: c.salmonLight, borderWidth: 1, borderColor: c.salmon, paddingHorizontal: 12 },
    pressed: { opacity: 0.85 },
    removeButton: { minHeight: 38, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    remove: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.error },

    // ── The laptop's row (desktop-01) ──
    row: { gap: 10 },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: 28 },
    // Wide enough for each question on one line ("How likely on the exam?"), as desktop-01's single line.
    rowLeft: { width: 215, gap: 4 },
    rowQuestion: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    rowMiddle: { flex: 1, minWidth: 220 },
    rowEnds: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    rowEnd: { flex: 1, fontSize: Typography.size.xs },
    rowValue: { fontSize: Typography.size.md, fontWeight: Typography.weight.bold, color: c.text.primary, fontVariant: ['tabular-nums'] },
    rowNote: { width: 224, gap: 4 },
    noteLabel: { fontSize: Typography.size.xs, color: c.text.secondary },
    rowNoteField: { height: 38, borderRadius: 8 },
    rowActions: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-end' },
    outlined: { height: 38, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    outlinedText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    dark: { height: 38, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', backgroundColor: c.button.primary },
    darkText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    rowHint: { fontSize: Typography.size.xs, color: c.text.secondary },

    // ── The sheet (iphone-03) ──
    sheet: { gap: 14 },
    sheetQuestion: { marginTop: -6, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: c.text.primary },
    sheetValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
    sheetLevel: { fontSize: 44, lineHeight: 50, fontWeight: Typography.weight.bold, color: c.accentDark, fontVariant: ['tabular-nums'] },
    sheetOf: { fontSize: Typography.size.lg, color: c.text.primary },
    sheetEnds: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    hintBox: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: c.cardMuted },
    sheetHint: { fontSize: Typography.size.sm, lineHeight: 20, color: c.text.primary },
    sheetNoteField: { height: 46, borderRadius: 12 },
    sheetSave: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    sheetSaveText: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
  });
