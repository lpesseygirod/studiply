import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { GradientBackground } from '../../../src/components/GradientBackground';
import { FlashcardsView } from '../../../src/components/review/FlashcardsView';
import { QuizView } from '../../../src/components/review/QuizView';
import { useShellScreen, type DocumentHeader } from '../../../src/components/shell/ShellContext';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { loadReview, type ReviewCard, type ReviewData } from '../../../src/services/review.service';
import type { QuizItem } from '../../../src/lib/review/session';
import { errorMessage } from '../../../src/utils/errors';

type Mode = 'cards' | 'quiz';

/**
 * Review (step 9.1): Flashcards and Quiz me.
 * - Laptop (desktop-07/08): no sidebar; the top bar names the card's course and lecture and holds the
 *   Quiz me | Flashcards control (?mode=quiz); the card in a centred column on the gradient.
 * - iPhone (iphone-10): the Review tab: "Review", "N due today", Flashcards | Quiz me, the card.
 * Both read the same data (services/review.service: the iPhone its own copy, offline too).
 */
export default function ReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const compact = useLayoutMode() === 'compact';
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === 'quiz' ? 'quiz' : 'cards';
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [shown, setShown] = useState<{ course: string | null; lecture: string | null; fileId: string | null } | null>(null);

  const load = useCallback(() => {
    setError(null);
    loadReview()
      .then((d) => {
        setData(d);
        setReviewed(0);
        // A new session each time the screen is opened.
        setSession((s) => s + 1);
      })
      .catch((err) => setError(errorMessage(err, 'Could not load your review.')));
  }, []);
  useFocusEffect(load);

  const onCard = useCallback((card: ReviewCard | null) => setShown(card ? { course: card.course, lecture: card.lecture, fileId: card.fileId } : null), []);
  const onQuestion = useCallback((item: QuizItem | null) => setShown(item ? { course: item.deck.course, lecture: item.deck.lecture, fileId: item.deck.fileId } : null), []);
  const onReviewed = useCallback(() => setReviewed((n) => n + 1), []);

  // The laptop's top bar: "Review today · Course › Lecture" over the lecture's title.
  const header: DocumentHeader = {
    crumbs: [
      { label: shown?.course ? `Review today · ${shown.course}` : 'Review today', href: '/review' as Href },
      ...(shown?.lecture && shown.fileId ? [{ label: shown.lecture, href: `/doc/${shown.fileId}` as Href }] : []),
    ],
    title: shown?.lecture ?? 'Review',
    saved: null,
  };
  useShellScreen(null, header);

  const due = data ? Math.max(0, data.dueToday - reviewed) : null;
  const setMode = (m: Mode) => router.replace((m === 'quiz' ? '/review?mode=quiz' : '/review') as Href);

  const body = !data ? (
    <View style={styles.center}>
      {error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={load} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={c.accentDark} />
      )}
    </View>
  ) : mode === 'quiz' ? (
    <QuizView key={`quiz-${session}`} decks={data.quiz} compact={compact} onCurrent={onQuestion} />
  ) : (
    <FlashcardsView key={`cards-${session}`} cards={data.cards} marks={data.cardsMarks} compact={compact} reviewedBefore={data.reviewedToday} onCurrent={onCard} onReviewed={onReviewed} />
  );

  return (
    <GradientBackground>
      <ThemedStatusBar />
      <ScrollView contentContainerStyle={[styles.scroll, compact ? { paddingTop: insets.top + 16 } : styles.scrollWide]} keyboardShouldPersistTaps="handled">
        <View style={[styles.column, !compact && styles.columnWide]}>
          {compact && (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Review</Text>
                {due !== null && (
                  <Text style={styles.due} {...{ dataSet: { review: 'due' } }}>
                    {due} due today
                  </Text>
                )}
              </View>
              <View style={styles.modes} accessibilityRole="tablist">
                {(['cards', 'quiz'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.mode, mode === m && styles.modeOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === m }}
                    aria-selected={mode === m}
                    accessibilityLabel={m === 'cards' ? 'Flashcards' : 'Quiz me'}
                  >
                    <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>{m === 'cards' ? 'Flashcards' : 'Quiz me'}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {body}
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 40 },
    scrollWide: { paddingTop: 40 },
    column: { width: '100%', maxWidth: Layout.pageMaxWidth, alignSelf: 'center', gap: 16 },
    // desktop-07/08: the card's column, 720 px.
    columnWide: { maxWidth: 720 },
    titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    title: { fontSize: Typography.size['3xl'], fontWeight: Typography.weight.extrabold, color: c.text.onGradientStrong },
    due: { fontSize: Typography.size.base, color: c.text.onGradient },
    modes: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: c.cardMuted },
    mode: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    modeOn: { backgroundColor: c.card },
    modeText: { fontSize: Typography.size.base, color: c.text.secondary },
    modeTextOn: { fontWeight: Typography.weight.semibold, color: c.text.primary },
    center: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12 },
    error: { fontSize: Typography.size.base, color: c.error, textAlign: 'center' },
    retry: { height: 40, paddingHorizontal: 18, borderRadius: 10, backgroundColor: c.card, justifyContent: 'center' },
    retryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.accentDark },
  });
