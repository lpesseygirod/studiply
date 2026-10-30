// notes-live.mjs — step 5.4, live notes with timestamps (web: the laptop and
// the 390 px iPhone layout), on the recorder of 5.2 and the screens of 5.3,
// with a synthetic microphone and no paid call:
//   - the microphone is a synthetic Web Audio stream (a 1 kHz tone),
//     getUserMedia replaced before the app loads; transcribe-chunk is
//     answered inside the page; the check fails if any request reaches
//     transcribe-chunk, OpenAI or ElevenLabs. Consent is seeded.
// Steps:
//   1. record a lecture and type three lines in My notes a few seconds apart
//      (the first with a bold word through "**…**", the second a list item
//      through "- "): each line starts with a chip whose time is the timer's
//      when the line was started (± 1.5 s), in order; an empty line gets none;
//   2. note_lines: one row per line with its time, its text without the chip,
//      and the bold kept in its JSON;
//   3. a tap on a chip during the recording plays that moment from the
//      browser's own copy (the player's time moves on from the chip's) while
//      the recording goes on; the quiet "Use headphones: the recording is
//      still running." shows the first time only;
//   4. at 390 px (the iPhone recording screen) a new line is stamped too;
//   5. after Stop: a line written now gets no chip; a chip plays from Storage,
//      and across a chunk join the time never goes back (the 500 ms overlap
//      isn't heard twice);
//   6. no paid request.
// Screenshots (each after the splash): notes-live-1280, notes-live-1280-dark,
// notes-live-390, notes-live-390-dark, notes-live-playing-1280.
// About 3 minutes. PASS/FAIL per step; exit 1 on a FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node notes-live.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const TITLE = 'Live notes check';
const HINT = 'Use headphones: the recording is still running.';
const EDITOR = 'window.studiplyEditor';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-notes-live-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(250);
  }
}

const repo = join(fileURLToPath(scripts), '../../../../');
const policy = readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(policy)?.[1];
if (!POLICY_VERSION) throw new Error('CONSENT_POLICY_VERSION not found in policy.ts');

/** Before the app: the synthetic microphone, transcribe-chunk answered in the page. */
const PAGE_SETUP = `(() => {
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
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      const segments = [{ startMs: body.startMs, endMs: body.startMs + 1000, text: 'Simulated chunk ' + body.seq }];
      return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 0, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

const path = () => b.evaluate('location.pathname + location.search');
const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
/** The strip's or the phone chip's clock, in seconds. */
const timer = async () => {
  const m = /(\d+):(\d\d)\s*$/.exec((await text('[data-recording="timer"]')).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Each block of My notes: its chip times (s) and its text. */
const notes = () => b.evaluate(`${EDITOR}.getJSON().content.map((blk) => {
  const chips = [], words = [];
  const walk = (n) => { if (n.type === 'timestampChip') chips.push(n.attrs.ms / 1000); else if (n.type === 'text') words.push(n.text); (n.content || []).forEach(walk); };
  walk(blk);
  return { type: blk.type, chips, text: words.join('').trim() };
})`);
/** The player's "At 0:12 of 0:40", in seconds. */
const playerAt = async () => {
  const label = await b.evaluate(`document.querySelector('[aria-label^="At "]')?.getAttribute('aria-label') ?? ''`);
  const m = /^At (\d+):(\d\d) of/.exec(label);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATIVE STUDY')`);
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  await b.sleep(400);
  await b.shot(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(600);
};
const toEnd = () => b.evaluate(`${EDITOR}.commands.focus('end')`);
const noteRows = async (lectureId) => (await admin.from('note_lines').select('block_id, t_ms, text, content, position').eq('lecture_id', lectureId).order('position')).data ?? [];

let lectureId = null;
const started = [];
try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  await b.signIn(BASE, user.email, user.password);

  await step('recording: each new line of My notes starts with the recording time (bold and "- " kept); an empty line gets none', async () => {
    await b.nav(`${BASE}/record?projectId=${data.course.id}`);
    await b.waitText('New Recording', { timeout: 30000 });
    await b.fill('input[placeholder^="e.g."]', TITLE);
    await b.clickSelector('[aria-label="Start recording"]');
    await waitFor(async () => (await path()).startsWith('/doc/'), 'the lecture opened', 20000);
    lectureId = (await path()).split('/doc/')[1].split('?')[0];
    await waitFor(() => b.evaluate(`!!${EDITOR}`), 'the editor', 15000);
    await waitFor(async () => (await timer()) >= 3, 'three seconds recorded', 10000);
    // Line 1, with a bold word (typed as the keyboard would: the line first, then **…**).
    await toEnd();
    started.push(await timer());
    await b.type('Def: ');
    await b.type('**conducta**');
    await b.press('Enter');
    await b.sleep(3000);
    // Line 2, a list item through "- ".
    started.push(await timer());
    await b.type('- ');
    await b.type('a list item');
    await b.press('Enter');
    await b.press('Enter');
    // An empty line, then line 3.
    await b.press('Enter');
    await b.sleep(3000);
    started.push(await timer());
    await b.type('Third line');
    await b.sleep(500);
    const n = await notes();
    const lines = n.filter((x) => x.text);
    expect(lines.length === 3, `lines: ${JSON.stringify(n)}`);
    expect(lines[0].type === 'paragraph' && lines[0].text === 'Def: conducta', `line 1: ${JSON.stringify(lines[0])}`);
    expect(lines[1].type === 'bulletList' && lines[1].text === 'a list item', `line 2: ${JSON.stringify(lines[1])}`);
    lines.forEach((l, i) => {
      expect(l.chips.length === 1, `line ${i + 1} has ${l.chips.length} chips`);
      expect(Math.abs(l.chips[0] - started[i]) <= 1.5, `line ${i + 1} at ${l.chips[0]} s, the timer said ${started[i]} s`);
    });
    expect(lines[0].chips[0] < lines[1].chips[0] && lines[1].chips[0] < lines[2].chips[0], 'the times are not in order');
    expect(n.filter((x) => !x.text).every((x) => x.chips.length === 0), `an empty line has a chip: ${JSON.stringify(n)}`);
    const bold = await b.evaluate(`!!document.querySelector('.studiply-editor strong, .studiply-editor b')`);
    expect(bold, 'the bold word is not bold');
    report.push(`RESULT | stamps | lines started at ${started.join(', ')} s; chips ${lines.map((l) => l.chips[0]).join(', ')} s`);
    await shot('notes-live-1280');
    await dark(true);
    await shot('notes-live-1280-dark');
    await dark(false);
  });

  await step('note_lines: one row per line, with its time, its text without the chip, the bold kept', async () => {
    const rows = await waitFor(async () => {
      const r = await noteRows(lectureId);
      return r.length === 3 && r[2].text === 'Third line' ? r : null;
    }, async () => `note_lines: ${JSON.stringify(await noteRows(lectureId))}`, 20000);
    const n = (await notes()).filter((x) => x.text);
    expect(rows.map((r) => r.t_ms / 1000).join() === n.map((l) => l.chips[0]).join(), `times: ${rows.map((r) => r.t_ms)} vs ${n.map((l) => l.chips[0])}`);
    expect(rows.map((r) => r.text).join('|') === 'Def: conducta|a list item|Third line', `texts: ${rows.map((r) => r.text)}`);
    expect(/#0$/.test(rows[1].block_id), `the list item's id: ${rows[1].block_id}`);
    expect(JSON.stringify(rows[0].content).includes('"bold"'), `the bold isn't in the row: ${JSON.stringify(rows[0].content)}`);
  });

  await step('a chip tapped during the recording plays that moment from the browser’s copy; the headphones hint once; recording goes on', async () => {
    const chipAt = (await notes()).filter((x) => x.text)[0].chips[0];
    await b.clickSelector('.studiply-editor .ts-chip');
    await waitFor(() => has('[aria-label="Pause"]'), 'playing', 15000);
    const first = await waitFor(playerAt, 'the player time', 5000);
    expect(Math.abs(first - chipAt) <= 1.5, `played from ${first} s, the chip is ${chipAt} s`);
    expect(await b.hasText(HINT, true), 'no headphones hint');
    await b.sleep(2500);
    const later = await playerAt();
    expect(later > first, `the player time doesn't move: ${first} → ${later}`);
    expect(await has('[data-recording="strip"]'), 'the recording stopped');
    await shot('notes-live-playing-1280');
    // The hint goes by itself, and isn't shown again.
    await waitFor(async () => !(await b.hasText(HINT, true)), 'the hint gone', 10000);
    await b.clickSelector('[aria-label="Close the player"]');
    await b.clickSelector('.studiply-editor .ts-chip');
    await waitFor(() => has('[aria-label="Pause"]'), 'playing again', 15000);
    await b.sleep(800);
    expect(!(await b.hasText(HINT, true)), 'the hint showed a second time');
    await b.clickSelector('[aria-label="Close the player"]');
    report.push(`RESULT | live playback | chip ${chipAt} s played from ${first} s, ${later} s after 2.5 s`);
  });

  await step('390 px: on the iPhone recording screen a new line is stamped too', async () => {
    await b.resize(390, 844);
    await waitFor(() => has('[data-recording="bar"]'), 'the recording screen', 10000);
    await toEnd();
    await b.press('Enter');
    const at = await timer();
    await b.type('Phone line');
    await b.sleep(500);
    const last = (await notes()).filter((x) => x.text).at(-1);
    expect(last.text === 'Phone line' && last.chips.length === 1 && Math.abs(last.chips[0] - at) <= 1.5, `the phone line: ${JSON.stringify(last)} (timer ${at} s)`);
    await shot('notes-live-390');
    await dark(true);
    await shot('notes-live-390-dark');
    await dark(false);
    await b.resize(1280, 900);
  });

  await step('after Stop: a new line gets no chip; a chip plays from Storage, and across a chunk join the time never goes back', async () => {
    // Long enough for a chunk join behind the first chip (30-second chunks).
    await waitFor(async () => (await timer()) >= 40, 'forty seconds recorded', 45000);
    await b.clickSelector('[aria-label="Stop and summarize"]');
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    await waitFor(async () => (await path()).startsWith('/record/post-session'), 'the after-recording step', 90000);
    await b.nav(`${BASE}/doc/${lectureId}?tab=notes`);
    await waitFor(() => b.evaluate(`!!${EDITOR}`), 'the editor', 30000);
    await b.sleep(1500);
    await toEnd();
    await b.press('Enter');
    await b.type('After the recording');
    await b.sleep(500);
    const last = (await notes()).filter((x) => x.text).at(-1);
    expect(last.text === 'After the recording' && last.chips.length === 0, `the line after Stop: ${JSON.stringify(last)}`);
    // From Storage: the first chip, then +10 s twice, to cross the join at about 30 s.
    await b.clickSelector('.studiply-editor .ts-chip');
    await waitFor(() => has('[aria-label="Pause"]'), 'playing after the recording', 20000);
    expect(!(await b.hasText(HINT, true)), 'the headphones hint after the recording');
    await b.clickSelector('[aria-label="Forward 10 seconds"]');
    await b.sleep(400);
    await b.clickSelector('[aria-label="Forward 10 seconds"]');
    await b.sleep(400);
    const times = [];
    for (let i = 0; i < 32; i++) {
      times.push(await playerAt());
      await b.sleep(250);
    }
    const seen = times.filter((t) => t !== null);
    expect(seen.length > 20 && seen.at(-1) - seen[0] >= 5, `the player didn't play on: ${seen.join(',')}`);
    expect(seen.every((t, i) => i === 0 || t >= seen[i - 1]), `the time went back: ${seen.join(',')}`);
    const crossed = seen[0] <= 30 && seen.at(-1) > 31;
    report.push(`RESULT | after Stop | played ${seen[0]} s → ${seen.at(-1)} s${crossed ? ' across the chunk join' : ''}, never back`);
    await b.clickSelector('[aria-label="Close the player"]');
  });

  await step('no request reached transcribe-chunk, OpenAI or ElevenLabs (transcription answered in the page)', async () => {
    const out = requests.filter((u) => /functions\/v1\/transcribe-chunk|api\.openai\.com|elevenlabs\.io/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  for (const r of report) console.log(r);
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
