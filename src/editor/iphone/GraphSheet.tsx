import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { GraphForm } from '../../components/editor/GraphForm';
import type { GraphData } from '../graph/data';
import { useThemedStyles } from '../../theme/ThemeProvider';

/**
 * The iPhone's graph form: a sheet over the lower part of the
 * screen, like the formula sheet; the graph above it redraws as the student
 * types. Tapping above the sheet closes it, like Done.
 */
export function GraphSheet({
  draft,
  onChange,
  onDone,
  onDelete,
}: {
  draft: GraphData | null;
  onChange: (next: GraphData) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onDone}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.fill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Close the graph" />
        {draft && (
          <View style={styles.sheet}>
            <Text style={styles.title}>Graph</Text>
            <GraphForm value={draft} onChange={onChange} onDone={onDone} onDelete={onDelete} />
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
