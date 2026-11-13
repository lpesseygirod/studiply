#!/usr/bin/env node
/**
 * export-fixture.mjs — saves one lecture of the LOCAL Supabase as a test fixture (the golden
 * set; the format of supabase/functions/_shared/summary-fixture.ts) in tests/fixtures/lectures/<name>/,
 * which is git-ignored: transcript (as transcribed, with its chunks), My notes' lines with their
 * formatting, marks, questions to the assistant with their answers, photos and slides (the files
 * too), the course's settings, and the summarize panel's latest settings when there are some.
 *
 *   npm run export:fixture -- <lectureId> [--name <folder>] [--force]
 *
 * Local only: refuses unless Supabase is on 127.0.0.1 / localhost (exporting from the remote project
 * needs Lea's separate OK). Reads the service key from `supabase status` at run time and never prints
 * or stores it. Personal details in the lecture stay as they are: remove what Lea points out by hand.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const lectureId = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));
const nameArg = args.includes('--name') ? args[args.indexOf('--name') + 1] : null;
const force = args.includes('--force');
if (!lectureId) {
  console.error('Usage: npm run export:fixture -- <lectureId> [--name <folder>] [--force]');
  process.exit(1);
}

const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.API_URL || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API_URL)) {
  console.error(`Refusing to run: Supabase is "${env.API_URL ?? 'not running'}", not local.`);
  process.exit(1);
}
const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const must = ({ data, error }, what) => {
  if (error) throw new Error(`Could not read ${what}: ${error.message}`);
  return data;
};
const PAGE = 1000;
async function all(table, columns, filter, order) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = must(await filter(db.from(table).select(columns)).order(order).range(from, from + PAGE - 1), table);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}
const SLIDERS = ['startingPoint', 'length', 'depth', 'examples', 'visuals', 'examFocus', 'selfTest', 'language', 'extraResources', 'followMarks'];
const slug = (t) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'lecture';

try {
  const file = must(await db.from('files').select('title, course_id, created_at, kind').eq('id', lectureId).maybeSingle(), 'the lecture');
  if (!file || file.kind !== 'lecture') throw new Error('No lecture with that id in the local database.');
  const lecture = must(await db.from('lectures').select('language, duration_ms').eq('id', lectureId).single(), 'the lecture row');
  const name = nameArg ?? slug(file.title);
  const dir = join('tests/fixtures/lectures', name);
  if (existsSync(dir) && !force) throw new Error(`${dir} exists already (add --force to write over it).`);
  mkdirSync(join(dir, 'media'), { recursive: true });

  let course = null;
  let settings = null;
  let number = null;
  if (file.course_id) {
    course = must(await db.from('courses').select('name').eq('id', file.course_id).maybeSingle(), 'the course');
    settings = must(await db.from('course_settings').select('*').eq('course_id', file.course_id).maybeSingle(), 'the course settings');
    const earlier = await db.from('files').select('id', { count: 'exact', head: true }).eq('course_id', file.course_id).eq('kind', 'lecture').is('deleted_at', null).lte('created_at', file.created_at);
    number = earlier.count ?? null;
  }
  const byLecture = (q) => q.eq('lecture_id', lectureId);
  const segments = await all('transcript_segments', 'start_ms, end_ms, text, chunk_id', byLecture, 'start_ms');
  const chunks = must(await db.from('audio_chunks').select('id, seq, start_ms, duration_ms').eq('lecture_id', lectureId).order('seq'), 'the chunks');
  const notes = await all('note_lines', 'block_id, t_ms, text, content', byLecture, 'position');
  const marks = must(await db.from('marks').select('id, type, level, t_ms, note').eq('lecture_id', lectureId).order('t_ms'), 'the marks');
  const messages = must(await db.from('assistant_messages').select('id, role, content, reply_to, status, asked_at_ms, window_start_ms, window_end_ms').eq('lecture_id', lectureId).order('created_at'), 'the questions');
  const media = must(await db.from('media').select('id, kind, t_ms, caption, storage_path, mime_type').or(`lecture_id.eq.${lectureId},file_id.eq.${lectureId}`).in('kind', ['photo', 'slides']).not('storage_path', 'is', null).order('created_at'), 'the photos and slides');
  const requests = must(await db.from('summaries').select('sliders, applied_settings, result, created_at').eq('file_id', lectureId).is('result', null).order('created_at', { ascending: false }), 'the summary requests');

  const mediaOut = [];
  for (const x of media) {
    const bucket = x.kind === 'photo' ? 'photos' : 'slides';
    const { data, error } = await db.storage.from(bucket).download(x.storage_path);
    if (error || !data) {
      console.log(`  (left out: ${x.kind} ${x.id}, its file isn't in Storage)`);
      continue;
    }
    const out = `${x.id}${x.kind === 'slides' ? '.pdf' : x.mime_type === 'image/png' ? '.png' : '.jpg'}`;
    writeFileSync(join(dir, 'media', out), Buffer.from(await data.arrayBuffer()));
    // As the server names them (lecture-content.ts summaryMaterial).
    mediaOut.push({ id: x.id, kind: x.kind, tMs: x.t_ms, file: out, name: x.caption ?? (x.kind === 'slides' ? 'Slides' : undefined) });
  }
  const request = requests.find((r) => r.sliders && SLIDERS.every((k) => Number.isInteger(r.sliders[k])));
  const resources = request?.applied_settings?.resources;

  const write = (f, value) => writeFileSync(join(dir, f), `${JSON.stringify(value, null, 2)}\n`);
  write('lecture.json', {
    title: file.title,
    language: lecture.language ?? null,
    durationMs: lecture.duration_ms ?? 0,
    date: String(file.created_at).slice(0, 10),
    courseName: course?.name ?? null,
    lectureNumber: number,
    professor: settings?.professor ?? null,
  });
  write('course-settings.json', {
    subjectType: settings?.subject_type ?? null,
    examFormat: settings?.exam_format ?? null,
    summaryLanguage: settings?.summary_language ?? null,
    sliders: settings
      ? Object.fromEntries(SLIDERS.map((k) => [k, settings[`slider_${k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`]]))
      : null,
  });
  write('transcript.json', segments.map((s) => ({ startMs: s.start_ms, endMs: s.end_ms, text: s.text, chunkId: s.chunk_id })));
  if (chunks.length) write('chunks.json', chunks.map((c) => ({ id: c.id, seq: c.seq, startMs: c.start_ms, durationMs: c.duration_ms })));
  write('notes.json', notes.map((n) => ({ id: n.block_id, tMs: n.t_ms, text: n.text, content: n.content })));
  write('marks.json', marks.map((k) => ({ id: k.id, type: k.type, level: k.level, tMs: k.t_ms, note: k.note })));
  write(
    'assistant.json',
    messages
      .filter((m) => m.role === 'user')
      .map((q) => ({
        id: q.id,
        askedAtMs: q.asked_at_ms,
        windowStartMs: q.window_start_ms,
        windowEndMs: q.window_end_ms,
        question: q.content,
        answer: messages.find((a) => a.role === 'assistant' && a.reply_to === q.id && a.status === 'done')?.content ?? '',
      })),
  );
  write('media.json', mediaOut);
  if (request) {
    write('request.json', {
      sliders: Object.fromEntries(SLIDERS.map((k) => [k, request.sliders[k]])),
      resources: { slides: resources?.slides !== false, photos: resources?.photos !== false, assistant: resources?.assistant !== false },
    });
  }
  console.log(`Saved "${file.title}" to ${dir} (git-ignored):`);
  console.log(`  ${segments.length} transcript segments (${chunks.length} chunks), ${notes.length} note lines, ${marks.length} marks, ${messages.filter((m) => m.role === 'user').length} questions, ${mediaOut.length} photos/slides${request ? ', the panel’s settings' : ''}`);
  console.log('Read it through and remove anything personal before using it (names, phone numbers…).');
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
