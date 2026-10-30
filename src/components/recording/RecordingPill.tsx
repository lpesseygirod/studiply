import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { clock, useRecorder, useRecordingFlow } from '../../hooks/useRecorder';
import { useRecordingActions } from './useRecordingActions';
import { savingText } from './savingText';

/**
 * The iPhone layout away from the lecture being recorded (step 5.3): a red
 * "● Recording · 12:34" pill at the top leads back to it, so another screen
 * never stops it. Also says what is still being sent after Stop, and offers
 * a recording the page lost (Continue · Finish).
 */
export function RecordingPill() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const live = useRecorder();
  const flow = useRecordingFlow();
  const actions = useRecordingActions();

  // The lecture itself shows the full recording screen.
  const onLecture = !!live.lectureId && pathname === `/doc/${live.lectureId}`;
  const top = { top: insets.top + 6 };

  if (flow.saving) {
    if (pathname === `/doc/${flow.saving.lectureId}`) return null;
    return (
      <View style={[styles.wrap, top]} pointerEvents="box-none">
        <View style={styles.pill} {...{ dataSet: { recording: 'saving' } }}>
          <View style={styles.dot} />
          <Text style={styles.text}>{savingText(flow.saving)}</Text>
        </View>
      </View>
    );
  }

  if (live.status === 'idle') {
    const lost = flow.interrupted[0];
    if (!lost) return null;
    return (
      <View style={[styles.wrap, top]} pointerEvents="box-none">
        <View style={styles.card} {...{ dataSet: { recording: 'interrupted' } }}>
          <Text style={styles.cardText} numberOfLines={2}>
            Interrupted recording · {lost.title}
          </Text>
          <View style={styles.cardButtons}>
            <Pressable onPress={() => void actions.finish(lost.lectureId)} style={[styles.button, styles.plain]} accessibilityRole="button" accessibilityLabel="Finish recording">
              <Text style={styles.plainText}>Finish</Text>
            </Pressable>
            <Pressable onPress={() => void actions.continueRecording(lost.lectureId)} style={[styles.button, styles.dark]} accessibilityRole="button" accessibilityLabel="Continue recording">
              <Text style={styles.darkText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (onLecture) return null;
  return (
    <View style={[styles.wrap, top]} pointerEvents="box-none">
      <Pressable
        onPress={() => actions.openLecture(live.lectureId!)}
        style={({ pressed }) => [styles.pill, styles.live, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Recording, ${clock(live.elapsedMs)}. Open the lecture`}
        {...{ dataSet: { recording: 'pill' } }}
      >
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>
          {live.microphoneLost ? 'Microphone disconnected' : 'Recording'} · {clock(live.elapsedMs)}
        </Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 20 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: c.recordingStrip.bg,
      borderWidth: 1,
      borderColor: c.recordingStrip.border,
      shadowColor: c.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.recordingStrip.dot },
    text: { flexShrink: 1, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text },
    live: { backgroundColor: c.recording, borderColor: c.recording },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.onRecording },
    liveText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.onRecording, fontVariant: ['tabular-nums'] },
    pressed: { opacity: 0.85 },
    card: {
      alignSelf: 'stretch',
      gap: 10,
      padding: 14,
      borderRadius: 18,
      backgroundColor: c.recordingStrip.bg,
      borderWidth: 1,
      borderColor: c.recordingStrip.border,
      shadowColor: c.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    cardText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text },
    cardButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    button: { minHeight: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    plain: { backgroundColor: c.white, borderColor: c.border },
    plainText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    dark: { backgroundColor: c.black, borderColor: c.black },
    darkText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.white },
  });
