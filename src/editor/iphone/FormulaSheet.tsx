import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { FormulaForm } from '../../components/editor/FormulaForm';
import { FormulaLibrary } from '../../components/editor/FormulaLibrary';
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
 *
 * A new, still empty formula can come from the library instead (step 4.7c):
 * From the library shows the list in the same sheet; a pick puts in its
 * formula card and closes the sheet.
 */
export function FormulaSheet({
  draft,
  onChange,
  onDone,
  onRemove,
  onLibrary,
}: {
  draft: FormulaDraft | null;
  onChange: (latex: string, display: boolean) => void;
  onDone: () => void;
  onRemove: () => void;
  onLibrary?: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [library, setLibrary] = useState(false);
  const open = !!draft;
  useEffect(() => {
    if (!open) setLibrary(false);
  }, [open]);
  const offerLibrary = !!onLibrary && !!draft && !draft.existing && !draft.latex.trim();
  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onDone}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.fill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Close the formula" />
        {draft && (
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>{library ? 'Formula library' : 'Formula'}</Text>
              {(offerLibrary || library) && (
                <Pressable onPress={() => setLibrary(!library)} style={styles.switch} accessibilityRole="button" accessibilityLabel={library ? 'Back to the formula' : 'Formula from the library'}>
                  <Text style={styles.switchText}>{library ? 'Back' : 'From the library'}</Text>
                </Pressable>
              )}
            </View>
            {library && onLibrary ? (
              <View style={styles.library}>
                <FormulaLibrary autoFocus maxHeight={340} onPick={onLibrary} />
              </View>
            ) : (
              <FormulaForm latex={draft.latex} display={draft.display} onChange={onChange} onDone={onDone} onRemove={draft.existing ? onRemove : undefined} />
            )}
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
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
    title: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
    switch: { height: 32, justifyContent: 'center' },
    switchText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    library: { paddingTop: 8 },
  });
