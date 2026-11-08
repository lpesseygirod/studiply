/**
 * guard.ts
 * The checks every AI Edge Function makes before anything leaves the server:
 * signed in, the student's own lecture, consent, and how much they used today.
 *
 * `db` acts as the student, so RLS applies to every read. Only `logUsage`
 * uses the service role, because students can read ai_usage but never write
 * it (deleting rows must not reset a limit).
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fail } from './http.ts';
import { CONSENT_POLICY_VERSION, LIMIT_WINDOW_MS, type ConsentScope } from './policy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** PostgREST answers at most this many rows per request. */
const PAGE_SIZE = 1000;

export type SignedIn = { ok: true; db: SupabaseClient; userId: string } | { ok: false; response: Response };

/** The caller's user, from their access token, and a client acting as them. */
export async function signedIn(req: Request): Promise<SignedIn> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    ...clientOptions,
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { ok: false, response: fail(401, 'not_signed_in', 'Please sign in again.') };
  return { ok: true, db, userId: data.user.id };
}

/** The lecture if it is the caller's own (RLS hides everyone else's), else null. */
export async function ownLecture(db: SupabaseClient, lectureId: string) {
  const { data, error } = await db.from('lectures').select('id, language').eq('id', lectureId).maybeSingle();
  if (error) throw error;
  return data;
}

/** The caller's own document (RLS): any kind, not in the Trash (step 6.3: Ask Claude in any document). */
export async function ownFile(db: SupabaseClient, fileId: string) {
  const { data, error } = await db.from('files').select('id, kind').eq('id', fileId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

/** The caller's own quiz (RLS), not in the Trash (step 9.1b-2). */
export async function ownQuiz(db: SupabaseClient, quizId: string) {
  const { data, error } = await db.from('quizzes').select('id').eq('id', quizId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

/** Whether the caller has consent for this scope under the current policy, not withdrawn. */
export async function hasConsent(db: SupabaseClient, scope: ConsentScope): Promise<boolean> {
  const { data, error } = await db
    .from('ai_consent')
    .select('id')
    .eq('scope', scope)
    .eq('policy_version', CONSENT_POLICY_VERSION)
    .is('withdrawn_at', null)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}

/**
 * The caller's total of one ai_usage column for these operations over the
 * last 24 hours. Reads page by page, so it stays right past PostgREST's
 * 1000-row cap.
 */
export async function usedToday(
  db: SupabaseClient,
  operations: string[],
  column: 'audio_seconds' | 'cost_usd',
): Promise<number> {
  const since = new Date(Date.now() - LIMIT_WINDOW_MS).toISOString();
  let total = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('ai_usage')
      .select(`id, ${column}`)
      .in('operation', operations)
      .gte('created_at', since)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data as Record<string, unknown>[]) total += Number(row[column]);
    if (data.length < PAGE_SIZE) return total;
  }
}

export interface UsageRow {
  user_id: string;
  lecture_id: string | null;
  operation: 'transcription' | 'assistant' | 'summary' | 'quiz';
  /** 'elevenlabs' needs the ai_usage.provider check widened by a migration first (docs/PROGRESS.md). */
  provider: 'openai' | 'anthropic' | 'elevenlabs';
  model: string;
  tokens_input?: number;
  tokens_output?: number;
  audio_seconds?: number;
  cost_usd: number;
}

/** Logs one AI call's cost. The only write that uses the service role. */
export async function logUsage(row: UsageRow): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, clientOptions);
  const { error } = await admin.from('ai_usage').insert(row);
  if (error) throw error;
}
