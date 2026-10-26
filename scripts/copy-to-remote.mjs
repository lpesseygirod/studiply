#!/usr/bin/env node
/**
 * copy-to-remote.mjs — one-time copy of chosen courses from the student's
 * LOCAL Supabase account to the same student's REMOTE account (Lea, 26 Oct:
 * the earlier-version import once went to local Supabase, and the old copy
 * on the iPhone is gone).
 *
 *   node scripts/copy-to-remote.mjs --email <email> --courses "Calculus,Finance"            dry run
 *   node scripts/copy-to-remote.mjs --email <email> --courses "Calculus,Finance" --apply    copy
 *   node scripts/copy-to-remote.mjs --email <email> --courses "Calculus,Finance" --compare  counts only
 *
 * What it copies, per course: the course and its settings, folders, files,
 * lectures, notes (summaries, as they are: block origins stay "student" or
 * "ai"), transcript lines, recording chunks and photos/PDFs (media), and their
 * Storage files. Ids, titles, dates, favourites and trash state are kept;
 * only user_id (and the user id at the start of Storage paths) becomes the
 * remote account's. Rows are inserted with "do nothing if the id exists" and
 * Storage files are skipped when already there, so running it twice adds
 * nothing. It stops before writing anything if the courses have data it
 * doesn't copy (documents, marks, chat, flashcards…).
 *
 * Local is only read. Remote reads go through `supabase db query --linked`;
 * writing (--apply) needs the remote service key for the Storage uploads,
 * read at run time with `supabase projects api-keys` and never printed or
 * saved.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const EMAIL = arg('email');
const COURSES = (arg('courses') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const APPLY = args.includes('--apply');
const COMPARE = args.includes('--compare');
if (!EMAIL || COURSES.length === 0) {
  console.error('Usage: node scripts/copy-to-remote.mjs --email <email> --courses "A,B" [--apply | --compare]');
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

// ── Local (read only) ────────────────────────────────────────────────────
const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API_URL ?? '')) {
  console.error(`Refusing: local Supabase is "${env.API_URL ?? 'not running'}".`);
  process.exit(1);
}
const local = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts);

// ── Remote ───────────────────────────────────────────────────────────────
const REF = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (!/^[a-z0-9]{20}$/.test(REF)) {
  console.error('Refusing: no linked remote project.');
  process.exit(1);
}
const REMOTE_URL = `https://${REF}.supabase.co`;

/** A read-only query on the remote database, as rows of strings. */
function remoteQuery(sql) {
  const out = execFileSync('supabase', ['db', 'query', '--linked', '-o', 'csv', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = out.split('\n').filter((l) => l && !/^(Initialising|Connecting|Loading)/.test(l));
  const [header, ...rows] = lines;
  if (!header) return []; // no rows: the CLI prints no header either
  const cols = header.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
}
const sqlList = (ids) => (ids.length ? ids.map((id) => `'${id}'`).join(',') : `'00000000-0000-0000-0000-000000000000'`);

// ── What is copied ───────────────────────────────────────────────────────
async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data ?? [];
}
const inIds = (q, col, ids) => q.in(col, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);

async function localUserId(client, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
}

const localUid = await localUserId(local, EMAIL);
if (!localUid) throw new Error(`No local account ${EMAIL}.`);

const courses = await must(local.from('courses').select('*').eq('user_id', localUid).in('name', COURSES), 'courses');
const missingNames = COURSES.filter((n) => !courses.some((c) => c.name === n));
if (missingNames.length) throw new Error(`Not in the local account: ${missingNames.join(', ')}`);
if (courses.length !== COURSES.length) throw new Error('Two local courses have the same name; refusing.');
const courseIds = courses.map((c) => c.id);

const settings = await must(inIds(local.from('course_settings').select('*'), 'course_id', courseIds), 'course_settings');
const folders = await must(inIds(local.from('folders').select('*'), 'course_id', courseIds), 'folders');
const files = await must(inIds(local.from('files').select('*'), 'course_id', courseIds), 'files');
const fileIds = files.map((f) => f.id);
const lectures = await must(inIds(local.from('lectures').select('*'), 'id', fileIds), 'lectures');
const summaries = await must(inIds(local.from('summaries').select('*'), 'file_id', fileIds), 'summaries');
const audio = await must(inIds(local.from('audio_chunks').select('*'), 'lecture_id', fileIds), 'audio_chunks');
const segments = [];
for (let from = 0; ; from += 1000) {
  const page = await must(
    inIds(local.from('transcript_segments').select('*'), 'lecture_id', fileIds).order('id').range(from, from + 999),
    'transcript_segments',
  );
  segments.push(...page);
  if (page.length < 1000) break;
}
const mediaByLecture = await must(inIds(local.from('media').select('*'), 'lecture_id', fileIds), 'media');
const mediaByFile = await must(inIds(local.from('media').select('*'), 'file_id', fileIds), 'media');
const media = [...new Map([...mediaByLecture, ...mediaByFile].map((m) => [m.id, m])).values()];

// Data this script doesn't copy: stop rather than leave it behind silently.
const notCopied = {
  documents: await must(inIds(local.from('documents').select('id'), 'file_id', fileIds), 'documents'),
  document_versions: await must(inIds(local.from('document_versions').select('id'), 'file_id', fileIds), 'document_versions'),
  marks: await must(inIds(local.from('marks').select('id'), 'lecture_id', fileIds), 'marks'),
  note_lines: await must(inIds(local.from('note_lines').select('id'), 'lecture_id', fileIds), 'note_lines'),
  assistant_messages: await must(inIds(local.from('assistant_messages').select('id'), 'lecture_id', fileIds), 'assistant_messages'),
  flashcards: await must(inIds(local.from('flashcards').select('id'), 'course_id', courseIds), 'flashcards'),
  review_schedule: await must(inIds(local.from('review_schedule').select('id'), 'file_id', fileIds), 'review_schedule'),
};
const leftOut = Object.entries(notCopied).filter(([, rows]) => rows.length > 0);
if (leftOut.length) {
  throw new Error(`These courses have data this script doesn't copy: ${leftOut.map(([t, r]) => `${t} ${r.length}`).join(', ')}. Nothing was written.`);
}

// ── Storage files ────────────────────────────────────────────────────────
const bucketOf = (m) => (m.kind === 'photo' ? 'photos' : 'slides');
const objects = [
  ...audio.filter((a) => a.storage_path).map((a) => ({ bucket: 'audio-chunks', path: a.storage_path, lectureId: a.lecture_id })),
  ...media.filter((m) => m.storage_path).map((m) => ({ bucket: bucketOf(m), path: m.storage_path, lectureId: m.lecture_id ?? m.file_id })),
];
async function localObject(bucket, path) {
  const slash = path.lastIndexOf('/');
  const { data } = await local.storage.from(bucket).list(path.slice(0, slash), { search: path.slice(slash + 1) });
  return (data ?? []).find((o) => o.name === path.slice(slash + 1)) ?? null;
}
for (const o of objects) {
  const info = await localObject(o.bucket, o.path);
  o.bytes = info?.metadata?.size ?? 0;
  o.mimetype = info?.metadata?.mimetype ?? null;
  o.inLocalStorage = !!info;
}

// ── Remote account ───────────────────────────────────────────────────────
const remoteUsers = remoteQuery(`select id from auth.users where lower(email) = lower('${EMAIL.replace(/'/g, "''")}')`);
if (remoteUsers.length !== 1) throw new Error(`Expected one remote account ${EMAIL}, found ${remoteUsers.length}.`);
const remoteUid = remoteUsers[0].id;
const toRemotePath = (path) => (path.startsWith(`${localUid}/`) ? `${remoteUid}/${path.slice(localUid.length + 1)}` : path);

// ── Per course: on local, and already on the remote ──────────────────────
const courseOfFile = new Map(files.map((f) => [f.id, f.course_id]));
function localCounts(courseId) {
  const ids = new Set(files.filter((f) => f.course_id === courseId).map((f) => f.id));
  const objs = objects.filter((o) => ids.has(o.lectureId));
  return {
    folders: folders.filter((f) => f.course_id === courseId).length,
    lectures: files.filter((f) => f.course_id === courseId && f.kind === 'lecture').length,
    other_files: files.filter((f) => f.course_id === courseId && f.kind !== 'lecture').length,
    notes: summaries.filter((s) => ids.has(s.file_id)).length,
    transcript_lines: segments.filter((s) => ids.has(s.lecture_id)).length,
    recording_chunks: audio.filter((a) => ids.has(a.lecture_id)).length,
    photos_pdfs: media.filter((m) => ids.has(m.lecture_id) || ids.has(m.file_id)).length,
    storage_files: objs.length,
    storage_mb: Math.round(objs.reduce((n, o) => n + o.bytes, 0) / 1e5) / 10,
  };
}
function remoteCounts() {
  const rows = remoteQuery(`
    select c.id,
      (select count(*) from public.folders where course_id = c.id) folders,
      (select count(*) from public.files where course_id = c.id and kind = 'lecture') lectures,
      (select count(*) from public.files where course_id = c.id and kind <> 'lecture') other_files,
      (select count(*) from public.summaries s join public.files f on f.id = s.file_id where f.course_id = c.id) notes,
      (select count(*) from public.transcript_segments t join public.files f on f.id = t.lecture_id where f.course_id = c.id) transcript_lines,
      (select count(*) from public.audio_chunks a join public.files f on f.id = a.lecture_id where f.course_id = c.id) recording_chunks,
      (select count(*) from public.media m join public.files f on f.id = coalesce(m.lecture_id, m.file_id) where f.course_id = c.id) photos_pdfs
    from public.courses c where c.id in (${sqlList(courseIds)})`);
  const paths = objects.map((o) => `${o.bucket}/${toRemotePath(o.path)}`);
  const stored = remoteQuery(`
    select bucket_id || '/' || name as key, coalesce((metadata->>'size')::bigint, 0) as bytes from storage.objects
    where bucket_id || '/' || name in (${paths.length ? paths.map((p) => `'${p}'`).join(',') : "''"})`);
  return { rows: new Map(rows.map((r) => [r.id, r])), stored: new Map(stored.map((s) => [s.key, Number(s.bytes)])) };
}

function report(title) {
  const remote = remoteCounts();
  console.log(`\n${title}  (local account → remote account, ${REMOTE_URL})`);
  const keys = ['folders', 'lectures', 'other_files', 'notes', 'transcript_lines', 'recording_chunks', 'photos_pdfs', 'storage_files', 'storage_mb'];
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('course', 14) + keys.map((k) => pad(k, 18)).join(''));
  let allSame = true;
  for (const c of courses) {
    const l = localCounts(c.id);
    const r = remote.rows.get(c.id);
    const ids = new Set(files.filter((f) => f.course_id === c.id).map((f) => f.id));
    const objs = objects.filter((o) => ids.has(o.lectureId));
    const rStored = objs.filter((o) => remote.stored.has(`${o.bucket}/${toRemotePath(o.path)}`));
    const rc = {
      ...(r ?? {}),
      storage_files: rStored.length,
      storage_mb: Math.round(rStored.reduce((n, o) => n + remote.stored.get(`${o.bucket}/${toRemotePath(o.path)}`), 0) / 1e5) / 10,
    };
    const cell = (k) => {
      const lv = l[k];
      const rv = r || k.startsWith('storage') ? Number(rc[k] ?? 0) : 0;
      if (lv !== rv) allSame = false;
      return pad(`${lv} / ${rv}`, 18);
    };
    console.log(pad(c.name, 14) + keys.map(cell).join('') + (r ? '' : '  (not on remote)'));
  }
  console.log('(each cell: local / remote)');
  return allSame;
}

console.log(`Local account ${EMAIL} → remote account ${EMAIL} (${remoteUid.slice(0, 8)}…)`);
console.log(`Courses: ${courses.map((c) => c.name).join(', ')}`);
const notInLocalStorage = objects.filter((o) => !o.inLocalStorage);
if (notInLocalStorage.length) console.log(`Note: ${notInLocalStorage.length} Storage file(s) are missing in local Storage and can't be copied.`);

if (!APPLY) {
  const same = report(COMPARE ? 'Compare' : 'Dry run: nothing is written');
  if (!COMPARE) {
    console.log(`\nWould insert (skipping ids already there): ${courses.length} courses (+ their settings), ${folders.length} folders, ${files.length} files, ${lectures.length} lectures, ${summaries.length} notes, ${segments.length} transcript lines, ${audio.length} recording chunks, ${media.length} photo/PDF rows, ${objects.length} Storage files.`);
    console.log('Run again with --apply to copy.');
  } else {
    console.log(same ? '\nLocal and remote match.' : '\nLocal and remote differ.');
  }
  process.exit(0);
}

// ── Apply ────────────────────────────────────────────────────────────────
const keys = JSON.parse(
  execFileSync('supabase', ['projects', 'api-keys', '--project-ref', REF, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
);
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
if (!serviceKey) throw new Error('No service_role key for the remote project.');
const remote = createClient(REMOTE_URL, serviceKey, opts);

const strip = ({ changed_at: _changed, ...row }) => ({ ...row, user_id: remoteUid });
const insert = async (table, rows, onConflict = 'id') => {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await remote.from(table).upsert(rows.slice(i, i + 500), { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
};

const existingCourses = new Set(remoteQuery(`select id from public.courses where id in (${sqlList(courseIds)})`).map((r) => r.id));
await insert('courses', courses.map(strip));
// The database made default settings for each new course: give it the local ones.
for (const s of settings.filter((s) => !existingCourses.has(s.course_id))) {
  const { course_id, user_id: _u, created_at: _c, updated_at: _up, ...values } = s;
  const { error } = await remote.from('course_settings').update(values).eq('course_id', course_id);
  if (error) throw new Error(`course_settings: ${error.message}`);
}
const depth = (f, seen = new Set()) => {
  const parent = folders.find((p) => p.id === f.parent_id);
  return !parent || seen.has(f.id) ? 0 : 1 + depth(parent, seen.add(f.id));
};
await insert('folders', [...folders].sort((a, b) => depth(a) - depth(b)).map(strip));
await insert('files', files.map(strip));
await insert('lectures', lectures.map(strip));
await insert('summaries', summaries.map(strip));
await insert('audio_chunks', audio.map((a) => ({ ...strip(a), storage_path: a.storage_path ? toRemotePath(a.storage_path) : a.storage_path })));
await insert('transcript_segments', segments.map(strip));
await insert('media', media.map((m) => ({ ...strip(m), storage_path: m.storage_path ? toRemotePath(m.storage_path) : m.storage_path })));

let uploaded = 0;
let skipped = 0;
const already = remoteCounts().stored;
for (const o of objects.filter((x) => x.inLocalStorage)) {
  const target = toRemotePath(o.path);
  if (already.has(`${o.bucket}/${target}`)) {
    skipped++;
    continue;
  }
  const { data: blob, error: dlError } = await local.storage.from(o.bucket).download(o.path);
  if (dlError) throw new Error(`download ${o.bucket}: ${dlError.message}`);
  const body = Buffer.from(await blob.arrayBuffer());
  const { error: upError } = await remote.storage.from(o.bucket).upload(target, body, { contentType: o.mimetype ?? blob.type, upsert: false });
  if (upError) throw new Error(`upload ${o.bucket}: ${upError.message}`);
  uploaded++;
  process.stdout.write(`\rStorage: ${uploaded} uploaded, ${skipped} already there`);
}
console.log(`\rStorage: ${uploaded} uploaded, ${skipped} already there.   `);
const same = report('After the copy');
console.log(same ? '\nLocal and remote match.' : '\nLocal and remote differ: run again (it continues where it stopped).');
