import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { clock, useRecorder, useRecorderState, useRecordingFlow } from '../../hooks/useRecorder';
import { useRecordingActions } from './useRecordingActions';
import { savingText } from './savingText';
import { Waveform } from './Waveform';

/**
 * The iPhone's recording screen (step 5.3, docs/design iphone-02), drawn
 * around the lecture's My notes when that lecture is recording: the header
 * (back, the red timer chip, Course › folder, the title, the waveform) and
 * the bottom bar. Also the web below 1024 px.
 */
export function RecordingPhoneHeader({
  backLabel,
  backColor,
  onBack,
  crumbs,
  title,
}: {
  backLabel: string;
  backColor: string;
  onBack: () => void;
  crumbs: string;
  title: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const live = useRecorder();
  const actions = useRecordingActions();
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel={`Back to ${backLabel}`}>
          <Ionicons name="chevron-back" size={22} color={backColor} />
          <Text style={[styles.backText, { color: backColor }]} numberOfLines={1}>
            {backLabel}
          </Text>
        </Pressable>
        <View style={styles.chip} accessibilityLabel={`Recording, ${clock(live.elapsedMs)}`} {...{ dataSet: { recording: 'timer' } }}>
          <View style={styles.dot} />
          <Text style={styles.chipText}>{clock(live.elapsedMs)}</Text>
        </View>
      </View>
      {!!crumbs && (
        <Text style={styles.crumbs} numberOfLines={1}>
          {crumbs}
        </Text>
      )}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {live.microphoneLost ? (
        <View style={styles.lost}>
          <Text style={styles.lostText}>Microphone disconnected</Text>
          <Pressable onPress={() => void actions.resume()} style={styles.resume} accessibilityRole="button" accessibilityLabel="Resume recording">
            <Text style={styles.resumeText}>Resume</Text>
          </Pressable>
        </View>
      ) : (
        <Waveform levels={live.levels} color={c.recordingStrip.wave} height={22} bar={4} gap={4} />
      )}
    </View>
  );
}

const MARKS = [
  { key: 'important', glyph: '★', label: 'Important' },
  { key: 'confused', glyph: '?', label: 'Confused' },
  { key: 'exam', glyph: '!', label: 'Exam' },
] as const;

export function RecordingPhoneBar() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const live = useRecorderState();
  const flow = useRecordingFlow();
  const actions = useRecordingActions();

  if (flow.saving) {
    return (
      <View style={styles.bar}>
        <View style={styles.saving} {...{ dataSet: { recording: 'saving' } }}>
          <Text style={styles.savingText}>{savingText(flow.saving)}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.bar} {...{ dataSet: { recording: 'bar' } }}>
      {/* The marks (5.5) and board photos (5.6) come next: shown, disabled, all equally quiet. */}
      <View style={styles.tiles}>
        {MARKS.map((m) => (
          <Pressable
            key={m.key}
            disabled
            aria-disabled
            style={[styles.tile, { backgroundColor: c.marks[m.key].bg }, styles.off]}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={m.label}
          >
            <Text style={[styles.tileGlyph, { color: c.marks[m.key].text }]}>{m.glyph}</Text>
            <Text style={[styles.tileLabel, { color: c.marks[m.key].text }]}>{m.label}</Text>
          </Pressable>
        ))}
        <Pressable disabled aria-disabled style={[styles.tile, styles.photo, styles.off]} accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel="Photo">
          <Ionicons name="radio-button-on" size={18} color={c.text.primary} />
          <Text style={[styles.tileLabel, { color: c.text.primary }]}>Photo</Text>
        </Pressable>
      </View>
      <View style={styles.actions}>
        {/* The assistant comes in Phase 6. */}
        <Pressable disabled aria-disabled style={[styles.ask, styles.off]} accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel="Ask the study assistant">
          <Text style={styles.askText}>✦ Ask</Text>
        </Pressable>
        <Pressable
          onPress={() => void actions.stop()}
          disabled={live.status === 'stopping'}
          aria-disabled={live.status === 'stopping'}
          style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Stop and summarize"
        >
          <Text style={styles.stopText}>Stop & summarize</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    header: { gap: 4, paddingBottom: 4 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, flexShrink: 1, paddingRight: 8 },
    backText: { fontSize: Typography.size.md, fontWeight: Typography.weight.medium },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.recordingStrip.bg,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.recordingStrip.dot },
    chipText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text, fontVariant: ['tabular-nums'] },
    crumbs: { marginLeft: 6, fontSize: Typography.size.xs, color: c.text.onGradient },
    title: { marginLeft: 6, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: c.text.onGradientStrong },
    lost: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 6 },
    lostText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.onGradientStrong },
    resume: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', backgroundColor: c.black },
    resumeText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.white },
    bar: { gap: 10, paddingTop: 10 },
    tiles: { flexDirection: 'row', gap: 8 },
    tile: { flex: 1, minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 2 },
    tileGlyph: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold },
    tileLabel: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
    photo: { backgroundColor: c.white },
    off: { opacity: 0.45 },
    actions: { flexDirection: 'row', gap: 10 },
    ask: { flex: 1, minHeight: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight },
    askText: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.accentDark },
    stop: { flex: 2, minHeight: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.black },
    stopText: { fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.white },
    pressed: { opacity: 0.85 },
    saving: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: c.recordingStrip.bg },
    savingText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.recordingStrip.text, textAlign: 'center' },
  });
