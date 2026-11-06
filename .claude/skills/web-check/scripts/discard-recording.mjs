// discard-recording.mjs — Cancel recording (Lea, 6 Nov): Discard recording in Chrome, during real
// recordings (the fake microphone), against local Supabase. NO AI call: transcribe-chunk, summarize and
// assistant-chat are answered in the page (and listed); the chunks themselves upload to local Storage.
//
// Steps:
//   1. Laptop (1280), a new lecture: Stop & summarize opens the panel (desktop-02's frame) with a red
//      "Discard recording" at the far left of the footer (≥ 44 px, left of Save as course default).
//   2. It asks "Discard this recording?" with the lecture's title; Cancel: nothing happens, the recording
//      goes on (the clock moves, the strip stays), the panel is still open.
//   3. The document … menu has "Discard recording…", last, under "Recording" (below the fold of the
//      menu at 1280 × 900: End on the keyboard reaches it, scrolled into the menu's view; the click
//      scrolls it in first). Discard: the strip goes,
//      the lecture is in Recently Deleted (files.deleted_at), no summaries row, the chunk that reached
//      Studiply before Discard is kept (the later ones are not), the screen is the course, the toast
//      "“Discard check” discarded" with UNDO; nothing is transcribed after Discard. UNDO restores it.
//   4. The lecture recorded again (● Record in it): a line typed and an Exam mark during the recording;
//      Discard from the … menu ("the audio recorded since m:ss"): only this recording's chunks and
//      segments are gone (the earlier chunk stays), the mark's row is gone and its chip is words in My
//      notes, the line keeps its words without its time chip, the version "Before discarding the
//      recording" is saved, the notice "Recording discarded".
//   5. 390 (iphone-02), a plain document recorded into: the Stop & summarize sheet's red link at the end
//      (after Save as course default, ≥ 44 px); the recording header's ⋯ › Discard recording… (the menu
//      far above the mark buttons); Discard: a document again (no lecture row, no chunks, no audio files
//      in Storage), its notes kept with their words, the mark as words, the version saved.
//   6. No request reached summarize, assistant-chat, transcribe-chunk on the server, Anthropic or OpenAI.
//   7. Composites beside the mockups, light and dark: discard-compose-1280 (desktop-01: the strip and the
//      panel, the menu, the question), discard-compose-390 (iphone-02: the sheet's link, the ⋯ menu).
//
// Steps 4 and 5 start with nothing recording (a recording a failed step left running is discarded, an
// interrupted one finished), so one failure doesn't fail the rest. Undo is the toast's UNDO while it
// shows, else ⌘Z (under load the toast's 5 s can pass).
//
// The run always ends (its Chrome closed, the process exits), also after failures, when stopped, or
// after 15 minutes. Needs Lea's dev server on 8123 and `supabase start`:
//   node .claude/skills/web-check/scripts/discard-recording.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const MIN = 60_000;
const TITLE = 'Discard check';
const DOC_TITLE = 'Notas de clase';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-discard-${results.length}`).catch(() => {});
    await b.press('Escape').catch(() => {});
    await b.sleep(300);
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
    await b.sleep(200);
  }
}

const policy = readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(policy)?.[1];
if (!POLICY_VERSION) throw new Error('CONSENT_POLICY_VERSION not found in policy.ts');

/** The synthetic microphone; every Edge Function answered in the page (each call listed with its time). */
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
  const realFetch = window.fetch.bind(window);
  window.__functionCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/')) {
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      window.__functionCalls.push({ fn: url.replace(/^.*\\/functions\\/v1\\//, ''), at: Date.now(), body });
      if (url.includes('/functions/v1/transcribe-chunk')) {
        const segments = [{ startMs: body.startMs, endMs: body.startMs + 30000, text: 'Simulated chunk ' + body.seq }];
        return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 30000, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

const user = await makeUser();
const data = await seed(user.client);
b = await launch();

let finished = false;
const finish = async (code) => {
  if (finished) return;
  finished = true;
  await b.close().catch(() => {});
  await dropUser(user.id).catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => void finish(130));
process.on('SIGTERM', () => void finish(143));
const watchdog = setTimeout(() => {
  console.error('discard-recording.mjs: still running after 15 minutes; stopping');
  void finish(1);
}, 15 * MIN);
watchdog.unref();

const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const path = () => b.evaluate('location.pathname + location.search');
const rect = (css) => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const clockMs = (s) => s.split(':').map(Number).reduce((t, n) => t * 60 + n, 0) * 1000;
const timer = async () => {
  const m = /(\d+:\d\d(?::\d\d)?)\s*$/.exec((await text('[data-recording="timer"]')).trim());
  return m ? clockMs(m[1]) : null;
};
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
const shots = async (name) => {
  await shot(name);
  await dark(true);
  await shot(`${name}-dark`);
  await dark(false);
};
const ALERT = '[role="alert"]';
const confirmShown = () => waitFor(async () => (await text(ALERT)).includes('Discard this recording?'), 'the question', 6000);
/** A menu item's words: its first line with a letter (an item with an icon starts with the icon's glyph, which read as ''). */
const ITEM_WORDS = `(e) => e.innerText.split('\\n').map((s) => s.trim()).find((s) => /\\p{L}/u.test(s)) ?? ''`;
const menuItems = () => b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].map(${ITEM_WORDS})`);
/** The visible element matching `css` (several screens can hold the same button; hidden ones have no size). */
const tapVisible = async (css) => {
  const p = await b.evaluate(`(() => {
    const e = [...document.querySelectorAll(${JSON.stringify(css)})].find((x) => x.getBoundingClientRect().width > 0);
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!p) throw new Error(`no visible ${css}`);
  await b.sleep(250);
  await b.clickAt(p.x, p.y);
};
const openDocMenu = async () => {
  await tapVisible('[aria-label="Document menu"]');
  await waitFor(async () => (await menuItems()).length > 0, 'the document menu', 4000);
};
/**
 * A menu item by its words, scrolled into view first (the document menu is longer than the window:
 * Recording › Discard recording… is below its fold at 1280 × 900; the menu scrolls).
 */
const chooseMenuItem = async (words) => {
  const p = await b.evaluate(`(() => {
    const e = [...document.querySelectorAll('[role=menuitem]')].find((x) => (${ITEM_WORDS})(x) === ${JSON.stringify(words)});
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, inside: r.top >= 0 && r.bottom <= innerHeight };
  })()`);
  if (!p) throw new Error(`no menu item "${words}" (the menu: ${(await menuItems()).join(' | ')})`);
  expect(p.inside, `"${words}" can't be scrolled into the window`);
  await b.sleep(250);
  await b.clickAt(p.x, p.y);
};
/** The Undo toast's UNDO while it is really on screen; else ⌘Z (DESIGN: it undoes the last delete also after the toast has gone). */
const undoNow = async () => {
  const shown = () =>
    b.evaluate(`(() => {
      const el = [...document.querySelectorAll('div, span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'UNDO');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      let opacity = 1;
      for (let n = el; n && n !== document.body; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      return r.width && r.top >= 0 && r.bottom <= innerHeight && opacity > 0.9 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`);
  if (await shown()) {
    await b.sleep(300);
    const p = await shown();
    if (p) return b.clickAt(p.x, p.y);
  }
  await b.chord({ code: 'KeyZ', key: 'z', meta: true, keyCode: 90 });
};
const recordingShown = async () => (await has('[data-recording="strip"]')) || (await has('[data-recording="bar"]'));
/**
 * Each recording step starts with nothing recording: a recording a failed step left running is
 * discarded (the panel's Discard recording), an interrupted one finished; so one failure can't
 * fail the next steps. Never a summary request (step 6 checks).
 */
const cleanStart = async () => {
  await b.press('Escape').catch(() => {});
  for (let i = 0; i < 2 && (await recordingShown()); i++) {
    try {
      await tapVisible('[aria-label="Stop and summarize"]');
      await waitFor(() => has('[data-summarize="discard"]'), 'the panel', 10000);
      await tapVisible('[data-summarize="discard"]');
      await confirmShown();
      await b.click('Discard', { exact: true });
      await waitFor(async () => !(await recordingShown()), 'the recording stopped', 30000);
      await b.sleep(500);
      await b.click('OK', { exact: true }).catch(() => {});
    } catch (err) {
      report.push(`RESULT | clean start: ${err.message}`);
      await b.press('Escape').catch(() => {});
    }
  }
  for (let i = 0; i < 3 && (await has('[aria-label="Finish recording"]')); i++) {
    await tapVisible('[aria-label="Finish recording"]').catch(() => {});
    await b.sleep(1500);
    if (await has('[data-summarize="keep"]')) await tapVisible('[data-summarize="keep"]').catch(() => {});
  }
  expect(!(await recordingShown()), 'a recording is still running');
};
const chunks = async (lectureId) => (await admin.from('audio_chunks').select('seq, storage_path, start_ms, duration_ms').eq('lecture_id', lectureId).order('seq')).data ?? [];
const segments = async (lectureId) => (await admin.from('transcript_segments').select('start_ms, chunk_id').eq('lecture_id', lectureId)).data ?? [];
const calls = async () => (await b.evaluate('window.__functionCalls').catch(() => [])) ?? [];
/** Waits until the recording has handed over a chunk and it reached Studiply (30-second chunks). */
const chunkUploaded = (lectureId, seq) => waitFor(async () => (await chunks(lectureId)).some((c) => c.seq === seq && c.storage_path), `chunk ${seq} on Studiply`, 70_000);
const notesOf = async (fileId) => (await admin.from('documents').select('id, content').eq('file_id', fileId).eq('tab', 'notes').maybeSingle()).data;
const versionNamed = async (documentId, name) => (await admin.from('document_versions').select('id, name').eq('document_id', documentId).eq('name', name)).data ?? [];
/** A node tree's nodes of a type. */
const nodesOf = (node, type, out = []) => {
  if (!node) return out;
  if (node.type === type) out.push(node);
  for (const child of node.content ?? []) nodesOf(child, type, out);
  return out;
};
const textOf = (node) => (node.type === 'text' ? node.text : (node.content ?? []).map(textOf).join(''));
/** Types a line at the end of My notes while it records (it gets the recording's time). */
const typeLine = async (words) => {
  await b.evaluate(`(() => { const pm = document.querySelector('.ProseMirror'); pm.focus(); const s = window.getSelection(); s.selectAllChildren(pm); s.collapseToEnd(); })()`);
  await b.press('Enter');
  await b.type(words);
  await b.sleep(1500);
};
const markExam = async () => {
  await tapVisible('[data-mark-button="exam"]');
  await waitFor(() => has('[data-mark="panel"]'), 'the mark panel', 5000);
  await b.click('Save mark', { exact: true });
  await waitFor(async () => !(await has('[data-mark="panel"]')), 'the mark saved', 5000);
};

let L = null;
try {
  for (const scope of ['transcription', 'assistant_summary']) {
    const { error } = await user.client.from('ai_consent').insert({ scope, policy_version: POLICY_VERSION });
    if (error) throw new Error(`the ${scope} consent: ${error.message}`);
  }
  await b.signIn(BASE, user.email, user.password);
  await b.resize(1280, 900);
  await b.nav(`${BASE}/record?projectId=${data.course.id}`);
  await b.waitText('New Recording', { timeout: 30000 });
  await b.fill('input[placeholder^="e.g."]', TITLE);
  await b.clickSelector('[aria-label="Start recording"]');
  await waitFor(async () => (await path()).startsWith('/doc/'), async () => `the lecture opened (at ${await path()})`, 20000);
  await waitFor(() => has('[data-recording="strip"]'), 'the strip', 10000);
  L = /\/doc\/([^?/]+)/.exec(await path())[1];

  await step('laptop: Stop & summarize: a red "Discard recording" at the far left of the footer (≥ 44 px), before Save as course default', async () => {
    // A first chunk reaches Studiply (kept when the lecture goes to Recently Deleted).
    await chunkUploaded(L, 0);
    await tapVisible('[aria-label="Stop and summarize"]');
    await waitFor(() => has('[data-summarize="discard"]'), 'Discard recording in the panel', 15000);
    expect((await text('[data-summarize="discard"]')) === 'Discard recording', `its words: ${await text('[data-summarize="discard"]')}`);
    const discard = await rect('[data-summarize="discard"]');
    const save = await rect('[data-summarize="save-default"]');
    expect(discard.h >= 44 && discard.w >= 44, `its size: ${JSON.stringify(discard)}`);
    expect(discard.x < save.x, `not left of Save as course default: ${JSON.stringify({ discard, save })}`);
    const color = await b.evaluate(`getComputedStyle(document.querySelector('[data-summarize="discard"]').querySelector('div, span') ?? document.querySelector('[data-summarize="discard"]')).color`);
    report.push(`RESULT | the panel's Discard recording: ${Math.round(discard.w)}×${Math.round(discard.h)} px, colour ${color}`);
    await shots('discard-panel-1280');
  });

  await step('it asks first, with the lecture’s title; Cancel: nothing happens, the recording goes on, the panel stays', async () => {
    const before = await timer();
    await tapVisible('[data-summarize="discard"]');
    await confirmShown();
    const q = await text(ALERT);
    expect(q.includes(`The recording stops and “${TITLE}” moves to Recently Deleted with its notes and marks (kept 30 days). No summary is made.`), `the question: ${q}`);
    await shot('discard-confirm-1280');
    await b.click('Cancel', { exact: true });
    await waitFor(async () => !(await has(ALERT)), 'the question closed', 4000);
    await b.sleep(2500);
    expect((await timer()) > before && (await has('[data-recording="strip"]')), 'the recording stopped after Cancel');
    expect(await has('[data-summarize="panel"]'), 'the panel closed after Cancel');
    await tapVisible('[data-summarize="keep"]');
    await waitFor(async () => !(await has('[data-summarize="panel"]')), 'the panel closed', 4000);
  });

  let discardAt = 0;
  await step('the … menu’s Recording › Discard recording… (last; scrolled to, also by the keyboard); Discard: Recently Deleted, no summary, the earlier chunk kept, the course, the toast; UNDO restores it', async () => {
    await openDocMenu();
    const items = await menuItems();
    expect(items.at(-1) === 'Discard recording…', `the menu: ${items.join(' | ')}`);
    // The heading is drawn in capitals (text-transform), so its words are read from textContent, case-insensitively.
    const headings = await b.evaluate(`[...document.querySelectorAll('[role=menu] [role=heading], [role=menu] [role=header]')].map((e) => e.textContent.trim().toLowerCase())`);
    expect(headings.at(-1) === 'recording', `the menu's headings: ${headings.join(' | ')}`);
    // The keyboard reaches it: End goes to the last item, which scrolls into the menu's view.
    await b.chord({ key: 'End', code: 'End', keyCode: 35 });
    const focused = await b.evaluate(`(() => {
      const e = document.activeElement;
      const menu = e?.closest('[role=menu]');
      if (!e || !menu) return null;
      const r = e.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      return { words: (${ITEM_WORDS})(e), inside: r.top >= m.top - 1 && r.bottom <= m.bottom + 1, h: r.height };
    })()`);
    expect(focused?.words === 'Discard recording…' && focused.inside, `End: ${JSON.stringify(focused)}`);
    report.push(`RESULT | the menu item's height: ${Math.round(focused.h)} px`);
    await shot('discard-menu-1280');
    await chooseMenuItem('Discard recording…');
    await confirmShown();
    discardAt = Date.now();
    await b.click('Discard', { exact: true });
    await waitFor(async () => !(await has('[data-recording="strip"]')), 'the strip gone', 30000);
    await b.waitText(`“${TITLE}” discarded`, { timeout: 10000 });
    await shot('discard-toast-1280');
    await waitFor(async () => !!(await admin.from('files').select('deleted_at').eq('id', L).single()).data?.deleted_at, 'in Recently Deleted', 15000);
    await waitFor(async () => (await path()).startsWith(`/project/${data.course.id}`), async () => `the course (at ${await path()})`, 10000);
    // Undo straight away (the toast shows 5 s); what Discard left on Studiply is checked after.
    await undoNow();
    await waitFor(async () => !(await admin.from('files').select('deleted_at').eq('id', L).single()).data?.deleted_at, 'UNDO did not restore it', 10000);
    const { count } = await admin.from('summaries').select('id', { count: 'exact', head: true }).eq('file_id', L);
    expect(count === 0, `summaries: ${count}`);
    await b.sleep(3000);
    const left = await chunks(L);
    expect(left.length >= 1 && left[0].seq === 0, `chunks: ${JSON.stringify(left)}`);
    const transcribedAfter = (await calls()).filter((c) => c.fn === 'transcribe-chunk' && c.at > discardAt + 500);
    expect(transcribedAfter.length === 0, `transcribed after Discard: ${JSON.stringify(transcribedAfter)}`);
    report.push(`RESULT | a new lecture discarded: ${left.length} chunk(s) kept (those on Studiply before Discard)`);
  });

  await step('recorded again: the line and the mark of this recording; Discard: only its audio, the mark as words, the line without its time, the version', async () => {
    await cleanStart();
    // Out of Recently Deleted if step 3 left it there.
    await admin.from('files').update({ deleted_at: null }).eq('id', L);
    await b.nav(`${BASE}/doc/${L}?tab=notes`);
    await waitFor(() => has('[aria-label="Record"]'), '● Record in the lecture', 20000);
    await b.sleep(1500);
    await tapVisible('[aria-label="Record"]');
    await waitFor(() => has('[data-recording="strip"]'), 'recording again', 15000);
    await waitFor(() => has('.ProseMirror'), 'My notes', 10000);
    await typeLine('Línea de la segunda grabación');
    await markExam();
    const earlierRows = await chunks(L);
    const earlier = earlierRows.map((c) => c.seq);
    // Where this recording starts: where the audio Studiply already had ends.
    const fromMs = Math.max(0, ...earlierRows.map((c) => c.start_ms + c.duration_ms));
    await chunkUploaded(L, Math.max(...earlier) + 1);
    const notes = await waitFor(async () => {
      const n = await notesOf(L);
      return nodesOf(n?.content, 'markChip').length ? n : null;
    }, 'the mark in My notes on Studiply', 15000);
    const { data: marks } = await admin.from('marks').select('id').eq('lecture_id', L);
    expect(marks.length === 1, `marks: ${marks.length}`);
    await openDocMenu();
    await chooseMenuItem('Discard recording…');
    await confirmShown();
    const q = await text(ALERT);
    expect(/The recording stops and the audio recorded since \d+:\d\d is deleted\. Earlier audio and your notes stay\. No summary is made\./.test(q), `the question: ${q}`);
    await b.click('Discard', { exact: true });
    await waitFor(async () => !(await has('[data-recording="strip"]')), 'the strip gone', 30000);
    await b.waitText('Recording discarded', { timeout: 10000 });
    await b.click('OK', { exact: true }).catch(() => {});
    await waitFor(async () => JSON.stringify((await chunks(L)).map((c) => c.seq)) === JSON.stringify(earlier), async () => `chunks: ${JSON.stringify(await chunks(L))} (earlier ${JSON.stringify(earlier)})`, 20000);
    await waitFor(async () => (await admin.from('marks').select('id').eq('lecture_id', L)).data.length === 0, 'the mark’s row gone', 15000);
    const after = await waitFor(async () => {
      const n = await notesOf(L);
      return nodesOf(n?.content, 'markChip').length === 0 ? n : null;
    }, 'My notes saved without the chip', 15000);
    const words = textOf(after.content);
    expect(words.includes('Línea de la segunda grabación') && words.includes('Exam 5/10'), `My notes: ${words}`);
    const stamps = nodesOf(after.content, 'timestampChip').map((s) => s.attrs.ms);
    expect(stamps.every((ms) => ms < fromMs), `stamps of this recording left: ${JSON.stringify(stamps)} (it started at ${fromMs})`);
    expect((await versionNamed(notes.id, 'Before discarding the recording')).length === 1, 'no version "Before discarding the recording"');
    expect((await segments(L)).every((s) => s.start_ms < fromMs), 'segments of this recording left');
  });

  let D = null;
  await step('390: a plain document recorded into: the sheet’s red link after Save as course default (≥ 44 px); the ⋯ menu; Discard: a document again, nothing of the recording left', async () => {
    await b.resize(1280, 900);
    await cleanStart();
    const f = await user.client.from('files').insert({ kind: 'document', title: DOC_TITLE, course_id: data.course.id }).select('id').single();
    if (f.error) throw new Error(f.error.message);
    D = f.data.id;
    const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'b-antes' }, content: [{ type: 'text', text: 'Escrito antes de grabar' }] }] };
    const d = await user.client.from('documents').insert({ file_id: D, tab: 'notes', content }).select('id').single();
    if (d.error) throw new Error(d.error.message);
    await b.resize(390, 844);
    await b.nav(`${BASE}/doc/${D}`);
    await waitFor(() => has('[aria-label="Record"]'), '● Record in the document', 20000);
    await b.sleep(1500);
    await tapVisible('[aria-label="Record"]');
    await waitFor(() => has('[data-recording="bar"]'), 'the recording screen', 20000);
    await waitFor(() => has('.ProseMirror'), 'My notes', 10000);
    await typeLine('Durante la grabación');
    await markExam();
    await chunkUploaded(D, 0);

    // The sheet's link, at the end of its scroll.
    await tapVisible('[data-recording="bar"] [aria-label="Stop and summarize"]');
    await waitFor(() => has('[data-summarize="discard"]'), 'Discard recording in the sheet', 15000);
    await b.evaluate(`document.querySelector('[data-summarize="discard"]').scrollIntoView({ block: 'center' })`);
    await b.sleep(400);
    const link = await rect('[data-summarize="discard"]');
    const save = await rect('[data-summarize="save-default"]');
    expect(link.h >= 44 && link.w >= 44 && link.y > save.y, `the link: ${JSON.stringify({ link, save })}`);
    await shots('discard-panel-390');
    await tapVisible('[data-summarize="keep"]');
    await waitFor(async () => !(await has('[data-summarize="panel"]')), 'the sheet closed', 4000);

    // The recording header's ⋯, far above the mark buttons.
    const visibleRect = (css) =>
      b.evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(css)})].find((x) => x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const menu = await visibleRect('[aria-label="Document menu"]');
    const marks = await visibleRect('[data-mark-button="exam"]');
    expect(menu && marks && marks.y - menu.y > 400, `the menu is near the mark buttons: ${JSON.stringify({ menu, marks })}`);
    await openDocMenu();
    expect((await menuItems()).at(-1) === 'Discard recording…', `the menu: ${(await menuItems()).join(' | ')}`);
    await b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].at(-1)?.scrollIntoView({ block: 'center' })`);
    await shots('discard-menu-390');
    await chooseMenuItem('Discard recording…');
    await confirmShown();
    const q = await text(ALERT);
    expect(q.includes(`The recording stops and its audio is deleted. “${DOC_TITLE}” stays a document with all your notes; marks become text. No summary is made.`), `the question: ${q}`);
    await shots('discard-confirm-390');
    await b.click('Discard', { exact: true });
    await waitFor(async () => !(await has('[data-recording="bar"]')), 'the recording screen gone', 30000);
    await b.waitText('Recording discarded', { timeout: 10000 });
    await b.click('OK', { exact: true }).catch(() => {});
    await waitFor(async () => (await admin.from('files').select('kind').eq('id', D).single()).data?.kind === 'document', 'a document again', 20000);
    expect(!(await admin.from('lectures').select('id').eq('id', D).maybeSingle()).data, 'its lecture row is left');
    expect((await chunks(D)).length === 0, `chunks left: ${JSON.stringify(await chunks(D))}`);
    const { data: files } = await admin.storage.from('audio-chunks').list(`${user.id}/${D}`);
    expect(!files?.length, `audio files left: ${JSON.stringify(files?.map((x) => x.name))}`);
    const after = await waitFor(async () => {
      const n = await notesOf(D);
      return n && nodesOf(n.content, 'markChip').length === 0 ? n : null;
    }, 'My notes saved without the chip', 15000);
    const words = textOf(after.content);
    expect(words.includes('Escrito antes de grabar') && words.includes('Durante la grabación') && words.includes('Exam 5/10'), `My notes: ${words}`);
    expect(nodesOf(after.content, 'timestampChip').length === 0, 'time chips left');
    expect((await versionNamed(d.data.id, 'Before discarding the recording')).length === 1, 'no version "Before discarding the recording"');
    await b.resize(1280, 900);
  });

  await step('no request reached summarize, assistant-chat or transcribe-chunk on the server, nor Anthropic or OpenAI; the page asked for no summary', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|assistant-chat|transcribe-chunk)|anthropic\.com|api\.openai\.com|elevenlabs\.io/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
    const asked = (await calls()).filter((c) => c.fn !== 'transcribe-chunk');
    expect(asked.length === 0, `functions asked for in the page: ${JSON.stringify(asked.map((c) => c.fn))}`);
    const { count } = await admin.from('summaries').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    expect(count === 0, `summaries: ${count}`);
  });

  await step('the composites beside the mockups: desktop-01 (1280), iphone-02 (390), light and dark', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const mock = (name) => png(join(repo, 'docs/design', `${name}.png`));
    await b.nav('about:blank');
    const compose = async (name, cells, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 15px -apple-system,sans-serif;margin:0 0 6px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:grid;grid-template-columns:repeat(${cells.length}, ${w}px);gap:24px;align-items:start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => {
        document.open(); document.write(${JSON.stringify(html)}); document.close();
        const loaded = (i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; }));
        await Promise.race([Promise.all([...document.images].map(loaded)), new Promise((r) => setTimeout(r, 5000))]);
      })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose(
      'discard-compose-1280',
      [
        ['desktop-01 (mockup)', mock('desktop-01-recording')],
        ['Panel · light', shotOf('discard-panel-1280')],
        ['Panel · dark', shotOf('discard-panel-1280-dark')],
        ['… menu', shotOf('discard-menu-1280')],
        ['The question', shotOf('discard-confirm-1280')],
      ],
      560,
    );
    await compose(
      'discard-compose-390',
      [
        ['iphone-02 (mockup)', mock('iphone-02-recording')],
        ['Sheet · light', shotOf('discard-panel-390')],
        ['Sheet · dark', shotOf('discard-panel-390-dark')],
        ['⋯ menu · light', shotOf('discard-menu-390')],
        ['⋯ menu · dark', shotOf('discard-menu-390-dark')],
        ['The question', shotOf('discard-confirm-390')],
      ],
      390,
    );
    await b.resize(1280, 900);
    const wanted = ['discard-panel-1280', 'discard-panel-1280-dark', 'discard-menu-1280', 'discard-confirm-1280', 'discard-panel-390', 'discard-panel-390-dark', 'discard-menu-390', 'discard-menu-390-dark', 'discard-confirm-390'];
    const missing = wanted.filter((n) => !taken.has(n));
    expect(missing.length === 0, `not taken in this run: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  for (const r of results) console.log(r.join(' | '));
  for (const line of report) console.log(line);
  console.log(`console errors: ${JSON.stringify(errors)}`);
  console.log(`shots: ${SHOTS}`);
  await finish(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
}
