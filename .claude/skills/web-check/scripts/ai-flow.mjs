// ai-flow.mjs — the recording → transcript → notes → clarify flow in the
// browser, against the REAL local Edge Functions (Whisper and Claude):
// a spoken lecture (macOS `say`) is played as the page's microphone.
// Costs a few cents per run (about 15 s of audio, one short note, one
// clarification). Needs `supabase functions serve` with the keys in
// supabase/functions/.env. Exit code 1 on any FAIL.
//
// Since step 5.3 the web records with the recorder service: Start asks for
// transcription consent (the live transcript), the lecture's My notes opens
// with the red strip, Stop & summarize saves and opens the after-recording
// step; the chunk is already transcribed, so Generate notes asks only for
// Anthropic.
//
// WEB_CHECK_MOCK=1: expect the simulated pipeline instead (the dev server
// was started with EXPO_PUBLIC_MOCK_AI=1); no consent dialogs, no cost.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { launch, OUT, SHOTS } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const MOCK = process.env.WEB_CHECK_MOCK === '1';
const SPEECH =
  'Today we look at supply and demand. The equilibrium price is the price where the quantity supplied equals ' +
  'the quantity demanded. Price elasticity of demand is the percentage change in quantity demanded divided by ' +
  'the percentage change in price.';

const results = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b?.shot(`ai-fail-${results.length}`).catch(() => {});
    throw err; // later steps depend on this one
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const waitFor = async (fn, ms, what) => {
  const until = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${what}`);
    await b.sleep(500);
  }
};

const wav = join(OUT, 'lecture.wav');
execFileSync('say', ['-o', wav, '--data-format=LEI16@16000', SPEECH]);

const user = await makeUser();
await seed(user.client);
b = await launch({ micWav: wav });
let lectureId;

try {
  await step('sign in', () => b.signIn(BASE, user.email, user.password));

  await step(MOCK ? 'record about 12 s and stop (simulated, no consent asked)' : 'record about 12 s and stop: transcription consent at Start', async () => {
    await b.nav(`${BASE}/record`);
    await b.waitText('New Recording');
    await b.fill('input[placeholder^="e.g."]', 'AI flow check');
    await b.click('Start Recording');
    if (!MOCK) {
      await b.waitText('Send the recording to ElevenLabs?', { timeout: 20000 });
      await b.shot('ai-10-consent-transcription');
      await b.click('Allow', { exact: true });
    }
    await b.waitText('Stop & summarize', { timeout: 20000 });
    await b.sleep(12000);
    await b.click('Stop & summarize', { exact: true });
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    // Saving waits for the upload and the live transcript (at most a minute).
    await b.waitText('Post-Session', { timeout: 90000 });
    const { data } = await admin.from('files').select('id').eq('user_id', user.id).eq('title', 'AI flow check').single();
    lectureId = data.id;
  });

  await step(MOCK ? 'generate notes (simulated, no consent asked)' : 'generate notes: the Anthropic consent, then real notes', async () => {
    await b.click('GENERATE NOTES');
    if (!MOCK) {
      await b.waitText('Send the transcript to Anthropic?', { timeout: 90000 });
      await b.shot('ai-11-consent-assistant');
      await b.click('Allow', { exact: true });
    }
    await b.waitText('SUGGESTED TITLE', { timeout: 180000 });
    await b.shot('ai-12-notes');
  });

  await step('clarify a highlighted sentence', async () => {
    // A summary sentence: on the web each one is a nested Text, i.e. a <span>.
    const sentence = await b.evaluate(`(() => {
      const leaves = [...document.querySelectorAll('span')].filter((el) => el.children.length === 0);
      const s = leaves.map((el) => el.innerText.trim()).find((t) => t.length > 40 && /[.!?]$/.test(t));
      return s ?? null;
    })()`);
    expect(sentence, 'no summary sentence found');
    await b.click(sentence);
    await b.click('Clarify Highlighted Parts');
    await waitFor(async () => !(await b.hasText('Clarifying…')) && (await b.hasText('💡')), 90000, 'clarification');
    await b.shot('ai-13-clarified');
  });

  await step('confirm the notes', async () => {
    await b.click('Confirm Notes');
    await waitFor(async () => (await b.evaluate('location.pathname')) === '/', 30000, 'back on Home');
  });

  await step('database: transcript, note with clarification, lecture ready', async () => {
    const [segments, summaries, lecture] = await Promise.all([
      admin.from('transcript_segments').select('text').eq('lecture_id', lectureId),
      admin.from('summaries').select('result').eq('file_id', lectureId),
      admin.from('lectures').select('status').eq('id', lectureId).single(),
    ]);
    const text = (segments.data ?? []).map((s) => s.text).join(' ');
    console.log(`    transcript: "${text.slice(0, 90)}…"`);
    expect(MOCK ? text.includes('Simulated') : /equilibrium/i.test(text), 'transcript does not match the speech');
    const result = summaries.data?.[0]?.result;
    expect(result?.format === 'legacy-note-v1' && result.isConfirmed === true, 'no confirmed legacy note');
    expect(String(result.manualAnnotations ?? '').includes('clarifications'), 'clarification not saved with the note');
    console.log(`    note: "${result.title}"`);
    expect(lecture.data?.status === 'ready', `lecture status ${lecture.data?.status}`);
  });

  await step(MOCK ? 'no consent rows, no cost (simulated)' : 'consent rows and the cost log', async () => {
    const [consents, usage] = await Promise.all([
      admin.from('ai_consent').select('scope').eq('user_id', user.id),
      admin.from('ai_usage').select('operation, cost_usd').eq('user_id', user.id),
    ]);
    const scopes = (consents.data ?? []).map((c) => c.scope).sort();
    const ops = (usage.data ?? []).map((u) => u.operation).sort();
    console.log(`    consent: ${scopes.join(', ') || 'none'}; ai_usage: ${ops.join(', ') || 'none'} ($${(usage.data ?? []).reduce((t, u) => t + Number(u.cost_usd), 0).toFixed(4)})`);
    if (MOCK) expect(scopes.length === 0 && ops.length === 0, 'the simulation must not ask or spend');
    else {
      expect(scopes.join() === 'assistant_summary,transcription', `consent scopes ${scopes}`);
      expect(ops.includes('transcription') && ops.includes('summary') && ops.includes('assistant'), `usage ${ops}`);
    }
  });

  await step('the note opens from Home', async () => {
    await b.waitText('AI flow check', { exact: false, timeout: 10000 }).catch(() => {});
    const { data } = await admin.from('summaries').select('result').eq('file_id', lectureId).single();
    await b.nav(`${BASE}/note/${lectureId}`);
    await b.waitText(data.result.title, { timeout: 20000 });
    await b.sleep(2500); // the splash screen fades out after a reload
    await b.shot('ai-14-note');
  });
} catch {
  // the failing step is already recorded
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL') || results.length < 7) process.exitCode = 1;
}
