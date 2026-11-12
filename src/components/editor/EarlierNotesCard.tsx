import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Typography } from '../../constants/typography';
import { PAGE_COLORS } from '../../editor/editorCss';

/**
 * The Summary tab of a lecture whose notes were made before documents
 * (step 4.3): a preview, until they are converted into this tab. Also says
 * when a lecture has no summary yet, with an action if there is one. On the white page.
 */
export function EarlierNotesCard({
  label,
  text,
  action,
  onAction,
}: {
  label: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.text}>{text}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 18, gap: 10, backgroundColor: PAGE_COLORS.cardMuted },
  label: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 0.8, color: PAGE_COLORS.text.secondary },
  text: { fontSize: Typography.size.base, lineHeight: 22, color: PAGE_COLORS.text.primary },
  button: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: PAGE_COLORS.button.primary,
  },
  buttonText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: PAGE_COLORS.button.primaryText },
});
