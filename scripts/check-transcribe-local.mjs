#!/usr/bin/env node
/**
 * check-transcribe-local.mjs — end-to-end check of transcribe-chunk (step 1.5).
 *
 * Calls the real local Edge Function, which calls the provider chosen by
 * TRANSCRIBE_PROVIDER in supabase/functions/.env (Scribe v2 when unset or
 * `elevenlabs`, whisper-1 for `openai`; a few cents' fraction per run):
 *   1. makes a short sample lecture with macOS `say`: two known sentences
 *      with a 4-second pause between them;
 *   2. creates two throwaway users, A and B, and a lecture for A;
 *   3. checks login, consent, timestamps, the database rows, the cost log,
 *      that a repeat costs nothing, that B can't use A's audio or lecture,
 *      the daily limit, and withdrawing consent;
 *   4. checks the AI keys are only in the git-ignored functions .env;
 *   5. asks OpenAI once whether gpt-transcribe returns timestamps yet (info
 *      only; skipped without an OpenAI key);
 *   6. deletes the test files and both users, even when a check fails.
 *
 * Local only: refuses to run unless Supabase is on 127.0.0.1 / localhost.
 * Keys are read at run time (`supabase status`, supabase/functions/.env)
 * and never printed or written anywhere.
 *
 * Run with Docker, `supabase start` and `supabase functions serve` up:
 *   npm run check:transcribe
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const FUNCTION_URL = `${url}/functions/v1/transcribe-chunk`;
const BUCKET = 'audio-chunks';
// CONSENT_POLICY_VERSION in supabase/functions/_shared/policy.ts (step 10.1).
const POLICY_VERSION = '2026-11-store-1';
const DAILY_LIMIT_SECONDS = 6 * 60 * 60;
const START_MS = 60_000;
const PAUSE_MS = 4000;
const FIRST = 'Supply and demand set the market price.';
const SECOND = 'Inflation reduces purchasing power.';
const FUNCTIONS_ENV = 'supabase/functions/.env';

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
}

const mmss = (ms) => {
  const s = ms / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

/** A value from the git-ignored functions .env, without printing it. */
function envValue(name) {
  if (!existsSync(FUNCTIONS_ENV)) return null;
  // Same forms the Supabase CLI accepts: optional `export`, spaces around =, quotes.
  for (const line of readFileSync(FUNCTIONS_ENV, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`));
    if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

// The provider the function uses, as in supabase/functions/_shared/transcript.ts
const PROVIDER = (envValue('TRANSCRIBE_PROVIDER') || 'elevenlabs').trim().toLowerCase();
const { model: MODEL, keyEnv: KEY_ENV } = {
  openai: { model: 'whisper-1', keyEnv: 'OPENAI_API_KEY' },
  elevenlabs: { model: 'scribe_v2', keyEnv: 'ELEVENLABS_API_KEY' },
}[PROVIDER] ?? {};
if (!MODEL) {
  console.error(`TRANSCRIBE_PROVIDER in ${FUNCTIONS_ENV} is "${PROVIDER}"; use openai or elevenlabs.`);
  process.exit(1);
}

/** Speaks text with an English voice into an AAC .m4a, like the recorder's files. */
function speak(file, text) {
  const args = ['-o', file, '--file-format=m4af', '--data-format=aac'];
  try {
    execFileSync('say', ['-v', 'Samantha', ...args, text], { stdio: 'ignore' });
  } catch {
    execFileSync('say', [...args, text], { stdio: 'ignore' });
  }
}

/** Length of an audio file in ms, from macOS afinfo. */
function durationMs(file) {
  const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
  return Math.round(Number(out.match(/estimated duration: ([\d.]+)/)[1]) * 1000);
}

/**
 * The sample: two sentences with a pause between them. Also returns where
 * the second sentence starts, measured by speaking the first one alone.
 */
function makeSample(dir) {
  const file = join(dir, 'sample.m4a');
  const firstOnly = join(dir, 'first.m4a');
  speak(file, `${FIRST} [[slnc ${PAUSE_MS}]] ${SECOND}`);
  speak(firstOnly, FIRST);
  return { audio: readFileSync(file), secondStartsMs: durationMs(firstOnly) + PAUSE_MS };
}

async function call(token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function signIn(email, password) {
  const client = createClient(url, env.ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return { client, token: data.session.access_token, id: data.user.id };
}

async function usageRows(userId) {
  const { data, error } = await admin.from('ai_usage').select('*').eq('user_id', userId);
  if (error) throw new Error(`Could not read ai_usage: ${error.message}`);
  return data;
}

const words = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean);
const mentions = (text, sentence) => {
  const said = new Set(words(text));
  const expected = words(sentence).filter((w) => w.length > 3);
  return expected.filter((w) => said.has(w)).length >= expected.length - 1;
};

const run = randomUUID().slice(0, 8);
const password = `Pw-${randomUUID()}`;
const emails = [`a-${run}@transcribe-check.test`, `b-${run}@transcribe-check.test`];
const createdUsers = [];
const uploaded = [];
const dir = mkdtempSync(join(tmpdir(), 'studiply-transcribe-'));

try {
  console.log('\nThe OpenAI key');
  const ignored = (() => {
    try {
      execFileSync('git', ['check-ignore', '-q', FUNCTIONS_ENV]);
      return true;
    } catch {
      return false;
    }
  })();
  check(ignored, `${FUNCTIONS_ENV} is git-ignored`);
  const tracked = execFileSync('git', ['ls-files', FUNCTIONS_ENV], { encoding: 'utf8' }).trim();
  check(!tracked, `${FUNCTIONS_ENV} is not in git`);
  let leaked = '';
  try {
    // OpenAI keys start sk-, ElevenLabs keys sk_ and hex
    leaked = execFileSync('git', ['grep', '-lE', '(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{20,}|sk_[0-9a-f]{40,})'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    leaked = ''; // git grep exits 1 when nothing matches
  }
  check(!leaked, 'no tracked file contains an OpenAI or ElevenLabs key');
  if (!envValue(KEY_ENV)) {
    throw new Error(`No ${KEY_ENV} in ${FUNCTIONS_ENV}. Add it, restart \`supabase functions serve\`, run again.`);
  }
  console.log(`Transcribing with ${MODEL} (TRANSCRIBE_PROVIDER ${envValue('TRANSCRIBE_PROVIDER') ? PROVIDER : 'not set'})`);

  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`Could not create ${email}: ${error.message}`);
    createdUsers.push(data.user.id);
  }
  const a = await signIn(emails[0], password);
  const b = await signIn(emails[1], password);

  const { data: file, error: fileError } = await a.client
    .from('files')
    .insert({ kind: 'lecture', title: 'Transcribe check' })
    .select('id')
    .single();
  if (fileError) throw new Error(`Could not create the lecture file: ${fileError.message}`);
  const lectureId = file.id;
  const { error: lectureError } = await a.client.from('lectures').insert({ id: lectureId });
  if (lectureError) throw new Error(`Could not create the lecture: ${lectureError.message}`);

  const { audio, secondStartsMs } = makeSample(dir);
  const path = `${a.id}/${lectureId}/0000.m4a`;
  const up = await a.client.storage.from(BUCKET).upload(path, audio, { contentType: 'audio/mp4' });
  if (up.error) throw new Error(`Could not upload the sample: ${up.error.message}`);
  uploaded.push(path);
  const request = { lectureId, seq: 0, storagePath: path, startMs: START_MS };

  console.log('\nBefore consent');
  const noToken = await call(null, request);
  check(noToken.status === 401, `a request without a token is refused (got ${noToken.status})`);
  const noConsent = await call(a.token, request);
  check(
    noConsent.status === 403 && noConsent.body.code === 'consent_required',
    `without consent: 403 consent_required (got ${noConsent.status} ${noConsent.body.code ?? ''})`,
  );
  check((await usageRows(a.id)).length === 0, 'nothing was sent to transcribe (no ai_usage row)');

  console.log('\nConsent, the way the step 10.1 screen will give it');
  const given = await a.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  check(!given.error, 'A gives transcription consent with its own client');

  console.log(`\nTranscription (chunk starting at ${mmss(START_MS)})`);
  const first = await call(a.token, request);
  check(first.status === 200, `A's chunk is transcribed (got ${first.status}${first.body.code ? ` ${first.body.code}` : ''})`);
  const segments = first.body.segments ?? [];
  for (const s of segments) console.log(`    ${mmss(s.startMs)}–${mmss(s.endMs)}  ${s.text}`);
  const text = segments.map((s) => s.text).join(' ');
  check(mentions(text, FIRST) && mentions(text, SECOND), 'the text has both sentences');
  const durationMs = first.body.durationMs ?? 0;
  check(durationMs > 5000 && durationMs < 12000, `the chunk is ${(durationMs / 1000).toFixed(1)} s long`);
  check(
    segments.length > 0 && segments.every((s, i) => i === 0 || s.startMs >= segments[i - 1].startMs),
    'segments are in order',
  );
  check(
    segments.every((s) => s.startMs >= START_MS && s.endMs >= s.startMs && s.endMs <= START_MS + durationMs + 1000),
    'every segment lies inside the chunk, shifted by its start time',
  );
  check(segments[0] && segments[0].startMs < START_MS + 1500, 'the first sentence starts at the chunk start');
  // Whisper adds a pause to the end of the segment before it, so the check is
  // where the second sentence starts: right after the first one plus the pause.
  const secondSeg = segments.find((s) => mentions(s.text, SECOND) && !mentions(s.text, FIRST));
  const expectedMs = START_MS + secondStartsMs;
  check(
    secondSeg && Math.abs(secondSeg.startMs - expectedMs) <= 1000,
    `the second sentence starts after the ${PAUSE_MS / 1000}-second pause, at ${mmss(expectedMs)} ± 1 s` +
      (secondSeg ? ` (got ${mmss(secondSeg.startMs)})` : ' (not a separate segment)'),
  );

  console.log('\nIn the database');
  const { data: rows } = await admin
    .from('transcript_segments')
    .select('start_ms, end_ms, text, chunk_id, user_id')
    .eq('lecture_id', lectureId)
    .order('start_ms');
  check(
    rows?.length === segments.length && rows.every((r, i) => r.start_ms === segments[i].startMs && r.text === segments[i].text),
    `transcript_segments match the answer (${rows?.length ?? 0} rows)`,
  );
  check(rows?.every((r) => r.user_id === a.id && r.chunk_id === first.body.chunkId), 'they belong to A and to this chunk');
  const { data: chunk } = await admin.from('audio_chunks').select('*').eq('id', first.body.chunkId ?? '').maybeSingle();
  check(
    chunk?.status === 'transcribed' && chunk.start_ms === START_MS && chunk.storage_path === path && chunk.seq === 0,
    'the audio chunk is saved as transcribed, with its start time and path',
  );
  const usage = await usageRows(a.id);
  check(
    usage.length === 1 &&
      usage[0].provider === PROVIDER &&
      usage[0].model === MODEL &&
      usage[0].operation === 'transcription' &&
      usage[0].lecture_id === lectureId &&
      Number(usage[0].audio_seconds) > 5 &&
      Number(usage[0].cost_usd) > 0,
    `the cost is logged once in ai_usage (${usage[0]?.audio_seconds ?? '?'} s, $${usage[0]?.cost_usd ?? '?'})`,
  );
  const { data: lecture } = await admin.from('lectures').select('language').eq('id', lectureId).single();
  check(lecture?.language === 'en', `the lecture had no language and now has the detected one (${lecture?.language})`);

  console.log('\nSending the same chunk again');
  const again = await call(a.token, request);
  check(
    again.status === 200 && JSON.stringify(again.body.segments) === JSON.stringify(segments),
    'the answer is the same',
  );
  const { count: rowCount } = await admin
    .from('transcript_segments')
    .select('id', { count: 'exact', head: true })
    .eq('lecture_id', lectureId);
  check(rowCount === segments.length, 'no duplicate segments');
  check((await usageRows(a.id)).length === 1, 'no second provider call (still one ai_usage row)');

  console.log("\nUser B, A's audio and lecture");
  await b.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  const stolenPath = await call(b.token, { ...request, seq: 5 });
  check(stolenPath.status === 403 && stolenPath.body.code === 'forbidden_path', `B can't use A's audio (got ${stolenPath.status})`);
  const stolenLecture = await call(b.token, { ...request, seq: 5, storagePath: `${b.id}/${lectureId}/0005.m4a` });
  check(
    stolenLecture.status === 404 && stolenLecture.body.code === 'lecture_not_found',
    `B can't add to A's lecture (got ${stolenLecture.status})`,
  );
  check((await usageRows(b.id)).length === 0, 'nothing was charged to B');
  const { count: chunkCount } = await admin
    .from('audio_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('lecture_id', lectureId);
  check(chunkCount === 1, "A's lecture still has only its own chunk");

  console.log('\nDaily limit');
  const seeded = await admin.from('ai_usage').insert({
    user_id: a.id,
    operation: 'transcription',
    provider: 'openai',
    model: 'whisper-1',
    audio_seconds: DAILY_LIMIT_SECONDS,
  });
  if (seeded.error) throw new Error(`Could not seed usage: ${seeded.error.message}`);
  const limited = await call(a.token, { ...request, seq: 1, storagePath: `${a.id}/${lectureId}/0001.m4a` });
  check(limited.status === 429 && limited.body.code === 'daily_limit', `after 6 hours today: 429 daily_limit (got ${limited.status})`);

  console.log('\nWithdrawing consent');
  const withdrawn = await a.client
    .from('ai_consent')
    .update({ withdrawn_at: new Date().toISOString() })
    .is('withdrawn_at', null)
    .select('id');
  check(!withdrawn.error && withdrawn.data.length === 1, 'A withdraws consent with its own client');
  const afterWithdraw = await call(a.token, { ...request, seq: 2, storagePath: `${a.id}/${lectureId}/0002.m4a` });
  check(
    afterWithdraw.status === 403 && afterWithdraw.body.code === 'consent_required',
    `after withdrawing: 403 consent_required (got ${afterWithdraw.status})`,
  );

  if (envValue('OPENAI_API_KEY')) {
    console.log('\nInfo: does gpt-transcribe return timestamps yet?');
    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/mp4' }), 'sample.m4a');
    form.append('model', 'gpt-transcribe');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    const probe = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${envValue('OPENAI_API_KEY')}` },
      body: form,
    });
    const probeBody = await probe.json().catch(() => ({}));
    console.log(
      probe.ok
        ? `  ${Array.isArray(probeBody.segments) && probeBody.segments.length ? 'yes' : 'no'}: answered 200, ` +
            `${probeBody.segments?.length ?? 0} segment(s), keys: ${Object.keys(probeBody).join(', ')}`
        : `  no: answered ${probe.status} (${probeBody?.error?.message ?? 'no message'})`,
    );
  }
} catch (err) {
  failures += 1;
  console.error(`✗ ${err.message}`);
} finally {
  console.log('\nCleanup');
  rmSync(dir, { recursive: true, force: true });
  if (uploaded.length) {
    const { error } = await admin.storage.from(BUCKET).remove(uploaded);
    check(!error, `deleted ${uploaded.length} test file(s)`);
  }
  for (const id of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(!error, `deleted test user ${id} and their rows`);
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  check(!data?.users.some((u) => u.email?.endsWith('@transcribe-check.test')), 'no @transcribe-check.test users left');
  if (createdUsers.length) {
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).in('user_id', createdUsers);
    check(count === 0, 'no test rows left in ai_usage');
  }
  for (const id of createdUsers) {
    const { data: left } = await admin.storage.from(BUCKET).list(id, { limit: 100 });
    check(!left?.length, `no files left in ${BUCKET}/${id}/`);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll transcription checks passed.');
process.exit(failures ? 1 : 0);
