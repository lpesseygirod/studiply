/**
 * credits.ts
 * Step 10.2-1 (docs/reports/plan-10.2-1.md): what each action costs, the ledger's keys, and the
 * spend calls (the database functions of 20261029152800_credits.sql, service role only). Counted in
 * quarter credits ("units"): 1 lecture = 4. The server decides every price from what it reads itself,
 * never from the request body. Without Deno or npm code, so Jest runs it.
 */

/** 1 credit = 1 lecture = 4 units. */
export const LECTURE_UNITS = 4;
/** A lecture's credit covers 2 hours of audio; every started 2 hours is another credit. */
export const BLOCK_MS = 2 * 60 * 60 * 1000;
/** Writing a lecture's summary again, Extend, Merge, an Exam pack: ½ a lecture. */
export const AGAIN_UNITS = 2;
export const COMBINE_UNITS = 2;
/** The most questions a quiz row can hold (quizzes.question_count's check). */
export const MAX_QUIZ_QUESTIONS = 60;

/** The 2-hour block a chunk starting at startMs is in. */
export const blockOf = (startMs: number) => Math.floor(Math.max(0, startMs) / BLOCK_MS);

export const lectureKey = (lectureId: string, block: number) => `lecture:${lectureId}:block:${block}`;
export const summaryKey = (summaryId: string) => `summary:${summaryId}`;
export const combineKey = (summaryId: string) => `combine:${summaryId}`;
export const quizKey = (quizId: string) => `quiz:${quizId}`;

/** A quiz: ¼ a lecture up to 10 questions, ½ up to 25, ¾ above. */
export function quizUnits(questions: number): number {
  if (questions <= 10) return 1;
  if (questions <= 25) return 2;
  return 3;
}

/** The most questions these units pay for (the cap of a quiz claimed again after it was paid). */
export function maxQuestionsFor(units: number): number {
  if (units <= 1) return 10;
  if (units === 2) return 25;
  return MAX_QUIZ_QUESTIONS;
}

/**
 * The questions a quiz pays for: its row's question_count as the server reads it at the claim (the
 * panel saves its preview's count there). A row from before that column was written (0) counts its
 * settings' Number of questions (5 per step), also read from the row.
 */
export function quizPaidCount(row: { question_count?: unknown; settings?: unknown }): number {
  const saved = Number(row.question_count);
  if (Number.isInteger(saved) && saved > 0) return Math.min(saved, MAX_QUIZ_QUESTIONS);
  const step = Number((row.settings as { sliders?: { count?: unknown } } | null)?.sliders?.count);
  return Number.isInteger(step) && step > 0 ? Math.min(5 * step, MAX_QUIZ_QUESTIONS) : 5;
}

export type CreditUse = 'transcription' | 'summary' | 'quiz' | 'notes';

/** The 402 the app shows as is. */
export const NO_CREDITS: Record<CreditUse, string> = {
  transcription: 'No lecture credits left. Your recording is safe: it’s transcribed when you have credits.',
  summary: 'No lecture credits left. Your recording and notes are safe.',
  quiz: 'No credits left: a quiz uses part of a credit.',
  notes: 'No lecture credits left. Your recording and notes are safe.',
};

export const noCredits = (use: CreditUse) => ({ status: 402 as const, code: 'no_credits' as const, error: NO_CREDITS[use] });

// ---------- the database calls (a service-role client) ----------

export type SpendOutcome = 'spent' | 'already' | 'insufficient';
export interface SpendResult {
  outcome: SpendOutcome;
  /** Units taken by this spend ("spent"), or by the one already made ("already"); 0 when insufficient. */
  charged: number;
  balanceAfter: number;
}

/** What the calls need of a Supabase client (the service role's). */
export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

async function call(db: RpcClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: string; charged: number; balance_after: number } | undefined;
  if (!row) throw new Error(`${fn}: no answer`);
  return { outcome: row.outcome, charged: Number(row.charged), balanceAfter: Number(row.balance_after) };
}

/** A lecture block or an extra (Extend, Merge, Exam pack, a quiz): spent, already paid, or insufficient. */
export async function spendCredits(
  db: RpcClient,
  s: { userId: string; key: string; units: number; kind: 'spend_lecture' | 'spend_extra'; lectureId?: string | null; refId?: string | null; label?: string | null },
): Promise<SpendResult> {
  const r = await call(db, 'spend_credits', {
    p_user: s.userId,
    p_base_key: s.key,
    p_units: s.units,
    p_kind: s.kind,
    p_lecture: s.lectureId ?? null,
    p_ref: s.refId ?? null,
    p_label: s.label ?? null,
  });
  return r as SpendResult;
}

/** A lecture's summary (mode new): the database decides first (included) or again (2), and pays an unpaid lecture first. */
export async function spendSummary(db: RpcClient, s: { userId: string; lectureId: string; summaryId: string }): Promise<SpendResult> {
  const r = await call(db, 'spend_summary', { p_user: s.userId, p_lecture: s.lectureId, p_summary: s.summaryId, p_label: null });
  return r as SpendResult;
}

/** Gives back the latest spend of a key, once: true when it did now. */
export async function reverseSpend(db: RpcClient, userId: string, key: string): Promise<boolean> {
  const r = await call(db, 'reverse_spend', { p_user: userId, p_base_key: key });
  return r.outcome === 'reversed';
}
