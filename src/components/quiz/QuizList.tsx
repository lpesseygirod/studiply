import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useConnectivity } from '../../lib/connectivity';
import { latestAttempts, scoreLine, type AttemptRow } from '../../lib/quiz/session';
import { quizRowState } from '../../lib/quiz/status';
import { attemptsByQuiz } from '../../services/quiz-attempt.service';
import { deleteQuiz, listQuizzes, onQuizzesChanged, quizNow, startQuiz, type QuizListItem } from '../../services/quiz.service';
import { ConsentDeclinedError } from '../../services/consent.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { anchorBelow, menuTriggerProps, showActionSheet, showAlert, type Anchor } from '../dialogs/dialogs';
import { openNewQuiz } from './newQuizState';

/** While a quiz is being written, its row is read this often (as the Summary card's). */
const POLL_MS = 5_000;

/**
 * Review → Quiz me's quizzes (step 9.1b): + New quiz, and every quiz, newest first: its title, how
 * many questions, its state and Take. Step 9.1b-2: while one is written its row says so (with a
 * spinner) and is read every 5 s; a quiz saved but not started has Start, one that failed Try again
 * (src/lib/quiz/status.ts). A quiz's menu (… , right-click on the laptop, long-press on the iPhone):
 * Delete, with Undo (deleting one being written stops it). Step 9.1b-3: Take (Resume while an attempt
 * is in progress) opens the quiz; "Last: 7.5 / 10" and the menu's Results show the latest finished
 * attempt. The laptop takes quizzes online only; the iPhone offline too.
 */
export function QuizList({ showUndo }: { showUndo: (text: string, undo: () => void) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const offline = useConnectivity() === 'offline';
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [attempts, setAttempts] = useState<Map<string, AttemptRow[]>>(new Map());
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(() => {
    listQuizzes()
      .then(setQuizzes)
      .catch(() => setQuizzes((q) => q ?? []));
    attemptsByQuiz()
      .then(setAttempts)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    return onQuizzesChanged(load);
  }, [load]);

  // While a quiz is being written (and online): its row read every 5 s, until it is ready or failed.
  const writing = (quizzes ?? []).filter((q) => quizRowState(q).writing).map((q) => q.id);
  const writingKey = writing.join(',');
  useEffect(() => {
    if (!writingKey || offline) return;
    const ids = writingKey.split(',');
    const timer = setInterval(() => {
      Promise.all(ids.map((id) => quizNow(id).catch(() => null))).then(load);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [writingKey, offline, load]);

  const start = async (quiz: QuizListItem) => {
    setStarting(quiz.id);
    try {
      await startQuiz(quiz.id);
    } catch (err) {
      // Declining the permission: the row says so ("Nothing was sent…"); anything else is said here too.
      if (!(err instanceof ConsentDeclinedError)) showAlert('The quiz wasn’t started', errorMessage(err, 'Please try again.'));
    } finally {
      setStarting(null);
    }
  };

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
  const menu = (quiz: QuizListItem, anchor?: Anchor) => {
    const last = latestAttempts(attempts.get(quiz.id) ?? []).last;
    showActionSheet(
      quiz.title,
      [
        ...(last ? [{ text: 'Results', icon: 'list-outline', disabled: takeOffline, hint: takeOffline ? TAKE_OFFLINE : undefined, onPress: () => router.push(`/review/quiz/${quiz.id}?attempt=${last.id}` as Href) }] : []),
        { text: 'Delete quiz', style: 'destructive' as const, icon: 'trash-outline', disabled: offline, hint: offline ? 'Needs a connection' : undefined, onPress: () => remove(quiz) },
      ],
      { anchor },
    );
  };
  // The laptop takes a quiz online only (as the web reads everything); the iPhone from its copy.
  const takeOffline = offline && Platform.OS === 'web';

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
      {quizzes?.map((quiz) => (
        <Row
          key={quiz.id}
          quiz={quiz}
          attempts={attempts.get(quiz.id) ?? []}
          offline={offline}
          takeOffline={takeOffline}
          starting={starting === quiz.id}
          onStart={() => start(quiz)}
          onTake={() => router.push(`/review/quiz/${quiz.id}` as Href)}
          onMenu={(anchor) => menu(quiz, anchor)}
        />
      ))}
    </View>
  );
}

const TAKE_OFFLINE = 'Taking a quiz needs a connection on the laptop';

function Row({
  quiz,
  attempts,
  offline,
  takeOffline,
  starting,
  onStart,
  onTake,
  onMenu,
}: {
  quiz: QuizListItem;
  attempts: AttemptRow[];
  offline: boolean;
  takeOffline: boolean;
  starting: boolean;
  onStart: () => void;
  onTake: () => void;
  onMenu: (anchor?: Anchor) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const more = useRef<View>(null);
  const state = quizRowState(quiz);
  const label = state.action === 'start' ? 'Start' : 'Try again';
  const { resume, last } = latestAttempts(attempts);
  const lastLine = state.ready && last ? `Last: ${scoreLine(last, last)}` : null;
  // Saved but not started always says why; with no reason from this session (never tried here), a neutral line.
  const sub = [state.sub ?? (state.action === 'start' ? 'Not started yet' : null), lastLine].filter(Boolean).join(' · ') || null;
  const takeOff = !state.ready || takeOffline;
  return (
    // The buttons are the text's siblings, not inside it (no button in a button on the web).
    <View style={styles.row} {...{ dataSet: { quizzes: 'row', id: quiz.id, status: quiz.status } }}>
      <Pressable style={styles.rowText} accessibilityLabel={quiz.title} {...menuTriggerProps(onMenu)}>
        <Text style={styles.title} numberOfLines={1}>
          {quiz.title}
        </Text>
        <View style={styles.detailLine}>
          {state.writing && <ActivityIndicator size="small" color={c.text.secondary} {...{ dataSet: { quizzes: 'writing' } }} />}
          {/* The state wraps (never cut at 390 px): "10 questions · Writing your quiz…" on two lines if need be. */}
          <Text style={styles.detail} {...{ dataSet: { quizzes: 'detail' } }}>
            {state.line}
          </Text>
        </View>
        {sub && (
          <Text style={styles.sub} {...{ dataSet: { quizzes: 'sub' } }}>
            {sub}
          </Text>
        )}
      </Pressable>
      {state.action ? (
        <Pressable
          disabled={offline || starting}
          onPress={onStart}
          style={[styles.take, (offline || starting) && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${quiz.title}`}
          accessibilityState={{ disabled: offline || starting }}
          accessibilityHint={offline ? 'Needs a connection' : undefined}
          {...{ dataSet: { quizzes: state.action } }}
        >
          {starting ? <ActivityIndicator size="small" color={c.text.primary} /> : <Text style={styles.takeText}>{label}</Text>}
        </Pressable>
      ) : (
        <Pressable
          disabled={takeOff}
          onPress={onTake}
          style={[styles.take, takeOff && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`${resume ? 'Resume' : 'Take'} ${quiz.title}`}
          accessibilityState={{ disabled: takeOff }}
          accessibilityHint={state.ready && takeOffline ? TAKE_OFFLINE : undefined}
          {...{ dataSet: { quizzes: resume ? 'resume' : 'take' } }}
        >
          <Text style={styles.takeText}>{resume ? 'Resume' : 'Take'}</Text>
        </Pressable>
      )}
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
    rowText: { flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center', paddingVertical: 8 },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    detailLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detail: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.secondary },
    sub: { fontSize: Typography.size.xs, color: c.text.secondary },
    take: { height: 36, minWidth: 64, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    takeText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    dim: { opacity: 0.5 },
    pressed: { opacity: 0.7 },
  });
