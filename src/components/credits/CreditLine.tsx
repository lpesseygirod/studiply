/**
 * CreditLine.tsx
 * Step 10.2-2 (docs/reports/plan-10.2-2.md §3–§5; no mockup): the quiet credit lines.
 *  - LowCreditsLine: on Record's setup and in Library, with 1 lecture or less (or none): "1 lecture
 *    left"; at 0 "No lecture credits left. You can still record…". It opens Settings → Credits. Never
 *    dismissible, no alarm colour: secondary text on the gradient, an info icon.
 *  - CostLine: next to a panel's button that costs a part of a credit ("Uses ½ credit · 11½ left",
 *    "Included in this lecture's credit", or "Not enough credits: …" in the warning colour).
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useCreditUnits } from '../../hooks/useCredits';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { costLine, lowCreditsText } from '../../lib/credits/format';

export function LowCreditsLine({ where }: { where: 'record' | 'library' }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  // The laptop (any web) names the iPhone app; the iPhone says nothing about buying until 10.2-4.
  const text = lowCreditsText(useCreditUnits(), Platform.OS !== 'ios');
  if (!text) return null;
  return (
    <Pressable
      onPress={() => router.push('/settings/credits')}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel={`${text}. Open Credits`}
      {...{ dataSet: { credits: `low-${where}` } }}
    >
      <Ionicons name="information-circle-outline" size={16} color={c.text.onGradient} />
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

/** A panel's cost line, in the panel's preview style (`style`); null cost: nothing to say yet. */
export function CostLine({ cost, unpaidLecture, style, testId }: { cost: number | null; unpaidLecture?: boolean; style?: object; testId: string }) {
  const styles = useThemedStyles(makeStyles);
  const units = useCreditUnits();
  if (cost === null) return null;
  const line = costLine(cost, units, { unpaidLecture });
  return (
    <Text style={[style, line.short && styles.short]} {...{ dataSet: { credits: testId } }}>
      {line.text}
    </Text>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
    pressed: { opacity: 0.7 },
    text: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.onGradient },
    short: { color: c.status.warning.text },
  });
