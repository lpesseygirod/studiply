#!/usr/bin/env node
/**
 * check-claude-local.mjs — end-to-end check of assistant-chat and summarize (steps 1.6, 1.7).
 *
 * Calls the real local Edge Functions, which call Anthropic (four short
 * answers, two short study notes and one clarification at low effort,
 * a few cents per run):
 *   1. checks the Anthropic key is in no tracked file;
 *   2. creates two throwaway users, A and B, and a lecture for A;
 *   3. checks login, request checks, consent (and its scope), that
 *      assistant-chat really streams, that each answer's cost is logged
 *      once (also when the student disconnects mid-answer), summarize,
 *      that B can't use A's lecture, the study notes (with a photo, which
 *      needs images consent) and clarify (step 1.7), the daily limit, and
 *      withdrawing consent;
 *   4. deletes both users and their rows, even when a check fails.
 *
 * Local only: refuses to run unless Supabase is on 127.0.0.1 / localhost.
 * Never reads supabase/functions/.env; the functions report a missing key.
 *
 * Run with Docker, `supabase start` and `supabase functions serve` up:
 *   npm run check:claude
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

const CHAT_URL = `${url}/functions/v1/assistant-chat`;
const SUMMARIZE_URL = `${url}/functions/v1/summarize`;
const POLICY_VERSION = 'dev-2026-10-elevenlabs';
const MODEL = 'claude-opus-5-5';
const DAILY_LIMIT_USD = 3;
const FUNCTIONS_ENV = 'supabase/functions/.env';
const COUNT_PROMPT = 'Count from 1 to 30, one number per line, nothing else.';
const LECTURE_TEXT = [
  'Today we look at supply and demand.',
  'The equilibrium price is the price where the quantity supplied equals the quantity demanded.',
  'Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price.',
  'If the price is above equilibrium there is a surplus, and the price tends to fall.',
];

/** A real JPEG for the photo check: the app icon, converted with macOS sips. */
function sampleJpeg() {
  const dir = mkdtempSync(join(tmpdir(), 'claude-check-'));
  try {
    const out = join(dir, 'board.jpg');
    execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '512', 'assets/icon.png', '--out', out], { stdio: 'ignore' });
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** A plain JSON call (summarize, or any refusal before streaming starts). */
async function call(fnUrl, token, body) {
  const res = await fetch(fnUrl, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  return { status: res.status, type: res.headers.get('content-type') ?? '', body: await res.json().catch(() => ({})) };
}

/**
 * Reads assistant-chat's Server-Sent Events as they arrive, noting when
 * each one came. With `abortAfterFirstDelta`, hangs up after the first piece.
 */
async function chat(token, body, { abortAfterFirstDelta = false } = {}) {
  const abort = new AbortController();
  const started = Date.now();
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
    signal: abort.signal,
  });
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('text/event-stream')) {
    return { status: res.status, type, body: await res.json().catch(() => ({})), events: [] };
  }

  const events = [];
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const name = frame.match(/^event: (.*)$/m)?.[1];
        const data = frame.match(/^data: (.*)$/m)?.[1];
        events.push({ name, data: data ? JSON.parse(data) : null, ms: Date.now() - started });
      }
      if (abortAfterFirstDelta && events.some((e) => e.name === 'delta')) {
        abort.abort();
        break;
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  }
  return { status: res.status, type, body: null, events };
}

async function signIn(email, password) {
  const client = createClient(url, env.ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return { client, token: data.session.access_token, id: data.user.id };
}

async function usageRows(userId) {
  const { data, error } = await admin.from('ai_usage').select('*').eq('user_id', userId).order('created_at');
  if (error) throw new Error(`Could not read ai_usage: ${error.message}`);
  return data;
}

/** Waits until the user has `count` usage rows (the cost is logged after the answer ends). */
async function waitForRows(userId, count, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await usageRows(userId);
    if (rows.length >= count || Date.now() > until) return rows;
    await sleep(500);
  }
}

const isConsentRequired = (r) => r.status === 403 && r.body?.code === 'consent_required';
const gitIgnored = (file) => {
  try {
    execFileSync('git', ['check-ignore', '-q', file]);
    return true;
  } catch {
    return false;
  }
};

const run = randomUUID().slice(0, 8);
const password = `Pw-${randomUUID()}`;
const emails = [`a-${run}@claude-check.test`, `b-${run}@claude-check.test`];
const createdUsers = [];
const uploadedPhotos = [];

try {
  console.log('\nThe Anthropic key');
  check(gitIgnored(FUNCTIONS_ENV), `${FUNCTIONS_ENV} is git-ignored`);
  const tracked = execFileSync('git', ['ls-files', FUNCTIONS_ENV], { encoding: 'utf8' }).trim();
  check(!tracked, `${FUNCTIONS_ENV} is not in git`);
  let leaked = '';
  try {
    leaked = execFileSync('git', ['grep', '-lE', 'sk-ant-[A-Za-z0-9_-]{20,}'], { encoding: 'utf8' }).trim();
  } catch {
    leaked = ''; // git grep exits 1 when nothing matches
  }
  check(!leaked, 'no tracked file contains an Anthropic key');

  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`Could not create ${email}: ${error.message}`);
    createdUsers.push(data.user.id);
  }
  const a = await signIn(emails[0], password);
  const b = await signIn(emails[1], password);

  const { data: file, error: fileError } = await a.client
    .from('files')
    .insert({ kind: 'lecture', title: 'Claude check' })
    .select('id')
    .single();
  if (fileError) throw new Error(`Could not create the lecture file: ${fileError.message}`);
  const lectureId = file.id;
  const { error: lectureError } = await a.client.from('lectures').insert({ id: lectureId });
  if (lectureError) throw new Error(`Could not create the lecture: ${lectureError.message}`);
  const chatBody = { lectureId, message: COUNT_PROMPT };

  console.log('\nRequest checks');
  for (const [name, fnUrl] of [['assistant-chat', CHAT_URL], ['summarize', SUMMARIZE_URL]]) {
    const noToken = await call(fnUrl, null, { lectureId });
    check(noToken.status === 401, `${name}: a request without a token is refused (got ${noToken.status})`);
  }
  const badChat = await call(CHAT_URL, a.token, { lectureId, message: '' });
  check(badChat.status === 400 && badChat.body.code === 'invalid_request', `assistant-chat: an empty message is 400 (got ${badChat.status})`);
  const badSummary = await call(SUMMARIZE_URL, a.token, { lectureId: 'not-an-id' });
  check(badSummary.status === 400 && badSummary.body.code === 'invalid_request', `summarize: a bad lecture id is 400 (got ${badSummary.status})`);

  console.log('\nBefore consent');
  const noConsentChat = await chat(a.token, chatBody);
  if (noConsentChat.status === 500 && noConsentChat.body?.code === 'not_configured') {
    throw new Error(`No ANTHROPIC_API_KEY on the server. Add it to ${FUNCTIONS_ENV}, restart \`supabase functions serve\`, run again.`);
  }
  check(isConsentRequired(noConsentChat), `assistant-chat without consent: 403 consent_required (got ${noConsentChat.status})`);
  const noConsentSummary = await call(SUMMARIZE_URL, a.token, { lectureId });
  check(isConsentRequired(noConsentSummary), `summarize without consent: 403 consent_required (got ${noConsentSummary.status})`);

  const transcriptionOnly = await a.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  check(!transcriptionOnly.error, 'A gives transcription consent only');
  check(isConsentRequired(await chat(a.token, chatBody)), 'transcription consent does not allow the assistant (still 403)');
  check(isConsentRequired(await call(SUMMARIZE_URL, a.token, { lectureId })), 'nor summaries (still 403)');
  check((await usageRows(a.id)).length === 0, 'nothing was sent to Anthropic (no ai_usage row)');

  console.log('\nConsent, the way the step 10.1 screen will give it');
  const given = await a.client.from('ai_consent').insert({ scope: 'assistant_summary', policy_version: POLICY_VERSION });
  check(!given.error, 'A gives assistant and summary consent with its own client');

  console.log('\nStreaming');
  const streamed = await chat(a.token, chatBody);
  check(streamed.status === 200 && streamed.type.startsWith('text/event-stream'), `assistant-chat answers as a stream (${streamed.status} ${streamed.type})`);
  const deltas = streamed.events.filter((e) => e.name === 'delta');
  const done = streamed.events.find((e) => e.name === 'done');
  const errorEvent = streamed.events.find((e) => e.name === 'error');
  if (errorEvent) console.log(`    error event: ${JSON.stringify(errorEvent.data)}`);
  const text = deltas.map((e) => e.data.text).join('');
  console.log(`    ${deltas.length} pieces; first after ${deltas[0]?.ms ?? '?'} ms, done after ${done?.ms ?? '?'} ms`);
  console.log(`    "${text.replace(/\s+/g, ' ').trim().slice(0, 80)}…"`);
  check(deltas.length >= 2, `the answer arrives in pieces (${deltas.length} delta events)`);
  check(done && deltas.length && done.ms - deltas[0].ms >= 200, 'the first piece arrives well before the end (it is really streamed)');
  check(/\b1\b/.test(text) && /\b30\b/.test(text), 'the joined text is the answer (counts to 30)');
  check(done && !errorEvent && done.data.model === MODEL && done.data.usage?.output > 0, `done carries the model and usage (${done?.data.model})`);

  console.log('\nThe cost, logged once');
  let rows = await waitForRows(a.id, 1);
  const chatRow = rows[0];
  check(
    rows.length === 1 &&
      chatRow.operation === 'assistant' &&
      chatRow.provider === 'anthropic' &&
      chatRow.model === MODEL &&
      chatRow.lecture_id === lectureId &&
      chatRow.tokens_input > 0 &&
      chatRow.tokens_output > 0 &&
      Number(chatRow.cost_usd) > 0,
    `one assistant row in ai_usage (${chatRow?.tokens_input ?? '?'} in, ${chatRow?.tokens_output ?? '?'} out, $${chatRow?.cost_usd ?? '?'})`,
  );
  check(done && Number(chatRow?.cost_usd) === done.data.costUsd, 'its cost is the one reported in done');

  console.log('\nSummarize');
  const summary = await call(SUMMARIZE_URL, a.token, { lectureId });
  check(summary.status === 200 && summary.type.startsWith('application/json'), `summarize answers JSON (got ${summary.status})`);
  check(typeof summary.body.text === 'string' && summary.body.text.trim().length > 0, `with text: "${(summary.body.text ?? '').trim().slice(0, 80)}"`);
  rows = await usageRows(a.id);
  const summaryRows = rows.filter((r) => r.operation === 'summary');
  check(
    rows.length === 2 && summaryRows.length === 1 && summaryRows[0].model === MODEL && Number(summaryRows[0].cost_usd) === summary.body.costUsd,
    `one summary row, with the reported cost ($${summaryRows[0]?.cost_usd ?? '?'})`,
  );

  console.log('\nHanging up mid-answer');
  const cut = await chat(a.token, chatBody, { abortAfterFirstDelta: true });
  check(cut.events.some((e) => e.name === 'delta') && !cut.events.some((e) => e.name === 'done'), 'A hangs up after the first piece');
  rows = await waitForRows(a.id, 3);
  check(rows.length === 3 && rows[2].operation === 'assistant', 'the answer still finished and was logged');
  await sleep(3000);
  check((await usageRows(a.id)).length === 3, 'exactly once (no second row after waiting)');

  console.log("\nUser B and A's lecture");
  await b.client.from('ai_consent').insert({ scope: 'assistant_summary', policy_version: POLICY_VERSION });
  const stolenChat = await chat(b.token, chatBody);
  check(stolenChat.status === 404 && stolenChat.body?.code === 'lecture_not_found', `assistant-chat: B can't use A's lecture (got ${stolenChat.status})`);
  const stolenSummary = await call(SUMMARIZE_URL, b.token, { lectureId });
  check(stolenSummary.status === 404, `summarize: B can't use A's lecture (got ${stolenSummary.status})`);
  check((await usageRows(b.id)).length === 0, 'nothing was charged to B');

  console.log('\nStudy notes (step 1.7)');
  const notesBody = { lectureId, task: 'notes', summaryLevel: 'minimal', recordingMode: 'lecture', title: 'Claude check' };
  const noTranscript = await call(SUMMARIZE_URL, a.token, notesBody);
  check(noTranscript.status === 409 && noTranscript.body.code === 'no_transcript', `notes before any transcript: 409 no_transcript (got ${noTranscript.status})`);
  const badNotes = await call(SUMMARIZE_URL, a.token, { ...notesBody, summaryLevel: 'huge' });
  check(badNotes.status === 400 && badNotes.body.code === 'invalid_request', `a bad summaryLevel is 400 (got ${badNotes.status})`);

  const segments = LECTURE_TEXT.map((text, i) => ({ lecture_id: lectureId, start_ms: i * 5000, end_ms: (i + 1) * 5000, text }));
  const seededSegments = await a.client.from('transcript_segments').insert(segments);
  if (seededSegments.error) throw new Error(`Could not add the transcript: ${seededSegments.error.message}`);

  const rowsBeforeNotes = (await usageRows(a.id)).length;
  const notes = await call(SUMMARIZE_URL, a.token, notesBody);
  const note = notes.body.note;
  check(notes.status === 200 && note && typeof note.summary === 'string' && note.summary.length > 0, `notes answer JSON with a summary (got ${notes.status} ${notes.body.code ?? ''})`);
  check(
    note && Array.isArray(note.keyConcepts) && Array.isArray(note.formulas) && Array.isArray(note.definitions) && Array.isArray(note.tags) && Array.isArray(note.unclearParts),
    'every field of the note has its shape (structured outputs)',
  );
  console.log(`    "${note?.suggestedTitle ?? '?'}": ${(note?.summary ?? '').replace(/\s+/g, ' ').slice(0, 100)}…`);
  console.log(`    ${note?.keyConcepts?.length ?? 0} key concepts, ${notes.body.usage?.input ?? '?'} tokens in, ${notes.body.usage?.output ?? '?'} out, $${notes.body.costUsd ?? '?'}`);
  rows = await usageRows(a.id);
  check(rows.length === rowsBeforeNotes + 1 && rows.at(-1).operation === 'summary', 'logged once as a summary');

  const photoPath = `${a.id}/${lectureId}/board.jpg`;
  const uploaded = await a.client.storage.from('photos').upload(photoPath, sampleJpeg(), { contentType: 'image/jpeg' });
  if (uploaded.error) throw new Error(`Could not upload the photo: ${uploaded.error.message}`);
  uploadedPhotos.push(photoPath);
  const mediaRow = await a.client.from('media').insert({ lecture_id: lectureId, kind: 'photo', storage_path: photoPath, mime_type: 'image/jpeg' });
  if (mediaRow.error) throw new Error(`Could not add the media row: ${mediaRow.error.message}`);

  const withMediaBody = { ...notesBody, includeMedia: true };
  const noImagesConsent = await call(SUMMARIZE_URL, a.token, withMediaBody);
  check(isConsentRequired(noImagesConsent) && noImagesConsent.body.scope === 'images', `with a photo but no images consent: 403 consent_required, scope images (got ${noImagesConsent.status})`);
  await a.client.from('ai_consent').insert({ scope: 'images', policy_version: POLICY_VERSION });
  const withPhoto = await call(SUMMARIZE_URL, a.token, withMediaBody);
  check(withPhoto.status === 200 && withPhoto.body.note?.summary, `with images consent the photo goes along (got ${withPhoto.status} ${withPhoto.body.code ?? ''})`);
  check(
    withPhoto.body.usage?.input > (notes.body.usage?.input ?? Infinity),
    `the photo reached Claude: more input tokens (${withPhoto.body.usage?.input ?? '?'} vs ${notes.body.usage?.input ?? '?'})`,
  );

  console.log('\nClarify (step 1.7)');
  const badClarify = await call(CHAT_URL, a.token, { lectureId, mode: 'clarify', highlightedParts: [], summary: 'x' });
  check(badClarify.status === 400 && badClarify.body.code === 'invalid_request', `clarify without parts is 400 (got ${badClarify.status})`);
  const clarified = await chat(a.token, {
    lectureId,
    mode: 'clarify',
    highlightedParts: ['The equilibrium price'],
    summary: note?.summary ?? 'Supply and demand.',
  });
  const clarifyText = clarified.events.filter((e) => e.name === 'delta').map((e) => e.data.text).join('');
  const clarifyDone = clarified.events.find((e) => e.name === 'done');
  check(clarified.status === 200 && clarifyDone && clarifyText.trim().length > 0, `clarify streams an explanation (${clarifyText.length} characters)`);
  console.log(`    "${clarifyText.replace(/\s+/g, ' ').trim().slice(0, 100)}…"`);
  const rowsAfterClarify = await waitForRows(a.id, rowsBeforeNotes + 3);
  check(rowsAfterClarify.at(-1)?.operation === 'assistant', 'clarify is logged as an assistant answer');

  console.log('\nDaily limit');
  const rowsBeforeLimit = (await usageRows(a.id)).length;
  const seeded = await admin.from('ai_usage').insert({
    user_id: a.id,
    operation: 'assistant',
    provider: 'anthropic',
    model: MODEL,
    cost_usd: DAILY_LIMIT_USD,
  });
  if (seeded.error) throw new Error(`Could not seed usage: ${seeded.error.message}`);
  const limitedChat = await chat(a.token, chatBody);
  check(limitedChat.status === 429 && limitedChat.body?.code === 'daily_limit', `after $${DAILY_LIMIT_USD} today: assistant-chat 429 daily_limit (got ${limitedChat.status})`);
  const limitedSummary = await call(SUMMARIZE_URL, a.token, { lectureId });
  check(limitedSummary.status === 429 && limitedSummary.body.code === 'daily_limit', `and summarize 429 daily_limit (got ${limitedSummary.status})`);
  check((await usageRows(a.id)).length === rowsBeforeLimit + 1, 'no new ai_usage rows (only the seeded one)');

  console.log('\nWithdrawing consent');
  const withdrawn = await a.client
    .from('ai_consent')
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('scope', 'assistant_summary')
    .is('withdrawn_at', null)
    .select('id');
  check(!withdrawn.error && withdrawn.data.length === 1, 'A withdraws assistant and summary consent');
  check(isConsentRequired(await chat(a.token, chatBody)), 'after withdrawing: assistant-chat 403 consent_required');
  check(isConsentRequired(await call(SUMMARIZE_URL, a.token, { lectureId })), 'and summarize 403 consent_required');
} catch (err) {
  failures += 1;
  console.error(`✗ ${err.message}`);
} finally {
  console.log('\nCleanup');
  if (uploadedPhotos.length) {
    const { error } = await admin.storage.from('photos').remove(uploadedPhotos);
    check(!error, 'removed the test photo from Storage');
  }
  for (const id of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(!error, `deleted test user ${id} and their rows`);
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  check(!data?.users.some((u) => u.email?.endsWith('@claude-check.test')), 'no @claude-check.test users left');
  if (createdUsers.length) {
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).in('user_id', createdUsers);
    check(count === 0, 'no test rows left in ai_usage');
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll Claude checks passed.');
process.exit(failures ? 1 : 0);
