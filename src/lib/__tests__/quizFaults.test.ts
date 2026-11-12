/**
 * @jest-environment node
 */
// The free evaluation's planted faults (scripts/fixtures/quiz-faults.ts, run by
// `npm run eval:quizzes -- --faults` with the synthetic lecture's sources) on every `npm run check`:
// the hand-made good quiz passes as it is, and each fault planted in it is caught.
import { goodAnswer, goodContext } from '../../../scripts/fixtures/quiz-good-answer';
import { evaluateAnswer, QUIZ_FAULTS } from '../../../scripts/fixtures/quiz-faults';
import { normalizeLatex, type Sources } from '../../../supabase/functions/_shared/summary-checks';
import { PAST_EXAM_EXPECTED, PAST_EXAM_STEMS, syntheticPastExam } from '../../../scripts/fixtures/synthetic-past-exam';

/** What the synthetic Tema 1 lecture gives the checks (its notes' formula); 98765 and 1872 are in nothing. */
const SRC: Sources = { numbers: new Set([5, 1859]), dates: new Set(), formulas: new Set([normalizeLatex('h^2 = V_G / V_P')]), photos: new Set() };

describe('the planted faults', () => {
  it('the good quiz passes as it is: every question kept', () => {
    const o = evaluateAnswer(goodAnswer(), goodContext(), SRC);
    expect({ failed: o.failed, dropped: o.dropped }).toEqual({ failed: [], dropped: [] });
    expect(o.kept.map((q) => q.slot)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it.each(QUIZ_FAULTS.map((f) => [f.name, f] as const))('caught: %s', (_name, fault) => {
    const answer = goodAnswer();
    const ctx = goodContext();
    fault.plant(answer, ctx);
    expect(fault.caught(evaluateAnswer(answer, ctx, SRC))).toBe(true);
  });

  it('the synthetic past exam has the format it claims (12: 8 multiple choice with 4 options, 2 true/false, 2 short), and its stems', () => {
    const lines = syntheticPastExam().content.content.map((p) => p.content[0].text);
    expect(lines.filter((l) => /^\d+\. /.test(l))).toHaveLength(PAST_EXAM_EXPECTED.questionCount);
    expect(lines.filter((l) => /^[a-d]\) /.test(l))).toHaveLength(PAST_EXAM_EXPECTED.types.multiple_choice * PAST_EXAM_EXPECTED.optionsPerQuestion);
    expect(PAST_EXAM_STEMS.every((s) => lines.some((l) => l.includes(s)))).toBe(true);
  });
});
