import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { clock, useRecorder, useRecordingFlow } from '../../hooks/useRecorder';
import { useRecordingActions } from './useRecordingActions';
import { Waveform } from './Waveform';
import { savingText } from './savingText';
import { MarkPanel } from './MarkPanel';
import { closeMarkPanel, openMarkPanel, saveNewMark, useMarkPanel } from './markPanelState';

/**
 * The laptop's recording strip (step 5.3, docs/design desktop-01): under the
 * top bar on every screen while a lecture records, so leaving the lecture
 * never stops it. "● Recording · 34:12" (back to the lecture), the live
 * waveform, the mark buttons (step 5.5: each opens its panel inline under
 * the strip), Photo board (disabled until 5.6) and Stop & summarize. After
 * Stop it says what is still being sent; a recording the page lost offers
 * Continue and Finish.
 */
export function RecordingStrip() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const live = useRecorder();
  const flow = useRecordingFlow();
  const actions = useRecordingActions();
  const draft = useMarkPanel();

  if (flow.saving) {
    return (
      <View style={styles.strip} {...{ dataSet: { recording: 'strip' } }}>
        <View style={styles.dot} />
        <Text style={styles.label} {...{ dataSet: { recording: 'saving' } }}>
          {savingText(flow.saving)}
        </Text>
      </View>
    );
  }

  if (live.status === 'idle') {
    const lost = flow.interrupted[0];
    if (!lost) return null;
    return (
      <View style={styles.strip} {...{ dataSet: { recording: 'interrupted' } }}>
        <View style={styles.dot} />
        <Text style={styles.label} numberOfLines={1}>
          Interrupted recording · {lost.title}
        </Text>
        <View style={styles.spacer} />
        <Pressable onPress={() => void actions.finish(lost.lectureId)} style={[styles.pill, styles.plain]} accessibilityRole="button" accessibilityLabel="Finish recording">
          <Text style={styles.plainText}>Finish</Text>
        </Pressable>
        <Pressable onPress={() => void actions.continueRecording(lost.lectureId)} style={[styles.pill, styles.stop]} accessibilityRole="button" accessibilityLabel="Continue recording">
          <Text style={styles.stopText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  const lectureId = live.lectureId!;
  const paused = live.status === 'paused';
  const markable = live.status === 'recording' || live.status === 'paused';
  return (
    <View>
    <View style={styles.strip} {...{ dataSet: { recording: 'strip' } }}>
      <Pressable
        onPress={() => actions.openLecture(lectureId)}
        style={styles.timer}
        accessibilityRole="button"
        accessibilityLabel={`${paused ? 'Paused' : 'Recording'}, ${clock(live.elapsedMs)}. Open the lecture`}
      >
        <View style={[styles.dot, paused && styles.dotPaused]} />
        <Text style={styles.label} {...{ dataSet: { recording: 'timer' } }}>
          {live.microphoneLost ? 'Microphone disconnected' : paused ? 'Paused' : 'Recording'} · {clock(live.elapsedMs)}
        </Text>
      </Pressable>
      {live.microphoneLost ? (
        <Pressable onPress={() => void actions.resume()} style={[styles.pill, styles.plain]} accessibilityRole="button" accessibilityLabel="Resume recording">
          <Text style={styles.plainText}>Resume</Text>
        </Pressable>
      ) : (
        <>
          {/* Pause (Lea, 30 Oct): beside the timer; ▶ goes on. */}
          <Pressable
            onPress={() => void (paused ? actions.resume() : actions.pause())}
            disabled={live.status === 'stopping'}
            aria-disabled={live.status === 'stopping'}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume recording' : 'Pause recording'}
            {...{ dataSet: { recording: 'pause' } }}
          >
            <Ionicons name={paused ? 'play' : 'pause'} size={14} color={c.recordingStrip.text} />
          </Pressable>
          <View style={[styles.wave, paused && styles.waveStill]}>
            <Waveform levels={live.levels} color={c.recordingStrip.wave} height={24} />
          </View>
        </>
      )}
      <View style={styles.spacer} />
      {/* The marks (step 5.5): each opens its panel under the strip; the recording goes on. */}
      {MARK_BUTTONS.map((b) => (
        <Pressable
          key={b.kind}
          onPress={() => (draft?.kind === b.kind ? closeMarkPanel() : openMarkPanel(b.kind))}
          disabled={!markable}
          aria-disabled={!markable}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: c.markButton[b.kind].bg },
            draft?.kind === b.kind && { borderColor: c.markButton[b.kind].text },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: draft?.kind === b.kind }}
          accessibilityLabel={b.label}
          {...{ dataSet: { markButton: b.kind } }}
        >
          <Text style={[styles.markText, { color: c.markButton[b.kind].text }]}>{b.text}</Text>
        </Pressable>
      ))}
      {/* Board photos (5.6) come next: shown, disabled. */}
      <Pressable
        disabled
        aria-disabled
        style={[styles.pill, styles.quiet]}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel="Photo board"
      >
        <Text style={styles.quietText}>Photo board</Text>
      </Pressable>
      <Pressable
        onPress={() => void actions.stop()}
        disabled={live.status === 'stopping'}
        aria-disabled={live.status === 'stopping'}
        style={({ pressed }) => [styles.pill, styles.stop, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Stop and summarize"
      >
        <Text style={styles.stopText}>Stop & summarize</Text>
      </Pressable>
    </View>
      {draft && draft.lectureId === lectureId && markable && (
        <View style={styles.panelRow}>
          <View style={styles.panel}>
            <MarkPanel kind={draft.kind} ms={draft.ms} onSave={(level, note) => void saveNewMark(draft, level, note)} onCancel={closeMarkPanel} />
          </View>
        </View>
      )}
    </View>
  );
}

const MARK_BUTTONS = [
  { kind: 'important', label: 'Important', text: '★ Important' },
  { kind: 'confused', label: 'Confused', text: '? Confused' },
  { kind: 'exam', label: 'Exam', text: 'Exam' },
] as const;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    strip: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      backgroundColor: c.recordingStrip.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.recordingStrip.border,
    },
    timer: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.recordingStrip.dot },
    // Paused: the dot is a ring, not lit.
    dotPaused: { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.recordingStrip.dot },
    round: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.recordingStrip.border,
    },
    waveStill: { opacity: 0.4 },
    label: { flexShrink: 1, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text, fontVariant: ['tabular-nums'] },
    wave: { flexShrink: 1, maxWidth: 240, overflow: 'hidden' },
    spacer: { flex: 1 },
    pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.85 },
    // Not usable yet: one look for all of them, no colour of its own, so none seems on.
    quiet: { backgroundColor: c.white, borderColor: c.recordingStrip.border, opacity: 0.55 },
    quietText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.secondary },
    markText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
    // The mark panel, inline under the strip at the buttons' side (it pushes the page down, never covers it).
    panelRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: c.recordingStrip.bg, borderBottomWidth: 1, borderBottomColor: c.recordingStrip.border },
    panel: { width: 460, maxWidth: '100%', padding: 16, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    plain: { backgroundColor: c.white, borderColor: c.border },
    plainText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    stop: { backgroundColor: c.black, borderColor: c.black },
    stopText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.white },
  });
