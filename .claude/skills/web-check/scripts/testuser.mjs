// testuser.mjs — a throwaway, confirmed user on LOCAL Supabase only, with a
// small library, removed afterwards (rows by cascade, Storage files here,
// because deleting a user doesn't delete their files).
// The service key is read from `supabase status` at run time; never stored.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: ROOT })
    .split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.API_URL ?? '')) {
  throw new Error('web-check only runs against local Supabase (supabase start).');
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts);
/** Step 10.1: for account.mjs's own clients (signed in as the test user). */
export const supabaseEnv = { url: env.API_URL, anonKey: env.ANON_KEY };
/** Step 10.1b-2: the legal texts' version the app saves (src/legal/texts.generated.ts). */
export const LEGAL_VERSION = /LEGAL_VERSION = "([^"]+)"/.exec(readFileSync(`${ROOT}src/legal/texts.generated.ts`, 'utf8'))?.[1];

/** Step 10.2-1: what a test user gets on top of the 2 welcome lectures: 10 lectures (40 units, quarter credits). */
export const TEST_CREDIT_UNITS = 40;

/**
 * A confirmed user. Step 10.1: the reminder before the first recording ("check that you may record
 * this class") counts as seen, so the recording checks start as before; `reminder: true` keeps it
 * (account.mjs checks it). Step 10.1b-2: she has accepted the Terms and the Privacy Policy (as at
 * sign-up), so no suite meets the one-time gate; `terms: false` leaves her without (signup.mjs).
 * Step 10.2-1: she has the welcome credits (2 lectures, from the new-user trigger) plus 10 lectures
 * granted here, so no suite runs out; `credits: false` leaves her with the welcome ones only.
 */
export async function makeUser({ reminder = false, terms = true, credits = true } = {}) {
  const email = `ui-${Date.now()}@test.dev`;
  const password = 'password123';
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: 'UI Test', ...(terms ? { terms_version: LEGAL_VERSION, age_16: true } : {}) },
  });
  if (error) throw error;
  if (!reminder) await admin.from('profiles').update({ preferences: { recordingReminderSeen: true } }).eq('id', data.user.id);
  if (terms) {
    // The new-user trigger saved it from the metadata (20261029152500); before that migration is applied, nothing.
    const { count } = await admin.from('terms_acceptances').select('id', { count: 'exact', head: true }).eq('user_id', data.user.id);
    if (!count) throw new Error('the test user has no terms acceptance: is 20261029152500_terms_acceptance applied?');
  }
  if (credits) {
    const { error: grantError } = await admin.rpc('grant_credits', {
      p_user: data.user.id, p_kind: 'grant_admin', p_base_key: 'web-check', p_units: TEST_CREDIT_UNITS, p_label: 'web-check',
    });
    if (grantError) throw new Error(`could not grant the test user credits (is 20261029152800_credits applied?): ${grantError.message}`);
  }
  const client = createClient(env.API_URL, env.ANON_KEY, opts);
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, password, client };
}

/** Step 10.2-1: her balance in units (1 lecture = 4), as the server counts it. */
export async function creditsOf(userId) {
  const { data, error } = await admin.from('credit_ledger').select('units').eq('user_id', userId);
  if (error) throw error;
  return data.reduce((n, r) => n + r.units, 0);
}

/**
 * Step 10.2-1: sets her balance to `units` (0 for the "no credits left" checks). The ledger is
 * append-only, so this adds one row: a grant up, or a spend down, through the server's own functions.
 */
export async function setCredits(userId, units) {
  const now = await creditsOf(userId);
  if (now === units) return;
  const key = `web-check-set-${Date.now()}`;
  const { error } = units > now
    ? await admin.rpc('grant_credits', { p_user: userId, p_kind: 'grant_admin', p_base_key: key, p_units: units - now, p_label: 'web-check' })
    : await admin.rpc('spend_credits', { p_user: userId, p_base_key: key, p_units: now - units, p_kind: 'spend_extra', p_label: 'web-check' });
  if (error) throw error;
  if ((await creditsOf(userId)) !== units) throw new Error(`setCredits: the balance is not ${units}`);
}

/** Courses Math and Science, folder Funcions in Math, Lecture 1 (no notes yet) in Math. */
export async function seed(client) {
  const { data: course } = await client.from('courses').insert({ name: 'Math' }).select().single();
  const { data: science } = await client.from('courses').insert({ name: 'Science', color: '#C8E8D8' }).select().single();
  const { data: folder } = await client.from('folders').insert({ name: 'Funcions', course_id: course.id }).select().single();
  const { data: file } = await client.from('files').insert({ kind: 'lecture', title: 'Lecture 1', course_id: course.id }).select().single();
  await client.from('lectures').insert({ id: file.id, status: 'transcribing', duration_ms: 30000 });
  return { course, science, folder, lecture: file };
}

/** Removes the user's Storage files, then the user (rows cascade). Gone already (account.mjs deleted it): nothing to do. */
export async function dropUser(id) {
  for (const bucket of ['audio-chunks', 'photos', 'slides']) {
    const paths = [];
    const walk = async (prefix) => {
      const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      for (const item of data ?? []) {
        const path = `${prefix}/${item.name}`;
        if (item.id === null) await walk(path);
        else paths.push(path);
      }
    };
    await walk(id);
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  }
  await admin.auth.admin.deleteUser(id).catch(() => {});
}
