// marks.mjs — step 5.5, marks with a 1–10 level while recording (web: the
// laptop's strip and the 390 px iPhone layout), with a synthetic microphone
// and no paid call (transcribe-chunk is answered inside the page; the check
// fails if any request reaches transcribe-chunk, OpenAI or ElevenLabs).
// Steps:
//   1. laptop: writing in My notes, ★ Important opens its panel under the
//      strip (the moment's time, "How important is this?", the slider's
//      labelled ends, the hint); a click on the track sets 8 (the hint
//      changes), a note, Save mark: "Important 8/10" at the end of the line
//      being written; its `marks` row (type, level, note, t_ms = the panel's
//      time); the recording goes on;
//   2. ? Confused at 3 and Exam at 10 with the keyboard (Home, →, End);
//      Cancel saves nothing; the three chips in My notes, three rows;
//   3. a click on the Confused chip opens its panel (Done, Remove mark):
//      level 7 and a note; the chip and the row change;
//   4. Remove mark on the Important chip: the chip and the row go; Undo: both
//      come back (the same mark);
//   5. while paused: the mark is at the paused moment;
//   6. My notes not open (the course page): Exam from the strip; back in the
//      lecture, a new last line with its time and "Exam 5/10"; its row;
//   7. offline: a mark's chip is there at once, its row once back online;
//   8. 390 px: each mark's small sheet (light and dark); one saved;
//   9. Stop: the marks stay; after the recording a click on a chip still
//      changes its level; the recording never stopped meanwhile (the clock
//      ran, the chunks uploaded, status "recording" until Stop);
//  10. no paid request.
// Screenshots (each after the splash): mark-panel-{important,confused,exam}-1280(-dark),
// mark-sheet-{important,confused,exam}-390(-dark), mark-edit-1280, mark-removed-1280,
// marks-chips-1280(-dark), marks-chips-390, mark-paused-1280.
// About 4 minutes. PASS/FAIL per step; exit 1 on a FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node marks.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const TITLE = 'Marks check';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-marks-${results.length}`).catch(() => {});
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

/** Before the app: the synthetic microphone, transcribe-chunk answered in the page (failing while offline). */
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
  window.__checkOffline = false;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      if (window.__checkOffline) throw new TypeError('Failed to fetch');
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
/** "4:12" or "1:02:03" → ms. */
const clockMs = (s) => {
  const parts = s.split(':').map(Number);
  return parts.reduce((t, n) => t * 60 + n, 0) * 1000;
};
/** The strip's or the phone chip's clock (ms). */
const timer = async () => {
  const m = /(\d+:\d\d(?::\d\d)?)\s*$/.exec((await text('[data-recording="timer"]')).trim());
  return m ? clockMs(m[1]) : null;
};
/** The open panel's time (its badge "★ Important · 4:12"). */
const panelTime = async () => {
  const m = /·\s*(\d+:\d\d(?::\d\d)?)/.exec(await text('[data-mark="panel"]'));
  return m ? clockMs(m[1]) : null;
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
const offline = async (on) => {
  await b.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.evaluate(`window.__checkOffline = ${on}`);
};
const key = (name, keyCode) => b.chord({ code: name, key: name, keyCode });

/** The mark chips in My notes (the editor's JSON): their attributes and the line they're on. */
const docMarks = () =>
  b.evaluate(`(() => {
    const out = [];
    const walk = (n, line) => {
      if (n.type === 'markChip') out.push({ ...n.attrs, line });
      (n.content || []).forEach((c) => walk(c, line));
    };
    (window.studiplyEditor.getJSON().content || []).forEach((block, i) => walk(block, i));
    return out;
  })()`);
/** A line of My notes: its inline nodes (text, or the chip's type). */
const lineOf = (i) =>
  b.evaluate(`(() => {
    const block = (window.studiplyEditor.getJSON().content || [])[${i}];
    return (block && block.content || []).map((n) => n.type === 'text' ? n.text : n.type);
  })()`);
const chipLabels = () => b.evaluate(`[...document.querySelectorAll('.studiply-mark-chip')].map((e) => e.textContent)`);
const rows = async () => (await admin.from('marks').select('id, type, level, t_ms, note, lecture_id').eq('lecture_id', lectureId).order('t_ms')).data ?? [];
const lectureStatus = async () => (await admin.from('lectures').select('status').eq('id', lectureId).single()).data?.status;
const chunkCount = async () => ((await admin.from('audio_chunks').select('seq').eq('lecture_id', lectureId)).data ?? []).length;

const openMark = async (kind) => {
  await b.clickSelector(`[data-mark-button="${kind}"]`);
  await waitFor(() => has('[data-mark="panel"]'), `the ${kind} panel`, 5000);
  await b.sleep(300);
};
const level = async () => Number(/(\d+)\/10/.exec(await text('[data-mark="level"]'))?.[1] ?? NaN);
/** The slider by keyboard: Home, then → to `n`. */
const setLevel = async (n) => {
  await b.evaluate(`document.querySelector('[data-mark="slider"]').focus()`);
  await key('Home', 36);
  for (let i = 1; i < n; i++) await key('ArrowRight', 39);
  expect((await level()) === n, `the slider: ${await level()} (wanted ${n})`);
};
/** A click on the track at the place of level `n`. */
const clickLevel = async (n) => {
  const r = await b.evaluate(`(() => { const r = document.querySelector('[data-mark="slider"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  await b.clickAt(r.x + (r.w * (n - 1)) / 9, r.y + r.h / 2);
  await b.sleep(300);
};
const press = (label) => b.clickSelector(`[aria-label="${label}"]`);
const panelGone = () => waitFor(async () => !(await has('[data-mark="panel"]')), 'the panel closed', 5000);
const waitRows = (fn, what, timeout = 20000) => waitFor(async () => {
  const list = await rows();
  return fn(list) ? list : null;
}, async () => `${what}: ${JSON.stringify(await rows())}`, timeout);

let lectureId = null;
let recordingAt = null;
try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  await b.signIn(BASE, user.email, user.password);
  await b.nav(`${BASE}/record?projectId=${data.course.id}`);
  await b.waitText('New Recording', { timeout: 30000 });
  await b.fill('input[placeholder^="e.g."]', TITLE);
  await b.clickSelector('[aria-label="Start recording"]');
  await waitFor(async () => (await path()).startsWith('/doc/'), async () => `the lecture opened (at ${await path()})`, 20000);
  await waitFor(() => has('[data-recording="strip"]'), 'the strip', 10000);
  lectureId = /\/doc\/([^?/]+)/.exec(await path())[1];
  await waitFor(() => has('.ProseMirror'), 'My notes', 15000);
  recordingAt = await waitFor(timer, 'the timer', 5000);

  await step('laptop: ★ Important opens its panel under the strip; 8 by a click, a note, Save mark: the chip at the end of the line being written, its row; still recording', async () => {
    await b.clickSelector('.ProseMirror');
    await b.type('La sinapsis es la unión');
    await b.sleep(500);
    await openMark('important');
    expect(await has('[data-recording="strip"]'), 'the strip is gone');
    const shown = await text('[data-mark="panel"]');
    for (const t of ['★ Important', 'How important is this?', '1 · Worth noting', 'Key idea · 10', '5/10', 'In the summary: the point is bolded in its section.']) {
      expect(shown.includes(t), `the panel lacks "${t}": ${shown}`);
    }
    const at = await panelTime();
    const now = await timer();
    expect(at !== null && Math.abs(now - at) <= 2000, `the panel's time ${at} against the clock ${now}`);
    await shot('mark-panel-important-1280');
    await dark(true);
    await shot('mark-panel-important-1280-dark');
    await dark(false);
    await clickLevel(8);
    expect((await level()) === 8, `a click on the track: ${await level()}`);
    expect((await text('[data-mark="hint"]')).includes('Key takeaways'), `the hint at 8: ${await text('[data-mark="hint"]')}`);
    await b.fill('input[data-mark="note"]', 'Definición clave');
    await press('Save mark');
    await panelGone();
    const marks = await docMarks();
    expect(marks.length === 1 && marks[0].kind === 'important' && marks[0].level === 8 && marks[0].note === 'Definición clave' && marks[0].markId, JSON.stringify(marks));
    const line = await lineOf(marks[0].line);
    expect(line.at(-1) === 'markChip' && line.some((t) => typeof t === 'string' && t.includes('La sinapsis es la unión')), `the chip isn't at the end of the line written: ${JSON.stringify(line)}`);
    expect((await chipLabels()).includes('Important 8/10'), JSON.stringify(await chipLabels()));
    const list = await waitRows((l) => l.length === 1, 'the Important row');
    expect(list[0].id === marks[0].markId && list[0].type === 'important' && list[0].level === 8 && list[0].note === 'Definición clave', JSON.stringify(list));
    expect(Math.abs(list[0].t_ms - at) <= 1000, `t_ms ${list[0].t_ms} against the panel's ${at}`);
    expect((await timer()) > now && (await lectureStatus()) === 'recording', 'the recording stopped');
    report.push(`RESULT | important | 8/10 at ${list[0].t_ms} ms (panel ${at} ms)`);
  });

  await step('? Confused at 3 and Exam at 10 by keyboard; Cancel saves nothing; three chips, three rows', async () => {
    await openMark('exam');
    await press('Cancel');
    await panelGone();
    await openMark('confused');
    const shown = await text('[data-mark="panel"]');
    for (const t of ['How lost are you?', '1 · A bit unsure', 'Completely lost · 10']) expect(shown.includes(t), `the panel lacks "${t}": ${shown}`);
    await setLevel(3);
    expect((await text('[data-mark="hint"]')).includes('one-sentence clarification'), await text('[data-mark="hint"]'));
    await shot('mark-panel-confused-1280');
    await dark(true);
    await shot('mark-panel-confused-1280-dark');
    await dark(false);
    await press('Save mark');
    await panelGone();
    await openMark('exam');
    const exam = await text('[data-mark="panel"]');
    for (const t of ['How likely on the exam?', '1 · Maybe', 'Certain · 10']) expect(exam.includes(t), `the panel lacks "${t}": ${exam}`);
    await b.evaluate(`document.querySelector('[data-mark="slider"]').focus()`);
    await key('End', 35);
    expect((await level()) === 10, `End: ${await level()}`);
    expect((await text('[data-mark="hint"]')).includes('flashcard'), await text('[data-mark="hint"]'));
    await shot('mark-panel-exam-1280');
    await dark(true);
    await shot('mark-panel-exam-1280-dark');
    await dark(false);
    await press('Save mark');
    await panelGone();
    const labels = await chipLabels();
    for (const l of ['Important 8/10', 'Confused 3/10', 'Exam 10/10']) expect(labels.includes(l), `no "${l}": ${JSON.stringify(labels)}`);
    const list = await waitRows((l) => l.length === 3, 'three rows');
    expect(JSON.stringify(list.map((r) => [r.type, r.level])) === JSON.stringify([['important', 8], ['confused', 3], ['exam', 10]]), JSON.stringify(list));
    await shot('marks-chips-1280');
    await dark(true);
    await shot('marks-chips-1280-dark');
    await dark(false);
  });

  await step('a click on the Confused chip opens its panel (Done, Remove mark): 7 and a note; the chip and its row change', async () => {
    await b.clickSelector('.studiply-mark-chip[data-mark="confused"]');
    await waitFor(() => has('[aria-label="Done"]'), 'the chip\'s panel', 5000);
    expect(await has('[aria-label="Remove mark"]'), 'no Remove mark');
    expect((await level()) === 3, `the panel shows ${await level()}`);
    await setLevel(7);
    await b.fill('input[data-mark="note"]', 'No entiendo el paso 2');
    await shot('mark-edit-1280');
    await press('Done');
    await panelGone();
    expect((await chipLabels()).includes('Confused 7/10'), JSON.stringify(await chipLabels()));
    await waitRows((l) => l.some((r) => r.type === 'confused' && r.level === 7 && r.note === 'No entiendo el paso 2'), 'the Confused row at 7');
  });

  await step('Remove mark on the Important chip: the chip and its row go; Undo: both back (the same mark)', async () => {
    const before = (await rows()).find((r) => r.type === 'important');
    await b.clickSelector('.studiply-mark-chip[data-mark="important"]');
    await waitFor(() => has('[aria-label="Remove mark"]'), 'the chip\'s panel', 5000);
    await press('Remove mark');
    await panelGone();
    expect(!(await chipLabels()).some((l) => l.startsWith('Important')), 'the chip is still there');
    await b.waitText('Mark removed', { timeout: 5000 });
    await shot('mark-removed-1280');
    // Saved within about 1.5 s; the toast stays 5 s.
    await waitRows((l) => !l.some((r) => r.type === 'important'), 'the Important row deleted', 3500);
    await b.click('UNDO', { exact: true });
    await waitFor(async () => (await chipLabels()).includes('Important 8/10'), 'the chip back', 5000);
    const back = await waitRows((l) => l.some((r) => r.type === 'important'), 'the Important row back');
    const again = back.find((r) => r.type === 'important');
    expect(again.id === before.id && again.level === 8 && again.t_ms === before.t_ms && again.note === before.note, `${JSON.stringify(before)} → ${JSON.stringify(again)}`);
  });

  await step('while paused: the mark is at the paused moment', async () => {
    await press('Pause recording');
    await waitFor(async () => (await text('[data-recording="timer"]')).startsWith('Paused'), 'paused', 10000);
    await b.sleep(2500);
    const pausedAt = await timer();
    await openMark('important');
    const at = await panelTime();
    expect(Math.abs(at - pausedAt) <= 1000, `the panel's time ${at} against the paused clock ${pausedAt}`);
    await setLevel(4);
    await shot('mark-paused-1280');
    await press('Save mark');
    await panelGone();
    const list = await waitRows((l) => l.length === 4, 'the paused mark\'s row');
    const paused = list.find((r) => r.type === 'important' && r.level === 4);
    expect(paused && Math.abs(paused.t_ms - pausedAt) <= 1000, JSON.stringify(list));
    await press('Resume recording');
    await waitFor(async () => (await text('[data-recording="timer"]')).startsWith('Recording'), 'recording again', 10000);
  });

  await step('My notes not open (the course page): Exam from the strip; back in the lecture, a new last line with its time and the chip; its row', async () => {
    await b.click('Math', { exact: true });
    await b.waitText('Funcions', { exact: true, timeout: 10000 });
    expect(await has('[data-recording="strip"]'), 'no strip on the course page');
    await openMark('exam');
    const at = await panelTime();
    await press('Save mark');
    await panelGone();
    const list = await waitRows((l) => l.length === 5, 'the row of the mark made elsewhere');
    const elsewhere = list.find((r) => r.type === 'exam' && r.level === 5);
    expect(elsewhere && Math.abs(elsewhere.t_ms - at) <= 1000, JSON.stringify(list));
    await b.clickSelector('[aria-label^="Recording,"]');
    await waitFor(async () => (await path()).includes(lectureId), 'back at the lecture', 10000);
    await waitFor(async () => (await chipLabels()).includes('Exam 5/10'), async () => `the chip in My notes: ${JSON.stringify(await chipLabels())}`, 15000);
    const marks = await docMarks();
    const chip = marks.find((m) => m.markId === elsewhere.id);
    const line = await lineOf(chip.line);
    expect(line[0] === 'timestampChip' && line.at(-1) === 'markChip', `the new line: ${JSON.stringify(line)}`);
    const last = await b.evaluate(`(window.studiplyEditor.getJSON().content || []).length - 1`);
    expect(chip.line === last, `not the last line (${chip.line} of ${last})`);
  });

  await step('offline: the chip is there at once, its row once back online; the recording goes on', async () => {
    const before = (await rows()).length;
    await offline(true);
    await openMark('confused');
    await setLevel(9);
    await press('Save mark');
    await panelGone();
    expect((await chipLabels()).includes('Confused 9/10'), JSON.stringify(await chipLabels()));
    await b.sleep(3000);
    expect((await rows()).length === before, 'a row arrived while offline');
    await offline(false);
    await waitRows((l) => l.length === before + 1 && l.some((r) => r.type === 'confused' && r.level === 9), 'the offline mark\'s row', 30000);
  });

  await step('390 px: each mark\'s small sheet (light and dark); one saved', async () => {
    await b.resize(390, 844);
    await waitFor(() => has('[data-recording="bar"]'), 'the iPhone recording screen', 10000);
    for (const kind of ['important', 'confused', 'exam']) {
      await openMark(kind);
      await shot(`mark-sheet-${kind}-390`);
      await dark(true);
      await shot(`mark-sheet-${kind}-390-dark`);
      await dark(false);
      if (kind !== 'exam') {
        await press('Cancel');
        await panelGone();
      }
    }
    const before = (await rows()).length;
    await setLevel(6);
    await press('Save mark');
    await panelGone();
    await waitRows((l) => l.length === before + 1 && l.some((r) => r.type === 'exam' && r.level === 6), 'the mark saved at 390');
    await shot('marks-chips-390');
    await b.resize(1280, 900);
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 10000);
  });

  await step('Stop: the marks stay; after the recording a click on a chip still changes its level; the recording never stopped meanwhile', async () => {
    const t = await timer();
    expect(t - recordingAt >= 30000, `the clock ran ${t - recordingAt} ms`);
    expect((await lectureStatus()) === 'recording', `status ${await lectureStatus()}`);
    expect((await chunkCount()) >= 1, 'no chunk uploaded');
    const kept = await rows();
    await press('Stop and summarize');
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    await waitFor(async () => (await path()).startsWith('/record/post-session'), async () => `the after-recording step (at ${await path()})`, 90000);
    expect(JSON.stringify(await rows()) === JSON.stringify(kept), 'the marks changed at Stop');
    await b.nav(`${BASE}/doc/${lectureId}?tab=notes`);
    await waitFor(() => has('.studiply-mark-chip[data-mark="exam"]'), 'the chips after the recording', 30000);
    expect(!(await has('[data-recording="strip"]')), 'still recording');
    await b.clickSelector('.studiply-mark-chip[data-mark="exam"]');
    await waitFor(() => has('[aria-label="Done"]'), 'the chip\'s panel after the recording', 5000);
    await setLevel(2);
    await press('Done');
    await panelGone();
    const list = await waitRows((l) => l.some((r) => r.type === 'exam' && r.level === 2), 'the level changed after the recording');
    report.push(`RESULT | marks | ${list.map((r) => `${r.type} ${r.level}/10 @${r.t_ms}${r.note ? ` "${r.note}"` : ''}`).join(', ')}`);
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
