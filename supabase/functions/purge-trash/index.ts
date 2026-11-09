/**
 * purge-trash — the nightly clean-up (step 3.5; recordings since step 10.1b-3).
 *
 * POST, called by the database's daily job (pg_cron + pg_net, migration
 * 20261026090500) with the `x-cron-secret` header; nothing else may call
 * it. For every user:
 *
 * The trash — what has been in it for more than 30 days:
 *   1. trash_purge_plan(cutoff): the Storage objects that go with it,
 *      found through rows (a photo moved out of a lecture stays);
 *   2. removes them through the Storage API (SQL can't);
 *   3. trash_purge(cutoff): deletes the rows (the database cascades).
 *
 * Recordings — lectures on "Delete in 3 days" whose date has passed
 * (3 days after transcription; migration 20261029152600):
 *   4. audio_purge_plan(now): their audio chunks' files;
 *   5. removes them through the Storage API;
 *   6. audio_purge(lectures): clears the chunks' paths and marks each lecture's
 *      audio deleted. The chunk rows, transcript, notes and summaries stay.
 *
 * If a Storage removal fails, that part's rows are kept and the next night
 * tries again, so no file is ever left without a row pointing at it, and a
 * lecture is only marked deleted once its files are gone. The two parts don't
 * wait for each other. Uses the service role (every user's rows). Logs counts
 * only, never names or paths.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { cutoffFor, dueLectures, removalBatches, sameSecret } from '../_shared/purge.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'purge-trash', event, ...details }));
}

type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string };

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, 'public', any>;

/** Removes the plan's objects; the number removed, or how many batches failed. */
async function removeObjects(admin: Admin, plan: { bucket: string; path: string | null }[]) {
  let removed = 0;
  let failedBatches = 0;
  for (const { bucket, paths } of removalBatches(plan)) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) failedBatches++;
    else removed += paths.length;
  }
  return { removed, failedBatches };
}

async function purgeTrash(admin: Admin): Promise<Outcome<{ objects: number; files: number; folders: number; courses: number }>> {
  const cutoff = cutoffFor(new Date());
  const { data: plan, error: planError } = await admin.rpc('trash_purge_plan', { older_than: cutoff });
  if (planError) {
    log('plan_failed', { code: planError.code });
    return { ok: false, status: 500, code: 'plan_failed', message: 'Could not list what to remove.' };
  }
  const { removed, failedBatches } = await removeObjects(admin, plan ?? []);
  if (failedBatches > 0) {
    // Keep the rows: tomorrow's run lists these objects again.
    log('storage_failed', { removed, failedBatches });
    return { ok: false, status: 502, code: 'storage_failed', message: 'Could not remove some files; will try again tomorrow.' };
  }
  const { data: counts, error: purgeError } = await admin.rpc('trash_purge', { older_than: cutoff });
  if (purgeError) {
    log('purge_failed', { code: purgeError.code, removed });
    return { ok: false, status: 500, code: 'purge_failed', message: 'Could not delete the rows.' };
  }
  const deleted = counts?.[0] ?? { files: 0, folders: 0, courses: 0 };
  log('purged', { objects: removed, ...deleted });
  return { ok: true, value: { objects: removed, ...deleted } };
}

async function purgeAudio(admin: Admin): Promise<Outcome<{ lectures: number; chunks: number; objects: number }>> {
  const { data: plan, error: planError } = await admin.rpc('audio_purge_plan', { due: new Date().toISOString() });
  if (planError) {
    log('audio_plan_failed', { code: planError.code });
    return { ok: false, status: 500, code: 'audio_plan_failed', message: 'Could not list the recordings to delete.' };
  }
  const lectures = dueLectures(plan ?? []);
  if (lectures.length === 0) return { ok: true, value: { lectures: 0, chunks: 0, objects: 0 } };
  const { removed, failedBatches } = await removeObjects(admin, plan ?? []);
  if (failedBatches > 0) {
    // Not marked: tomorrow's run lists them again (removing a file twice is harmless).
    log('audio_storage_failed', { removed, failedBatches });
    return { ok: false, status: 502, code: 'audio_storage_failed', message: 'Could not delete some recordings; will try again tomorrow.' };
  }
  const { data: counts, error: purgeError } = await admin.rpc('audio_purge', { lecture_ids: lectures });
  if (purgeError) {
    log('audio_purge_failed', { code: purgeError.code, removed });
    return { ok: false, status: 500, code: 'audio_purge_failed', message: 'Could not mark the recordings deleted.' };
  }
  const marked = counts?.[0] ?? { lectures: 0, chunks: 0 };
  log('audio_purged', { objects: removed, ...marked });
  return { ok: true, value: { ...marked, objects: removed } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret || !sameSecret(req.headers.get('x-cron-secret') ?? '', secret)) {
    log('refused');
    return fail(401, 'unauthorized', 'Not allowed.');
  }

  const admin: Admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const trash = await purgeTrash(admin);
  const audio = await purgeAudio(admin);

  if (!trash.ok) return fail(trash.status, trash.code, trash.message);
  if (!audio.ok) return fail(audio.status, audio.code, audio.message);
  return json({ ok: true, ...trash.value, audio: audio.value });
});
