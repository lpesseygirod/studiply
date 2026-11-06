import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useConnectivity } from '../../lib/connectivity';
import { deleteQuiz, listQuizzes, onQuizzesChanged, type QuizListItem } from '../../services/quiz.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { anchorBelow, menuTriggerProps, showActionSheet, showAlert, type Anchor } from '../dialogs/dialogs';
import { openNewQuiz } from './newQuizState';

const STATUS: Record<QuizListItem['status'], string> = {
  // Step 9.1b-1: saved; the quiz function writes it in 9.1b-2.
  pending: 'Saved · written in a later update',
  generating: 'Writing your quiz…',
  ready: 'Ready',
  failed: 'Couldn’t be written',
};

/**
 * Review → Quiz me's quizzes (step 9.1b): + New quiz, and every quiz, newest first: its title, how
 * many questions, its status (its best score from 9.1b-3) and Take. A quiz's menu (… , right-click
 * on the laptop, long-press on the iPhone): Delete, with Undo. Taking a quiz comes in 9.1b-3.
 */
export function QuizList({ showUndo }: { showUndo: (text: string, undo: () => void) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const offline = useConnectivity() === 'offline';
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);

  const load = useCallback(() => {
    listQuizzes()
      .then(setQuizzes)
      .catch(() => setQuizzes((q) => q ?? []));
  }, []);
  useEffect(() => {
    load();
    return onQuizzesChanged(load);
  }, [load]);

  const remove = async (quiz: QuizListItem) => {
    try {
      const undo = await deleteQuiz(quiz.id);
      showUndo(`Deleted “${quiz.title}”`, () => {
        undo().catch((err) => showAlert('The quiz wasn’t restored', errorMessage(err, 'Please try again.')));
      });
    } catch (err) {
      showAlert('The quiz wasn’t deleted', errorMessage(err, 'Please try again.'));
    }
  };
  const menu = (quiz: QuizListItem, anchor?: Anchor) =>
    showActionSheet(quiz.title, [{ text: 'Delete quiz', style: 'destructive', icon: 'trash-outline', disabled: offline, hint: offline ? 'Needs a connection' : undefined, onPress: () => remove(quiz) }], { anchor });

  return (
    <View style={styles.wrap} {...{ dataSet: { quizzes: 'list' } }}>
      <View style={styles.head}>
        <Text style={styles.heading}>{quizzes?.length ? 'Your quizzes' : 'Quizzes'}</Text>
        <Pressable
          onPress={() => openNewQuiz()}
          disabled={offline}
          style={({ pressed }) => [styles.newButton, offline && styles.dim, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: offline }}
          accessibilityHint={offline ? 'Making a quiz needs a connection' : undefined}
          {...{ dataSet: { quizzes: 'new' } }}
        >
          <Ionicons name="add" size={18} color={c.button.primaryText} />
          <Text style={styles.newText}>New quiz</Text>
        </Pressable>
      </View>
      {quizzes?.map((quiz) => <Row key={quiz.id} quiz={quiz} onMenu={(anchor) => menu(quiz, anchor)} />)}
    </View>
  );
}

function Row({ quiz, onMenu }: { quiz: QuizListItem; onMenu: (anchor?: Anchor) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const more = useRef<View>(null);
  const ready = quiz.status === 'ready';
  return (
    // The buttons are the text's siblings, not inside it (no button in a button on the web).
    <View style={styles.row} {...{ dataSet: { quizzes: 'row', id: quiz.id, status: quiz.status } }}>
      <Pressable style={styles.rowText} accessibilityLabel={quiz.title} {...menuTriggerProps(onMenu)}>
        <Text style={styles.title} numberOfLines={1}>
          {quiz.title}
        </Text>
        <Text style={styles.detail} numberOfLines={1} {...{ dataSet: { quizzes: 'detail' } }}>
          {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'} · {STATUS[quiz.status]}
        </Text>
      </Pressable>
      <Pressable
        disabled={!ready}
        onPress={() => showAlert('Taking quizzes comes in a later update')}
        style={[styles.take, !ready && styles.dim]}
        accessibilityRole="button"
        accessibilityLabel={`Take ${quiz.title}`}
        accessibilityState={{ disabled: !ready }}
        {...{ dataSet: { quizzes: 'take' } }}
      >
        <Text style={styles.takeText}>Take</Text>
      </Pressable>
      <Pressable
        ref={more}
        onPress={async () => onMenu(await anchorBelow(more))}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`More for ${quiz.title}`}
        {...{ dataSet: { quizzes: 'more' } }}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={c.text.secondary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heading: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.onGradientStrong },
    newButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.button.primary },
    newText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, paddingLeft: 16, paddingRight: 4, borderRadius: 14, backgroundColor: c.card },
    rowText: { flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center' },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    detail: { fontSize: Typography.size.sm, color: c.text.secondary },
    take: { height: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    takeText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    dim: { opacity: 0.5 },
    pressed: { opacity: 0.7 },
  });
