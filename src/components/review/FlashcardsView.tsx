import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAppUndo } from '../../hooks/useAppUndo';
import { cardProgress, currentCard, flip, rated, removeCurrent, skip, startCards, type CardSession } from '../../lib/review/session';
import { GRADE_LABELS, GRADES, intervalLabel, type Grade } from '../../lib/review/schedule';
import { deleteCard, rateCard, type ReviewCard } from '../../services/review.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import { showAlert } from '../dialogs/dialogs';
import { ReviewProgress } from './ReviewProgress';

const LABELS: Record<ReviewCard['kind'], string> = { term: 'Term', question: 'Question', card: 'Flashcard' };
/** How far a swipe goes before it skips to the next card (px). */
const SWIPE = 80;

/**
 * The review screen's Flashcards (desktop-08 / iphone-10): the due cards one by one.
 * Click (laptop: also Space) or tap flips the card; Again · Hard · Good · Easy rate it (the laptop
 * shows each one's next interval; keys 1–4); a swipe left or right on the iPhone skips to the next
 * card (it stays due; → on the laptop). On the back: the answer, its lecture, and Delete card.
 */
export function FlashcardsView({
  cards,
  marks,
  compact,
  reviewedBefore,
  onCurrent,
  onReviewed,
}: {
  cards: ReviewCard[];
  marks: string;
  compact: boolean;
  /** Reviews already done today (the end card's count). */
  reviewedBefore: number;
  /** The card shown (the laptop's top bar names its lecture). */
  onCurrent: (card: ReviewCard | null) => void;
  /** After each rating (Review today counts down). */
  onReviewed: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const showUndo = useAppUndo();
  const [session, setSession] = useState<CardSession>(() => startCards(cards));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = currentCard(session);
  const progress = cardProgress(session);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => onCurrent(card), [card, onCurrent]);

  /**
   * A card's side and place change at once; the movement after is only a look. (When they waited for
   * the animation's end, a rating pressed during a flip flipped the next card, and a browser that
   * pauses animation frames, a background tab, left the card half-turned.) A timer always settles it.
   */
  const settleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => settleTimers.current.forEach(clearTimeout), []);
  const animateTo = (value: Animated.Value, from: number, to: number, duration: number) => {
    value.stopAnimation();
    value.setValue(from);
    Animated.timing(value, { toValue: to, duration, useNativeDriver: Platform.OS !== 'web' }).start();
    settleTimers.current.push(
      setTimeout(() => {
        value.stopAnimation();
        value.setValue(to);
      }, duration + 250),
    );
  };

  // The flip: the other side at once, opening from narrow to full width.
  const turn = useRef(new Animated.Value(1)).current;
  const doFlip = () => {
    if (!sessionRef.current.queue[sessionRef.current.at]) return;
    if (Platform.OS === 'web') (document.activeElement as HTMLElement | null)?.blur?.();
    setSession((s) => flip(s));
    animateTo(turn, 0.2, 1, 180);
  };

  const rate = async (grade: Grade) => {
    const s = sessionRef.current;
    const now = currentCard(s);
    if (!now || busy) return;
    // A clicked button keeps the focus: Space would press it again as well as flip the next card.
    if (Platform.OS === 'web') (document.activeElement as HTMLElement | null)?.blur?.();
    setBusy(true);
    setError(null);
    try {
      const state = await rateCard(now, grade);
      setSession((cur) => (currentCard(cur)?.id === now.id ? rated(cur, grade, state) : cur));
      onReviewed();
    } catch (err) {
      setError(errorMessage(err, 'Could not save this review. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  // The swipe (iPhone, and a narrow window): the card follows the finger; far enough, the next card.
  const shift = useRef(new Animated.Value(0)).current;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => shift.setValue(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < SWIPE) {
            animateTo(shift, g.dx, 0, 160);
            return;
          }
          // The next card at once, coming in from the side the finger went to.
          setSession((s) => skip(s));
          animateTo(shift, -Math.sign(g.dx) * 80, 0, 180);
        },
        onPanResponderTerminate: () => animateTo(shift, 0, 0, 0),
      }),
    [shift],
  );

  // The laptop's keys: Space flips, 1–4 rate, → skips.
  useEffect(() => {
    if (Platform.OS !== 'web' || compact) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        doFlip();
      } else if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        void rate(GRADES[Number(e.key) - 1]);
      } else if (e.key === 'ArrowRight') {
        setSession((s) => skip(s));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // The handlers read the session through its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  const remove = async () => {
    const now = currentCard(sessionRef.current);
    if (!now) return;
    try {
      const undo = await deleteCard(now.id);
      setSession((s) => (currentCard(s)?.id === now.id ? removeCurrent(s) : s));
      showUndo('Card deleted', () => void undo().catch((err) => showAlert('Could not restore the card', errorMessage(err, 'Please try again.'))));
    } catch (err) {
      showAlert('Could not delete the card', errorMessage(err, 'Deleting a card needs a connection.'));
    }
  };

  if (!card) {
    const total = reviewedBefore + session.reviewed;
    return (
      <View style={[styles.card, styles.endCard]} {...{ dataSet: { review: 'done' } }}>
        <Ionicons name="checkmark-circle-outline" size={36} color={c.accentDark} />
        <Text style={styles.endTitle}>{session.reviewed || reviewedBefore ? 'All done for today' : 'Nothing to review today'}</Text>
        <Text style={styles.endText}>{total ? `${total} ${total === 1 ? 'card' : 'cards'} reviewed today` : 'New flashcards from your summaries and the study assistant come here.'}</Text>
      </View>
    );
  }

  const label = `${LABELS[card.kind].toUpperCase()}${compact && card.course ? ` · ${card.course.toUpperCase()}` : ''}`;
  const now = new Date();
  return (
    <View style={styles.wrap}>
      <ReviewProgress label={`Card ${progress.n} of ${progress.total}`} marks={marks} done={progress.done} compact={compact} />
      <Animated.View style={{ transform: [{ translateX: shift }, { scaleX: turn }] }} {...(compact ? pan.panHandlers : {})}>
        <Pressable
          onPress={doFlip}
          style={[styles.card, compact && styles.cardCompact]}
          accessibilityRole="button"
          accessibilityLabel={session.flipped ? `Answer: ${card.back}` : `${LABELS[card.kind]}: ${card.front}. ${compact ? 'Tap' : 'Click'} to flip`}
          {...{ dataSet: { reviewCard: session.flipped ? 'back' : 'front' } }}
        >
          <Text style={styles.kind}>{session.flipped ? 'ANSWER' : label}</Text>
          {session.flipped ? (
            <>
              <Text style={styles.asked} numberOfLines={2}>
                {card.front}
              </Text>
              <Text style={[styles.main, styles.answer]}>{card.back}</Text>
              {!!card.lecture && <Text style={styles.hint}>From {card.lecture}</Text>}
            </>
          ) : (
            <>
              <Text style={styles.main}>{card.front}</Text>
              <Text style={styles.hint}>{compact ? 'Tap to flip' : 'Click to flip'}</Text>
            </>
          )}
        </Pressable>
        {/*
          Delete card, over the card's corner: the card's sibling, not inside it (a button inside a
          button is invalid HTML, screen readers read it as part of the card, and a press could reach
          the flip). In the same moving view, so it turns and swipes with the card.
        */}
        {session.flipped && (
          <Pressable onPress={() => void remove()} style={styles.delete} accessibilityRole="button" accessibilityLabel="Delete card" hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={c.text.secondary} />
          </Pressable>
        )}
      </Animated.View>
      <View style={styles.grades}>
        {GRADES.map((g) => (
          <Pressable
            key={g}
            onPress={() => void rate(g)}
            disabled={busy}
            style={({ pressed }) => [styles.grade, styles[`grade_${g}`], compact && styles.gradeCompact, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={GRADE_LABELS[g]}
            accessibilityHint={`Next review in ${intervalLabel(card.state, g, now)}`}
          >
            <Text style={[styles.gradeName, styles[`gradeText_${g}`]]}>{GRADE_LABELS[g]}</Text>
            {!compact && <Text style={[styles.gradeWhen, styles[`gradeText_${g}`]]}>{intervalLabel(card.state, g, now)}</Text>}
          </Pressable>
        ))}
      </View>
      {compact && <Text style={styles.footHint}>Tap to flip · swipe left or right for the next card</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => {
  const tone = { again: c.status.error, hard: c.status.warning, good: c.status.info, easy: c.status.success };
  return StyleSheet.create({
    wrap: { gap: 20 },
    card: {
      minHeight: 340,
      paddingHorizontal: 32,
      paddingVertical: 28,
      borderRadius: 18,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
    },
    cardCompact: { minHeight: 360, paddingHorizontal: 20 },
    endCard: { minHeight: 220 },
    kind: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 1.2, color: c.text.secondary, textAlign: 'center' },
    main: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.bold, color: c.text.primary, textAlign: 'center' },
    answer: { fontSize: Typography.size.lg, fontWeight: Typography.weight.semibold },
    asked: { fontSize: Typography.size.sm, color: c.text.secondary, textAlign: 'center' },
    hint: { fontSize: Typography.size.sm, color: c.text.secondary, textAlign: 'center' },
    delete: { position: 'absolute', top: 14, right: 14, padding: 6 },
    grades: { flexDirection: 'row', gap: 10 },
    grade: { flex: 1, minHeight: 50, borderRadius: 10, borderWidth: 1, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
    gradeCompact: { minHeight: 54, borderRadius: 14 },
    grade_again: { borderColor: tone.again.border },
    grade_hard: { borderColor: tone.hard.border },
    grade_good: { borderColor: tone.good.border },
    grade_easy: { borderColor: tone.easy.border },
    gradeText_again: { color: tone.again.text },
    gradeText_hard: { color: tone.hard.text },
    gradeText_good: { color: tone.good.text },
    gradeText_easy: { color: tone.easy.text },
    gradeName: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },
    gradeWhen: { fontSize: Typography.size.xs },
    pressed: { opacity: 0.7 },
    footHint: { fontSize: Typography.size.sm, color: c.text.onGradient, textAlign: 'center' },
    error: { fontSize: Typography.size.sm, color: c.error, textAlign: 'center' },
    endTitle: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    endText: { fontSize: Typography.size.base, color: c.text.secondary, textAlign: 'center' },
  });
};
