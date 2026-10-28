import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { FormulaForm } from '../../components/editor/FormulaForm';
import { useThemedStyles } from '../../theme/ThemeProvider';

export interface FormulaDraft {
  latex: string;
  display: boolean;
  /** A formula already in the text (it can be removed). */
  existing: boolean;
}

/**
 * The iPhone's formula editor (step 4.5): a sheet over the lower part of the
 * screen, with its own keyboard (letters and numbers, no autocorrect). The
 * formula in the text above changes as the student types, so the text is
 * the preview. Tapping above the sheet closes it, like Done.
 */
export function FormulaSheet({
  draft,
  onChange,
  onDone,
  onRemove,
}: {
  draft: FormulaDraft | null;
  onChange: (latex: string, display: boolean) => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onDone}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.fill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Close the formula" />
        {draft && (
          <View style={styles.sheet}>
            <Text style={styles.title}>Formula</Text>
            <FormulaForm latex={draft.latex} display={draft.display} onChange={onChange} onDone={onDone} onRemove={draft.existing ? onRemove : undefined} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    title: { paddingHorizontal: 16, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
