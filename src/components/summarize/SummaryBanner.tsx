import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { showAlert } from '../dialogs/dialogs';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { LectureSummary } from '../../services/summarize.service';
import { bannerText, COMING_LATER } from './summaryCard';

const later = (what: string) => showAlert(COMING_LATER, `${what} comes in a later update.`);

/**
 * The laptop's green banner while a lecture's Summary tab holds its summary (step 7.7, desktop-03):
 * the window's full width under the top bar (the shell draws it), one line: "Summary added to this
 * document", what it was built from (cut with … when the window is too narrow, only that part), and
 * + Extend with next lecture at the right (7.9: greyed for now). No close button: the mockup has none.
 */
export function SummaryBanner({ summary }: { summary: LectureSummary | null }) {
  const styles = useThemedStyles(makeStyles);
  const r = summary?.result;
  return (
    <View style={styles.banner} accessibilityRole="summary" {...{ dataSet: { summaryBanner: 'shown' } }}>
      <Text style={styles.strong} numberOfLines={1}>
        Summary added to this document
      </Text>
      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail" {...{ dataSet: { summaryBanner: 'built' } }}>
        {r ? bannerText(r) : ''}
      </Text>
      <Pressable
        onPress={() => later('Extending a summary with the next lecture')}
        style={({ pressed }) => [styles.extend, pressed && styles.extendPressed]}
        accessibilityRole="button"
        accessibilityLabel="Extend with next lecture"
        accessibilityHint={COMING_LATER}
        accessibilityState={{ disabled: true }}
        {...{ dataSet: { summaryBanner: 'extend' } }}
      >
        <Text style={styles.extendText} numberOfLines={1}>
          + Extend with next lecture
        </Text>
      </Pressable>
    </View>
  );
}

/** The iPhone's two buttons under a summary (iphone-06): + Extend with next (7.9) and Quiz me (9.1), greyed for now. */
export function SummaryPhoneButtons() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.phone} {...{ dataSet: { summaryButtons: 'shown' } }}>
      <Pressable
        onPress={() => later('Extending a summary with the next lecture')}
        style={({ pressed }) => [styles.phoneButton, styles.phoneExtend, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Extend with next lecture"
        accessibilityHint={COMING_LATER}
        accessibilityState={{ disabled: true }}
      >
        <Text style={styles.phoneExtendText}>+ Extend with next</Text>
      </Pressable>
      <Pressable
        onPress={() => later('Quiz me')}
        style={({ pressed }) => [styles.phoneButton, styles.phoneQuiz, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Quiz me"
        accessibilityHint={COMING_LATER}
        accessibilityState={{ disabled: true }}
      >
        <Text style={styles.phoneQuizText}>Quiz me</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: c.fromNotes.bg },
    // The title never shrinks; "Built from" takes the room left and is the only part cut.
    strong: { flexShrink: 0, fontSize: Typography.size.sm, fontWeight: Typography.weight.bold, color: c.fromNotes.text },
    text: { flex: 1, minWidth: 0, fontSize: Typography.size.sm, color: c.text.secondary },
    // Greyed (not built yet), the mockup's outlined pill.
    extend: { flexShrink: 0, height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.card, justifyContent: 'center', opacity: 0.6 },
    extendPressed: { opacity: 0.45 },
    extendText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    phone: { flexDirection: 'row', gap: 10, paddingTop: 10 },
    phoneButton: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
    phoneExtend: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.card },
    phoneExtendText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
    phoneQuiz: { backgroundColor: c.button.primary },
    phoneQuizText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    pressed: { opacity: 0.45 },
  });
