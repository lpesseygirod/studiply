import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import { useRecorderState } from '../../hooks/useRecorder';

/** The study assistant beside a document on the laptop (docs/design desktop-01). Built in Phase 6. */
export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  // Opening the assistant never stops a recording (step 5.3): it says so.
  const recording = useRecorderState().status !== 'idle';
  return (
    <View style={styles.panel} testID="assistant-panel">
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={14} color={c.accent} />
        </View>
        <Text style={styles.title}>Study assistant</Text>
        {recording && (
          <View style={styles.recording} {...{ dataSet: { recording: 'continues' } }}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording continues</Text>
          </View>
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Hide study assistant" hitSlop={6} style={styles.close}>
          <Ionicons name="close" size={18} color={c.text.secondary} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.soon}>Comes in Phase 6</Text>
        <Text style={styles.text}>
          Ask about the lecture while you record or study; answers come from its transcript and can be added to your notes.
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  panel: {
    width: Layout.assistantWidth,
    backgroundColor: c.white,
    borderLeftWidth: 1,
    borderLeftColor: c.surfaceMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: c.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.primary },
  recording: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: c.recordingStrip.bg },
  recordingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.recordingStrip.dot },
  recordingText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  body: { padding: 16, gap: 8 },
  soon: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.accentDark,
    letterSpacing: Typography.tracking.wide,
    textTransform: 'uppercase',
  },
  text: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 20 },
});
