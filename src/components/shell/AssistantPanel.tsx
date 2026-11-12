import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import { useAssistant } from '../../hooks/useAssistant';
import { useRecorderState } from '../../hooks/useRecorder';
import { requestPlay } from '../../lib/playRequest';
import { AssistantChat, knownText } from '../assistant/AssistantChat';
import { useAssistantTarget } from '../assistant/assistantTarget';

/**
 * The study assistant beside a document on the laptop (docs/design
 * desktop-01, step 6.2): "Study assistant", "Knows this lecture up to
 * mm:ss", the "Recording continues" pill while this lecture records (the
 * assistant never stops it), then the conversation (AssistantChat). A time
 * in an answer plays in the document's mini player. A plain document has
 * nothing to ask about yet: the server answers from a lecture's transcript.
 */
export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const target = useAssistantTarget();
  const pathname = usePathname();
  // The document screen says what it shows.
  const lectureId = target?.isLecture && pathname.startsWith('/doc/') ? target.documentId : null;
  const chat = useAssistant(lectureId);
  // Opening the assistant never stops a recording (step 5.3): it says so, or that it is paused.
  const { status } = useRecorderState();
  const recording = status !== 'idle';
  const paused = status === 'paused';
  return (
    <View style={styles.panel} testID="assistant-panel">
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={14} color={c.accent} />
        </View>
        <View style={styles.titles}>
          <Text style={styles.title}>Study assistant</Text>
          {lectureId && (
            <Text style={styles.known} {...{ dataSet: { assistant: 'known' } }}>
              {knownText(chat.knownUpToMs)}
            </Text>
          )}
        </View>
        {recording && (
          <View style={styles.recording} {...{ dataSet: { recording: 'continues' } }}>
            <View style={[styles.recordingDot, paused && styles.recordingDotPaused]} />
            <Text style={styles.recordingText}>{paused ? 'Paused' : 'Recording\ncontinues'}</Text>
          </View>
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Hide study assistant" hitSlop={6} style={styles.close}>
          <Ionicons name="close" size={18} color={c.text.secondary} />
        </Pressable>
      </View>
      {lectureId ? (
        <AssistantChat chat={chat} layout="panel" onTime={(ms) => requestPlay({ lectureId, ms })} />
      ) : (
        <View style={styles.body}>
          <Text style={styles.text}>
            {target && pathname.startsWith('/doc/')
              ? 'The assistant answers from a lecture’s transcript. Record in this document (Record, top right) to ask about its class.'
              : 'Open a lecture to ask about it.'}
          </Text>
        </View>
      )}
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
      paddingLeft: 16,
      paddingRight: 8,
      paddingVertical: 12,
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
    titles: { flex: 1, gap: 1 },
    title: { fontSize: Typography.size.md - 1, fontWeight: Typography.weight.bold, color: c.text.primary },
    known: { fontSize: Typography.size.xs, color: c.text.secondary },
    recording: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: c.recordingStrip.bg },
    recordingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.recordingStrip.dot },
    // Paused: the dot is a ring, as on the strip.
    recordingDotPaused: { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.recordingStrip.dot },
    recordingText: { fontSize: Typography.size.xs, lineHeight: 13, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text },
    close: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
    body: { padding: 16, gap: 8 },
    text: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 20 },
  });
