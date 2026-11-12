import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { isEmptyResponse, responseText, type Verdict } from '../../../supabase/functions/_shared/quiz-grade';
import { attemptScore, changedLine, clock, scoreLine, VERDICT_WORDS, type AnswerRow, type AttemptRow, type TakeQuestion } from '../../lib/quiz/session';
import type { SourceFile } from '../../services/quiz-attempt.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { anchorBelow, showActionSheet } from '../dialogs/dialogs';
import { sourceChipText } from './QuizFeedback';

const GRADES: { verdict: Verdict; text: string }[] = [
  { verdict: 'correct', text: 'Correct' },
  { verdict: 'partly', text: 'Partly' },
  { verdict: 'wrong', text: 'Wrong' },
];

/**
 * An attempt's results (no mockup;the latest finished attempt only: Lea's decision 3):
 * the score ("7.5 / 10" or "Passed · 72 %"), how long it took, a row per question (her answer, the
 * verdict, the AI's reason, "Changed by you (was: Wrong)"), "being graded…" while Sonnet grades, how
 * many wrong answers went to review, Take again / Done. Her grade on any row: tap its verdict →
 * Correct · Partly · Wrong.
 */
export function QuizResults({
  attempt,
  order,
  answers,
  files,
  gradingNote,
  onGrade,
  onRetryGrading,
  onSource,
  onTakeAgain,
  onDone,
}: {
  attempt: AttemptRow;
  order: TakeQuestion[];
  answers: Map<string, AnswerRow>;
  files: Map<string, SourceFile>;
  /** Why pending answers aren't being graded now, or null while they are. */
  gradingNote: string | null;
  onGrade: (answer: AnswerRow, verdict: Verdict) => void;
  onRetryGrading: (() => void) | null;
  onSource: (q: TakeQuestion) => void;
  onTakeAgain: () => void;
  onDone: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const list = order.map((q) => answers.get(q.id)).filter((a): a is AnswerRow => !!a);
  const score = attemptScore(list, attempt);
  const pending = list.filter((a) => a.verdict === 'pending').length;
  const toReview = list.filter((a) => a.verdict === 'wrong' || a.verdict === 'partly').length;
  return (
    <View style={styles.wrap} {...{ dataSet: { quizResults: pending ? 'grading' : 'done' } }}>
      <View style={styles.head}>
        <Text style={styles.score} accessibilityRole="header" {...{ dataSet: { quizScore: scoreLine(attempt, score) } }}>
          {scoreLine(attempt, score)}
        </Text>
        <Text style={styles.meta}>
          {order.length} {order.length === 1 ? 'question' : 'questions'}
          {attempt.duration_ms !== null ? ` · ${clock(attempt.duration_ms)}` : ''}
        </Text>
        {pending > 0 && (
          <View style={styles.gradingLine} {...{ dataSet: { quizGrading: gradingNote ? 'waiting' : 'running' } }}>
            {!gradingNote && <ActivityIndicator size="small" color={c.text.secondary} />}
            <Text style={styles.meta}>
              {pending} {pending === 1 ? 'answer is' : 'answers are'} {gradingNote ? `waiting to be graded · ${gradingNote}` : 'being graded…'}
            </Text>
            {onRetryGrading && (
              <Pressable onPress={onRetryGrading} style={styles.link} accessibilityRole="button" {...{ dataSet: { quizGradeNow: 'yes' } }}>
                <Text style={styles.linkText}>Grade now</Text>
              </Pressable>
            )}
          </View>
        )}
        {toReview > 0 && (
          <Text style={styles.meta} {...{ dataSet: { quizToReview: String(toReview) } }}>
            {toReview} wrong {toReview === 1 ? 'answer' : 'answers'} saved for review
          </Text>
        )}
      </View>
      {order.map((q, i) => (
        <Row key={q.id} n={i + 1} question={q} answer={answers.get(q.id)} file={q.source_file_id ? files.get(q.source_file_id) : undefined} onGrade={onGrade} onSource={() => onSource(q)} />
      ))}
      <View style={styles.buttons}>
        <Pressable onPress={onTakeAgain} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { quizAction: 'again' } }}>
          <Text style={styles.secondaryText}>Take again</Text>
        </Pressable>
        <Pressable onPress={onDone} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { quizAction: 'done' } }}>
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ n, question, answer, file, onGrade, onSource }: { n: number; question: TakeQuestion; answer: AnswerRow | undefined; file: SourceFile | undefined; onGrade: (a: AnswerRow, v: Verdict) => void; onSource: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const pill = useRef<View>(null);
  const verdict = answer?.verdict ?? 'wrong';
  const tone = verdict === 'correct' ? c.status.success : verdict === 'partly' ? c.status.warning : verdict === 'wrong' ? c.status.error : c.status.info;
  const given = answer && !isEmptyResponse(answer.response) ? responseText(question.type, question.data, answer.response) : '';
  const changed = answer ? changedLine(answer) : null;
  const chip = sourceChipText(question, file);
  const menu = async () => {
    if (!answer) return;
    const anchor = await anchorBelow(pill);
    showActionSheet(
      'Your grade',
      GRADES.map((g) => ({ text: g.text, icon: g.verdict === answer.verdict ? 'checkmark' : undefined, onPress: () => onGrade(answer, g.verdict) })),
      { anchor, message: 'Change the grade if you think it’s wrong. The score follows.' },
    );
  };
  return (
    <View style={styles.row} {...{ dataSet: { quizResultRow: String(n), verdict } }}>
      <View style={styles.rowHead}>
        <Text style={styles.prompt}>
          {n}. {question.prompt}
        </Text>
        <Pressable
          ref={pill}
          onPress={() => void menu()}
          disabled={!answer}
          style={({ pressed }) => [styles.pill, { backgroundColor: tone.bg, borderColor: tone.border }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${VERDICT_WORDS[verdict].word}. Change the grade`}
          {...{ dataSet: { quizVerdict: verdict } }}
        >
          {verdict === 'pending' ? <ActivityIndicator size="small" color={tone.text} /> : null}
          <Text style={[styles.pillText, { color: tone.text }]}>
            {VERDICT_WORDS[verdict].mark} {VERDICT_WORDS[verdict].word}
          </Text>
          <Ionicons name="chevron-down" size={12} color={tone.text} />
        </Pressable>
      </View>
      <Text style={[styles.given, !given && styles.none]}>{given ? `Your answer: ${given}` : 'Not answered'}</Text>
      {verdict !== 'correct' && !!question.answer_text && <Text style={styles.right}>Right answer: {question.answer_text}</Text>}
      {!!answer?.reason && (
        <Text style={styles.reason} {...{ dataSet: { quizReason: 'ai' } }}>
          {answer.reason}
        </Text>
      )}
      {changed && (
        <Text style={styles.changed} {...{ dataSet: { quizChanged: 'yes' } }}>
          {changed}
        </Text>
      )}
      {chip && (
        <Pressable onPress={onSource} style={styles.link} accessibilityRole="button" accessibilityLabel={`Open ${chip}`}>
          <Text style={styles.linkText} numberOfLines={1}>
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
    head: { gap: 4, paddingBottom: 4 },
    score: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.extrabold, color: c.text.primary },
    meta: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.secondary },
    gradingLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    row: { gap: 4, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    prompt: { flex: 1, fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary, lineHeight: 21 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1 },
    pillText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.bold },
    given: { fontSize: Typography.size.sm, color: c.text.primary, lineHeight: 19 },
    none: { color: c.text.secondary, fontStyle: 'italic' },
    right: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 19 },
    reason: { fontSize: Typography.size.sm, color: c.text.secondary, fontStyle: 'italic', lineHeight: 19 },
    changed: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.accentDark },
    link: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' },
    linkText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 8 },
    secondary: { height: 44, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 20, borderRadius: 10, backgroundColor: c.button.primary, justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    pressed: { opacity: 0.7 },
  });
