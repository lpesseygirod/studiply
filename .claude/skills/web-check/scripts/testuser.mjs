// testuser.mjs — a throwaway, confirmed user on LOCAL Supabase only, with a
// small library, removed afterwards (rows by cascade, Storage files here,
// because deleting a user doesn't delete their files).
// The service key is read from `supabase status` at run time; never stored.
import { execFileSync } from 'node:child_process';
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

/**
 * A confirmed user. Step 10.1: the reminder before the first recording ("check that you may record
 * this class") counts as seen, so the recording checks start as before; `reminder: true` keeps it
 * (account.mjs checks it).
 */
export async function makeUser({ reminder = false } = {}) {
  const email = `ui-${Date.now()}@test.dev`;
  const password = 'password123';
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: 'UI Test' },
  });
  if (error) throw error;
  if (!reminder) await admin.from('profiles').update({ preferences: { recordingReminderSeen: true } }).eq('id', data.user.id);
  const client = createClient(env.API_URL, env.ANON_KEY, opts);
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, password, client };
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
