import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { DueLecture } from '../../services/lectureReview.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { anchorBelow, menuTriggerProps, showActionSheet, type Anchor } from '../dialogs/dialogs';

/**
 * Review's "Lectures to review today" (step 9.2; no mockup, the quiz rows' look of 9.1b), the same on
 * both devices, over Flashcards and Quiz me: each lecture due today, "Psicobiología · Day 3" (or "A
 * week before the exam", "Day before the exam"). **Review** opens its Quiz me questions (finishing
 * them marks it reviewed) or, without a self-test, its Summary tab; its menu (…, right-click,
 * long-press): Mark reviewed (with Undo) and Open lecture. Nothing shows when nothing is due.
 */
export function LecturesToday({
  lectures,
  hasQuestions,
  onReview,
  onMarkReviewed,
  onOpen,
}: {
  lectures: DueLecture[];
  /** Whether the lecture has Quiz me questions (its summary's self-test). */
  hasQuestions: (fileId: string) => boolean;
  onReview: (lecture: DueLecture) => void;
  onMarkReviewed: (lecture: DueLecture) => void;
  onOpen: (lecture: DueLecture) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  if (!lectures.length) return null;
  const menu = (lecture: DueLecture, anchor?: Anchor) =>
    showActionSheet(
      lecture.title,
      [
        { text: 'Mark reviewed', icon: 'checkmark-circle-outline', onPress: () => onMarkReviewed(lecture) },
        { text: 'Open lecture', icon: 'document-text-outline', onPress: () => onOpen(lecture) },
      ],
      { anchor },
    );
  return (
    <View style={styles.wrap} {...{ dataSet: { lectures: 'today' } }}>
      <Text style={styles.heading} accessibilityRole="header">
        Lectures to review today
      </Text>
      {lectures.map((l) => (
        <Row key={l.fileId} lecture={l} quiz={hasQuestions(l.fileId)} onReview={() => onReview(l)} onMenu={(anchor) => menu(l, anchor)} />
      ))}
    </View>
  );
}

function Row({ lecture, quiz, onReview, onMenu }: { lecture: DueLecture; quiz: boolean; onReview: () => void; onMenu: (anchor?: Anchor) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const more = useRef<View>(null);
  const detail = [lecture.course, lecture.label].filter(Boolean).join(' · ');
  return (
    // The buttons are the text's siblings, not inside it (no button in a button on the web).
    <View style={styles.row} {...{ dataSet: { lectures: 'row', id: lecture.fileId, session: lecture.label } }}>
      <Pressable style={styles.rowText} accessibilityLabel={`${lecture.title}, ${detail}`} {...menuTriggerProps(onMenu)}>
        <Text style={styles.title} numberOfLines={1}>
          {lecture.title}
        </Text>
        <Text style={styles.detail} {...{ dataSet: { lectures: 'detail' } }}>
          {detail}
        </Text>
      </Pressable>
      <Pressable
        onPress={onReview}
        style={({ pressed }) => [styles.review, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Review ${lecture.title}`}
        accessibilityHint={quiz ? 'Its Quiz me questions' : 'Opens its summary'}
        {...{ dataSet: { lectures: 'review', target: quiz ? 'quiz' : 'summary' } }}
      >
        <Text style={styles.reviewText}>Review</Text>
      </Pressable>
      <Pressable
        ref={more}
        onPress={async () => onMenu(await anchorBelow(more))}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`More for ${lecture.title}`}
        {...{ dataSet: { lectures: 'more' } }}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={c.text.secondary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    heading: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.onGradientStrong },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, paddingLeft: 16, paddingRight: 4, borderRadius: 14, backgroundColor: c.card },
    rowText: { flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center', paddingVertical: 8 },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    detail: { fontSize: Typography.size.sm, color: c.text.secondary },
    review: { height: 36, minWidth: 64, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    reviewText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.7 },
  });
