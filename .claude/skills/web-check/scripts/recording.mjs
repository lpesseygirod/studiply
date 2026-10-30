// recording.mjs — step 5.3, the recording screens (web, laptop and the 390 px
// iPhone layout) on the recorder service of 5.2, with a synthetic microphone
// and no paid call:
//   - the microphone is a synthetic Web Audio stream (a 1 kHz tone),
//     getUserMedia replaced before the app loads;
//   - transcribe-chunk is answered inside the page ("Simulated chunk N"); the
//     check fails if any request reaches transcribe-chunk, OpenAI or
//     ElevenLabs. Uploads are real (local Supabase). Consent is seeded.
// Steps:
//   1. setup (Lea's option A): opened from a folder, the course and that
//      folder are preset; the folder picker lists the course and its folders;
//      + New folder makes "Tema 3" in the course and selects it;
//   2. Start: the lecture is made in Math › Tema 3 with status "recording",
//      its My notes opens, the red strip shows the timer (moving) and the
//      waveform; Important · Confused · Exam · Photo board are shown greyed out;
//   3. leaving never stops it: the course page and another document, the strip
//      on each, the timer going on, chunks uploaded meanwhile; the strip leads
//      back to the lecture;
//   4. the microphone going away pauses it ("Microphone disconnected"); Resume;
//   4b. Pause beside the timer (Lea, 30 Oct): "Paused", the clock and the
//      waveform still, the microphone closed, at 1280 and 390; ▶ goes on, and
//      the chunk after the pause starts exactly where the one before ended;
//   5. at 390 px: the iPhone recording screen around My notes (timer chip,
//      waveform, bottom bar); back to the course: the red pill leads back;
//   6. a reload asks first (the browser's question), then the strip offers the
//      interrupted recording; Continue records on into the same lecture;
//   7. Stop & summarize asks, saves, and opens today's after-recording step;
//      the lecture is "transcribing" with its length, its chunks in order;
//   8. a second lecture: the tab closed (reloaded) while "Saving…" (its audio
//      upload blocked): on the next load it is handed off in the background,
//      "transcribing" with its length, nothing shown;
//   9. no paid request.
// Also: the marks and Photo board (and ✦ Ask) are truly disabled (aria-disabled)
// and, on the laptop, all look the same; at 390 px the title shows once and My
// notes is pageless, without the toolbar card, page sheets or word-count line.
// Screenshots (each after the splash): rec-setup-folders-1280(-dark),
// rec-setup-1280, rec-setup-folders-390(-dark), rec-strip-lecture-1280,
// rec-strip-course-1280(-dark), rec-strip-other-doc-1280, rec-mic-lost-1280,
// rec-phone-390(-dark), rec-pill-390, rec-interrupted-1280, rec-saving-1280,
// rec-saving-closed-1280, rec-paused-1280(-dark), rec-paused-390(-dark).
// About 4 minutes (the app's chunks are 30 s). PASS/FAIL per step; exit 1 on a FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node recording.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const TITLE = 'Rec check';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-recording-${results.length}`).catch(() => {});
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

/** Before the app: the synthetic microphone (every stream kept), transcribe-chunk answered in the page. */
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
    (window.__micStreams = window.__micStreams || []).push(out.stream);
    return out.stream;
  };
  const realFetch = window.fetch.bind(window);
  window.__transcribeCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      window.__transcribeCalls.push(body.seq);
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
// Step 8: the audio uploads fail while this is on (Fetch is enabled only then).
let blockUploads = false;
b.onEvent('Fetch.requestPaused', (p) => {
  void b.send(blockUploads ? 'Fetch.failRequest' : 'Fetch.continueRequest', blockUploads ? { requestId: p.requestId, errorReason: 'Failed' } : { requestId: p.requestId }).catch(() => {});
});
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const path = () => b.evaluate('location.pathname + location.search');
const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const disabled = (label) => b.evaluate(`document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-disabled') === 'true'`);
/** The strip's or the phone chip's clock, in seconds. */
const timer = async () => {
  const m = /(\d+):(\d\d)(?::(\d\d))?\s*$/.exec((await text('[data-recording="timer"]')).trim());
  if (!m) return null;
  return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
};
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  await b.sleep(400);
  await b.shot(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(600);
};
const lectureRow = async (title = TITLE) => {
  const { data: file } = await admin.from('files').select('id, folder_id, course_id').eq('user_id', user.id).eq('title', title).maybeSingle();
  if (!file) return null;
  const { data: lecture } = await admin.from('lectures').select('status, duration_ms').eq('id', file.id).single();
  return { ...file, ...lecture };
};
const chunkRows = async (id) => (await admin.from('audio_chunks').select('seq, start_ms, duration_ms, storage_path').eq('lecture_id', id).order('seq')).data ?? [];
const openPicker = async () => {
  await b.clickSelector('[aria-label^="Folder:"]');
  await b.waitText('Select folder', { timeout: 5000 });
  await b.sleep(500);
};

let lectureId = null;
let tema3 = null;
/** Where the Pause button paused the recording (s). */
let pausedAtS = null;
try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  await b.signIn(BASE, user.email, user.password);

  await step('setup (option A): course and folder preset from the folder; the picker lists them; + New folder makes "Tema 3" and selects it', async () => {
    await b.nav(`${BASE}/record?projectId=${data.course.id}&folderId=${data.folder.id}`);
    await b.waitText('New Recording', { timeout: 30000 });
    await waitFor(async () => (await text('[data-record="folder"]')) === 'Math › Funcions', async () => `the folder preset: "${await text('[data-record="folder"]')}"`, 15000);
    await openPicker();
    expect(await b.hasText('Math (not in a folder)', true), 'no "not in a folder" row');
    expect(await b.hasText('Funcions', true), 'the folder Funcions is not listed');
    expect(await b.hasText('+ New folder', true), 'no + New folder');
    await shot('rec-setup-folders-1280');
    await dark(true);
    await shot('rec-setup-folders-1280-dark');
    await dark(false);
    await b.click('+ New folder', { exact: true });
    await b.waitText('In Math', { timeout: 5000 });
    await b.fill('input[placeholder="Folder name"]', 'Tema 3');
    await b.press('Enter');
    await waitFor(async () => (await text('[data-record="folder"]')) === 'Math › Tema 3', async () => `the new folder selected: "${await text('[data-record="folder"]')}"`, 10000);
    const { data: f } = await admin.from('folders').select('id, course_id, parent_id').eq('name', 'Tema 3').single();
    expect(f.course_id === data.course.id && f.parent_id === null, `Tema 3: ${JSON.stringify(f)}`);
    tema3 = f.id;
    await b.fill('input[placeholder^="e.g."]', TITLE);
    await shot('rec-setup-1280');
    // The iPhone layout of the same picker.
    await b.resize(390, 844);
    await openPicker();
    expect(await b.hasText('Tema 3', true), 'Tema 3 not in the picker at 390');
    await shot('rec-setup-folders-390');
    await dark(true);
    await shot('rec-setup-folders-390-dark');
    await dark(false);
    await b.click('Tema 3', { exact: true });
    await b.sleep(500);
    await b.resize(1280, 900);
  });

  await step('Start: the lecture in Math › Tema 3, "recording"; My notes opens with the red strip (timer moving, waveform, marks greyed out)', async () => {
    await b.clickSelector('[aria-label="Start recording"]');
    await waitFor(async () => (await path()).startsWith('/doc/'), async () => `the lecture opened (at ${await path()})`, 20000);
    const row = await waitFor(lectureRow, 'the lecture row', 10000);
    lectureId = row.id;
    expect(row.course_id === data.course.id && row.folder_id === tema3, `the lecture's place: ${JSON.stringify(row)}`);
    expect(row.status === 'recording', `status ${row.status}`);
    expect((await path()).includes(lectureId) && (await path()).includes('tab=notes'), await path());
    await waitFor(() => has('[data-recording="strip"]'), 'the strip', 10000);
    const t0 = await waitFor(timer, 'the timer', 5000);
    await b.sleep(2500);
    const t1 = await timer();
    expect(t1 > t0, `the timer doesn't move: ${t0} → ${t1}`);
    expect(await has('[data-recording="waveform"]'), 'no waveform');
    for (const label of ['Important', 'Confused', 'Exam', 'Photo board']) expect(await disabled(label), `${label} is not greyed out`);
    expect(!(await disabled('Stop and summarize')), 'Stop & summarize is not usable');
    // Not usable yet, so equally quiet: one look for all four (none seems on).
    const looks = await b.evaluate(`['Important', 'Confused', 'Exam', 'Photo board'].map((l) => {
      const s = getComputedStyle(document.querySelector('[aria-label="' + l + '"]'));
      return [s.backgroundColor, s.borderTopColor, s.borderTopWidth, s.opacity].join(' ');
    })`);
    expect(new Set(looks).size === 1, `the disabled buttons don't look the same: ${JSON.stringify(looks)}`);
    // A click on one does nothing (no panel, still recording).
    await b.clickSelector('[aria-label="Confused"]');
    await b.sleep(400);
    expect(await has('[data-recording="strip"]') && !(await b.hasText('How lost are you?')), 'a disabled mark reacted');
    await shot('rec-strip-lecture-1280');
  });

  await step('leaving never stops it: the course page and another document, the strip on each, chunks still uploaded; the strip leads back', async () => {
    await b.click('Math', { exact: true });
    await b.waitText('Funcions', { exact: true, timeout: 10000 });
    expect(await has('[data-recording="strip"]'), 'no strip on the course page');
    await shot('rec-strip-course-1280');
    await dark(true);
    await shot('rec-strip-course-1280-dark');
    await dark(false);
    await b.click('Lecture 1', { button: 'right' });
    await b.click('Open', { exact: true });
    await waitFor(async () => (await path()).includes(data.lecture.id), async () => `Lecture 1 opened (at ${await path()})`, 10000);
    expect(await has('[data-recording="strip"]'), 'no strip on another document');
    await shot('rec-strip-other-doc-1280');
    // The first 30-second chunk arrives while the student is elsewhere.
    await waitFor(async () => (await chunkRows(lectureId)).some((c) => c.storage_path), 'a chunk uploaded while on other screens', 45000);
    const t = await timer();
    expect(t >= 30, `the timer: ${t} s`);
    await b.clickSelector('[aria-label^="Recording,"]');
    await waitFor(async () => (await path()).includes(lectureId), async () => `back at the lecture (at ${await path()})`, 10000);
    report.push(`RESULT | elsewhere | still recording at ${t} s; ${(await chunkRows(lectureId)).length} chunk(s) uploaded meanwhile`);
  });

  await step('the microphone going away pauses it ("Microphone disconnected", never a silent stop); Resume goes on', async () => {
    const before = await timer();
    await b.evaluate(`(() => { const s = window.__micStreams.at(-1); s.getAudioTracks().forEach((t) => t.dispatchEvent(new Event('ended'))); })()`);
    await waitFor(async () => (await text('[data-recording="timer"]')).startsWith('Microphone disconnected'), async () => `the strip: "${await text('[data-recording="timer"]')}"`, 10000);
    await shot('rec-mic-lost-1280');
    await b.sleep(2000);
    const still = await timer();
    expect(Math.abs(still - before) <= 1, `the clock moved while the microphone was gone: ${before} → ${still}`);
    await b.clickSelector('[aria-label="Resume recording"]');
    await waitFor(async () => (await text('[data-recording="timer"]')).startsWith('Recording'), 'recording again', 10000);
    await b.sleep(1500);
    expect((await timer()) > still, 'the timer did not go on after Resume');
  });

  await step('Pause beside the timer: "Paused", the clock and waveform still, the microphone closed (1280 and 390); ▶ goes on', async () => {
    const tracks = () => b.evaluate(`(window.__micStreams || []).map((s) => s.getAudioTracks().map((t) => t.readyState)).flat()`);
    const wave = () => b.evaluate(`[...document.querySelectorAll('[data-recording="waveform"] > div')].map((d) => getComputedStyle(d).height).join(',')`);
    await b.clickSelector('[aria-label="Pause recording"]');
    await waitFor(async () => (await text('[data-recording="timer"]')).startsWith('Paused'), async () => `paused: "${await text('[data-recording="timer"]')}"`, 10000);
    await b.sleep(500);
    pausedAtS = await timer();
    const w0 = await wave();
    expect((await tracks()).every((s) => s === 'ended'), `a microphone track still live while paused: ${JSON.stringify(await tracks())}`);
    await b.sleep(3000);
    expect((await timer()) === pausedAtS, `the clock moved while paused: ${pausedAtS} → ${await timer()}`);
    expect((await wave()) === w0, 'the waveform moved while paused');
    expect(await has('[aria-label="Resume recording"]') && !(await has('[aria-label="Pause recording"]')), 'no ▶ while paused');
    await shot('rec-paused-1280');
    await dark(true);
    await shot('rec-paused-1280-dark');
    await dark(false);
    // The same on the iPhone layout.
    await b.resize(390, 844);
    await waitFor(() => has('[data-recording="bar"]'), 'the iPhone recording screen', 10000);
    expect((await text('[data-recording="timer"]')).startsWith('Paused'), `the phone's timer: "${await text('[data-recording="timer"]')}"`);
    expect(await has('[aria-label="Resume recording"]'), 'no ▶ on the phone header');
    await shot('rec-paused-390');
    await dark(true);
    await shot('rec-paused-390-dark');
    await dark(false);
    await b.resize(1280, 900);
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 10000);
    await b.clickSelector('[aria-label="Resume recording"]');
    await waitFor(async () => (await text('[data-recording="timer"]')).startsWith('Recording'), 'recording again', 10000);
    await b.sleep(2000);
    expect((await timer()) > pausedAtS, 'the clock did not go on after ▶');
    expect((await tracks()).some((s) => s === 'live'), 'the microphone did not open again');
    report.push(`RESULT | pause | paused at ${pausedAtS} s, 3 s still, on again`);
  });

  await step('390 px: the iPhone recording screen around My notes; back to the course, the red pill leads back', async () => {
    await b.resize(390, 844);
    await waitFor(() => has('[data-recording="bar"]'), 'the bottom bar', 10000);
    expect(!(await has('[data-recording="strip"]')), 'the laptop strip at 390 px');
    expect(await timer(), 'no timer chip');
    expect(await has('[data-recording="waveform"]'), 'no waveform');
    for (const label of ['Important', 'Confused', 'Exam', 'Photo', 'Ask the study assistant']) expect(await disabled(label), `${label} is not greyed out`);
    expect(await b.hasText('Math › Tema 3', true), 'no Course › folder');
    // As iphone-02: the title once (in the header), then My notes pageless, no toolbar card, no page sheets.
    await waitFor(() => has('[data-recording="notes-label"]'), 'MY NOTES above the notes', 10000);
    const titles = await b.evaluate(`[...document.querySelectorAll('*')].filter((e) => e.offsetParent !== null && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' ? e.value === 'Rec check' : e.childElementCount === 0 && e.textContent.trim() === 'Rec check')).length`);
    expect(titles === 1, `the title is shown ${titles} times`);
    expect(!(await b.hasText('Normal text', true)), 'the formatting toolbar is shown');
    expect(!(await has('.studiply-page-layer-sheet')), 'My notes is in pages');
    expect(!(await has('[data-status="line"]')), 'the word-count line is shown');
    await shot('rec-phone-390');
    await dark(true);
    await shot('rec-phone-390-dark');
    await dark(false);
    await b.clickSelector('[aria-label^="Back to"]');
    await waitFor(() => has('[data-recording="pill"]'), async () => `the pill (at ${await path()})`, 10000);
    await shot('rec-pill-390');
    await b.clickSelector('[data-recording="pill"]');
    await waitFor(async () => (await path()).includes(lectureId), 'back at the lecture from the pill', 10000);
    await b.resize(1280, 900);
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 10000);
  });

  await step('a reload asks first; then the interrupted recording is offered; Continue records on into the same lecture', async () => {
    const asked = b.dialogs.length;
    const before = await timer();
    await b.send('Page.reload', {});
    await b.sleep(1500);
    expect(b.dialogs.length > asked, 'the reload did not ask first (beforeunload)');
    await waitFor(() => has('[data-recording="interrupted"]'), 'the interrupted recording offered', 40000);
    expect((await text('[data-recording="interrupted"]')).includes(TITLE), await text('[data-recording="interrupted"]'));
    await shot('rec-interrupted-1280');
    await b.clickSelector('[aria-label="Continue recording"]');
    await waitFor(() => has('[data-recording="timer"]'), 'recording again', 15000);
    const after = await waitFor(timer, 'the timer', 5000);
    // It goes on from where the recording ended (the reload's moment isn't recorded).
    expect(after >= before - 2, `the timer restarted: ${before} → ${after}`);
    expect((await lectureRow()).status === 'recording', 'the lecture is not "recording"');
    report.push(`RESULT | reload | recorded until ${before} s; continued at ${after} s`);
    await b.sleep(3000);
  });

  await step('Stop & summarize asks, saves, opens the after-recording step; "transcribing" with its length; the chunks in order', async () => {
    await b.clickSelector('[aria-label="Stop and summarize"]');
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    const saving = await waitFor(() => has('[data-recording="saving"]'), 'saving', 5000).catch(() => false);
    if (saving) await b.shot('rec-saving-1280');
    await waitFor(async () => (await path()).startsWith('/record/post-session'), async () => `the after-recording step (at ${await path()})`, 90000);
    expect((await path()).includes(lectureId), await path());
    const row = await lectureRow();
    expect(row.status === 'transcribing' && row.duration_ms > 30000, `the lecture: ${JSON.stringify(row)}`);
    const chunks = await chunkRows(lectureId);
    expect(chunks.length >= 3 && chunks.every((c, i) => c.seq === i && c.storage_path), `audio_chunks: ${JSON.stringify(chunks)}`);
    expect(chunks.every((c, i) => i === 0 || c.start_ms <= chunks[i - 1].start_ms + chunks[i - 1].duration_ms), `a hole: ${chunks.map((c) => `${c.start_ms}+${c.duration_ms}`)}`);
    // The Pause button's join: the chunk after it starts exactly where the one before ended.
    if (pausedAtS !== null) {
      const join = chunks.find((c, i) => i > 0 && Math.abs(c.start_ms - pausedAtS * 1000) <= 1500 && c.start_ms === chunks[i - 1].start_ms + chunks[i - 1].duration_ms);
      expect(join, `no exact join at the pause (${pausedAtS} s): ${chunks.map((c) => `${c.start_ms}+${c.duration_ms}`)}`);
    }
    expect(!(await has('[data-recording="strip"]')), 'the strip is still there after Stop');
    report.push(`RESULT | stop | ${chunks.length} chunks, ${Math.round(row.duration_ms / 1000)} s, saving shown: ${saving}`);
  });

  await step('the tab closed during "Saving…": on the next load the lecture is handed off in the background (never left "recording")', async () => {
    const title = 'Rec check 2';
    await b.nav(`${BASE}/record?projectId=${data.course.id}&folderId=${tema3}`);
    await b.waitText('New Recording', { timeout: 30000 });
    await waitFor(async () => (await text('[data-record="folder"]')) === 'Math › Tema 3', 'the folder preset', 15000);
    await b.fill('input[placeholder^="e.g."]', title);
    await b.clickSelector('[aria-label="Start recording"]');
    await waitFor(() => has('[data-recording="strip"]'), 'recording', 20000);
    await b.sleep(6000);
    // The audio can't reach Storage, so "Saving…" waits; then the tab is reloaded (as if closed).
    blockUploads = true;
    await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/storage/v1/object/audio-chunks/*', requestStage: 'Request' }] });
    await b.clickSelector('[aria-label="Stop and summarize"]');
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    await waitFor(() => has('[data-recording="saving"]'), 'Saving…', 10000);
    await b.sleep(1500);
    const before = await lectureRow(title);
    expect(before.status === 'recording', `before the reload: ${before.status}`);
    await b.shot('rec-saving-closed-1280');
    await b.send('Page.reload', {});
    await b.sleep(1500);
    blockUploads = false;
    await b.send('Fetch.disable', {});
    const after = await waitFor(async () => {
      const row = await lectureRow(title);
      return row?.status === 'transcribing' ? row : null;
    }, async () => `the lecture handed off (status ${(await lectureRow(title))?.status})`, 120000);
    expect(after.duration_ms >= 5000, `its length: ${after.duration_ms} ms`);
    const chunks = await chunkRows(after.id);
    expect(chunks.length >= 1 && chunks.every((c, i) => c.seq === i && c.storage_path), `audio_chunks: ${JSON.stringify(chunks)}`);
    // Quietly: no saving line, no interrupted offer for it.
    expect(!(await has('[data-recording="saving"]')) && !(await has('[data-recording="interrupted"]')), 'something shown for the background hand-off');
    report.push(`RESULT | closed while saving | handed off after the reload: transcribing, ${Math.round(after.duration_ms / 1000)} s, ${chunks.length} chunk(s)`);
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
