#!/usr/bin/env node
/**
 * check-purge-local.mjs — end-to-end check of the nightly trash clean-up
 * (Edge Function purge-trash, step 3.5). Free: no AI calls.
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
 *   5. deletes the test files and users, even when a check fails.
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
    ['oldCourse', 'liveCourse', 'bCourse', 'folder', 'inOld', 'oldLecture', 'recentPdf', 'liveLecture', 'movedFile', 'bLecture'].map(
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
    ]),
    'Could not create the files',
  );
  await must(
    admin.from('lectures').insert([
      { id: ids.inOld, user_id: a },
      { id: ids.oldLecture, user_id: a },
      { id: ids.liveLecture, user_id: a },
      { id: ids.bLecture, user_id: b },
    ]),
    'Could not create the lectures',
  );

  const objects = {
    oldChunk: { bucket: 'audio-chunks', path: `${a}/${ids.inOld}/0000.m4a` },
    oldPhoto: { bucket: 'photos', path: `${a}/${ids.inOld}/p.jpg` },
    moved: { bucket: 'photos', path: `${a}/${ids.oldLecture}/moved.jpg` },
    recentPdf: { bucket: 'slides', path: `${a}/${ids.recentPdf}/recent.pdf` },
    liveChunk: { bucket: 'audio-chunks', path: `${a}/${ids.liveLecture}/0000.m4a` },
    bSlides: { bucket: 'slides', path: `${b}/${ids.bLecture}/s.pdf` },
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
    ]),
    'Could not create the media rows',
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
  const kept = await must(
    admin.from('files').select('id').in('id', [ids.recentPdf, ids.liveLecture, ids.movedFile]),
    'Could not read files',
  );
  check(kept.length === 3, 'the recent PDF, the live lecture and the moved photo\'s file stay');
  const courses = await must(admin.from('courses').select('id').in('id', [ids.oldCourse, ids.liveCourse, ids.bCourse]), 'Could not read courses');
  check(courses.length === 2 && !courses.some((c) => c.id === ids.oldCourse), 'the old course is gone, the live ones stay');
  const media = await must(admin.from('media').select('storage_path').eq('user_id', a), 'Could not read media');
  check(
    media.length === 2 && media.every((m) => m.storage_path !== objects.oldPhoto.path),
    'the old photo\'s row is gone; the moved photo and the recent PDF keep theirs',
  );

  console.log('\nAgain');
  const second = await call(secret);
  check(second.status === 200 && second.body.objects === 0 && second.body.files === 0, 'a second run finds nothing left');
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
