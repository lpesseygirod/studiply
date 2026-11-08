/**
 * @jest-environment node
 */
// The checks before anything reaches Anthropic (supabase/functions/_shared/claude-gate.ts, which
// readyForClaude runs): step 7.9's requests (an Exam pack, a Unit summary, Extend on a lecture) go
// through them like any summary, and today's limit counts every summarize call (operation summary).
import { claudeGate, type GateDeps } from '../../../supabase/functions/_shared/claude-gate';
import { CLAUDE_LIMIT_OPERATIONS, DAILY_CLAUDE_LIMIT_USD, SUMMARY_OPERATION } from '../../../supabase/functions/_shared/claude';
import { validateSummaryRunBody } from '../../../supabase/functions/_shared/summary-pipeline';

const PACK = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const UNIT = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';
const LECTURE = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const ROW = '1e7b1f3a-5a8b-4c2f-9d3e-7f6a5b4c3d2e';

/** summarize's validation of a summary run (summarize/index.ts validateBody): the row's file, any kind. */
const validate = (body: unknown) => {
  const run = validateSummaryRunBody(body);
  return run.ok ? { ok: true as const, value: { lectureId: run.value.lectureId, fileId: run.value.lectureId } } : run;
};

function deps(over: Partial<GateDeps<{ lectureId: string; fileId: string }>> & { spent: number; body: unknown }) {
  const asked: (readonly string[])[] = [];
  const { spent: _spent, ...rest } = over;
  const d: GateDeps<{ lectureId: string; fileId: string }> = {
    hasKey: true,
    validate,
    ownFile: async (id) => (id === PACK ? { kind: 'exam_pack' } : id === UNIT ? { kind: 'unit_summary' } : id === LECTURE ? { kind: 'lecture' } : null),
    ownLecture: async (id) => (id === LECTURE ? { id } : null),
    hasConsent: async () => true,
    spentToday: async (ops) => {
      asked.push(ops);
      return over.spent;
    },
    log: () => {},
    ...rest,
  };
  return { d, asked };
}

describe('the daily limit counts Extend, Merge and Exam pack', () => {
  it('every summarize call logs as an operation the limit counts', () => {
    expect(CLAUDE_LIMIT_OPERATIONS).toContain(SUMMARY_OPERATION);
    expect(SUMMARY_OPERATION).toBe('summary');
  });

  it.each([
    ['an Exam pack', PACK],
    ['a Unit summary (Extend or Merge)', UNIT],
    ['Extend "Add to this summary" (the lecture)', LECTURE],
  ])('%s is refused with 429 once today’s usage is $3, and allowed just under it', async (_name, fileId) => {
    const body = { lectureId: fileId, summaryId: ROW };
    const at = deps({ body, spent: DAILY_CLAUDE_LIMIT_USD });
    expect(await claudeGate(at.d)).toEqual({ ok: false, status: 429, code: 'daily_limit', error: 'You have reached today’s limit for the assistant and summaries. Try again tomorrow.' });
    // Step 9.1b-2: quizzes count too.
    expect(at.asked[0]).toEqual(['assistant', 'summary', 'quiz']);
    const under = deps({ body, spent: DAILY_CLAUDE_LIMIT_USD - 0.01 });
    expect(await claudeGate(under.d)).toEqual({ ok: true, value: { lectureId: fileId, fileId } });
  });

  it('the order holds: no key (500), bad body (400), not hers (404), no consent (403), then the limit', async () => {
    const body = { lectureId: PACK, summaryId: ROW };
    expect(await claudeGate(deps({ body, spent: 0, hasKey: false }).d)).toMatchObject({ status: 500, code: 'not_configured' });
    expect(await claudeGate(deps({ body: { lectureId: 'x', summaryId: ROW }, spent: 0 }).d)).toMatchObject({ status: 400 });
    expect(await claudeGate(deps({ body: { lectureId: '2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d', summaryId: ROW }, spent: 0 }).d)).toMatchObject({ status: 404, code: 'file_not_found' });
    const noConsent = deps({ body, spent: 99, hasConsent: async () => false });
    expect(await claudeGate(noConsent.d)).toMatchObject({ status: 403, code: 'consent_required' });
    expect(noConsent.asked).toEqual([]);
  });

  it('without a fileId (the notes, the test prompt) it must be her lecture: a document is refused', async () => {
    const lectureOnly = (body: unknown) => {
      const b = body as { lectureId: string };
      return { ok: true as const, value: { lectureId: b.lectureId, fileId: null as string | null } };
    };
    const asLecture = { ...deps({ body: { lectureId: PACK }, spent: 0 }).d, validate: lectureOnly };
    expect(await claudeGate(asLecture)).toMatchObject({ status: 404, code: 'lecture_not_found' });
  });
});

describe('step 9.1b-2: a quiz must be hers, and it counts for the limit', () => {
  const QUIZ = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const byQuiz = (body: unknown) => ({ ok: true as const, value: { lectureId: '', fileId: null as string | null, quizId: (body as { quizId: string }).quizId } });
  const gate = (quizId: string, over: Partial<GateDeps<{ lectureId: string; fileId: string | null; quizId: string }>> = {}, spent = 0) => {
    const asked: (readonly string[])[] = [];
    const d: GateDeps<{ lectureId: string; fileId: string | null; quizId: string }> = {
      hasKey: true,
      body: { quizId },
      validate: byQuiz,
      ownFile: async () => null,
      ownLecture: async () => null,
      ownQuiz: async (id) => (id === QUIZ ? { id } : null),
      hasConsent: async () => true,
      spentToday: async (ops) => {
        asked.push(ops);
        return spent;
      },
      log: () => {},
      ...over,
    };
    return { d, asked };
  };

  it('her quiz passes; another (or one in the Trash) is 404 quiz_not_found; without the check, refused too', async () => {
    expect(await claudeGate(gate(QUIZ).d)).toEqual({ ok: true, value: { lectureId: '', fileId: null, quizId: QUIZ } });
    expect(await claudeGate(gate('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d').d)).toMatchObject({ status: 404, code: 'quiz_not_found' });
    expect(await claudeGate(gate(QUIZ, { ownQuiz: undefined }).d)).toMatchObject({ status: 404, code: 'quiz_not_found' });
  });

  it('then consent (403) and today’s limit, which counts quiz calls', async () => {
    expect(await claudeGate(gate(QUIZ, { hasConsent: async () => false }).d)).toMatchObject({ status: 403, code: 'consent_required' });
    const at = gate(QUIZ, {}, DAILY_CLAUDE_LIMIT_USD);
    expect(await claudeGate(at.d)).toMatchObject({ status: 429, code: 'daily_limit' });
    expect(at.asked[0]).toContain('quiz');
  });

  it('step 9.1b-3: grading an attempt goes through the same checks (her quiz, consent, the limit)', async () => {
    const ATTEMPT = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
    const grade = (quizId: string, over: Partial<GateDeps<{ lectureId: string; fileId: string | null; quizId: string }>> = {}, spent = 0) => {
      const g = gate(quizId, over, spent);
      g.d.body = { mode: 'grade', quizId, attemptId: ATTEMPT };
      return g;
    };
    expect(await claudeGate(grade(QUIZ).d)).toMatchObject({ ok: true, value: { quizId: QUIZ } });
    expect(await claudeGate(grade('2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d').d)).toMatchObject({ status: 404, code: 'quiz_not_found' });
    expect(await claudeGate(grade(QUIZ, { hasConsent: async () => false }).d)).toMatchObject({ status: 403, code: 'consent_required' });
    expect(await claudeGate(grade(QUIZ, {}, DAILY_CLAUDE_LIMIT_USD).d)).toMatchObject({ status: 429, code: 'daily_limit' });
  });
});
