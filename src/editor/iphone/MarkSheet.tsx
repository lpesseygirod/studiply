import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { MarkForm } from '../../components/editor/MarkForm';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { MarkKind } from '../schema/markChip';

export interface MarkDraft {
  kind: MarkKind;
  level: number | null;
  /** A chip already in the text (Done changes it; it can be removed). */
  existing: boolean;
}

/**
 * The iPhone's mark chip sheet (step 4.6): its kind and level 1–10, to put
 * one in or change a chip tapped in the text. Tapping above it closes it.
 */
export function MarkSheet({
  draft,
  onSubmit,
  onRemove,
  onClose,
}: {
  draft: MarkDraft | null;
  onSubmit: (kind: MarkKind, level: number | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the mark" />
      {draft && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.title}>Mark</Text>
          <MarkForm kind={draft.kind} level={draft.level} action={draft.existing ? 'Done' : 'Insert'} onSubmit={onSubmit} onRemove={draft.existing ? onRemove : undefined} />
        </View>
      )}
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    sheet: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
