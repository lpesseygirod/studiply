import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * Record inside a document: in the laptop's row above the page
 * and the iPhone's document header. "● Record"; greyed out with the reason
 * when it can't start (another lecture records; the laptop offline).
 */
export function RecordButton({ onPress, blocked, starting }: { onPress: () => void; blocked: string | null; starting: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const off = !!blocked || starting;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      aria-disabled={off}
      style={({ pressed }) => [styles.button, !!blocked && styles.off, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Record"
      accessibilityHint={blocked ?? 'Records into this document; a plain document becomes a lecture'}
      {...{ dataSet: { recordButton: blocked ? 'blocked' : 'ready', reason: blocked ?? '' } }}
    >
      {starting ? <ActivityIndicator size="small" color={c.recordingStrip.dot} /> : <View style={styles.dot} />}
      <Text style={styles.label}>Record</Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      backgroundColor: c.recordingStrip.bg,
      borderWidth: 1,
      borderColor: c.recordingStrip.border,
    },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.recordingStrip.dot },
    label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text },
    off: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
  });
