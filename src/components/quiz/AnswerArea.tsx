import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { QuizResponse } from '../../../supabase/functions/_shared/quiz-grade';
import type { TakeQuestion } from '../../lib/quiz/session';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { anchorBelow, showActionSheet } from '../dialogs/dialogs';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const circled = (i: number) => CIRCLED[i] ?? `(${i + 1})`;
const letter = (i: number) => String.fromCharCode(65 + i);

/** The answer she is giving (a draft until Check / Next saves it). */
export type Draft = QuizResponse | null;

/** The first draft of a question: an order question starts in its shown order; match pairs with nothing chosen. */
export function firstDraft(q: TakeQuestion, shown: number[]): Draft {
  if (q.type === 'order_steps') return { order: shown };
  if (q.type === 'match_pairs') return { matches: shown.map(() => null) };
  if (q.type === 'fill_blank') return { blanks: ((q.data.blanks as unknown[]) ?? []).map(() => '') };
  return null;
}

/** "The ___ is …" with ① ② in place of the blanks. */
export const blankText = (text: string) => {
  let n = 0;
  return text.replace(/_{3,}/g, () => circled(n++));
};

/**
 * The answer area of a quiz question (step 9.1b-3; desktop-07): A–D rows for multiple choice (and
 * True / False), a one-line field (short answer, numeric with its unit), a multi-line one with a word
 * count (long answer), ① ② fields (fill in the blank), each left item's choice among the right ones
 * shown shuffled (match pairs), ↑ ↓ rows shown shuffled (put in order). `locked` after Check: her
 * answer stays, the right option green and hers red when wrong.
 */
export function AnswerArea({
  question,
  shown,
  draft,
  onDraft,
  locked,
  onSubmit,
}: {
  question: TakeQuestion;
  /** Match pairs' right items / the steps, in the order shown (stored indices). */
  shown: number[];
  draft: Draft;
  onDraft: (d: Draft) => void;
  locked: boolean;
  /** Enter in a one-line field. */
  onSubmit: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const d = question.data as Record<string, never>;
  const r = (draft ?? {}) as Record<string, never>;

  const choiceRows = (labels: string[], chosen: number | null, right: number | null, pick: (i: number) => void) => (
    <View style={styles.options} accessibilityRole="radiogroup">
      {labels.map((label, i) => {
        const on = chosen === i;
        const good = locked && right === i;
        const bad = locked && on && right !== i;
        return (
          <Pressable
            key={i}
            disabled={locked}
            onPress={() => pick(i)}
            style={({ pressed }) => [styles.option, on && styles.optionOn, good && styles.optionGood, bad && styles.optionBad, pressed && styles.pressed]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: locked }}
            aria-checked={on}
            accessibilityLabel={`${letter(i)}: ${label}`}
            {...{ dataSet: { quizOption: letter(i), on: on ? 'yes' : 'no', verdict: good ? 'right' : bad ? 'wrong' : '' } }}
          >
            <View style={[styles.letter, on && styles.letterOn]}>
              <Text style={[styles.letterText, on && styles.letterTextOn]}>{letter(i)}</Text>
            </View>
            <Text style={styles.optionText}>{label}</Text>
            {good && <Ionicons name="checkmark-circle" size={20} color={c.status.success.text} />}
            {bad && <Ionicons name="close-circle" size={20} color={c.status.error.text} />}
          </Pressable>
        );
      })}
    </View>
  );

  switch (question.type) {
    case 'multiple_choice':
      return choiceRows((d.options as string[]) ?? [], typeof r.choice === 'number' ? r.choice : null, d.correct as number, (i) => onDraft({ choice: i }));
    case 'true_false':
      return choiceRows(['True', 'False'], typeof r.value === 'boolean' ? (r.value ? 0 : 1) : null, d.correct ? 0 : 1, (i) => onDraft({ value: i === 0 }));
    case 'short_answer':
    case 'numeric':
      return (
        <View style={styles.fieldRow}>
          <Field
            value={typeof r.text === 'string' ? r.text : ''}
            onChange={(text) => onDraft({ text })}
            locked={locked}
            onSubmit={onSubmit}
            numeric={question.type === 'numeric'}
            label={question.type === 'numeric' ? 'Your answer (a number)' : 'Your answer'}
          />
          {question.type === 'numeric' && !!d.unit && <Text style={styles.unit}>{d.unit as string}</Text>}
        </View>
      );
    case 'long_answer': {
      const text = typeof r.text === 'string' ? r.text : '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return (
        <View style={styles.longWrap}>
          <TextInput
            value={text}
            onChangeText={(t) => onDraft({ text: t })}
            editable={!locked}
            multiline
            placeholder="Write your answer"
            placeholderTextColor={c.text.placeholder}
            style={[styles.input, styles.long]}
            accessibilityLabel="Your answer"
            {...{ dataSet: { quizField: 'long' } }}
          />
          <Text style={styles.count} {...{ dataSet: { quizWords: String(words) } }}>
            {words} {words === 1 ? 'word' : 'words'}
            {Platform.OS === 'web' && !locked ? ' · ⌘/Ctrl + Enter to check' : ''}
          </Text>
        </View>
      );
    }
    case 'fill_blank': {
      const blanks = (r.blanks as string[] | undefined) ?? [];
      const n = ((d.blanks as unknown[]) ?? []).length;
      return (
        <View style={styles.blanks}>
          <Text style={styles.blankText}>{blankText(String(d.text ?? ''))}</Text>
          {Array.from({ length: n }, (_, i) => (
            <View key={i} style={styles.fieldRow}>
              <Text style={styles.circled}>{circled(i)}</Text>
              <Field
                value={blanks[i] ?? ''}
                onChange={(t) => onDraft({ blanks: Array.from({ length: n }, (_, k) => (k === i ? t : (blanks[k] ?? ''))) })}
                locked={locked}
                onSubmit={onSubmit}
                label={`Blank ${i + 1}`}
              />
            </View>
          ))}
        </View>
      );
    }
    case 'match_pairs':
      return <Pairs question={question} shown={shown} matches={(r.matches as (number | null)[] | undefined) ?? shown.map(() => null)} onDraft={onDraft} locked={locked} />;
    case 'order_steps':
      return <Steps steps={(d.steps as string[]) ?? []} order={(r.order as number[] | undefined) ?? shown} onDraft={onDraft} locked={locked} />;
  }
}

function Field({ value, onChange, locked, onSubmit, numeric, label }: { value: string; onChange: (t: string) => void; locked: boolean; onSubmit: () => void; numeric?: boolean; label: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={!locked}
      onSubmitEditing={onSubmit}
      blurOnSubmit={false}
      returnKeyType="done"
      autoCorrect={false}
      keyboardType={numeric ? (Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad') : 'default'}
      placeholder={numeric ? '0' : 'Your answer'}
      placeholderTextColor={c.text.placeholder}
      style={[styles.input, styles.flex]}
      accessibilityLabel={label}
      {...{ dataSet: { quizField: numeric ? 'numeric' : 'text' } }}
    />
  );
}

/** Each left item, and the right item she matched to it (chosen in a menu of the right items, shown shuffled). */
function Pairs({ question, shown, matches, onDraft, locked }: { question: TakeQuestion; shown: number[]; matches: (number | null)[]; onDraft: (d: Draft) => void; locked: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const pairs = (question.data.pairs as { left: string; right: string }[]) ?? [];
  const refs = useRef<(View | null)[]>([]);
  const choose = async (i: number) => {
    const anchor = await anchorBelow({ current: refs.current[i] });
    showActionSheet(
      pairs[i].left,
      shown.map((k) => ({
        text: pairs[k].right,
        icon: matches[i] === k ? 'checkmark' : undefined,
        onPress: () => onDraft({ matches: pairs.map((_, j) => (j === i ? k : matches[j] === k ? null : (matches[j] ?? null))) }),
      })),
      { anchor },
    );
  };
  return (
    <View style={styles.options}>
      {pairs.map((p, i) => {
        const m = matches[i];
        const good = locked && m === i;
        const bad = locked && m !== i;
        return (
          <View key={i} style={[styles.pair, good && styles.optionGood, bad && styles.optionBad]} {...{ dataSet: { quizPair: String(i) } }}>
            <Text style={[styles.optionText, styles.pairLeft]}>{p.left}</Text>
            <Ionicons name="arrow-forward" size={16} color={c.text.secondary} />
            <Pressable
              ref={(v) => {
                refs.current[i] = v;
              }}
              disabled={locked}
              onPress={() => void choose(i)}
              style={({ pressed }) => [styles.pairChoice, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Match for ${p.left}: ${m === null || m === undefined ? 'not chosen' : pairs[m].right}`}
              {...{ dataSet: { quizPairChoice: String(i) } }}
            >
              <Text style={[styles.optionText, m === null || m === undefined ? styles.placeholder : null]} numberOfLines={2}>
                {m === null || m === undefined ? 'Choose…' : pairs[m].right}
              </Text>
              {!locked && <Ionicons name="chevron-down" size={16} color={c.text.secondary} />}
            </Pressable>
            {locked && bad && <Text style={styles.rightAnswer}>{p.right}</Text>}
          </View>
        );
      })}
    </View>
  );
}

/** The steps in her order, each moved with ↑ ↓. */
function Steps({ steps, order, onDraft, locked }: { steps: string[]; order: number[]; onDraft: (d: Draft) => void; locked: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const move = (at: number, by: number) => {
    const to = at + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[at], next[to]] = [next[to], next[at]];
    onDraft({ order: next });
  };
  return (
    <View style={styles.options}>
      {order.map((k, at) => {
        const good = locked && k === at;
        const bad = locked && k !== at;
        return (
          <View key={k} style={[styles.step, good && styles.optionGood, bad && styles.optionBad]} {...{ dataSet: { quizStep: String(k) } }}>
            <Text style={styles.stepNo}>{at + 1}</Text>
            <Text style={[styles.optionText, styles.flex]}>{steps[k]}</Text>
            {!locked && (
              <>
                <Pressable disabled={at === 0} onPress={() => move(at, -1)} style={[styles.arrow, at === 0 && styles.dim]} accessibilityRole="button" accessibilityLabel={`Move up: ${steps[k]}`}>
                  <Ionicons name="arrow-up" size={18} color={c.text.primary} />
                </Pressable>
                <Pressable disabled={at === order.length - 1} onPress={() => move(at, 1)} style={[styles.arrow, at === order.length - 1 && styles.dim]} accessibilityRole="button" accessibilityLabel={`Move down: ${steps[k]}`}>
                  <Ionicons name="arrow-down" size={18} color={c.text.primary} />
                </Pressable>
              </>
            )}
            {bad && <Text style={styles.rightPlace}>→ {k + 1}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    options: { gap: 10 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    optionOn: { borderColor: c.accentDark, backgroundColor: c.accentLight },
    optionGood: { borderColor: c.status.success.border, backgroundColor: c.status.success.bg },
    optionBad: { borderColor: c.status.error.border, backgroundColor: c.status.error.bg },
    letter: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardMuted },
    letterOn: { backgroundColor: c.accentDark },
    letterText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, color: c.text.primary },
    letterTextOn: { color: c.accentOn },
    optionText: { flexShrink: 1, fontSize: Typography.size.base, color: c.text.primary, lineHeight: 21 },
    placeholder: { color: c.text.secondary },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, fontSize: Typography.size.base, color: c.text.primary },
    flex: { flex: 1, minWidth: 0 },
    unit: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.secondary },
    longWrap: { gap: 6 },
    long: { minHeight: 160, textAlignVertical: 'top' },
    count: { alignSelf: 'flex-end', fontSize: Typography.size.xs, color: c.text.secondary },
    blanks: { gap: 10 },
    blankText: { fontSize: Typography.size.base, color: c.text.primary, lineHeight: 24 },
    circled: { width: 22, fontSize: Typography.size.md, color: c.text.secondary },
    pair: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 10, paddingLeft: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    pairLeft: { flexBasis: 120, flexGrow: 1, fontWeight: Typography.weight.medium },
    pairChoice: { flexDirection: 'row', alignItems: 'center', gap: 6, flexBasis: 160, flexGrow: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.cardMuted, justifyContent: 'space-between' },
    rightAnswer: { width: '100%', fontSize: Typography.size.sm, color: c.status.success.text },
    step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingLeft: 14, paddingRight: 4, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    stepNo: { width: 20, fontSize: Typography.size.sm, fontWeight: Typography.weight.bold, color: c.text.secondary },
    arrow: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
    rightPlace: { paddingRight: 10, fontSize: Typography.size.sm, color: c.status.error.text },
    dim: { opacity: 0.35 },
    pressed: { opacity: 0.7 },
  });
