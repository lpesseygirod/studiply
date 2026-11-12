// check-account-deletion-local.mjs — Delete account leaves nothing behind (the build plan's
// check, done by code). LOCAL ONLY, FREE (no AI service is called).
//
// Needs `supabase start` (the migrations applied, 20261029152300_store_rules included) and
// `supabase functions serve` (delete-account). Refuses unless Supabase is on 127.0.0.1 / localhost.
// Keys come from `supabase status` at run time; nothing is printed or stored.
//
// Two throwaway accounts, A (deleted) and B (kept): each with a row in every table that has a
// user_id (a course and its settings, a folder, a lecture with notes, a mark, a recording chunk, a
// transcript, a photo, a summary, the assistant, a flashcard and its review, a document with a
// version, AI consent and use, a quiz with its source, question, attempt and answer) and files in the
// three buckets. Then, for A:
//   1. without "DELETE" (400) or without a token (401): nothing deleted;
//   2. with her token and "DELETE": { deleted: true, files: 3 }; Apple's revocation skipped (no Apple
//      identity), so the function's log says so;
//   3. nothing of A left: the auth user, a row in any of the tables (A's id, every table), a file
//      under A's id in any bucket;
//   4. called again with her (still unexpired) token: { deleted: true } (idempotent);
//   5. B untouched: B's rows and files are all still there.
// Exit 1 on any failure; B is removed at the end.
//
// This is the end-to-end guard for the account cascade: the real auth service deletes the user as
// supabase_auth_admin, which has no grants on our tables, so a trigger fired by the cascade that touches
// another table fails only here (20261029152400). pgTAP 20 can't act as that role on the local stack
// ("permission denied to set role") and skips that part; its list of every AFTER update/delete trigger
// still makes a new one get checked. Run it after any migration that adds a trigger or a user table.
//
//   npm run check:account-deletion
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = env.API_URL;
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.error(`Refusing to run: Supabase API is "${url ?? 'not running'}", not local.`);
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(readFileSync('supabase/functions/_shared/policy.ts', 'utf8'))?.[1];
const BUCKETS = ['audio-chunks', 'slides', 'photos'];
/** Every public table with a user_id (the migrations' tables; pgTAP 20 checks the list is complete from information_schema). */
const TABLES = [
  'courses', 'course_settings', 'folders', 'files', 'lectures', 'documents', 'document_versions', 'note_lines', 'marks',
  'audio_chunks', 'transcript_segments', 'media', 'summaries', 'assistant_messages', 'flashcards', 'review_schedule',
  'ai_consent', 'ai_usage', 'quizzes', 'quiz_sources', 'quiz_questions', 'quiz_attempts', 'quiz_answers',
  'terms_acceptances', 'credit_ledger',
];

let failures = 0;
const check = (ok, what) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${what}`);
};
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** A confirmed account with a row in every table and a file in every bucket. */
async function account(label) {
  const email = `delete-check-${label}-${randomUUID().slice(0, 8)}@test.dev`;
  const password = `Pw-${randomUUID()}`;
  const made = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Check ${label}` } }), 'the user');
  const id = made.user.id;
  const client = createClient(url, env.ANON_KEY, options);
  const session = must(await client.auth.signInWithPassword({ email, password }), 'sign in').session;

  const course = must(await client.from('courses').insert({ name: `Course ${label}` }).select('id').single(), 'course');
  must(await client.from('folders').insert({ name: 'Tema 1', course_id: course.id }), 'folder');
  const lecture = must(await client.from('files').insert({ kind: 'lecture', title: 'Lecture', course_id: course.id }).select('id').single(), 'lecture file');
  must(await client.from('lectures').insert({ id: lecture.id, status: 'ready', duration_ms: 60_000 }), 'lecture');
  const notes = must(await client.from('documents').insert({ file_id: lecture.id, tab: 'notes' }).select('id').single(), 'notes');
  must(await client.from('note_lines').insert({ lecture_id: lecture.id, document_id: notes.id, block_id: 'b1', t_ms: 1000, text: 'Una nota', position: 0 }), 'a note line');
  must(await client.from('marks').insert({ lecture_id: lecture.id, type: 'exam', level: 8, t_ms: 1000 }), 'a mark');
  must(await client.from('transcript_segments').insert({ lecture_id: lecture.id, start_ms: 0, end_ms: 5000, text: 'Hola.' }), 'a transcript');
  const doc = must(await client.from('files').insert({ kind: 'document', title: 'Notas', course_id: course.id }).select('id').single(), 'a document');
  const docRow = must(await client.from('documents').insert({ file_id: doc.id, tab: 'notes' }).select('id').single(), 'its tab');
  // Best effort (written by the app or the server with more fields): the count below allows a few to be missing.
  await admin.from('document_versions').insert({ user_id: id, document_id: docRow.id, content: {} });
  await admin.from('summaries').insert({ user_id: id, file_id: lecture.id, mode: 'new', source_lecture_ids: [lecture.id], sliders: {}, status: 'done', result: {} });
  await client.from('assistant_messages').insert({ lecture_id: lecture.id, role: 'user', content: '¿Qué?', status: 'done' });
  const card = await client.from('flashcards').insert({ front: 'Q', back: 'A', source: 'manual', course_id: course.id }).select('id').single();
  if (card.data) await client.from('review_schedule').insert({ flashcard_id: card.data.id, due_at: new Date().toISOString() });
  for (const scope of ['transcription', 'assistant_summary', 'images']) await client.from('ai_consent').insert({ scope, policy_version: POLICY_VERSION });
  must(await client.from('terms_acceptances').insert({ terms_version: 'delete-check-1', age_confirmed: true, source: 'gate' }), 'a terms acceptance');
  await admin.from('ai_usage').insert({ user_id: id, operation: 'summary', provider: 'anthropic', model: 'claude-opus-5-5', lecture_id: lecture.id });
  // Her welcome credits came with the account; a spend too (through the server's function).
  must(await admin.rpc('spend_credits', { p_user: id, p_base_key: `lecture:${lecture.id}:block:0`, p_units: 4, p_kind: 'spend_lecture', p_lecture: lecture.id }), 'a credit spend');
  const quiz = must(await client.from('quizzes').insert({ course_id: course.id, title: 'Quiz', settings: {}, plan: {}, status: 'ready', question_count: 1 }).select('id').single(), 'a quiz');
  await client.from('quiz_sources').insert({ quiz_id: quiz.id, role: 'lecture', file_id: lecture.id });
  const question = must(await client.from('quiz_questions').insert({ quiz_id: quiz.id, position: 0, type: 'true_false', prompt: 'Q', data: { correct: true } }).select('id').single(), 'a question');
  const attempt = must(await client.from('quiz_attempts').insert({ quiz_id: quiz.id, max_points: 1 }).select('id').single(), 'an attempt');
  must(await client.from('quiz_answers').insert({ attempt_id: attempt.id, question_id: question.id, response: { value: false }, verdict: 'wrong', points: 0, graded_by: 'code' }), 'an answer');
  for (const [bucket, path, type] of [
    ['audio-chunks', `${id}/${lecture.id}/0000.webm`, 'audio/webm'],
    ['slides', `${id}/${lecture.id}/slides.pdf`, 'application/pdf'],
    ['photos', `${id}/profile/avatar.jpg`, 'image/jpeg'],
  ]) {
    must(await client.storage.from(bucket).upload(path, new Blob([new Uint8Array([1, 2, 3])], { type }), { contentType: type }), `a file in ${bucket}`);
  }
  must(await client.from('audio_chunks').insert({ lecture_id: lecture.id, seq: 0, start_ms: 0, duration_ms: 1000, storage_path: `${id}/${lecture.id}/0000.webm`, status: 'uploaded' }), 'a chunk row');
  must(await client.from('media').insert({ lecture_id: lecture.id, kind: 'slides', storage_path: `${id}/${lecture.id}/slides.pdf`, mime_type: 'application/pdf' }), 'a media row');
  return { id, token: session.access_token };
}

async function rowsOf(id) {
  const out = {};
  for (const table of TABLES) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (count) out[table] = count;
  }
  const { count: profiles } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('id', id);
  if (profiles) out.profiles = profiles;
  return out;
}

/** Every file under her id, per bucket. */
async function filePaths(id) {
  const out = [];
  for (const bucket of BUCKETS) {
    const walk = async (prefix) => {
      const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      for (const item of data ?? []) {
        if (item.id === null) await walk(`${prefix}/${item.name}`);
        else out.push({ bucket, path: `${prefix}/${item.name}` });
      }
    };
    await walk(id);
  }
  return out;
}
const filesOf = async (id) => (await filePaths(id)).length;

const call = (token, body) =>
  fetch(`${url}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }));

const a = await account('a');
const b = await account('b');
try {
  const before = await rowsOf(a.id);
  console.log(`  A before: ${Object.keys(before).length} tables with her rows, ${await filesOf(a.id)} files`);
  check(Object.keys(before).length >= 18 && (await filesOf(a.id)) === 3, 'A has rows in (nearly) every table and a file in every bucket');

  const noWord = await call(a.token, {});
  const noToken = await call(null, { confirm: 'DELETE' });
  check(noWord.status === 400 && noToken.status === 401, `refused without "DELETE" (${noWord.status}) or without a token (${noToken.status})`);
  check(Object.keys(await rowsOf(a.id)).length === Object.keys(before).length && (await filesOf(a.id)) === 3, 'and nothing was deleted');

  const done = await call(a.token, { confirm: 'DELETE' });
  check(done.status === 200 && done.body.deleted === true && done.body.files === 3, `deleted: ${done.status} ${JSON.stringify(done.body)}`);

  const { data: user } = await admin.auth.admin.getUserById(a.id);
  check(!user?.user, 'her auth user is gone');
  const left = await rowsOf(a.id);
  check(Object.keys(left).length === 0, `no row of hers in any table (${TABLES.length + 1} checked)${Object.keys(left).length ? `: ${JSON.stringify(left)}` : ''}`);
  check((await filesOf(a.id)) === 0, 'no file of hers in audio-chunks, slides or photos');

  const again = await call(a.token, { confirm: 'DELETE' });
  check(again.status === 200 && again.body.deleted === true, `called again: ${again.status} ${JSON.stringify(again.body)} (idempotent)`);

  check(Object.keys(await rowsOf(b.id)).length === Object.keys(before).length && (await filesOf(b.id)) === 3, 'another student’s rows and files are all still there');
} finally {
  for (const id of [a.id, b.id]) for (const { bucket, path } of await filePaths(id)) await admin.storage.from(bucket).remove([path]);
  await admin.auth.admin.deleteUser(b.id).catch(() => {});
  await admin.auth.admin.deleteUser(a.id).catch(() => {});
}
console.log(failures ? `\n${failures} check(s) FAILED.` : '\nNothing of a deleted account is left.');
process.exit(failures ? 1 : 0);
