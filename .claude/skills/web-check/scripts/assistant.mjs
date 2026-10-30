// assistant.mjs — the study assistant's chat (step 6.2) in Chrome, during a
// real recording (the fake microphone), against local Supabase. No paid call:
// assistant-chat and transcribe-chunk are answered in the page. The assistant's
// answer is a canned Spanish one, streamed in timed pieces (meta, then deltas,
// then done), with **bold**, a numbered list and a time [0:20].
//
// Steps:
//   1. laptop (1280): the panel (desktop-01): "Study assistant", "Knows this
//      lecture up to m:ss", "Recording continues"; the four quick prompts;
//      the send arrow disabled while the box is empty.
//   2. "Explain the last 10 min": the question's bubble, "FROM 0:00 TO m:ss",
//      the answer arriving in pieces, then Copy, Retry, Add to notes,
//      Flashcards; the request carries the quick prompt and the recording's
//      time; bold, the numbered list, the time underlined; the recording goes on.
//      The chips' scroll area: color-scheme dark in dark mode (its scrollbar
//      was drawn light), the browser's own (normal) in light mode; also in 7.
//   3. The time plays in the mini player; Copy says "Copied"; Retry asks the
//      same again in its place; Add to notes / Flashcards / + say they come next.
//   4. Typing: Shift+Enter a new line, Enter sends the question as typed.
//   5. Offline: the note, the chips and send disabled, the draft kept.
//   6. The panel closed and opened again shows the conversation saved in
//      assistant_messages (not a reload: that would end the recording).
//   7. 390 px: ✦ Ask opens the sheet over the recording screen (iphone-04):
//      handle, "Study assistant", "Recording continues", "Knows…"; a quick
//      prompt answers with "0:00 → m:ss", Add to notes and Flashcards only;
//      a long-press gives Copy · Retry; the handle drags it to full height and
//      back; a tap on the time closes it and plays; the recording goes on.
//   8. After Stop, on the phone: ✦ in the header opens the sheet, no
//      recording pill, "Knows this lecture up to…" the transcript's end.
//   9. A plain document: the panel says the assistant answers about lectures.
//  10. No request reached assistant-chat or transcribe-chunk on the server.
//  11. The screenshots SIDE BY SIDE with the mockups (light and dark):
//      shots/assistant-compare-1280.png (desktop-01, light, dark),
//      shots/assistant-compare-1280-panel.png (the right panel at its size),
//      shots/assistant-compare-390.png (iphone-04, light, dark).
//
// Run with Lea's dev server on 8123 and `supabase start`:
//   node .claude/skills/web-check/scripts/assistant.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const TITLE = 'Assistant check';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-assistant-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(150);
  }
}

const repo = join(fileURLToPath(scripts), '../../../../');
const policy = readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(policy)?.[1];
if (!POLICY_VERSION) throw new Error('CONSENT_POLICY_VERSION not found in policy.ts');

/**
 * Before the app: the synthetic microphone; transcribe-chunk answered in the page (each chunk
 * transcribed whole, so "Knows up to" follows the recording); assistant-chat answered in the page
 * with a canned answer streamed in pieces. Both fail while the check is offline.
 */
const PAGE_SETUP = `(() => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) throw new Error('only audio here');
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const out = ctx.createMediaStreamDestination();
    const tone = ctx.createOscillator();
    tone.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    tone.connect(gain).connect(out);
    tone.start();
    return out.stream;
  };
  const ANSWER = 'La profesora explicó **las 5 preguntas** de la Psicobiología:\\n\\n1. **Estructuras:** qué partes del sistema nervioso producen la conducta\\n2. **Procesos:** qué la pone en marcha\\n3. **Regulación:** cómo se controla\\n4. **Finalidad:** para qué sirve, su valor adaptativo\\n5. **Evolución:** cómo se ha ido modelando\\n\\nEn el [0:20] dijo que hay que saberlas de memoria.';
  const SPANS = { last_10_min: 600000, just_said: 60000, last_term: 180000, missing: 600000 };
  const frame = (name, data) => 'event: ' + name + '\\ndata: ' + JSON.stringify(data) + '\\n\\n';
  const realFetch = window.fetch.bind(window);
  window.__checkOffline = false;
  window.__assistantCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    let body = {};
    try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      if (window.__checkOffline) throw new TypeError('Failed to fetch');
      const segments = [{ startMs: body.startMs, endMs: body.startMs + 30000, text: 'Simulated chunk ' + body.seq }];
      return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 30000, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url && url.includes('/functions/v1/assistant-chat')) {
      if (window.__checkOffline) throw new TypeError('Failed to fetch');
      window.__assistantCalls.push(body);
      const n = window.__assistantCalls.length;
      const now = typeof body.nowMs === 'number' ? body.nowMs : 0;
      const start = body.quickPrompt ? Math.max(0, now - SPANS[body.quickPrompt]) : 0;
      const pieces = [frame('meta', { questionId: 'q' + n, answerId: 'a' + n, window: { startMs: start, endMs: now }, knownUpToMs: 0 })];
      for (let i = 0; i < ANSWER.length; i += 24) pieces.push(frame('delta', { text: ANSWER.slice(i, i + 24) }));
      pieces.push(frame('done', { model: 'claude-sonnet-5-5', stopReason: 'end_turn', usage: { input: 1, output: 1 }, costUsd: 0 }));
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(c) {
          for (const p of pieces) {
            c.enqueue(enc.encode(p));
            await new Promise((r) => setTimeout(r, 90));
          }
          c.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
    }
    return realFetch(input, init);
  };
})();`;

const user = await makeUser();
const data = await seed(user.client);
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });
await b.send('Browser.grantPermissions', { origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});

const path = () => b.evaluate('location.pathname + location.search');
const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const count = (css) => b.evaluate(`document.querySelectorAll(${JSON.stringify(css)}).length`);
const disabled = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute('aria-disabled') === 'true'`);
const clockMs = (s) => s.split(':').map(Number).reduce((t, n) => t * 60 + n, 0) * 1000;
const timer = async () => {
  const m = /(\d+:\d\d(?::\d\d)?)\s*$/.exec((await text('[data-recording="timer"]')).trim());
  return m ? clockMs(m[1]) : null;
};
/** The "Knows this lecture up to m:ss" line (ms), in `scope`. */
const known = async (scope = '') => {
  const m = /up to (\d+:\d\d(?::\d\d)?)/.exec(await text(`${scope} [data-assistant="known"]`.trim()));
  return m ? clockMs(m[1]) : null;
};
const calls = () => b.evaluate('window.__assistantCalls');
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const taken = new Set();
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  await b.sleep(400);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(600);
};
const offline = async (on) => {
  await b.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.evaluate(`window.__checkOffline = ${on}`);
};
/** The last turn in `scope`: its status, question, window label, answer text, and which buttons it has. */
const lastTurn = (scope) =>
  b.evaluate(`(() => {
    const turns = document.querySelectorAll(${JSON.stringify(`${scope} [data-assistant="turn"]`)});
    const t = turns[turns.length - 1];
    if (!t) return null;
    const q = (s) => t.querySelector(s);
    const answer = q('[data-assistant="answer"]');
    const time = q('[data-answer-time]');
    return {
      count: turns.length,
      status: t.getAttribute('data-status'),
      question: q('[data-assistant="question"]')?.textContent ?? '',
      window: q('[data-assistant="window"]')?.textContent ?? '',
      windowCaps: q('[data-assistant="window"]') ? getComputedStyle(q('[data-assistant="window"]')).textTransform : null,
      answer: answer?.textContent ?? '',
      bold: answer ? [...answer.querySelectorAll('span, div')].filter((e) => e.childElementCount === 0 && Number(getComputedStyle(e).fontWeight) >= 700).map((e) => e.textContent) : [],
      time: time ? { label: time.textContent, ms: Number(time.getAttribute('data-answer-time')), underline: getComputedStyle(time).textDecorationLine } : null,
      copy: !!q('[data-assistant="copy"]'),
      retry: !!q('[data-assistant="retry"]'),
      addToNotes: !!q('[data-assistant="add-to-notes"]'),
      flashcards: !!q('[data-assistant="flashcards"]'),
      // The laptop's bubble has the avatar beside the question (desktop-01).
      avatar: (q('[data-assistant="bubble"]')?.childElementCount ?? 0) > 1,
    };
  })()`);
/** Watches an answer stream in: the answer's lengths seen until it is done. */
const watchStream = async (scope) => {
  const lengths = new Set();
  const until = Date.now() + 20000;
  for (;;) {
    const t = await lastTurn(scope);
    if (t?.answer) lengths.add(t.answer.length);
    if (t?.status === 'done' || t?.status === 'error') return { turn: t, lengths: [...lengths] };
    if (Date.now() > until) throw new Error(`the answer never finished: ${JSON.stringify(t)}`);
    await b.sleep(60);
  }
};
/**
 * The quick prompts' scroll area in `scope`: its computed color-scheme (the browser draws its
 * scrollbar from it) and whether it overflows (so a scrollbar is drawn at all).
 */
const chipsScroll = (scope) =>
  b.evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(`${scope} [data-assistant="chips"]`)});
    return e ? { scheme: getComputedStyle(e).colorScheme, overflows: e.scrollWidth > e.clientWidth } : null;
  })()`);
/** Dark mode: a dark scrollbar under the chips (it was drawn light); light mode: the browser's own, as before. */
const expectChipsScheme = async (scope, dark) => {
  const s = await chipsScroll(scope);
  expect(s && s.overflows, `the chips don't scroll sideways (no scrollbar to check): ${JSON.stringify(s)}`);
  expect(dark ? s.scheme === 'dark' : s.scheme === 'normal', `the chips' scroll area in ${dark ? 'dark' : 'light'} mode: color-scheme ${s.scheme}`);
};
const PANEL = '[data-testid="assistant-panel"]';
const SHEET = '[data-assistant="sheet"]';
const center = (css) =>
  b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

let lectureId = null;
try {
  for (const scope of ['transcription', 'assistant_summary']) {
    const { error } = await user.client.from('ai_consent').insert({ scope, policy_version: POLICY_VERSION });
    if (error) throw new Error(`the ${scope} consent: ${error.message}`);
  }
  await b.signIn(BASE, user.email, user.password);
  await b.nav(`${BASE}/record?projectId=${data.course.id}`);
  await b.waitText('New Recording', { timeout: 30000 });
  await b.fill('input[placeholder^="e.g."]', TITLE);
  await b.clickSelector('[aria-label="Start recording"]');
  await waitFor(async () => (await path()).startsWith('/doc/'), async () => `the lecture opened (at ${await path()})`, 20000);
  await waitFor(() => has('[data-recording="strip"]'), 'the strip', 10000);
  lectureId = /\/doc\/([^?/]+)/.exec(await path())[1];

  await step('laptop: the panel as desktop-01: Study assistant, Knows this lecture up to m:ss (after the first chunk), Recording continues; four quick prompts; send disabled while the box is empty', async () => {
    await waitFor(() => has(PANEL), 'the assistant panel', 10000);
    expect((await text(PANEL)).includes('Study assistant'), 'no title');
    expect(await has(`${PANEL} [data-recording="continues"]`), 'no "Recording continues"');
    // The first chunk (30 s) is transcribed: the panel knows the lecture up to its end.
    await waitFor(async () => (await known(PANEL)) >= 30000, async () => `"Knows…": ${await text(`${PANEL} [data-assistant="known"]`)}`, 60000);
    const chips = await b.evaluate(`[...document.querySelectorAll('${PANEL} [data-assistant="chip"]')].map((e) => e.textContent)`);
    expect(JSON.stringify(chips) === JSON.stringify(['Explain the last 10 min', 'What did she just say?', 'Define the last term', 'Am I missing something?']), `chips: ${JSON.stringify(chips)}`);
    expect(await disabled(`${PANEL} [data-assistant="send"]`), 'send is not disabled with an empty box');
    expect((await text(PANEL)).includes('Context: this lecture'), 'no "Context: this lecture"');
    expect((await text(PANEL)).includes('Answers come from the lecture transcript and are saved to your summary.'), 'no footer');
    const placeholder = await b.evaluate(`document.querySelector('${PANEL} textarea')?.placeholder`);
    expect(placeholder === 'Ask about the lecture…', `placeholder: ${placeholder}`);
  });

  let firstAnswer = null;
  await step('“Explain the last 10 min”: bubble, FROM 0:00 TO m:ss, the answer arriving in pieces, then Copy · Retry · Add to notes · Flashcards; bold, the list and the time underlined; the request carries the quick prompt and the recording time; the recording goes on', async () => {
    const before = await timer();
    await b.clickSelector(`${PANEL} [data-quick-prompt="last_10_min"]`);
    const { turn, lengths } = await watchStream(PANEL);
    firstAnswer = turn;
    expect(turn.status === 'done', `status ${turn.status}`);
    expect(lengths.length >= 4, `the answer did not stream in pieces (lengths seen: ${lengths.join(', ')})`);
    expect(turn.question.trim() === 'Explain the last 10 min' && turn.avatar, `bubble: ${turn.question} (avatar ${turn.avatar})`);
    expect(/^From 0:00 to \d+:\d\d$/.test(turn.window) && turn.windowCaps === 'uppercase', `window label: ${turn.window} (${turn.windowCaps})`);
    expect(turn.copy && turn.retry && turn.addToNotes && turn.flashcards, `buttons: ${JSON.stringify(turn)}`);
    expect(turn.bold.includes('las 5 preguntas') && turn.bold.some((s) => s.startsWith('Estructuras')), `bold: ${JSON.stringify(turn.bold)}`);
    expect(turn.answer.includes('1.') && turn.answer.includes('5.'), 'no numbered list');
    expect(turn.time && turn.time.label === '0:20' && turn.time.ms === 20000 && turn.time.underline === 'underline', `the time: ${JSON.stringify(turn.time)}`);
    expect(!turn.answer.includes('**') && !turn.answer.includes('[0:20]'), 'markdown shown raw');
    const call = (await calls()).at(-1);
    expect(call.quickPrompt === 'last_10_min' && call.lectureId === lectureId && Math.abs(call.nowMs - before) < 5000, `request: ${JSON.stringify(call)}`);
    const t = await timer();
    expect(t > before && (await has('[data-recording="strip"]')), 'the recording stopped');
    await expectChipsScheme(PANEL, false);
    await shot('assistant-panel-1280');
    await dark(true);
    await expectChipsScheme(PANEL, true);
    await shot('assistant-panel-1280-dark');
    await dark(false);
    await expectChipsScheme(PANEL, false);
  });

  await step('the time plays in the mini player; Copy says Copied; Add to notes, Flashcards and + say they come next', async () => {
    await b.clickSelector(`${PANEL} [data-answer-time]`);
    await waitFor(() => has('[aria-label="Recording player"]'), 'the mini player', 8000);
    await b.clickSelector(`${PANEL} [data-assistant="copy"]`);
    await waitFor(async () => (await text(`${PANEL} [data-assistant="notice"]`)) === 'Copied', 'Copied', 4000);
    const clip = await b.evaluate('navigator.clipboard.readText().catch(() => null)');
    if (clip !== null) expect(clip.startsWith('La profesora explicó las 5 preguntas') && clip.includes('[0:20]'), `the clipboard: ${clip}`);
    await b.clickSelector(`${PANEL} [data-assistant="add-to-notes"]`);
    await waitFor(async () => (await text(`${PANEL} [data-assistant="notice"]`)) === 'Add to notes comes in the next step.', 'the Add to notes notice', 4000);
    await b.clickSelector(`${PANEL} [data-assistant="flashcards"]`);
    await waitFor(async () => (await text(`${PANEL} [data-assistant="notice"]`)) === 'Flashcards comes in the next step.', 'the Flashcards notice', 4000);
    await b.clickSelector(`${PANEL} [data-assistant="attach"]`);
    await waitFor(async () => (await text(`${PANEL} [data-assistant="notice"]`)) === 'Attaching files comes later.', 'the + notice', 4000);
  });

  await step('Retry asks the same quick prompt again, its answer in the same place', async () => {
    const n = (await calls()).length;
    await b.clickSelector(`${PANEL} [data-assistant="retry"]`);
    const { turn } = await watchStream(PANEL);
    const list = await calls();
    expect(list.length === n + 1 && list.at(-1).quickPrompt === 'last_10_min' && !list.at(-1).message, `request: ${JSON.stringify(list.at(-1))}`);
    expect(turn.count === firstAnswer.count && turn.status === 'done', `turns: ${turn.count} (was ${firstAnswer.count})`);
  });

  await step('typing: Shift+Enter makes a new line, Enter sends the question as typed (send enabled with text)', async () => {
    await b.clickSelector(`${PANEL} textarea`);
    await b.type('¿Qué es la sinapsis?');
    expect(!(await disabled(`${PANEL} [data-assistant="send"]`)), 'send still disabled with text');
    await b.chord({ code: 'Enter', key: 'Enter', shift: true, text: '\r', keyCode: 13 });
    await b.type('Con un ejemplo');
    const value = await b.evaluate(`document.querySelector('${PANEL} textarea').value`);
    expect(value === '¿Qué es la sinapsis?\nCon un ejemplo', `the box: ${JSON.stringify(value)}`);
    await b.press('Enter');
    const { turn } = await watchStream(PANEL);
    expect((await calls()).at(-1).message === '¿Qué es la sinapsis?\nCon un ejemplo', 'the message sent');
    expect(turn.question.trim() === '¿Qué es la sinapsis?\nCon un ejemplo', `bubble: ${JSON.stringify(turn.question)}`);
    expect(/^From 0:00 to /.test(turn.window), `a typed question's window: ${turn.window}`);
    expect((await b.evaluate(`document.querySelector('${PANEL} textarea').value`)) === '', 'the box not emptied');
  });

  await step('offline: the note, the chips and send disabled; the draft stays; back online they work again', async () => {
    await offline(true);
    await b.clickSelector(`${PANEL} textarea`);
    await b.type('Pregunta sin conexión');
    await waitFor(() => has(`${PANEL} [data-assistant="offline"]`), 'the offline note', 30000);
    expect((await text(`${PANEL} [data-assistant="offline"]`)) === 'The assistant needs the internet. Your question stays here.', 'the offline text');
    expect(await disabled(`${PANEL} [data-quick-prompt="just_said"]`), 'a chip is enabled offline');
    expect(await disabled(`${PANEL} [data-assistant="send"]`), 'send is enabled offline');
    const n = (await calls()).length;
    await b.clickSelector(`${PANEL} [data-quick-prompt="just_said"]`);
    expect((await calls()).length === n, 'a question was sent offline');
    await offline(false);
    await waitFor(async () => !(await has(`${PANEL} [data-assistant="offline"]`)), 'online again', 30000);
    expect((await b.evaluate(`document.querySelector('${PANEL} textarea').value`)) === 'Pregunta sin conexión', 'the draft was lost');
    await b.fill(`${PANEL} textarea`, '');
  });

  // Not a reload: that would interrupt the recording. Closing and opening the panel reads the conversation again.
  await step('the panel opened again shows the conversation saved in assistant_messages (as the server saves it)', async () => {
    const q = await user.client
      .from('assistant_messages')
      .insert({ lecture_id: lectureId, role: 'user', content: 'Pregunta guardada', quick_prompt: null, asked_at_ms: 10000, window_start_ms: 0, window_end_ms: 10000, status: 'done' })
      .select('id')
      .single();
    if (q.error) throw new Error(q.error.message);
    const a = await user.client.from('assistant_messages').insert({ lecture_id: lectureId, role: 'assistant', content: 'Respuesta **guardada** [0:05].', reply_to: q.data.id, window_start_ms: 0, window_end_ms: 10000, status: 'done', model: 'claude-sonnet-5-5' });
    if (a.error) throw new Error(a.error.message);
    await b.clickSelector(`${PANEL} [aria-label="Hide study assistant"]`);
    await waitFor(async () => !(await has(PANEL)), 'the panel hidden', 5000);
    await b.clickSelector('[aria-label="Show study assistant"]');
    await waitFor(async () => (await text(PANEL)).includes('Respuesta guardada 0:05'), async () => `the saved answer: ${await text(PANEL)}`, 20000);
    expect((await text(PANEL)).includes('Pregunta guardada'), 'the saved question');
    // The answers the page made up were never saved: only the saved pair is there.
    expect((await count(`${PANEL} [data-assistant="turn"]`)) === 1, `turns: ${await count(`${PANEL} [data-assistant="turn"]`)}`);
    expect(await has('[data-recording="strip"]'), 'the recording stopped');
  });

  await step('390 px: ✦ Ask opens the sheet over the recording screen (iphone-04): handle, Study assistant, Recording continues, Knows…; a quick prompt answers with 0:00 → m:ss, Add to notes and Flashcards only', async () => {
    await b.resize(390, 844);
    await waitFor(() => has('[data-recording="bar"]'), 'the bottom bar', 10000);
    expect(!(await disabled('[data-recording="ask"]')), '✦ Ask is disabled');
    await b.clickSelector('[data-recording="ask"]');
    await waitFor(() => has(SHEET), 'the sheet', 5000);
    expect(await has(`${SHEET} [data-sheet="handle"]`), 'no handle');
    expect((await text(SHEET)).includes('Study assistant'), 'no title');
    expect(await has(`${SHEET} [data-recording="continues"]`), 'no "Recording continues"');
    expect((await known(SHEET)) >= 30000, `"Knows…": ${await text(`${SHEET} [data-assistant="known"]`)}`);
    const box = await b.evaluate(`(() => { const r = document.querySelector('${SHEET}').getBoundingClientRect(); return { top: r.top, h: r.height }; })()`);
    expect(box.top > 200 && box.top < 360, `the sheet's top at ${box.top} px (iphone-04: about a third down)`);
    await b.clickSelector(`${SHEET} [data-quick-prompt="just_said"]`);
    const { turn } = await watchStream(SHEET);
    expect(turn.status === 'done' && turn.question.trim() === 'What did she just say?', `turn: ${JSON.stringify(turn)}`);
    expect(/^\d+:\d\d → \d+:\d\d$/.test(turn.window) && turn.windowCaps !== 'uppercase', `window label: ${turn.window}`);
    expect(turn.addToNotes && turn.flashcards && !turn.copy, `buttons (iphone-04: Add to notes and Flashcards only): ${JSON.stringify(turn)}`);
    const placeholder = await b.evaluate(`document.querySelector('${SHEET} textarea')?.placeholder`);
    expect(placeholder === 'Ask about the lecture…', `placeholder: ${placeholder}`);
    expect(await disabled(`${SHEET} [data-assistant="send"]`), 'send enabled with an empty box');
    await expectChipsScheme(SHEET, false);
    await shot('assistant-sheet-390');
    await dark(true);
    await expectChipsScheme(SHEET, true);
    await shot('assistant-sheet-390-dark');
    await dark(false);
  });

  await step('390 px: a long-press on the answer gives Copy · Retry; the handle drags the sheet to full height and back; a tap on the time closes it and plays; the recording goes on', async () => {
    const before = await timer();
    const answer = await center(`${SHEET} [data-assistant="turn"]:last-of-type [data-assistant="answer"]`);
    await b.clickAt(answer.x, answer.y, { holdMs: 700 });
    await b.waitText('Retry', { timeout: 4000, exact: true });
    expect(await b.hasText('Copy', true), 'no Copy in the menu');
    await b.click('Copy', { exact: true });
    const handle = await center(`${SHEET} [data-sheet="handle"]`);
    await b.mouseDrag(handle, { x: handle.x, y: handle.y - 220 });
    await waitFor(async () => (await b.evaluate(`document.querySelector('${SHEET}')?.getAttribute('data-expanded')`)) === 'true', 'full height', 3000);
    const up = await center(`${SHEET} [data-sheet="handle"]`);
    await b.mouseDrag(up, { x: up.x, y: up.y + 150 });
    await waitFor(async () => (await b.evaluate(`document.querySelector('${SHEET}')?.getAttribute('data-expanded')`)) === 'false', 'back down', 3000);
    expect(await has(SHEET), 'the sheet closed instead of going down a step');
    await b.clickSelector(`${SHEET} [data-answer-time]`);
    await waitFor(async () => !(await has(SHEET)), 'the sheet closed', 4000);
    await waitFor(() => has('[aria-label="Recording player"]'), 'the mini player', 8000);
    expect((await timer()) > before, 'the recording stopped');
    // Open again: the conversation is kept.
    await b.clickSelector('[data-recording="ask"]');
    await waitFor(() => has(SHEET), 'the sheet again', 5000);
    expect((await lastTurn(SHEET))?.question.trim() === 'What did she just say?', 'the conversation was lost');
    await b.clickSelector('[aria-label="Close the study assistant"]');
    await waitFor(async () => !(await has(SHEET)), 'the sheet closed', 4000);
    await b.resize(1280, 900);
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 10000);
    // Counted now: after Stop the page is reloaded, which empties the page's own list.
    report.push(`RESULT | questions answered in the page | ${(await calls())?.length ?? '?'}`);
  });

  await step('after Stop, on the phone: ✦ in the header opens the sheet, no recording pill, Knows this lecture up to its transcript’s end', async () => {
    await b.clickSelector('[aria-label="Stop and summarize"]');
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    await waitFor(async () => (await path()).startsWith('/record/post-session'), async () => `the after-recording step (at ${await path()})`, 90000);
    await b.resize(390, 844);
    await b.nav(`${BASE}/doc/${lectureId}?tab=notes`);
    await waitFor(() => has('[data-assistant="open"]'), '✦ in the header', 20000);
    await b.clickSelector('[data-assistant="open"] [aria-label="Study assistant"]');
    await waitFor(() => has(SHEET), 'the sheet', 5000);
    expect(!(await has(`${SHEET} [data-recording="continues"]`)), 'a recording pill after the recording');
    await waitFor(async () => (await known(SHEET)) !== null || (await text(`${SHEET} [data-assistant="known"]`)) === 'Nothing transcribed yet', 'the "Knows…" line', 8000);
    report.push(`RESULT | after class | ${await text(`${SHEET} [data-assistant="known"]`)}`);
    await b.clickSelector('[aria-label="Close the study assistant"]');
    await b.resize(1280, 900);
  });

  // After Stop: opening another document by its address reloads the page, which would have ended the recording.
  await step('a plain document: the panel says the assistant answers about a lecture', async () => {
    const f = await user.client.from('files').insert({ kind: 'document', title: 'Plain doc', course_id: data.course.id }).select('id').single();
    if (f.error) throw new Error(f.error.message);
    await b.nav(`${BASE}/doc/${f.data.id}`);
    await waitFor(async () => (await text(PANEL)).includes('answers from a lecture’s transcript'), async () => `the panel: ${await text(PANEL)}`, 15000);
    expect(!(await has(`${PANEL} [data-assistant="composer"]`)), 'a composer for a plain document');
  });

  await step('no request reached assistant-chat or transcribe-chunk on the server, nor Anthropic, OpenAI or ElevenLabs', async () => {
    const out = requests.filter((u) => /functions\/v1\/(assistant-chat|transcribe-chunk)|anthropic\.com|api\.openai\.com|elevenlabs\.io/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the screenshots SIDE BY SIDE with the mockups: assistant-compare-1280, assistant-compare-1280-panel, assistant-compare-390', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    // Only this run's screenshots.
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const wanted = ['assistant-panel-1280', 'assistant-panel-1280-dark', 'assistant-sheet-390', 'assistant-sheet-390-dark'];
    const missing = wanted.filter((n) => !taken.has(n));
    const mockDesktop = png(join(repo, 'docs/design/desktop-01-recording.png'));
    const mockPhone = png(join(repo, 'docs/design/iphone-04-assistant.png'));
    expect(mockDesktop && mockPhone, 'the mockups are not in docs/design');
    await b.nav('about:blank');
    /**
     * Labelled images side by side, each `w` px wide; `crop` { x, w, h, natural }: only that part of the
     * image (its own pixels, the image drawn `natural` px wide).
     */
    const compose = async (name, cells, w) => {
      const cell = ([label, src, crop]) =>
        `<figure style="margin:0;width:${crop ? crop.w : w}px"><figcaption style="font:600 18px -apple-system,sans-serif;margin:0 0 8px">${label}</figcaption>${
          !src
            ? '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
            : crop
              ? `<div style="width:${crop.w}px;height:${crop.h}px;overflow:hidden;border:1px solid #ccc"><img src="${src}" style="width:${crop.natural}px;margin-left:-${crop.x}px;display:block"></div>`
              : `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">`
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:flex;gap:24px;align-items:flex-start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose(
      'assistant-compare-1280',
      [
        ['Mockup: desktop-01', mockDesktop],
        ['App · light', shotOf('assistant-panel-1280')],
        ['App · dark', shotOf('assistant-panel-1280-dark')],
      ],
      760,
    );
    // The right panel at its own size: desktop-01 is 1600 px wide (panel from x 1258), the app 1280 (panel from x 950).
    await compose(
      'assistant-compare-1280-panel',
      [
        ['Mockup: desktop-01 (panel)', mockDesktop, { x: 1258, w: 342, h: 1086, natural: 1600 }],
        ['App · light', shotOf('assistant-panel-1280'), { x: 950, w: 330, h: 900, natural: 1280 }],
        ['App · dark', shotOf('assistant-panel-1280-dark'), { x: 950, w: 330, h: 900, natural: 1280 }],
      ],
      342,
    );
    await compose(
      'assistant-compare-390',
      [
        ['Mockup: iphone-04', mockPhone],
        ['App · light', shotOf('assistant-sheet-390')],
        ['App · dark', shotOf('assistant-sheet-390-dark')],
      ],
      390,
    );
    await b.resize(1280, 900);
    expect(missing.length === 0, `not taken in this run: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  for (const r of report) console.log(r);
  console.log('console errors:', JSON.stringify(errors));
  console.log('shots:', SHOTS);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
