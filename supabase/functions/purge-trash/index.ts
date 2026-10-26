/**
 * purge-trash — the nightly trash clean-up (step 3.5).
 *
 * POST, called by the database's daily job (pg_cron + pg_net, migration
 * 20261026090500) with the `x-cron-secret` header; nothing else may call
 * it. For every user it removes what has been in the trash for more than
 * 30 days:
 *
 *   1. trash_purge_plan(cutoff): the Storage objects that go with it,
 *      found through rows (a photo moved out of a lecture stays);
 *   2. removes them through the Storage API (SQL can't);
 *   3. trash_purge(cutoff): deletes the rows (the database cascades).
 *
 * If a Storage removal fails, the rows are kept and the next night tries
 * again, so no file is ever left without a row pointing at it. Uses the
 * service role (every user's rows). Logs counts only, never names or paths.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { cutoffFor, removalBatches, sameSecret } from '../_shared/purge.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'purge-trash', event, ...details }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret || !sameSecret(req.headers.get('x-cron-secret') ?? '', secret)) {
    log('refused');
    return fail(401, 'unauthorized', 'Not allowed.');
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const cutoff = cutoffFor(new Date());

  const { data: plan, error: planError } = await admin.rpc('trash_purge_plan', { older_than: cutoff });
  if (planError) {
    log('plan_failed', { code: planError.code });
    return fail(500, 'plan_failed', 'Could not list what to remove.');
  }

  let removed = 0;
  let failedBatches = 0;
  for (const { bucket, paths } of removalBatches(plan ?? [])) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) failedBatches++;
    else removed += paths.length;
  }
  if (failedBatches > 0) {
    // Keep the rows: tomorrow's run lists these objects again.
    log('storage_failed', { removed, failedBatches });
    return fail(502, 'storage_failed', 'Could not remove some files; will try again tomorrow.');
  }

  const { data: counts, error: purgeError } = await admin.rpc('trash_purge', { older_than: cutoff });
  if (purgeError) {
    log('purge_failed', { code: purgeError.code, removed });
    return fail(500, 'purge_failed', 'Could not delete the rows.');
  }
  const deleted = counts?.[0] ?? { files: 0, folders: 0, courses: 0 };
  log('purged', { objects: removed, ...deleted });
  return json({ ok: true, objects: removed, ...deleted });
});
