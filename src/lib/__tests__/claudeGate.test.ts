/**
 * @jest-environment node
 */
// The checks before anything reaches Anthropic (supabase/functions/_shared/claude-gate.ts, which
// readyForClaude runs): the combined summaries' requests (an Exam pack, a Unit summary, Extend on a lecture) go
// through them like any summary, and the paid daily limit counts every summarize call (operation
// summary). What credits pay for and the extras each have their own daily guard; only
// extras meet the 30-day allowance (429 extras_limit).
import { claudeGate, type GateDeps } from '../../../supabase/functions/_shared/claude-gate';
import {
  CLAUDE_LIMIT_OPERATIONS,
  DAILY_CLAUDE_LIMIT_USD,
  DAILY_EXTRAS_LIMIT_USD,
  EXTRAS_DAILY_MESSAGE,
  EXTRAS_LIMIT_MESSAGE,
  EXTRAS_OPERATIONS,
  PAID_OPERATIONS,
  QUIZ_FORMAT_OPERATION,
  QUIZ_GRADE_OPERATION,
  QUIZ_OPERATION,
  SUMMARY_OPERATION,
} from '../../../supabase/functions/_shared/claude';
import { validateSummaryRunBody } from '../../../supabase/functions/_shared/summary-pipeline';
import { EXTRAS_USED_UP } from '../credits/extras';

const PACK = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const UNIT = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';
const LECTURE = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const ROW = '1e7b1f3a-5a8b-4c2f-9d3e-7f6a5b4c3d2e';
const PAID_DAILY = 'You have reached today’s limit for summaries and quizzes. Try again tomorrow.';

/** summarize's validation of a summary run (summarize/index.ts validateBody): the row's file, any kind. */
const validate = (body: unknown) => {
  const run = validateSummaryRunBody(body);
  return run.ok ? { ok: true as const, value: { lectureId: run.value.lectureId, fileId: run.value.lectureId } } : run;
};

function deps(over: Partial<GateDeps<{ lectureId: string; fileId: string }>> & { spent: number; body: unknown; left?: number }) {
  const asked: (readonly string[])[] = [];
  let allowanceAsked = 0;
  const { spent: _spent, left = 1, ...rest } = over;
  const d: GateDeps<{ lectureId: string; fileId: string }> = {
    hasKey: true,
    validate,
    useOf: () => 'paid',
    ownFile: async (id) => (id === PACK ? { kind: 'exam_pack' } : id === UNIT ? { kind: 'unit_summary' } : id === LECTURE ? { kind: 'lecture' } : null),
    ownLecture: async (id) => (id === LECTURE ? { id } : null),
    hasConsent: async () => true,
    spentToday: async (ops) => {
      asked.push(ops);
      return over.spent;
    },
    extrasLeft: async () => {
      allowanceAsked += 1;
      return { left, resetsAt: '2026-12-01T10:00:00.000Z' };
    },
    log: () => {},
    ...rest,
  };
  return { d, asked, allowanceAsked: () => allowanceAsked };
}

describe('the operations', () => {
  it('paid and extras are apart, and every Claude operation logged is one of them', () => {
    expect(PAID_OPERATIONS).toEqual(['summary', 'quiz']);
    expect(EXTRAS_OPERATIONS).toEqual(['assistant', 'quiz_grade', 'quiz_format']);
    expect(PAID_OPERATIONS.filter((o) => (EXTRAS_OPERATIONS as readonly string[]).includes(o))).toEqual([]);
    expect([...CLAUDE_LIMIT_OPERATIONS].sort()).toEqual([...PAID_OPERATIONS, ...EXTRAS_OPERATIONS].sort());
    for (const op of [SUMMARY_OPERATION, QUIZ_OPERATION]) expect(PAID_OPERATIONS).toContain(op);
    for (const op of [QUIZ_GRADE_OPERATION, QUIZ_FORMAT_OPERATION]) expect(EXTRAS_OPERATIONS).toContain(op);
    expect(DAILY_CLAUDE_LIMIT_USD).toBe(3);
    expect(DAILY_EXTRAS_LIMIT_USD).toBe(1);
  });

  it('the app shows the server’s words at the limit', () => {
    expect(EXTRAS_USED_UP).toBe(EXTRAS_LIMIT_MESSAGE);
  });
});

describe('the paid daily limit counts Extend, Merge and Exam pack', () => {
  it.each([
    ['an Exam pack', PACK],
    ['a Unit summary (Extend or Merge)', UNIT],
    ['Extend "Add to this summary" (the lecture)', LECTURE],
  ])('%s is refused with 429 once today’s paid usage is $3, and allowed just under it; never asked about the allowance', async (_name, fileId) => {
    const body = { lectureId: fileId, summaryId: ROW };
    const at = deps({ body, spent: DAILY_CLAUDE_LIMIT_USD });
    expect(await claudeGate(at.d)).toEqual({ ok: false, status: 429, code: 'daily_limit', error: PAID_DAILY });
    expect(at.asked[0]).toEqual(['summary', 'quiz']);
    const under = deps({ body, spent: DAILY_CLAUDE_LIMIT_USD - 0.01, left: 0 });
    expect(await claudeGate(under.d)).toEqual({ ok: true, value: { lectureId: fileId, fileId } });
    expect(under.allowanceAsked()).toBe(0);
  });

  it('the order holds: no key (500), bad body (400), not hers (404), no consent (403), then the limit', async () => {
    const body = { lectureId: PACK, summaryId: ROW };
    expect(await claudeGate(deps({ body, spent: 0, hasKey: false }).d)).toMatchObject({ status: 500, code: 'not_configured' });
    expect(await claudeGate(deps({ body: { lectureId: 'x', summaryId: ROW }, spent: 0 }).d)).toMatchObject({ status: 400 });
    expect(await claudeGate(deps({ body: { lectureId: '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d', summaryId: ROW }, spent: 0 }).d)).toMatchObject({ status: 404, code: 'file_not_found' });
    const noConsent = deps({ body, spent: 99, hasConsent: async () => false, useOf: () => 'extra', left: 0 });
    expect(await claudeGate(noConsent.d)).toMatchObject({ status: 403, code: 'consent_required' });
    expect(noConsent.asked).toEqual([]);
    expect(noConsent.allowanceAsked()).toBe(0);
  });

  it('without a fileId (the notes, the test prompt) it must be her lecture: a document is refused', async () => {
    const lectureOnly = (body: unknown) => {
      const b = body as { lectureId: string };
      return { ok: true as const, value: { lectureId: b.lectureId, fileId: null as string | null } };
    };
    const asLecture = { ...deps({ body: { lectureId: PACK }, spent: 0 }).d, validate: lectureOnly } as unknown as GateDeps<{ lectureId: string; fileId: string | null }>;
    expect(await claudeGate(asLecture)).toMatchObject({ status: 404, code: 'lecture_not_found' });
  });
});

describe('the extras (the assistant, grading, a past exam’s format)', () => {
  const body = { lectureId: LECTURE, summaryId: ROW };
  const extra = (spent: number, left: number) => deps({ body, spent, left, useOf: () => 'extra' });

  it('their own daily guard: $1 of extras today → 429 daily_limit, before the allowance is read', async () => {
    const at = extra(DAILY_EXTRAS_LIMIT_USD, 1);
    expect(await claudeGate(at.d)).toEqual({ ok: false, status: 429, code: 'daily_limit', error: EXTRAS_DAILY_MESSAGE });
    expect(at.asked[0]).toEqual(['assistant', 'quiz_grade', 'quiz_format']);
    expect(at.allowanceAsked()).toBe(0);
  });

  it('the 30-day allowance used up → 429 extras_limit with the words and when it frees up', async () => {
    const used = extra(0, 0);
    expect(await claudeGate(used.d)).toEqual({ ok: false, status: 429, code: 'extras_limit', error: EXTRAS_LIMIT_MESSAGE, resetsAt: '2026-12-01T10:00:00.000Z' });
    expect(used.allowanceAsked()).toBe(1);
  });

  it('some left: allowed; a paid request’s $3 of today doesn’t block an extra (and the other way round)', async () => {
    expect(await claudeGate(extra(DAILY_EXTRAS_LIMIT_USD - 0.01, 0.01).d)).toMatchObject({ ok: true });
    const paidToday = deps({
      body,
      spent: 0,
      useOf: () => 'extra',
      spentToday: async (ops) => (ops.includes('summary') ? DAILY_CLAUDE_LIMIT_USD : 0),
    });
    expect(await claudeGate(paidToday.d)).toMatchObject({ ok: true });
    const extrasToday = deps({ body, spent: 0, spentToday: async (ops) => (ops.includes('assistant') ? 99 : 0) });
    expect(await claudeGate(extrasToday.d)).toMatchObject({ ok: true });
  });
});

describe('a quiz must be hers; writing it is paid, grading and a past exam are extras', () => {
  const QUIZ = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  type QuizValue = { lectureId: string; fileId: string | null; quizId: string; mode: string };
  const byQuiz = (body: unknown) => {
    const b = body as { quizId: string; mode?: string };
    return { ok: true as const, value: { lectureId: '', fileId: null as string | null, quizId: b.quizId, mode: b.mode ?? 'generate' } };
  };
  const gate = (quizId: string, over: Partial<GateDeps<QuizValue>> = {}, spent = 0, left = 1) => {
    const asked: (readonly string[])[] = [];
    const d: GateDeps<QuizValue> = {
      hasKey: true,
      body: { quizId },
      validate: byQuiz,
      // quiz/index.ts: generate is paid; grade and format are extras.
      useOf: (v) => (v.mode === 'generate' ? 'paid' : 'extra'),
      ownFile: async () => null,
      ownLecture: async () => null,
      ownQuiz: async (id) => (id === QUIZ ? { id } : null),
      hasConsent: async () => true,
      spentToday: async (ops) => {
        asked.push(ops);
        return spent;
      },
      extrasLeft: async () => ({ left, resetsAt: null }),
      log: () => {},
      ...over,
    };
    return { d, asked };
  };

  it('her quiz passes; another (or one in the Trash) is 404 quiz_not_found; without the check, refused too', async () => {
    expect(await claudeGate(gate(QUIZ).d)).toEqual({ ok: true, value: { lectureId: '', fileId: null, quizId: QUIZ, mode: 'generate' } });
    expect(await claudeGate(gate('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d').d)).toMatchObject({ status: 404, code: 'quiz_not_found' });
    expect(await claudeGate(gate(QUIZ, { ownQuiz: undefined }).d)).toMatchObject({ status: 404, code: 'quiz_not_found' });
  });

  it('writing: consent (403), then the paid limit, which counts quiz calls; the allowance never matters', async () => {
    expect(await claudeGate(gate(QUIZ, { hasConsent: async () => false }).d)).toMatchObject({ status: 403, code: 'consent_required' });
    const at = gate(QUIZ, {}, DAILY_CLAUDE_LIMIT_USD);
    expect(await claudeGate(at.d)).toMatchObject({ status: 429, code: 'daily_limit' });
    expect(at.asked[0]).toContain('quiz');
    expect(await claudeGate(gate(QUIZ, {}, 0, 0).d)).toMatchObject({ ok: true });
  });

  it('grading an attempt and a past exam’s format: her quiz, consent, the extras’ daily guard, the allowance', async () => {
    const ATTEMPT = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
    for (const mode of ['grade', 'format']) {
      const as = (quizId: string, over: Partial<GateDeps<QuizValue>> = {}, spent = 0, left = 1) => {
        const g = gate(quizId, over, spent, left);
        g.d.body = { mode, quizId, attemptId: ATTEMPT };
        return g;
      };
      expect(await claudeGate(as(QUIZ).d)).toMatchObject({ ok: true, value: { quizId: QUIZ, mode } });
      expect(await claudeGate(as('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d').d)).toMatchObject({ status: 404, code: 'quiz_not_found' });
      expect(await claudeGate(as(QUIZ, { hasConsent: async () => false }).d)).toMatchObject({ status: 403, code: 'consent_required' });
      const daily = as(QUIZ, {}, DAILY_EXTRAS_LIMIT_USD);
      expect(await claudeGate(daily.d)).toMatchObject({ status: 429, code: 'daily_limit' });
      expect(daily.asked[0]).toContain('quiz_grade');
      expect(await claudeGate(as(QUIZ, {}, 0, 0).d)).toMatchObject({ status: 429, code: 'extras_limit' });
    }
  });
});
