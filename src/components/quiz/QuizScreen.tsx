import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { AI_GRADED, type Verdict } from '../../../supabase/functions/_shared/quiz-grade';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { clockText, markChipText, marksText } from '../../lib/review/cards';
import {
  attemptOrder,
  clock,
  hasDraft,
  keyChoice,
  leftText,
  msLeft,
  resumeIndex,
  shownOrder,
  unanswered,
  type AnswerRow,
  type AttemptRow,
  type TakeQuestion,
} from '../../lib/quiz/session';
import {
  attemptAnswers,
  changeGrade,
  finishAttempt,
  gradeAttempt,
  loadTaking,
  openSourceFile,
  saveAnswer,
  startAttempt,
  type GradingState,
  type TakingData,
} from '../../services/quiz-attempt.service';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { GradientBackground } from '../GradientBackground';
import { isDialogOpen, showAlert } from '../dialogs/dialogs';
import { MiniPlayer, type PlayRequest } from '../editor/MiniPlayer';
import { ReviewProgress } from '../review/ReviewProgress';
import { useShellScreen, type DocumentHeader } from '../shell/ShellContext';
import { AnswerArea, firstDraft, type Draft } from './AnswerArea';
import { QuizFeedback, sourceChipText } from './QuizFeedback';
import { QuizResults } from './QuizResults';

type Phase = 'loading' | 'question' | 'feedback' | 'results' | 'error';

/** The results read the AI's grades this often while some are on their way. */
const GRADING_POLL_MS = 4_000;

const QUIZ_LIST = '/review?mode=quiz' as Href;

/** What the results say about answers still pending. Null: being graded now. */
function gradingNoteFor(state: GradingState | null): string | null {
  switch (state) {
    case 'offline':
      return 'graded when you’re online';
    case 'needs_permission':
      return 'needs your permission to send them to Claude';
    case 'limit':
      return 'today’s AI limit is reached';
    // Grading uses the assistant allowance; her own grade always works.
    case 'extras':
      return 'graded when your assistant allowance frees up; you can grade them yourself';
    case 'failed':
      return 'grading didn’t work';
    case 'done':
      return 'not graded yet';
    default:
      return null;
  }
}

/**
 * Taking a quiz. desktop-07 on the laptop: the top bar's breadcrumb, "Question n of M"
 * with "From your marks…" (or "12:30 left" with a time limit), the bar, the 720 px card (the mark
 * chip, the question, the answer, Show hint and Check / Next). The iPhone: full screen in iphone-10's
 * look, ‹ Quit at the top.
 * - After each question (the quiz's choice) Check shows the verdict and why; at the end, Next only.
 *   A short or long answer is sent to Sonnet right after Check (Lea's decision 5) or at Finish.
 * - Time limit, per question or in all: when it runs out, what she wrote so far is saved and graded.
 * - Quit (Escape) leaves with her answers kept; the list then offers Resume. Questions left at Finish
 *   count as wrong and come back for review (decision 1).
 * - The laptop's keys: A–D or 1–4 choose, Enter checks and goes on (⌘/Ctrl + Enter in a long answer),
 *   Escape quits.
 * - `attemptId`: the results of that finished attempt. `fresh`: a new attempt (Take again).
 */
export function QuizScreen({ quizId, attemptId, fresh }: { quizId: string; attemptId: string | null; fresh: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const compact = useLayoutMode() === 'compact';

  const [data, setData] = useState<TakingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [answers, setAnswers] = useState<Map<string, AnswerRow>>(new Map());
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(null);
  const [hintShown, setHintShown] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState<GradingState | null>(null);
  const [play, setPlay] = useState<PlayRequest | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [questionStart, setQuestionStart] = useState(() => Date.now());
  const started = useRef(false);
  // The answers as saved, at once: Finish (or a time-out) right after a save must see that save, not
  // the state before it.
  const answersRef = useRef<Map<string, AnswerRow>>(new Map());
  const putAnswers = useCallback((next: Map<string, AnswerRow>) => {
    answersRef.current = next;
    setAnswers(next);
  }, []);

  const order = useMemo(() => (data && attempt ? attemptOrder(data.questions, attempt.id) : []), [data, attempt]);
  const question: TakeQuestion | undefined = order[index];
  const shown = useMemo(() => (question ? shownOrder(question) : []), [question]);
  const choices = data?.quiz.settings.choices;
  const limit = choices?.timeLimit ?? { kind: 'none' as const };

  // The laptop's top bar: "Review today · Course" over the quiz's title.
  const header: DocumentHeader = {
    crumbs: [{ label: data?.courseName ? `Review today · ${data.courseName}` : 'Review today', href: QUIZ_LIST }],
    title: data?.quiz.title ?? 'Quiz',
    saved: null,
  };
  useShellScreen(null, header);

  const quit = useCallback(() => router.replace(QUIZ_LIST), [router]);

  // -------------------------------------------------------------------
  // Opening: the results of an attempt, the attempt in progress, or a new one
  // -------------------------------------------------------------------
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const d = await loadTaking(quizId);
      setData(d);
      if (d.quiz.status !== 'ready' || d.questions.length === 0) throw new Error('This quiz isn’t ready to take yet.');
      const shownAttempt = attemptId ? d.attempts.find((a) => a.id === attemptId) : null;
      if (attemptId && !shownAttempt) throw new Error('Those results were not found.');
      const resume = !fresh && !attemptId ? d.attempts.find((a) => a.status === 'in_progress') : null;
      const a = shownAttempt ?? resume ?? (await startAttempt(d.quiz, d.questions));
      const got = shownAttempt || resume ? await attemptAnswers(a.id) : new Map<string, AnswerRow>();
      setAttempt(a);
      putAnswers(got);
      if (a.status === 'finished') {
        setPhase('results');
        if ([...got.values()].some((x) => x.verdict === 'pending')) setGrading('done');
        return;
      }
      const ordered = attemptOrder(d.questions, a.id);
      const at = resumeIndex(ordered, got);
      setIndex(at);
      setDraft(at < ordered.length ? firstDraft(ordered[at], shownOrder(ordered[at])) : null);
      setQuestionStart(Date.now());
      setPhase('question');
    })().catch((err) => {
      setError(errorMessage(err, Platform.OS === 'web' ? 'Taking a quiz needs a connection on the laptop.' : 'Could not open the quiz.'));
      setPhase('error');
    });
  }, [quizId, attemptId, fresh, putAnswers]);

  // -------------------------------------------------------------------
  // Sonnet's grades for short and long answers
  // -------------------------------------------------------------------
  const gradingNow = useRef(false);
  const gradeAgain = useRef(false);
  const requestGrading = useCallback(async () => {
    if (!data || !attempt) return;
    // One call at a time; answers saved meanwhile go in the next.
    if (gradingNow.current) {
      gradeAgain.current = true;
      return;
    }
    gradingNow.current = true;
    setGrading('grading');
    try {
      let state: GradingState;
      do {
        gradeAgain.current = false;
        state = await gradeAttempt(data.quiz.id, attempt.id);
        if (state === 'done') putAnswers(await attemptAnswers(attempt.id));
      } while (gradeAgain.current && state === 'done');
      setGrading(state);
    } catch {
      setGrading('failed');
    } finally {
      gradingNow.current = false;
    }
  }, [data, attempt, putAnswers]);

  const anyPending = [...answers.values()].some((a) => a.verdict === 'pending');
  // The iPhone's queued grading (or a laptop call still running): the answers read again until graded.
  useEffect(() => {
    if (!attempt || !anyPending || grading !== 'grading' || Platform.OS === 'web') return;
    const timer = setInterval(() => {
      attemptAnswers(attempt.id).then(putAnswers).catch(() => {});
    }, GRADING_POLL_MS);
    return () => clearInterval(timer);
  }, [attempt, anyPending, grading, putAnswers]);

  // -------------------------------------------------------------------
  // Answering
  // -------------------------------------------------------------------
  const record = useCallback(
    async (q: TakeQuestion, response: Draft): Promise<AnswerRow | null> => {
      if (!attempt) return null;
      try {
        const saved = await saveAnswer(attempt, q, response, { existing: answersRef.current.get(q.id), hintUsed: hintShown, timeMs: Date.now() - questionStart });
        putAnswers(new Map(answersRef.current).set(q.id, saved));
        return saved;
      } catch (err) {
        showAlert('Your answer wasn’t saved', errorMessage(err, 'Check your connection and try again.'));
        return null;
      }
    },
    [attempt, hintShown, questionStart, putAnswers],
  );

  const finish = useCallback(async () => {
    if (!attempt) return;
    setBusy(true);
    try {
      const now = answersRef.current;
      const done = await finishAttempt(attempt, [...now.values()], unanswered(order, now));
      const all = new Map(answersRef.current);
      for (const a of done.added) all.set(a.question_id, a);
      putAnswers(all);
      setAttempt(done.attempt);
      setPhase('results');
      setPlay(null);
      if ([...all.values()].some((a) => a.verdict === 'pending')) void requestGrading();
    } catch (err) {
      showAlert('The quiz wasn’t finished', errorMessage(err, 'Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }, [attempt, order, requestGrading, putAnswers]);

  const goOn = useCallback(() => {
    if (index + 1 >= order.length) return void finish();
    const next = order[index + 1];
    setIndex(index + 1);
    setDraft(firstDraft(next, shownOrder(next)));
    setHintShown(false);
    setTimedOut(false);
    setPlay(null);
    setQuestionStart(Date.now());
    setPhase('question');
  }, [index, order, finish]);

  /** Check (after each) or Next (at the end): her answer saved and graded. `force`: time ran out. */
  const submit = useCallback(
    async (force = false) => {
      if (!question || busy || phase !== 'question') return;
      if (!force && !hasDraft(question.type, draft)) return;
      setBusy(true);
      const saved = await record(question, draft);
      setBusy(false);
      if (!saved) return;
      setTimedOut(force);
      if (choices?.answers === 'atEnd') return goOn();
      setPhase('feedback');
      if (saved.verdict === 'pending' && AI_GRADED.includes(question.type)) void requestGrading();
    },
    [question, busy, phase, draft, record, choices, goOn, requestGrading],
  );

  // -------------------------------------------------------------------
  // Time limits: what she wrote so far is saved and graded
  // -------------------------------------------------------------------
  const deadline =
    !attempt || phase === 'results' || phase === 'loading' || phase === 'error'
      ? null
      : limit.kind === 'total'
        ? Date.parse(attempt.started_at) + limit.minutes * 60_000
        : limit.kind === 'perQuestion' && phase === 'question'
          ? questionStart + limit.seconds * 1000
          : null;
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  const expired = useRef<number | null>(null);
  useEffect(() => {
    if (deadline === null || now < deadline || expired.current === deadline || busy) return;
    expired.current = deadline;
    if (limit.kind === 'perQuestion') return void submit(true);
    // The whole quiz's time: the question on screen saved as it is, then the end.
    (async () => {
      if (phase === 'question' && question) await record(question, draft);
      await finish();
    })();
  }, [now, deadline, busy, limit.kind, submit, phase, question, draft, record, finish]);

  // -------------------------------------------------------------------
  // The laptop's keys
  // -------------------------------------------------------------------
  const keys = useRef({ phase, question, submit, goOn, quit, setDraft });
  keys.current = { phase, question, submit, goOn, quit, setDraft };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (isDialogOpen() || e.altKey) return;
      const k = keys.current;
      const t = e.target as HTMLElement | null;
      const field = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const button = !!t && (t.tagName === 'BUTTON' || t.getAttribute('role') === 'button');
      if (e.key === 'Escape') {
        e.preventDefault();
        k.quit();
        return;
      }
      if (e.key === 'Enter') {
        // A focused button answers Enter itself; a long answer's Enter is a new line (⌘/Ctrl + Enter checks).
        // A field locked after Check (read-only) doesn't keep Enter: it goes on.
        const editable = field && !(t as HTMLInputElement).readOnly;
        if (button) return;
        if (editable && t?.tagName === 'TEXTAREA' && !(e.metaKey || e.ctrlKey)) return;
        if (editable && t?.tagName === 'INPUT') return; // onSubmitEditing
        e.preventDefault();
        if (k.phase === 'question') void k.submit();
        else if (k.phase === 'feedback') k.goOn();
        return;
      }
      if (field || e.metaKey || e.ctrlKey || k.phase !== 'question' || !k.question) return;
      const q = k.question;
      const options = q.type === 'multiple_choice' ? ((q.data.options as unknown[]) ?? []).length : q.type === 'true_false' ? 2 : 0;
      const i = options ? keyChoice(e.key, options) : null;
      if (i === null) return;
      e.preventDefault();
      k.setDraft(q.type === 'true_false' ? { value: i === 0 } : { choice: i });
    };
    // Capture: react-native-web's TextInput stops key events from bubbling, so a listener on the way up
    // never hears Enter / ⌘ + Enter / Escape typed in a field.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // -------------------------------------------------------------------
  // Sources and grades
  // -------------------------------------------------------------------
  const lectureToPlay = useRef<string | null>(null);
  const openSource = useCallback(
    (q: TakeQuestion) => {
      const file = q.source_file_id ? data?.files.get(q.source_file_id) : undefined;
      if (!file) return;
      if (file.kind === 'lecture') {
        if (q.source_ms === null) return router.push(`/doc/${file.id}` as Href);
        lectureToPlay.current = file.id;
        setPlay({ ms: q.source_ms, id: Date.now() });
        return;
      }
      if (file.kind !== 'pdf' && file.kind !== 'image') return router.push(`/doc/${file.id}` as Href);
      openSourceFile(file.id, q.source_page)
        .then((ok) => {
          if (!ok) showAlert('This file isn’t available', 'It may have been deleted or is still uploading.');
        })
        .catch((err) => showAlert('The file didn’t open', errorMessage(err, 'Opening a file needs a connection.')));
    },
    [data, router],
  );

  const regrade = useCallback(async (answer: AnswerRow, verdict: Verdict) => {
    try {
      const saved = await changeGrade(answer, verdict);
      putAnswers(new Map(answersRef.current).set(saved.question_id, saved));
    } catch (err) {
      showAlert('The grade wasn’t changed', errorMessage(err, 'Check your connection and try again.'));
    }
  }, [putAnswers]);

  // -------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------
  if (phase === 'loading' || phase === 'error' || !data || !attempt) {
    return (
      <GradientBackground>
        <ThemedStatusBar />
        <View style={[styles.center, compact && { paddingTop: insets.top }]} {...{ dataSet: { quizScreen: quizId } }}>
          {phase === 'error' ? (
            <>
              <Text style={styles.error} {...{ dataSet: { quizError: 'yes' } }}>
                {error}
              </Text>
              <Pressable onPress={quit} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.secondaryText}>Back to quizzes</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={c.accentDark} />
          )}
        </View>
      </GradientBackground>
    );
  }

  const left = deadline !== null ? msLeft(deadline, now) : null;
  const marks = data.marks;
  const counts = { exam: 0, confused: 0 };
  for (const q of order) {
    const m = q.mark_id ? marks.get(q.mark_id) : undefined;
    if (m?.type === 'exam') counts.exam++;
    if (m?.type === 'confused') counts.confused++;
  }
  const rightLabel = left !== null ? leftText(left) : marksText(counts);
  const mark = question?.mark_id ? marks.get(question.mark_id) : undefined;
  const tone = mark ? c.marks[mark.type] : null;
  const answer = question ? answers.get(question.id) : undefined;
  const file = question?.source_file_id ? data.files.get(question.source_file_id) : undefined;
  const lastQuestion = index + 1 >= order.length;
  const atEnd = choices?.answers === 'atEnd';
  const ready = !!question && hasDraft(question.type, draft);
  const primaryLabel = phase === 'feedback' ? (lastQuestion ? 'See results' : 'Next question') : atEnd ? (lastQuestion ? 'Finish' : 'Next question') : 'Check';

  const card =
    phase === 'results' ? (
      <View style={styles.card}>
        <QuizResults
          attempt={attempt}
          order={order}
          answers={answers}
          files={data.files}
          gradingNote={gradingNoteFor(grading)}
          onGrade={regrade}
          onRetryGrading={grading && grading !== 'grading' && grading !== 'offline' ? () => void requestGrading() : null}
          onSource={openSource}
          onTakeAgain={() => router.replace(`/review/quiz/${quizId}?new=${Date.now()}` as Href)}
          onDone={quit}
        />
      </View>
    ) : question ? (
      <View style={styles.card} {...{ dataSet: { quizCard: phase, quizType: question.type, quizQuestion: question.id } }}>
        {mark && tone && (
          <View style={[styles.chip, { backgroundColor: tone.bg }]} {...{ dataSet: { quizChip: mark.type } }}>
            <Text style={[styles.chipText, { color: tone.text }]}>{markChipText({ type: mark.type, level: mark.level, t: clockText(clock(mark.t_ms)) })}</Text>
          </View>
        )}
        {/* Not from a mark: where it comes from ("Tema 2 · 14:05", "Apuntes.pdf · p. 7"). */}
        {!mark && sourceChipText(question, file) && (
          <Pressable onPress={() => openSource(question)} style={({ pressed }) => [styles.chip, styles.sourceChip, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Source: ${sourceChipText(question, file)}`} {...{ dataSet: { quizChip: 'source' } }}>
            <Text style={[styles.chipText, styles.sourceChipText]}>{sourceChipText(question, file)}</Text>
          </Pressable>
        )}
        <Text style={styles.question} accessibilityRole="header" {...{ dataSet: { quizPrompt: 'yes' } }}>
          {question.prompt}
        </Text>
        <AnswerArea question={question} shown={shown} draft={draft} onDraft={setDraft} locked={phase !== 'question' || busy} onSubmit={() => void submit()} />
        {hintShown && phase === 'question' && (
          <View style={styles.hint} {...{ dataSet: { quizHint: 'shown' } }}>
            <Ionicons name="bulb-outline" size={16} color={c.status.info.text} />
            <Text style={styles.hintText}>{question.hint}</Text>
          </View>
        )}
        {phase === 'feedback' && (
          <QuizFeedback
            question={question}
            answer={answer}
            file={file}
            explanations={choices?.explanations ?? true}
            timedOut={timedOut}
            gradingNote={answer?.verdict === 'pending' ? gradingNoteFor(grading) : null}
            onSource={() => openSource(question)}
          />
        )}
        {play && lectureToPlay.current && <MiniPlayer lectureId={lectureToPlay.current} recording={false} request={play} onClose={() => setPlay(null)} />}
        <View style={styles.buttons}>
          {!compact && (
            <Pressable onPress={quit} style={({ pressed }) => [styles.quiet, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Quit (your answers are kept)" {...{ dataSet: { quizAction: 'quit' } }}>
              <Text style={styles.quietText}>Quit</Text>
            </Pressable>
          )}
          <View style={styles.flex} />
          {phase === 'question' && choices?.hints && !!question.hint && !hintShown && (
            <Pressable onPress={() => setHintShown(true)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { quizAction: 'hint' } }}>
              <Text style={styles.secondaryText}>Show hint</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => (phase === 'feedback' ? goOn() : void submit())}
            disabled={busy || (phase === 'question' && !ready)}
            style={({ pressed }) => [styles.primary, (busy || (phase === 'question' && !ready)) && styles.dim, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || (phase === 'question' && !ready) }}
            {...{ dataSet: { quizAction: phase === 'feedback' ? 'next' : atEnd ? 'next' : 'check' } }}
          >
            {busy ? <ActivityIndicator size="small" color={c.button.primaryText} /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
          </Pressable>
        </View>
      </View>
    ) : null;

  return (
    <GradientBackground>
      <ThemedStatusBar />
      <ScrollView contentContainerStyle={[styles.scroll, compact ? { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 } : styles.scrollWide]} keyboardShouldPersistTaps="handled">
        {/* The quiz screen's root, for the Chrome check (the Review tab stays mounted under it, with the same progress label). */}
        <View style={[styles.column, !compact && styles.columnWide]} {...{ dataSet: { quizScreen: quizId } }}>
          {compact && (
            <View style={styles.phoneHead}>
              <Pressable onPress={quit} style={styles.phoneQuit} accessibilityRole="button" accessibilityLabel="Quit (your answers are kept)" {...{ dataSet: { quizAction: 'quit' } }}>
                <Ionicons name="chevron-back" size={22} color={c.text.onGradientStrong} />
                <Text style={styles.phoneQuitText}>Quit</Text>
              </Pressable>
              <Text style={styles.phoneTitle} numberOfLines={1}>
                {data.quiz.title}
              </Text>
            </View>
          )}
          {phase !== 'results' && (
            <>
              {compact && (
                <View style={styles.phoneRow}>
                  <Text style={styles.phoneLabel}>
                    Question {index + 1} of {order.length}
                  </Text>
                  {left !== null && (
                    <Text style={[styles.phoneLabel, left < 60_000 && styles.urgent]} {...{ dataSet: { quizTime: 'left' } }}>
                      {leftText(left)}
                    </Text>
                  )}
                </View>
              )}
              <ReviewProgress label={`Question ${index + 1} of ${order.length}`} marks={rightLabel} done={(index + (phase === 'feedback' ? 1 : 0)) / order.length} compact={compact} />
            </>
          )}
          {card}
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 40 },
    scrollWide: { paddingTop: 40 },
    column: { width: '100%', alignSelf: 'center', gap: 16 },
    // desktop-07: the card's column, 720 px.
    columnWide: { maxWidth: 720 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    error: { fontSize: Typography.size.base, color: c.error, textAlign: 'center' },
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
    chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
    chipText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold },
    sourceChip: { backgroundColor: c.accentLight },
    sourceChipText: { color: c.accentDark },
    question: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary, lineHeight: 30 },
    hint: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.status.info.bg },
    hintText: { flex: 1, fontSize: Typography.size.base, color: c.status.info.text, lineHeight: 21 },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    flex: { flexGrow: 1 },
    quiet: { height: 44, paddingHorizontal: 4, justifyContent: 'center' },
    quietText: { fontSize: Typography.size.base, color: c.text.secondary },
    secondary: { height: 44, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, minWidth: 96, paddingHorizontal: 20, borderRadius: 10, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    dim: { opacity: 0.5 },
    pressed: { opacity: 0.7 },
    phoneHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    phoneQuit: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 8 },
    phoneQuitText: { fontSize: Typography.size.md, color: c.text.onGradientStrong },
    phoneTitle: { flex: 1, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold, color: c.text.onGradientStrong, textAlign: 'right' },
    phoneRow: { flexDirection: 'row', justifyContent: 'space-between' },
    phoneLabel: { fontSize: Typography.size.sm, color: c.text.onGradient },
    urgent: { fontWeight: Typography.weight.bold, color: c.text.onGradientStrong },
  });
