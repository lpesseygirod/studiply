import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { markChipText } from '../../lib/review/cards';
import { currentQuestion, nextQuestion, quizProgress, showAnswer, startQuiz, type QuizItem, type QuizSession } from '../../lib/review/session';
import type { QuizDeck } from '../../services/review.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { ReviewProgress } from './ReviewProgress';

type MarkTone = 'important' | 'confused' | 'exam';
const toneOf = (type: string): MarkTone => (type === 'confused' || type === 'important' ? type : 'exam');

/**
 * The review screen's Quiz me (step 9.1, desktop-07 as far as the summaries allow): the summaries'
 * self-test questions one by one, "Question n of N", the lecture's "From your marks" line, the
 * mark that asked for the question as a chip ("Exam 9/10 · from 06:40"), the question, Show answer
 * (the answer in the card) and Next question. No answer options or hints: those come with 9.1b's
 * quizzes.
 */
export function QuizView({ decks, compact, onCurrent }: { decks: QuizDeck[]; compact: boolean; onCurrent: (item: QuizItem | null) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [session, setSession] = useState<QuizSession>(() => startQuiz(decks));
  const item = currentQuestion(session);
  const progress = quizProgress(session);
  useEffect(() => onCurrent(item), [item, onCurrent]);

  if (!item) {
    return (
      <View style={[styles.card, styles.endCard]} {...{ dataSet: { quiz: 'done' } }}>
        <Ionicons name={session.items.length ? 'checkmark-circle-outline' : 'help-circle-outline'} size={36} color={c.accentDark} />
        <Text style={styles.endTitle}>{session.items.length ? 'Quiz done' : 'No questions yet'}</Text>
        <Text style={styles.endText}>
          {session.items.length ? `${session.items.length} ${session.items.length === 1 ? 'question' : 'questions'} from your summaries` : 'The self-test of each summary you make comes here.'}
        </Text>
        {session.items.length > 0 && (
          <Pressable onPress={() => setSession(startQuiz(decks))} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Start again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const { question, deck } = item;
  const tone = question.mark ? c.marks[toneOf(question.mark.type)] : null;
  return (
    <View style={styles.wrap}>
      <ReviewProgress label={`Question ${progress.n} of ${progress.total}`} marks={deck.marks} done={progress.done} compact={compact} />
      <View style={styles.card} {...{ dataSet: { quizCard: session.shown ? 'answer' : 'question' } }}>
        {question.mark && tone && (
          <View style={[styles.chip, { backgroundColor: tone.bg }]} {...{ dataSet: { quizChip: question.mark.type } }}>
            <Text style={[styles.chipText, { color: tone.text }]}>{markChipText(question.mark)}</Text>
          </View>
        )}
        {compact && <Text style={styles.lecture}>{deck.lecture.toUpperCase()}</Text>}
        <Text style={styles.question} accessibilityRole="header">
          {question.question}
        </Text>
        {session.shown && (
          <View style={styles.answer} {...{ dataSet: { quizAnswer: 'shown' } }}>
            <Text style={styles.answerLabel}>ANSWER</Text>
            <Text style={styles.answerText}>{question.answer}</Text>
          </View>
        )}
        <View style={styles.buttons}>
          {!session.shown && (
            <Pressable onPress={() => setSession((s) => showAnswer(s))} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Show answer">
              <Text style={styles.secondaryText}>Show answer</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setSession((s) => nextQuestion(s))} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Next question">
            <Text style={styles.primaryText}>Next question</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 20 },
    card: {
      padding: 32,
      borderRadius: 18,
      backgroundColor: c.card,
      gap: 18,
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
    },
    endCard: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12 },
    chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
    chipText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold },
    lecture: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 1.2, color: c.text.secondary },
    question: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary, lineHeight: 30 },
    answer: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardMuted, gap: 6 },
    answerLabel: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 1.2, color: c.text.secondary },
    answerText: { fontSize: Typography.size.base, color: c.text.primary, lineHeight: 22 },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    secondary: { height: 44, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 20, borderRadius: 10, backgroundColor: c.button.primary, justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    pressed: { opacity: 0.7 },
    endTitle: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    endText: { fontSize: Typography.size.base, color: c.text.secondary, textAlign: 'center' },
  });
