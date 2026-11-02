import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * Above the review card (desktop-07/08, iphone-10): "Card 5 of 12" / "Question 3 of 8" on the left,
 * "From your marks: 2 Exam · 1 Confused" on the right (the laptop; the iPhone shows the bar only),
 * and a thin bar filled lavender to amber as far as the session has come.
 */
export function ReviewProgress({ label, marks, done, compact }: { label: string; marks: string; done: number; compact: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const share = Math.max(0, Math.min(1, done));
  return (
    <View style={styles.wrap}>
      {!compact && (
        <View style={styles.row}>
          <Text style={styles.text} {...{ dataSet: { reviewProgress: 'label' } }}>
            {label}
          </Text>
          {!!marks && (
            <Text style={styles.text} numberOfLines={1} {...{ dataSet: { reviewProgress: 'marks' } }}>
              {marks}
            </Text>
          )}
        </View>
      )}
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}>
        <LinearGradient colors={[c.gradient.top, c.gradient.bottomEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    text: { fontSize: Typography.size.sm, color: c.text.onGradient },
    track: { height: 4, borderRadius: 2, backgroundColor: c.card, overflow: 'hidden' },
    fill: { height: 4 },
  });
