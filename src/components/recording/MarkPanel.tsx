import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { MARK_NOTE_MAX, type MarkKind } from '../../editor/schema/markChip';
import { formatHitTime } from '../../utils/searchText';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { MARK_LEVEL_DEFAULT, MARK_TEXT, markHint } from '../../utils/markHints';
import { LevelSlider } from './LevelSlider';

/**
 * The mark panel (step 5.5, DESIGN "While recording"): the moment's time,
 * the mark's own question, a 1–10 slider with labelled ends, an optional
 * note, a one-line hint of what the level does in the summary, Cancel /
 * Save mark (a light haptic on the iPhone). Inline under the laptop's strip,
 * in a small sheet on the iPhone. Opened from a mark chip in My notes it
 * changes that mark: Done, and Remove mark. Opening it never touches the
 * recording.
 */
export function MarkPanel({
  kind,
  ms,
  level: startLevel,
  note: startNote,
  editing = false,
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
  const tone = c.markButton[kind];
  const save = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSave(level, note.trim() ? note.trim() : null);
  };

  return (
    <View style={styles.panel} accessibilityLabel={`${text.name} mark`} {...{ dataSet: { mark: 'panel', kind } }}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.text }]}>
            {text.glyph} {text.name} · {formatHitTime(ms)}
          </Text>
        </View>
        <View style={styles.flex} />
        <Text style={styles.value} {...{ dataSet: { mark: 'level' } }}>
          {level}/10
        </Text>
      </View>
      <Text style={styles.question}>{text.question}</Text>
      <LevelSlider value={level} onChange={setLevel} color={tone.text} low={text.low} high={text.high} label={text.question} />
      <Text style={styles.hint} {...{ dataSet: { mark: 'hint' } }}>
        {markHint(kind, level)}
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Add a note (optional)"
        placeholderTextColor={c.text.secondary}
        maxLength={MARK_NOTE_MAX}
        style={styles.note}
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="Note"
        {...{ dataSet: { mark: 'note' } }}
      />
      <View style={styles.actions}>
        {editing && onRemove && (
          <Pressable onPress={onRemove} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Remove mark">
            <Text style={styles.remove}>Remove mark</Text>
          </Pressable>
        )}
        <View style={styles.flex} />
        <Pressable onPress={onCancel} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={editing ? 'Done' : 'Save mark'}>
          <Text style={styles.primaryText}>{editing ? 'Done' : 'Save mark'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { height: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: 'center' },
    badgeText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, fontVariant: ['tabular-nums'] },
    value: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary, fontVariant: ['tabular-nums'] },
    question: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    hint: { fontSize: Typography.size.sm, color: c.text.secondary },
    note: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.base,
      color: c.text.primary,
      backgroundColor: c.cardMuted,
    },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    flex: { flex: 1 },
    secondary: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
    cancel: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.secondary },
    remove: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.error },
    primary: { minHeight: 40, paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    pressed: { opacity: 0.85 },
  });
