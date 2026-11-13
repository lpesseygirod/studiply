// The credit rules the Edge Functions use (_shared/credits.ts), the quiz cap
// (quiz-plan.ts maxCount), and the words the app shows for no_credits.

import {
  BLOCK_MS,
  NO_CREDITS,
  blockOf,
  combineKey,
  lectureKey,
  maxQuestionsFor,
  noCredits,
  quizKey,
  quizPaidCount,
  quizUnits,
  reverseSpend,
  spendCredits,
  spendSummary,
  summaryKey,
} from '../../../supabase/functions/_shared/credits';
import { planQuiz, QUESTION_TYPES, QUIZ_SLIDER_DEFAULTS, type QuizPlanInput } from '../../../supabase/functions/_shared/quiz-plan';
import { SUMMARY_ERRORS, summaryCardText } from '../../components/summarize/summaryCard';
import { FAILED_WORDS, NO_CREDITS_NOTE, quizRowState } from '../quiz/status';
import type { LectureSummary } from '../../services/summarize.service';

const MIN = 60 * 1000;

describe('a lecture credit covers every started 2 hours', () => {
  it('blocks', () => {
    expect(BLOCK_MS).toBe(120 * MIN);
    expect(blockOf(0)).toBe(0);
    expect(blockOf(119 * MIN + 59_999)).toBe(0);
    expect(blockOf(120 * MIN)).toBe(1);
    expect(blockOf(179 * MIN)).toBe(1);
    expect(blockOf(240 * MIN)).toBe(2);
  });

  it('keys', () => {
    expect(lectureKey('L', blockOf(130 * MIN))).toBe('lecture:L:block:1');
    expect(summaryKey('S')).toBe('summary:S');
    expect(combineKey('S')).toBe('combine:S');
    expect(quizKey('Q')).toBe('quiz:Q');
  });
});

describe('quizzes', () => {
  it('cost ¼ / ½ / ¾ of a lecture by size', () => {
    expect([1, 10, 11, 25, 26, 50].map(quizUnits)).toEqual([1, 1, 2, 2, 3, 3]);
    expect([1, 2, 3].map(maxQuestionsFor)).toEqual([10, 25, 60]);
    // What a price pays for is never in a dearer size.
    for (let n = 1; n <= 60; n++) expect(quizUnits(Math.min(n, maxQuestionsFor(quizUnits(n))))).toBe(quizUnits(n));
  });

  it('are priced from the row as the server reads it', () => {
    expect(quizPaidCount({ question_count: 25, settings: { sliders: { count: 10 } } })).toBe(25);
    // A row from before the count was saved: its settings' Number of questions (5 per step).
    expect(quizPaidCount({ question_count: 0, settings: { sliders: { count: 4 } } })).toBe(20);
    expect(quizPaidCount({ question_count: 999 })).toBe(60);
    expect(quizPaidCount({})).toBe(5);
  });

  const input = (over: Partial<QuizPlanInput> = {}): QuizPlanInput => ({
    sliders: { ...QUIZ_SLIDER_DEFAULTS, count: 10 },
    types: QUESTION_TYPES,
    hasCalculations: false,
    lectures: [{ id: 'L', durationMs: 60 * MIN }],
    flaggedSpans: 3,
    weakSpots: 2,
    pendingWrong: 4,
    wrongComeBack: true,
    ...over,
  });

  it('a run never writes more questions than were paid for', () => {
    expect(planQuiz(input()).count).toBe(50);
    expect(planQuiz(input({ maxCount: 10 })).count).toBe(10);
    expect(planQuiz(input({ maxCount: 10 })).slots.length).toBeLessThanOrEqual(10);
    expect(planQuiz(input({ maxCount: 3 })).count).toBe(3);
    expect(planQuiz(input({ maxCount: 1 })).count).toBe(1);
    // Paid for more than the settings ask: the settings' count.
    expect(planQuiz(input({ sliders: { ...QUIZ_SLIDER_DEFAULTS, count: 2 }, maxCount: 25 })).count).toBe(10);
    expect(() => planQuiz(input({ maxCount: 0 }))).toThrow(RangeError);
  });
});

describe('the spend calls', () => {
  const rpc = (row: Record<string, unknown> | null, error: unknown = null) => {
    const calls: [string, Record<string, unknown>][] = [];
    return {
      calls,
      db: {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push([fn, args]);
          return { data: row ? [row] : [], error };
        },
      },
    };
  };

  it('spend_credits with every argument, and its answer', async () => {
    const r = rpc({ outcome: 'spent', charged: 4, balance_after: 44 });
    await expect(spendCredits(r.db, { userId: 'u', key: 'lecture:L:block:0', units: 4, kind: 'spend_lecture', lectureId: 'L' })).resolves.toEqual({ outcome: 'spent', charged: 4, balanceAfter: 44 });
    expect(r.calls).toEqual([['spend_credits', { p_user: 'u', p_base_key: 'lecture:L:block:0', p_units: 4, p_kind: 'spend_lecture', p_lecture: 'L', p_ref: null, p_label: null }]]);
  });

  it('spend_summary sends no price: the database decides', async () => {
    const r = rpc({ outcome: 'already', charged: 0, balance_after: 8 });
    await spendSummary(r.db, { userId: 'u', lectureId: 'L', summaryId: 'S' });
    expect(r.calls[0]).toEqual(['spend_summary', { p_user: 'u', p_lecture: 'L', p_summary: 'S', p_label: null }]);
  });

  it('reverse_spend: true only when it gave back now', async () => {
    await expect(reverseSpend(rpc({ outcome: 'reversed', charged: 2, balance_after: 10 }).db, 'u', 'quiz:Q')).resolves.toBe(true);
    await expect(reverseSpend(rpc({ outcome: 'none', charged: 0, balance_after: 10 }).db, 'u', 'quiz:Q')).resolves.toBe(false);
  });

  it('a database error is thrown, never read as "spent"', async () => {
    await expect(spendCredits(rpc(null, { message: 'permission denied' }).db, { userId: 'u', key: 'k', units: 1, kind: 'spend_extra' })).rejects.toEqual({ message: 'permission denied' });
    await expect(spendCredits(rpc(null).db, { userId: 'u', key: 'k', units: 1, kind: 'spend_extra' })).rejects.toThrow('no answer');
  });
});

describe('no credits left, in the app’s words', () => {
  it('the 402', () => {
    expect(noCredits('transcription')).toEqual({ status: 402, code: 'no_credits', error: NO_CREDITS.transcription });
    expect(NO_CREDITS.transcription).toMatch(/recording is safe/);
  });

  it('the Summary card: not started, safe, can be started again', () => {
    const s = { status: 'pending', error: 'no_credits', settings: null } as unknown as LectureSummary;
    expect(summaryCardText(s)).toEqual({ label: 'Summary settings saved', text: SUMMARY_ERRORS.no_credits, action: 'start' });
    expect(summaryCardText({ ...s, error: null } as unknown as LectureSummary).text).toMatch(/Not started yet/);
  });

  it('the quiz row', () => {
    const row = { status: 'pending' as const, questionCount: 10, requested: 10, error: 'no_credits', updatedAt: new Date().toISOString(), note: NO_CREDITS_NOTE };
    expect(quizRowState(row)).toMatchObject({ line: '10 questions · Saved · not started', sub: FAILED_WORDS.no_credits, action: 'start' });
  });
});
