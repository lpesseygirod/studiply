import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

/** The ✓ that shows for a moment after a setting is saved. */
export function SavedMark({ visible }: { visible: boolean }) {
  const styles = useThemedStyles(makeStyles);
  if (!visible) return null;
  return (
    <Text style={styles.mark} accessibilityLabel="Saved">
      ✓
    </Text>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    mark: {
      fontSize: Typography.size.base,
      color: c.success,
      fontWeight: Typography.weight.bold,
    },
  });
