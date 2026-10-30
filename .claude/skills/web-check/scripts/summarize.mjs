// summarize.mjs — Stop & summarize, the summarize panel (step 7.3), in Chrome
// during a real recording (the fake microphone), against local Supabase. No
// paid call: transcribe-chunk is answered in the page, nothing calls
// summarize (7.3 only saves the request). The lecture's transcript (12,000
// words, the spec's example), a note line, a mark and a question to the
// assistant are put in by the check.
//
// Steps:
//   1. laptop (1280): Stop & summarize opens the panel over the recording
//      (desktop-02), the recording goes on: "Summarize this lecture", the
//      counts (min recorded · 1 note line · 1 mark · 1 question to the
//      assistant), EXTRA RESOURCES (My notes and marks locked on, "Always
//      included · 1 line · 1 mark with levels"; Questions ticked "1 answer,
//      saved as Q&A"; slides and photos none yet), + Slides or PDF · + Photos
//      · + From my library (later) · + Link, the presets, the 10 sliders at the
//      course's defaults with their ends, the note, Save as course default,
//      Keep recording · Stop & generate summary, the preview "≈ 1,440 words ·
//      4 takeaways · 7 questions" between them; the card inside the window.
//   2. My notes and marks can't be unticked; Questions can (and back).
//   3. The keyboard moves a slider (→, End, Home) and the preview follows;
//      Exam tomorrow sets all 10 (5 4 5 4 4 10 10 7 6 9, "15 questions");
//      the four chips stay alike (no chosen look, as the mockups).
//   4. Save as course default: "Saved as Math’s default", course_settings
//      holds the 10 values.
//   5. + Link (a link row), + Slides or PDF (a slides row and its file;
//      "Tema1.pdf" ticked), + Photos (a photo row at the recording's time;
//      "1 photo · m:ss"), + From my library says it comes later.
//   6. Keep recording and Esc close it; the recording goes on.
//   7. 390 px: the sheet (iphone-05): My notes and marks first, then Slides,
//      Board photos, Questions; the add buttons, then the chips (a scrollbar,
//      dark in dark mode) with the heading right after them; one column, the
//      short counts and ends, Save as course default after slider 10, the
//      preview just above Keep recording · Generate.
//   8. Stop & generate summary (Board photos unticked first): the panel closes at once; the recording
//      stops; the Summary tab says "Summary settings saved" with the preview;
//      one summaries row: mode new, pending, the lecture, the 10 values, the
//      calculator's numbers, the resources ticked, the preview; no result.
//   9. Another lecture of the same course (its Summarize): the panel after
//      class (Cancel · Generate summary) with the saved defaults (BUILD-PLAN 7.3).
//  10. No request reached summarize or transcribe-chunk on the server, nor
//      Anthropic or OpenAI.
//  11. The screenshots SIDE BY SIDE with the mockups (light and dark):
//      shots/summarize-compare-1280.png (desktop-02),
//      shots/summarize-compare-390.png (iphone-05).
//
// Run with Lea's dev server on 8123 and `supabase start`:
//   node .claude/skills/web-check/scripts/summarize.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const TITLE = 'Summarize check';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-summarize-${results.length}`).catch(() => {});
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

// The files the pickers are given.
const FILES = join(tmpdir(), 'studiply-web-check', 'summarize-files');
mkdirSync(FILES, { recursive: true });
const PDF = join(FILES, 'Tema1.pdf');
writeFileSync(PDF, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PNG = join(FILES, 'pizarra.png');
writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

/** Before the app: the synthetic microphone; transcribe-chunk answered in the page (never the server). */
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
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      const segments = [{ startMs: body.startMs, endMs: body.startMs + 30000, text: 'Simulated chunk ' + body.seq }];
      return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 30000, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

const PANEL = '[data-summarize="panel"]';
const path = () => b.evaluate('location.pathname + location.search');
const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const clockMs = (s) => s.split(':').map(Number).reduce((t, n) => t * 60 + n, 0) * 1000;
const timer = async () => {
  const m = /(\d+:\d\d(?::\d\d)?)\s*$/.exec((await text('[data-recording="timer"]')).trim());
  return m ? clockMs(m[1]) : null;
};
const KEYS = ['startingPoint', 'length', 'depth', 'examples', 'visuals', 'examFocus', 'selfTest', 'language', 'extraResources', 'followMarks'];
const values = () => b.evaluate(`${JSON.stringify(KEYS)}.map((k) => Number(document.querySelector('[data-summarize="slider-' + k + '"]')?.getAttribute('data-value')))`);
const preview = () => text('[data-summarize="preview"]');
const checked = (key) => attr(`[data-summarize="resource-${key}"]`, 'data-checked');
const box = (css) =>
  b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; })()`);
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
/** Stop & summarize (the strip's or the phone bar's): the panel, loaded (its preview line shown). */
const openPanel = async () => {
  await b.clickSelector('[aria-label="Stop and summarize"]');
  await waitFor(() => has(PANEL), 'the summarize panel', 10000);
  await waitFor(() => has('[data-summarize="preview"]'), 'the panel loaded', 15000);
};
const closePanel = async () => {
  await b.clickSelector('[data-summarize="keep"]');
  await waitFor(async () => !(await has(PANEL)), 'the panel closed', 5000);
};
const focusSlider = (key) => b.evaluate(`document.querySelector('[data-summarize="slider-${key}"] [data-mark="slider"]')?.focus()`);
const courseRow = async () => (await admin.from('course_settings').select('*').eq('course_id', data.course.id).single()).data;
const sliderColumns = (row) => ['starting_point', 'length', 'depth', 'examples', 'visuals', 'exam_focus', 'self_test', 'language', 'extra_resources', 'follow_marks'].map((k) => row[`slider_${k}`]);

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

  // The lecture's material: a note line with a mark (My notes, saved by the editor), a question answered, 12,000 words heard.
  await waitFor(() => b.evaluate('!!window.studiplyEditor'), 'the editor', 15000);
  await b.evaluate(`(() => {
    const ed = window.studiplyEditor;
    ed.chain().focus('end').insertContent([{ type: 'text', text: 'Def: estudia la conducta como proceso biológico ' }, { type: 'markChip', attrs: { markId: crypto.randomUUID(), kind: 'important', level: 8, ms: 20000, note: null } }]).run();
  })()`);
  const q = await user.client.from('assistant_messages').insert({ lecture_id: lectureId, role: 'user', content: 'Explícame los últimos 10 minutos', quick_prompt: 'last_10_min', asked_at_ms: 30000, window_start_ms: 0, window_end_ms: 30000, status: 'done' }).select('id').single();
  if (q.error) throw new Error(q.error.message);
  const a = await user.client.from('assistant_messages').insert({ lecture_id: lectureId, role: 'assistant', content: 'La profesora explicó **las 5 preguntas**.', reply_to: q.data.id, window_start_ms: 0, window_end_ms: 30000, status: 'done', model: 'claude-sonnet-5-5' });
  if (a.error) throw new Error(a.error.message);
  const words = Array.from({ length: 12 }, (_, i) => ({ lecture_id: lectureId, start_ms: i * 1000, end_ms: i * 1000 + 999, text: Array.from({ length: 1000 }, (_, j) => `palabra${j}`).join(' ') }));
  const seg = await user.client.from('transcript_segments').insert(words);
  if (seg.error) throw new Error(`the transcript: ${seg.error.message}`);
  // My notes saved (the counts read the saved document).
  await waitFor(async () => {
    const { data: doc } = await admin.from('documents').select('content').eq('file_id', lectureId).eq('tab', 'notes').maybeSingle();
    return JSON.stringify(doc?.content ?? '').includes('markChip');
  }, 'My notes saved with the mark', 20000);

  await step('laptop: Stop & summarize opens the panel over the recording (desktop-02): counts, resources (notes locked), add buttons, presets, 10 sliders at the course defaults, the note, Save as course default, the preview between it and Keep recording · Stop & generate summary; the recording goes on', async () => {
    const before = await timer();
    await openPanel();
    expect((await attr(PANEL, 'data-layout')) === 'card', 'not the laptop card');
    const t = await text(PANEL);
    expect(t.includes('Summarize this lecture'), 'no title');
    expect(/\d+ min recorded · 1 note line · 1 mark · 1 question to the assistant/.test(await text('[data-summarize="counts"]')), `counts: ${await text('[data-summarize="counts"]')}`);
    expect(t.includes('EXTRA RESOURCES') && t.includes('TUNE YOUR SUMMARY · 10 SLIDERS'), 'the section labels');
    expect((await checked('notes')) === 'true' && (await text('[data-summarize="resource-notes"]')).includes('Always included · 1 line · 1 mark with levels'), `notes: ${await text('[data-summarize="resource-notes"]')}`);
    expect((await checked('assistant')) === 'true' && (await text('[data-summarize="resource-assistant"]')).includes('1 answer, saved as Q&A'), `questions: ${await text('[data-summarize="resource-assistant"]')}`);
    expect((await checked('slides')) === 'false' && (await checked('photos')) === 'false', 'slides / photos ticked with none');
    for (const k of ['slides', 'photos', 'library', 'link']) expect(await has(`[data-summarize="add-${k}"]`), `no + ${k}`);
    expect((await attr('[data-summarize="add-library"]', 'data-later')) === 'true', '+ From my library is not marked "later"');
    for (const k of ['firstTimeLearning', 'quickReview', 'examTomorrow', 'reset']) expect(await has(`[data-summarize="preset-${k}"]`), `no preset ${k}`);
    // The course's defaults (the row the course was made with: the spec's).
    const shown = await values();
    expect(JSON.stringify(shown) === JSON.stringify(sliderColumns(await courseRow())), `sliders ${shown} vs course ${sliderColumns(await courseRow())}`);
    expect(JSON.stringify(shown) === JSON.stringify([2, 5, 6, 5, 4, 5, 5, 4, 6, 7]), `not the defaults: ${shown}`);
    expect(t.includes('1 · start from zero') && t.includes('10 · I already know it') && t.includes('10 · follow them closely'), 'the ends');
    expect(t.includes('The summary is written into this document (Summary tab). Your notes stay untouched in the My notes tab.'), 'the note');
    expect((await preview()) === '≈ 1,440 words · 4 takeaways · 7 questions', `preview: ${await preview()}`);
    expect((await text('[data-summarize="keep"]')) === 'Keep recording' && (await text('[data-summarize="generate"]')) === 'Stop & generate summary', 'the buttons');
    // The preview between Save as course default and the buttons, on one row.
    const [save, prev, keep] = [await box('[data-summarize="save-default"]'), await box('[data-summarize="preview"]'), await box('[data-summarize="keep"]')];
    expect(save.right <= prev.x && prev.right <= keep.x && Math.abs(save.y + save.h / 2 - (keep.y + keep.h / 2)) < 20, `footer order: ${JSON.stringify({ save, prev, keep })}`);
    const card = await box(PANEL);
    expect(card.w <= 860 && card.x >= 0 && card.right <= 1280 && card.y >= 0 && card.bottom <= 900, `the card: ${JSON.stringify(card)}`);
    await b.sleep(2500);
    expect((await timer()) > before && (await has('[data-recording="strip"]')), 'the recording stopped while the panel was open');
    await shots('summarize-1280');
  });

  await step('My notes and marks can’t be unticked; Questions can (and back)', async () => {
    await b.clickSelector('[data-summarize="resource-notes"]');
    expect((await checked('notes')) === 'true', 'notes unticked');
    await b.clickSelector('[data-summarize="resource-assistant"]');
    await waitFor(async () => (await checked('assistant')) === 'false', 'Questions unticked', 3000);
    await b.clickSelector('[data-summarize="resource-assistant"]');
    await waitFor(async () => (await checked('assistant')) === 'true', 'Questions ticked again', 3000);
  });

  await step('the keyboard moves a slider and the preview follows; Exam tomorrow sets all 10', async () => {
    await focusSlider('length');
    await b.press('ArrowRight');
    await waitFor(async () => (await values())[1] === 6, 'Length 6', 3000);
    expect((await preview()) === '≈ 1,680 words · 4 takeaways · 7 questions', `→: ${await preview()}`);
    await b.press('End');
    await waitFor(async () => (await values())[1] === 10, 'Length 10', 3000);
    expect((await preview()) === '≈ 3,600 words · 5 takeaways · 7 questions', `End: ${await preview()}`);
    await b.press('Home');
    await waitFor(async () => (await values())[1] === 1, 'Length 1', 3000);
    expect((await preview()) === '≈ 360 words · 3 takeaways · 7 questions', `Home: ${await preview()}`);
    await b.clickSelector('[data-summarize="preset-examTomorrow"]');
    await waitFor(async () => JSON.stringify(await values()) === JSON.stringify([5, 4, 5, 4, 4, 10, 10, 7, 6, 9]), async () => `Exam tomorrow: ${await values()}`, 3000);
    expect((await preview()) === '≈ 1,080 words · 4 takeaways · 15 questions', `Exam tomorrow: ${await preview()}`);
    // The mockups draw the four chips alike: a preset only moves the sliders (no chosen look).
    const looks = await b.evaluate(`['firstTimeLearning', 'quickReview', 'examTomorrow', 'reset'].map((k) => getComputedStyle(document.querySelector('[data-summarize="preset-' + k + '"]')).backgroundColor)`);
    expect(new Set(looks).size === 1, `the chips don't look alike: ${looks.join(' / ')}`);
  });

  await step('Save as course default: "Saved as Math’s default"; course_settings holds the 10 values', async () => {
    await b.clickSelector('[data-summarize="save-default"]');
    await waitFor(async () => (await text('[data-summarize="save-note"]')).includes('Saved as Math’s default'), async () => `note: ${await text('[data-summarize="save-note"]')}`, 8000);
    const row = await courseRow();
    expect(JSON.stringify(sliderColumns(row)) === JSON.stringify([5, 4, 5, 4, 4, 10, 10, 7, 6, 9]), `course_settings: ${sliderColumns(row)}`);
  });

  await step('+ Link, + Slides or PDF, + Photos add to the lecture (rows, ticks, counts); + From my library comes later', async () => {
    await b.clickSelector('[data-summarize="add-link"]');
    await waitFor(() => has('input[placeholder="https://…"]'), 'the link prompt', 5000);
    await b.fill('input[placeholder="https://…"]', 'https://example.org/tema1');
    await b.click('Add', { exact: true });
    await b.chooseFiles([PDF], () => b.clickSelector('[data-summarize="add-slides"]'));
    await waitFor(async () => (await checked('slides')) === 'true', async () => `slides: ${await text('[data-summarize="resource-slides"]')}`, 20000);
    expect((await text('[data-summarize="resource-slides"]')).includes('Tema1.pdf'), `slides: ${await text('[data-summarize="resource-slides"]')}`);
    await b.chooseFiles([PNG], () => b.clickSelector('[data-summarize="add-photos"]'));
    await waitFor(async () => (await checked('photos')) === 'true', async () => `photos: ${await text('[data-summarize="resource-photos"]')}`, 20000);
    expect(/1 photo · \d+:\d\d/.test(await text('[data-summarize="resource-photos"]')), `photos: ${await text('[data-summarize="resource-photos"]')}`);
    const { data: media } = await admin.from('media').select('kind, url, caption, t_ms, storage_path, lecture_id, file_id').or(`lecture_id.eq.${lectureId},file_id.eq.${lectureId}`);
    expect(media.some((m) => m.kind === 'link' && m.url === 'https://example.org/tema1'), `no link row: ${JSON.stringify(media)}`);
    expect(media.some((m) => m.kind === 'slides' && m.caption === 'Tema1.pdf' && m.storage_path), `no slides row: ${JSON.stringify(media)}`);
    expect(media.some((m) => m.kind === 'photo' && m.t_ms !== null), `no photo row at a time: ${JSON.stringify(media)}`);
    await b.clickSelector('[data-summarize="add-library"]');
    await b.waitText('Comes with the first summaries', { timeout: 4000 });
    await b.click('OK', { exact: true });
    report.push(`RESULT | media | ${media.map((m) => m.kind).join(', ')}`);
  });

  await step('Keep recording and Esc close the panel; the recording goes on', async () => {
    await closePanel();
    const t = await timer();
    await openPanel();
    // Opened again: the course's defaults (now Exam tomorrow), not the last state.
    expect(JSON.stringify(await values()) === JSON.stringify([5, 4, 5, 4, 4, 10, 10, 7, 6, 9]), `opened again: ${await values()}`);
    await b.press('Escape');
    await waitFor(async () => !(await has(PANEL)), 'Esc closed it', 5000);
    await b.sleep(1500);
    expect((await timer()) > t && (await has('[data-recording="strip"]')), 'the recording stopped');
  });

  await step('390 px: the sheet (iphone-05): one column, short counts and ends, Save as course default after slider 10, the preview just above Keep recording · Generate', async () => {
    await b.resize(390, 844);
    await waitFor(() => has('[aria-label="Stop and summarize"]'), 'the phone bar', 10000);
    await openPanel();
    expect((await attr(PANEL, 'data-layout')) === 'sheet', 'not the sheet');
    expect(/^\d+ min · 1 note line · 1 mark · 1 question$/.test(await text('[data-summarize="counts"]')), `counts: ${await text('[data-summarize="counts"]')}`);
    const [s1, s2] = [await box('[data-summarize="slider-startingPoint"]'), await box('[data-summarize="slider-length"]')];
    expect(s2.y > s1.y + s1.h - 1 && Math.abs(s1.x - s2.x) < 2, 'not one column');
    expect((await text('[data-summarize="slider-startingPoint"]')).includes('I know it') && !(await text('[data-summarize="slider-startingPoint"]')).includes('10 ·'), 'the short ends');
    // iphone-05: My notes and marks first (the green row), then Slides, Board photos, Questions.
    const order = await b.evaluate(`['notes', 'slides', 'photos', 'assistant'].map((k) => document.querySelector('[data-summarize="resource-' + k + '"]').getBoundingClientRect().y)`);
    expect(order.every((y, i) => i === 0 || y > order[i - 1]), `the resources' order (notes, slides, photos, questions): ${order.join(', ')}`);
    // The add buttons stay (feature parity), between the resources and the presets.
    const [lastRow, addPill, chips] = [await box('[data-summarize="resource-assistant"]'), await box('[data-summarize="add-slides"]'), await box('[data-summarize="chips"]')];
    expect(addPill.y > lastRow.y && chips.y > addPill.y, `the add buttons not between the resources and the presets: ${JSON.stringify({ lastRow, addPill, chips })}`);
    // The heading follows the chips closely (an ~80 px gap before), and the chips' row scrolls with a scrollbar.
    const heading = await b.evaluate(`(() => { const e = [...document.querySelectorAll('${PANEL} div')].find((d) => d.childElementCount === 0 && d.textContent === 'TUNE YOUR SUMMARY · 10 SLIDERS'); const r = e.getBoundingClientRect(); return { y: r.y }; })()`);
    expect(heading.y - chips.bottom < 24, `a gap of ${Math.round(heading.y - chips.bottom)} px between the chips and the heading`);
    const row = await b.evaluate(`(() => { const e = document.querySelector('[data-summarize="chips"]'); return { overflows: e.scrollWidth > e.clientWidth, scrollbar: getComputedStyle(e).scrollbarWidth }; })()`);
    expect(row.overflows && row.scrollbar !== 'none', `the chips' row: ${JSON.stringify(row)}`);
    const [last, save] = [await box('[data-summarize="slider-followMarks"]'), await box('[data-summarize="save-default"]')];
    expect(save.y > last.y, 'Save as course default is not after slider 10');
    const [prev, keep, go] = [await box('[data-summarize="preview"]'), await box('[data-summarize="keep"]'), await box('[data-summarize="generate"]')];
    expect(prev.bottom <= keep.y && keep.y - prev.bottom < 24 && (await text('[data-summarize="generate"]')) === 'Generate', `the bottom: ${JSON.stringify({ prev, keep, go })}`);
    expect(keep.bottom <= 844 && go.right <= 390, 'the buttons off the screen');
    await shots('summarize-390');
    // Dark mode: the chips' scrollbar drawn dark (color-scheme), as the assistant's chips (6.2).
    await dark(true);
    const scheme = await b.evaluate(`getComputedStyle(document.querySelector('[data-summarize="chips"]')).colorScheme`);
    await dark(false);
    expect(scheme === 'dark', `the chips' scrollbar in dark mode: color-scheme ${scheme}`);
    await closePanel();
    await b.resize(1280, 900);
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 10000);
  });

  await step('Stop & generate summary: the panel closes at once, the recording stops, the Summary tab says the settings are saved; one pending summaries row with the values, the plan, the resources and the preview', async () => {
    await openPanel();
    // Her ticks are what is saved: Board photos unticked, the rest as they are.
    await b.clickSelector('[data-summarize="resource-photos"]');
    await waitFor(async () => (await checked('photos')) === 'false', 'Board photos unticked', 3000);
    const shown = await values();
    const expected = await preview();
    await b.clickSelector('[data-summarize="generate"]');
    await waitFor(async () => !(await has(PANEL)), 'the panel closed', 2000);
    await waitFor(() => has('[data-summarize="requested"]'), async () => `the Summary tab's card (at ${await path()})`, 90000);
    expect((await path()).startsWith(`/doc/${lectureId}`), await path());
    expect((await text('[data-summarize="requested"]')).includes(expected), `card: ${await text('[data-summarize="requested"]')}`);
    expect(!(await has('[data-recording="strip"]')), 'still recording');
    const lecture = (await admin.from('lectures').select('status').eq('id', lectureId).single()).data;
    expect(lecture.status === 'transcribing', `lecture: ${lecture.status}`);
    const { data: rows } = await admin.from('summaries').select('*').eq('file_id', lectureId);
    expect(rows.length === 1, `rows: ${rows.length}`);
    const [row] = rows;
    expect(row.mode === 'new' && row.status === 'pending' && row.result === null && JSON.stringify(row.source_lecture_ids) === JSON.stringify([lectureId]), `row: ${JSON.stringify(row)}`);
    expect(JSON.stringify(KEYS.map((k) => row.sliders[k])) === JSON.stringify(shown), `sliders: ${JSON.stringify(row.sliders)}`);
    const s = row.applied_settings;
    expect(s.preview === expected && typeof s.targetWords === 'number' && s.takeaways >= 3 && typeof s.selfTestCount === 'number' && typeof s.markStrength === 'number', `applied_settings: ${JSON.stringify(s)}`);
    // Key by key: jsonb keeps its own key order (the earlier check compared the JSON text and failed on the order alone).
    const r = s.resources ?? {};
    expect(r.slides === true && r.photos === false && r.assistant === true && r.notes === true && Object.keys(r).length === 4, `resources (photos unticked): ${JSON.stringify(r)}`);
    await shot('summarize-requested-1280');
    report.push(`RESULT | request | ${s.preview}`);
  });

  await step('another lecture of the same course: its Summarize opens the panel after class (Cancel · Generate summary) with the saved defaults', async () => {
    await b.nav(`${BASE}/doc/${data.lecture.id}?tab=summary&summarize=1`);
    await waitFor(() => has(PANEL), 'the panel for Lecture 1', 20000);
    await waitFor(() => has('[data-summarize="preview"]'), 'loaded', 15000);
    expect(JSON.stringify(await values()) === JSON.stringify([5, 4, 5, 4, 4, 10, 10, 7, 6, 9]), `Lecture 1: ${await values()}`);
    expect((await text('[data-summarize="keep"]')) === 'Cancel' && (await text('[data-summarize="generate"]')) === 'Generate summary', 'the after-class buttons');
    await closePanel();
  });

  await step('no request reached summarize or transcribe-chunk on the server, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the screenshots SIDE BY SIDE with the mockups: summarize-compare-1280, summarize-compare-390', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const wanted = ['summarize-1280', 'summarize-1280-dark', 'summarize-390', 'summarize-390-dark'];
    const missing = wanted.filter((n) => !taken.has(n));
    const mockDesktop = png(join(repo, 'docs/design/desktop-02-stop-and-summarize.png'));
    const mockPhone = png(join(repo, 'docs/design/iphone-05-stop-and-summarize.png'));
    expect(mockDesktop && mockPhone, 'the mockups are not in docs/design');
    await b.nav('about:blank');
    const compose = async (name, cells, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 18px -apple-system,sans-serif;margin:0 0 8px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:flex;gap:24px;align-items:flex-start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose(
      'summarize-compare-1280',
      [
        ['Mockup: desktop-02', mockDesktop],
        ['App · light', shotOf('summarize-1280')],
        ['App · dark', shotOf('summarize-1280-dark')],
      ],
      760,
    );
    await compose(
      'summarize-compare-390',
      [
        ['Mockup: iphone-05', mockPhone],
        ['App · light', shotOf('summarize-390')],
        ['App · dark', shotOf('summarize-390-dark')],
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
  for (const line of report) console.log(line);
  console.log(`console errors: ${JSON.stringify(errors)}`);
  console.log(`shots: ${SHOTS}`);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
