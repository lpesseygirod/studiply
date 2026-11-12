import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { DragSheet } from '../../components/DragSheet';
import { MarkForm } from '../../components/editor/MarkForm';
import { MarkPanel } from '../../components/recording/MarkPanel';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { LinkedMark, MarkKind, MarkPlace } from '../schema/markChip';

export interface MarkDraft {
  kind: MarkKind;
  level: number | null;
  /** A chip already in the text (Done changes it; it can be removed). */
  existing: boolean;
  /** A mark made while recording: its panel instead, and where it is (Undo of Remove). */
  linked?: { mark: LinkedMark; at: MarkPlace } | null;
}

/**
 * The iPhone's mark chip sheet: its kind and level 1–10, to put
 * one in or change a chip tapped in the text. A mark made while recording
 * shows its mark panel (iphone-03): level, note, Done, Remove
 * mark. Dragging it down or tapping above it closes it.
 */
export function MarkSheet({
  draft,
  onSubmit,
  onSaveLinked,
  onRemove,
  onClose,
}: {
  draft: MarkDraft | null;
  onSubmit: (kind: MarkKind, level: number | null) => void;
  onSaveLinked: (level: number, note: string | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const linked = draft?.linked?.mark;
  return (
    <DragSheet visible={!!draft} onClose={onClose} closeLabel="Close the mark">
      {draft &&
        (linked ? (
          <MarkPanel editing kind={linked.kind} ms={linked.ms} level={linked.level} note={linked.note} onSave={onSaveLinked} onCancel={onClose} onRemove={onRemove} />
        ) : (
          <View style={styles.form}>
            <Text style={styles.title}>Mark</Text>
            <MarkForm kind={draft.kind} level={draft.level} action={draft.existing ? 'Done' : 'Insert'} onSubmit={onSubmit} onRemove={draft.existing ? onRemove : undefined} />
          </View>
        ))}
    </DragSheet>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { gap: 10 },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
