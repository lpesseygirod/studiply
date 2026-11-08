import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { isEmptyResponse } from '../../../supabase/functions/_shared/quiz-grade';
import { clockText } from '../../lib/review/cards';
import { clock, VERDICT_WORDS, type AnswerRow, type TakeQuestion } from '../../lib/quiz/session';
import type { SourceFile } from '../../services/quiz-attempt.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/** Where a question comes from, as its chip says: "Lecture 3 · 06:40", "Slides.pdf · p. 12" (the iPhone: "open at p. 12"). */
export function sourceChipText(q: Pick<TakeQuestion, 'source_ms' | 'source_page'>, file: SourceFile | undefined): string | null {
  if (!file) return null;
  // The 9.1 self-test chip's times (clockText): "06:40".
  if (file.kind === 'lecture') return q.source_ms !== null ? `${file.title} · ${clockText(clock(q.source_ms))}` : file.title;
  // The iPhone's preview opens a PDF at its start: the chip names the page to go to (Lea's decision 2).
  if (q.source_page && file.kind === 'pdf') return `${file.title} · ${Platform.OS === 'web' ? '' : 'go to '}p. ${q.source_page}`;
  return file.title;
}

/**
 * After Check (or in the results): the verdict ("✓ Right", "½ Partly", "✗ Wrong", "… Grading" while the
 * AI grades a written answer), the AI's one-line reason, the right answer, the explanation, the
 * "Added context · not from the lecture" box, and the source chip (a lecture's time plays in the mini
 * player; a PDF or photo opens).
 */
export function QuizFeedback({
  question,
  answer,
  file,
  explanations,
  timedOut,
  gradingNote,
  onSource,
}: {
  question: TakeQuestion;
  answer: AnswerRow | undefined;
  file: SourceFile | undefined;
  /** The quiz's "Explanations" choice. */
  explanations: boolean;
  timedOut: boolean;
  /** Why a pending answer isn't being graded now ("Grading when you're online"…). */
  gradingNote: string | null;
  onSource: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const verdict = answer?.verdict ?? 'wrong';
  const tone = verdict === 'correct' ? c.status.success : verdict === 'partly' ? c.status.warning : verdict === 'wrong' ? c.status.error : c.status.info;
  const chip = sourceChipText(question, file);
  const empty = isEmptyResponse(answer?.response);
  return (
    <View style={styles.wrap} {...{ dataSet: { quizFeedback: verdict } }}>
      <View style={[styles.verdict, { backgroundColor: tone.bg, borderColor: tone.border }]} accessibilityLiveRegion="polite" aria-live="polite">
        <View style={styles.verdictLine}>
          {verdict === 'pending' && !gradingNote ? <ActivityIndicator size="small" color={tone.text} /> : null}
          <Text style={[styles.verdictText, { color: tone.text }]}>
            {VERDICT_WORDS[verdict].mark} {VERDICT_WORDS[verdict].word}
            {verdict === 'pending' ? (gradingNote ? ` · ${gradingNote}` : ' your answer…') : ''}
            {timedOut ? ' · Time’s up' : empty && verdict === 'wrong' ? ' · Not answered' : ''}
          </Text>
        </View>
        {!!answer?.reason && (
          <Text style={[styles.reason, { color: tone.text }]} {...{ dataSet: { quizReason: 'ai' } }}>
            {answer.reason}
          </Text>
        )}
      </View>
      {verdict !== 'correct' && !!question.answer_text && (
        <View style={styles.block}>
          <Text style={styles.label}>RIGHT ANSWER</Text>
          <Text style={styles.text} {...{ dataSet: { quizRight: 'answer' } }}>
            {question.answer_text}
          </Text>
        </View>
      )}
      {explanations && !!question.explanation && (
        <View style={styles.block}>
          <Text style={styles.label}>WHY</Text>
          <Text style={styles.text}>{question.explanation}</Text>
        </View>
      )}
      {!!question.added_context && (
        <View style={styles.added} {...{ dataSet: { quizAdded: 'context' } }}>
          <Text style={styles.addedLabel}>Added context · not from the lecture</Text>
          <Text style={styles.text}>{question.added_context}</Text>
        </View>
      )}
      {chip && (
        <Pressable
          onPress={onSource}
          style={({ pressed }) => [styles.source, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={file?.kind === 'lecture' && question.source_ms !== null ? `Play from ${chip}` : `Open ${chip}`}
          {...{ dataSet: { quizSource: file?.kind ?? 'file' } }}
        >
          <Ionicons name={file?.kind === 'lecture' ? 'play-circle-outline' : 'document-text-outline'} size={16} color={c.accentDark} />
          <Text style={styles.sourceText} numberOfLines={1}>
            {chip}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    verdict: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 4 },
    verdictLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    verdictText: { flexShrink: 1, fontSize: Typography.size.base, fontWeight: Typography.weight.bold },
    reason: { fontSize: Typography.size.sm, lineHeight: 19 },
    block: { gap: 4 },
    label: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 1.2, color: c.text.secondary },
    text: { fontSize: Typography.size.base, color: c.text.primary, lineHeight: 22 },
    added: { padding: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.cardMuted, gap: 4 },
    addedLabel: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: c.text.secondary },
    source: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.accentLight },
    sourceText: { flexShrink: 1, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    pressed: { opacity: 0.7 },
  });
