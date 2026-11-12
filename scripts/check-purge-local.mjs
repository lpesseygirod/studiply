#!/usr/bin/env node
/**
 * check-purge-local.mjs — end-to-end check of the nightly trash clean-up
 * (Edge Function purge-trash). Free: no AI calls.
 *
 *   1. refuses to run if the local database has anything else in the trash
 *      for more than 30 days (the function purges every user's old trash,
 *      and Lea's local data must stay);
 *   2. creates two throwaway users with old and recent trash and real
 *      Storage objects, including a photo moved out of an old lecture;
 *   3. checks the function refuses calls without the right secret;
 *   4. calls it, then checks that only the old rows and their objects are
 *      gone, that B's old trash went too, and that a second run finds
 *      nothing left;
 *   5. recordings: A's lecture transcribed 4 days ago on
 *      "Delete in 3 days" and B's loses its audio files (the chunk rows,
 *      the transcript and its photo stay; the lecture is marked deleted);
 *      one kept forever and one transcribed today keep theirs. It also
 *      refuses to run if anyone else's recording is due (it would be deleted);
 *   6. deletes the test files and users, even when a check fails.
 *
 * Local only: refuses to run unless Supabase is on 127.0.0.1 / localhost.
 * Keys are read at run time (`supabase status`, supabase/functions/.env)
 * and never printed or written anywhere.
 *
 * Run with Docker, `supabase start` and `supabase functions serve` up, and
 * CRON_SECRET set in supabase/functions/.env:
 *   npm run check:purge
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

const FUNCTION_URL = `${url}/functions/v1/purge-trash`;
const FUNCTIONS_ENV = 'supabase/functions/.env';
const DAY = 24 * 60 * 60 * 1000;

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
}

/** CRON_SECRET from the git-ignored functions .env, without printing it. */
function cronSecret() {
  if (!existsSync(FUNCTIONS_ENV)) return null;
  for (const line of readFileSync(FUNCTIONS_ENV, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?CRON_SECRET\s*=\s*(.*?)\s*$/);
    if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

async function call(secret, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-cron-secret'] = secret;
  const res = await fetch(FUNCTION_URL, { method, headers, body: method === 'POST' ? '{}' : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** Rows of other users that a purge would delete now. */
async function othersOldTrash(testUsers) {
  const cutoff = daysAgo(30);
  let total = 0;
  for (const table of ['files', 'folders', 'courses']) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .lt('deleted_at', cutoff)
      .not('user_id', 'in', `(${testUsers.join(',') || '00000000-0000-0000-0000-000000000000'})`);
    if (error) throw new Error(`Could not count ${table}: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

/** Other users' recordings the job would delete now. */
async function othersDueAudio() {
  const { count, error } = await admin
    .from('lectures')
    .select('id', { count: 'exact', head: true })
    .eq('audio_retention', 'delete_3_days')
    .lte('audio_delete_after', new Date().toISOString())
    .is('audio_deleted_at', null);
  if (error) throw new Error(`Could not count due recordings: ${error.message} (is 20261029152600_audio_auto_delete applied?)`);
  return count ?? 0;
}

async function exists(bucket, path) {
  const slash = path.lastIndexOf('/');
  const { data, error } = await admin.storage.from(bucket).list(path.slice(0, slash), { search: path.slice(slash + 1) });
  if (error) throw new Error(`Could not list ${bucket}: ${error.message}`);
  return (data ?? []).some((o) => o.name === path.slice(slash + 1));
}

const run = randomUUID().slice(0, 8);
const password = `Pw-${randomUUID()}`;
const emails = [`a-${run}@purge-check.test`, `b-${run}@purge-check.test`];
const createdUsers = [];
const uploaded = []; // { bucket, path }

try {
  const secret = cronSecret();
  if (!secret) {
    throw new Error(
      `No CRON_SECRET in ${FUNCTIONS_ENV}. Add one (openssl rand -hex 32), restart \`supabase functions serve\`, run again.`,
    );
  }

  console.log('\nLocal data');
  const before = await othersOldTrash([]);
  if (before > 0) {
    throw new Error(
      `The local database has ${before} item(s) in the trash for more than 30 days; this check would delete them. Not running.`,
    );
  }
  check(true, 'nothing else in the local trash is older than 30 days');
  const dueBefore = await othersDueAudio();
  if (dueBefore > 0) {
    throw new Error(
      `The local database has ${dueBefore} recording(s) due for deletion (Delete in 3 days, date passed); this check would delete them. Not running.`,
    );
  }
  check(true, 'no other recording in the local database is due for deletion');

  for (const email of emails) {
    const data = await must(admin.auth.admin.createUser({ email, password, email_confirm: true }), `Could not create ${email}`);
    createdUsers.push(data.user.id);
  }
  const [a, b] = createdUsers;

  // A: an old trashed course with a folder and a lecture (recording + photo);
  //    a live course with an old trashed lecture whose photo was moved out to
  //    a live library file, a recently trashed PDF and a live lecture.
  // B: an old trashed lecture with slides.
  const ids = Object.fromEntries(
    [
      'oldCourse', 'liveCourse', 'bCourse', 'folder', 'inOld', 'oldLecture', 'recentPdf', 'liveLecture', 'movedFile', 'bLecture',
      // Recordings.
      'dueA', 'keptA', 'freshA', 'dueB',
    ].map(
      (k) => [k, randomUUID()],
    ),
  );
  await must(
    admin.from('courses').insert([
      { id: ids.oldCourse, user_id: a, name: 'Old course', deleted_at: daysAgo(40) },
      { id: ids.liveCourse, user_id: a, name: 'Live course' },
      { id: ids.bCourse, user_id: b, name: 'B course' },
    ]),
    'Could not create the courses',
  );
  await must(
    admin.from('folders').insert({ id: ids.folder, user_id: a, course_id: ids.oldCourse, name: 'Tema', deleted_at: daysAgo(40) }),
    'Could not create the folder',
  );
  await must(
    admin.from('files').insert([
      { id: ids.inOld, user_id: a, kind: 'lecture', title: 'In old course', course_id: ids.oldCourse, folder_id: ids.folder, deleted_at: daysAgo(40) },
      { id: ids.oldLecture, user_id: a, kind: 'lecture', title: 'Old lecture', course_id: ids.liveCourse, deleted_at: daysAgo(35) },
      { id: ids.recentPdf, user_id: a, kind: 'pdf', title: 'Recent.pdf', course_id: ids.liveCourse, deleted_at: daysAgo(3) },
      { id: ids.liveLecture, user_id: a, kind: 'lecture', title: 'Live lecture', course_id: ids.liveCourse },
      { id: ids.movedFile, user_id: a, kind: 'image', title: 'Moved out.jpg', course_id: ids.liveCourse },
      { id: ids.bLecture, user_id: b, kind: 'lecture', title: 'B old', course_id: ids.bCourse, deleted_at: daysAgo(50) },
      { id: ids.dueA, user_id: a, kind: 'lecture', title: 'Due recording', course_id: ids.liveCourse },
      { id: ids.keptA, user_id: a, kind: 'lecture', title: 'Kept recording', course_id: ids.liveCourse },
      { id: ids.freshA, user_id: a, kind: 'lecture', title: 'Fresh recording', course_id: ids.liveCourse },
      { id: ids.dueB, user_id: b, kind: 'lecture', title: 'B due recording', course_id: ids.bCourse },
    ]),
    'Could not create the files',
  );
  // Every row with the same keys: a bulk insert sends one column list, and a key missing from a row
  // is written as NULL, not the column's default (that broke `status` once the recordings were added).
  const lectureRow = (id, user_id, status, audio_retention = 'delete_3_days') => ({ id, user_id, status, audio_retention });
  await must(
    admin.from('lectures').insert([
      lectureRow(ids.inOld, a, 'draft'),
      lectureRow(ids.oldLecture, a, 'draft'),
      lectureRow(ids.liveLecture, a, 'draft'),
      lectureRow(ids.bLecture, b, 'draft'),
      // Recorded and transcribed (dated below, by the server, from transcribed_at).
      lectureRow(ids.dueA, a, 'ready'),
      lectureRow(ids.keptA, a, 'ready', 'keep_permanently'),
      lectureRow(ids.freshA, a, 'ready'),
      lectureRow(ids.dueB, b, 'ready'),
    ]),
    'Could not create the lectures',
  );
  // The old lecture was paid for; purging it must leave her credits as they are.
  await must(
    admin.rpc('spend_credits', { p_user: a, p_base_key: `lecture:${ids.oldLecture}:block:0`, p_units: 4, p_kind: 'spend_lecture', p_lecture: ids.oldLecture }),
    'Could not spend a credit',
  );
  const balanceOf = async (id) => (await must(admin.from('credit_ledger').select('units').eq('user_id', id), 'Could not read credits')).reduce((n, r) => n + r.units, 0);
  const creditsBefore = await balanceOf(a);

  const objects = {
    oldChunk: { bucket: 'audio-chunks', path: `${a}/${ids.inOld}/0000.m4a` },
    oldPhoto: { bucket: 'photos', path: `${a}/${ids.inOld}/p.jpg` },
    moved: { bucket: 'photos', path: `${a}/${ids.oldLecture}/moved.jpg` },
    recentPdf: { bucket: 'slides', path: `${a}/${ids.recentPdf}/recent.pdf` },
    liveChunk: { bucket: 'audio-chunks', path: `${a}/${ids.liveLecture}/0000.m4a` },
    bSlides: { bucket: 'slides', path: `${b}/${ids.bLecture}/s.pdf` },
    dueA0: { bucket: 'audio-chunks', path: `${a}/${ids.dueA}/0000.m4a` },
    dueA1: { bucket: 'audio-chunks', path: `${a}/${ids.dueA}/0001.m4a` },
    duePhoto: { bucket: 'photos', path: `${a}/${ids.dueA}/board.jpg` },
    keptA: { bucket: 'audio-chunks', path: `${a}/${ids.keptA}/0000.m4a` },
    freshA: { bucket: 'audio-chunks', path: `${a}/${ids.freshA}/0000.m4a` },
    dueB: { bucket: 'audio-chunks', path: `${b}/${ids.dueB}/0000.m4a` },
  };
  const types = { 'audio-chunks': 'audio/mp4', photos: 'image/jpeg', slides: 'application/pdf' };
  for (const { bucket, path } of Object.values(objects)) {
    await must(admin.storage.from(bucket).upload(path, Buffer.from('test'), { contentType: types[bucket] }), `Could not upload to ${bucket}`);
    uploaded.push({ bucket, path });
  }
  await must(
    admin.from('audio_chunks').insert([
      { user_id: a, lecture_id: ids.inOld, seq: 0, start_ms: 0, duration_ms: 1000, storage_path: objects.oldChunk.path },
      { user_id: a, lecture_id: ids.liveLecture, seq: 0, start_ms: 0, duration_ms: 1000, storage_path: objects.liveChunk.path },
    ]),
    'Could not create the audio chunks',
  );
  await must(
    admin.from('media').insert([
      { user_id: a, lecture_id: ids.inOld, kind: 'photo', storage_path: objects.oldPhoto.path },
      { user_id: a, file_id: ids.movedFile, kind: 'photo', storage_path: objects.moved.path },
      { user_id: a, file_id: ids.recentPdf, kind: 'slides', storage_path: objects.recentPdf.path },
      { user_id: b, lecture_id: ids.bLecture, kind: 'slides', storage_path: objects.bSlides.path },
      { user_id: a, lecture_id: ids.dueA, kind: 'photo', storage_path: objects.duePhoto.path },
    ]),
    'Could not create the media rows',
  );

  // Recordings: chunks transcribed, then each lecture's transcription time (the server dates it 3 days later).
  await must(
    admin.from('audio_chunks').insert([
      { user_id: a, lecture_id: ids.dueA, seq: 0, start_ms: 0, duration_ms: 30000, storage_path: objects.dueA0.path, status: 'transcribed' },
      { user_id: a, lecture_id: ids.dueA, seq: 1, start_ms: 30000, duration_ms: 30000, storage_path: objects.dueA1.path, status: 'transcribed' },
      { user_id: a, lecture_id: ids.keptA, seq: 0, start_ms: 0, duration_ms: 30000, storage_path: objects.keptA.path, status: 'transcribed' },
      { user_id: a, lecture_id: ids.freshA, seq: 0, start_ms: 0, duration_ms: 30000, storage_path: objects.freshA.path, status: 'transcribed' },
      { user_id: b, lecture_id: ids.dueB, seq: 0, start_ms: 0, duration_ms: 30000, storage_path: objects.dueB.path, status: 'transcribed' },
    ]),
    'Could not create the recordings',
  );
  await must(
    admin.from('transcript_segments').insert({ user_id: a, lecture_id: ids.dueA, start_ms: 0, end_ms: 4000, text: 'Hola.' }),
    'Could not create the transcript',
  );
  for (const [id, at] of [[ids.dueA, daysAgo(4)], [ids.keptA, daysAgo(4)], [ids.freshA, new Date().toISOString()], [ids.dueB, daysAgo(5)]]) {
    await must(admin.from('lectures').update({ transcribed_at: at }).eq('id', id), 'Could not date the recordings');
  }
  const dated = await must(admin.from('lectures').select('id, audio_delete_after').in('id', [ids.dueA, ids.keptA, ids.freshA, ids.dueB]), 'Could not read the dates');
  const dateOf = (id) => dated.find((l) => l.id === id)?.audio_delete_after ?? null;
  check(
    dateOf(ids.dueA) !== null && Math.abs(Date.parse(dateOf(ids.dueA)) - (Date.parse(daysAgo(4)) + 3 * DAY)) < 60_000 && dateOf(ids.keptA) === null,
    'the server dates a recording 3 days after its transcription (none when kept forever)',
  );

  console.log('\nWho may call it');
  const none = await call(null);
  check(none.status === 401, `without the secret: refused (got ${none.status})`);
  const wrong = await call(`${secret}x`);
  check(wrong.status === 401, `with a wrong secret: refused (got ${wrong.status})`);
  const get = await call(secret, 'GET');
  check(get.status === 405, `GET: refused (got ${get.status})`);
  check(await exists(objects.oldChunk.bucket, objects.oldChunk.path), 'nothing was removed by refused calls');

  console.log('\nThe clean-up');
  const first = await call(secret);
  check(first.status === 200 && first.body.ok === true, `with the secret: 200 (got ${first.status} ${first.body.code ?? ''})`);
  check(first.body.objects === 3, `3 Storage objects removed (got ${first.body.objects})`);
  check(first.body.files === 3 && first.body.folders === 1 && first.body.courses === 1, `3 files, 1 folder, 1 course deleted (got ${first.body.files}, ${first.body.folders}, ${first.body.courses})`);

  for (const key of ['oldChunk', 'oldPhoto', 'bSlides']) {
    check(!(await exists(objects[key].bucket, objects[key].path)), `${key}: removed from Storage`);
  }
  for (const key of ['moved', 'recentPdf', 'liveChunk']) {
    check(await exists(objects[key].bucket, objects[key].path), `${key}: kept in Storage`);
  }
  const gone = await must(
    admin.from('files').select('id').in('id', [ids.inOld, ids.oldLecture, ids.bLecture]),
    'Could not read files',
  );
  check(gone.length === 0, 'the old lectures are gone (both users, and the one inside the old course)');
  const paid = await must(admin.from('credit_ledger').select('id').eq('lecture_id', ids.oldLecture), 'Could not read credits');
  check(paid.length === 1 && (await balanceOf(a)) === creditsBefore, 'the purged lecture\'s credit row stays; her balance is unchanged');
  const kept = await must(
    admin.from('files').select('id').in('id', [ids.recentPdf, ids.liveLecture, ids.movedFile]),
    'Could not read files',
  );
  check(kept.length === 3, 'the recent PDF, the live lecture and the moved photo\'s file stay');
  const courses = await must(admin.from('courses').select('id').in('id', [ids.oldCourse, ids.liveCourse, ids.bCourse]), 'Could not read courses');
  check(courses.length === 2 && !courses.some((c) => c.id === ids.oldCourse), 'the old course is gone, the live ones stay');
  const media = await must(admin.from('media').select('storage_path').eq('user_id', a), 'Could not read media');
  check(
    media.length === 3 && media.every((m) => m.storage_path !== objects.oldPhoto.path),
    'the old photo\'s row is gone; the moved photo, the recent PDF and the due lecture\'s photo keep theirs',
  );

  console.log('\nRecordings (3 days after transcription)');
  const audio = first.body.audio ?? {};
  check(audio.lectures === 2 && audio.chunks === 3 && audio.objects === 3, `2 recordings deleted, 3 chunk files (got ${audio.lectures}, ${audio.chunks}, ${audio.objects})`);
  for (const key of ['dueA0', 'dueA1', 'dueB']) {
    check(!(await exists(objects[key].bucket, objects[key].path)), `${key}: removed from Storage`);
  }
  for (const key of ['duePhoto', 'keptA', 'freshA', 'liveChunk']) {
    check(await exists(objects[key].bucket, objects[key].path), `${key}: kept in Storage`);
  }
  const chunks = await must(admin.from('audio_chunks').select('lecture_id, storage_path').in('lecture_id', [ids.dueA, ids.keptA, ids.freshA, ids.dueB]), 'Could not read chunks');
  const of = (id) => chunks.filter((c) => c.lecture_id === id);
  check(of(ids.dueA).length === 2 && of(ids.dueA).every((c) => c.storage_path === null) && of(ids.dueB).every((c) => c.storage_path === null), 'the due lectures\' chunk rows stay, without a file');
  check(of(ids.keptA)[0]?.storage_path === objects.keptA.path && of(ids.freshA)[0]?.storage_path === objects.freshA.path, 'kept forever and transcribed today: untouched');
  const lectures = await must(admin.from('lectures').select('id, audio_deleted_at, audio_delete_after').in('id', [ids.dueA, ids.keptA, ids.freshA, ids.dueB]), 'Could not read lectures');
  const lec = (id) => lectures.find((l) => l.id === id) ?? {};
  check(Boolean(lec(ids.dueA).audio_deleted_at && lec(ids.dueB).audio_deleted_at) && lec(ids.dueA).audio_delete_after === null, 'the due lectures are marked "audio deleted" (both students)');
  check(!lec(ids.keptA).audio_deleted_at && !lec(ids.freshA).audio_deleted_at, 'the others are not');
  const segs = await must(admin.from('transcript_segments').select('id').eq('lecture_id', ids.dueA), 'Could not read the transcript');
  check(segs.length === 1, 'the transcript stays');

  console.log('\nAgain');
  const second = await call(secret);
  check(second.status === 200 && second.body.objects === 0 && second.body.files === 0, 'a second run finds nothing left');
  check(second.body.audio?.lectures === 0 && second.body.audio?.objects === 0, 'no recording left to delete');
} catch (err) {
  failures += 1;
  console.error(`\n✗ ${err.message}`);
} finally {
  const byBucket = new Map();
  for (const { bucket, path } of uploaded) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  for (const [bucket, paths] of byBucket) await admin.storage.from(bucket).remove(paths);
  for (const id of createdUsers) {
    await admin.from('courses').delete().eq('user_id', id);
    await admin.from('files').delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}
