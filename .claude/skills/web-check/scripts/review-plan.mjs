// review-plan.mjs — step 9.2-1, spaced review of lectures, in Chrome against local Supabase (the
// migration 20261029152700_lecture_reviews applied). NO paid call: the one summary is a finished
// `summaries` row the check puts in (the 30-min synthetic lecture's, src/test-utils/summary-synthetic-30.json);
// the test user never allows AI, so Generate summary only saves its request (checked at the end).
//
// The library seeded (lectures dated by recorded_at, n days ago; the plan: day 1, 3, 7, 21):
//   Math:    Tema 1 (1 day ago: Day 1 due), Tema 2 (3 days: Day 3 due; has a summary with a
//            self-test), Tema 3 (7 days: Day 7 due), Tema 4 · old (40 days: its last session lapsed),
//            Tema 5 · off (1 day, its study reminders off), Tema 6 · reviewed (3 days, reviewed today),
//            and the seed's Lecture 1 (made today: no session yet).
//   Science: Bio 1 (1 day ago), the course's default switched off.
//   One flashcard, due now.
// Review today = 3 lectures + 1 card = 4.
//
// Steps:
//   1. The count (1280): the sidebar's Review today badge "4"; the Review screen's "Lectures to review
//      today": Tema 1 · Math · Day 1, Tema 2 · Day 3, Tema 3 · Day 7, nothing else; Tema 2's Review
//      opens its questions, Tema 3's (no summary) its Summary tab.
//   2. Mark reviewed (its … menu): its review row in the database (reviewed now, once), the row gone,
//      the badge 3; UNDO: the row's time back (none), the lecture back, the badge 4.
//   3. Finishing a lecture's questions (Tema 2's Review → Quiz me, only its questions): after the last
//      one, Tema 2 is reviewed (the database), "“Tema 2” reviewed", no longer in the card.
//   4. The lecture's menu (1280, the course page): Study reminders… says "on", Turn off: the
//      lecture's switch off in the database, the badge one less; UNDO: on again.
//   5. 390 (iphone-10, iphone-01): the Library chip "Review today · 3", Review's "3 due today", the
//      card over Flashcards | Quiz me.
//   6. The summarize panel (1280, desktop-02): "Study reminders for this lecture" after the panel's
//      choices, on; off, Save as course default: course_settings.study_reminders false ("Saved as
//      Math’s default"); Generate summary: Tema 1's switch off in the database, its request saved;
//      the badge: 2 (Tema 1 off; Tema 3 keeps its own switch). 390 (iphone-05): Lecture 1's panel shows
//      the course's default (off).
//   7. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//   8. Composites beside the mockups: desktop-04 (the sidebar), desktop-02 (the panel), iphone-05
//      (the panel), iphone-10 (Review at 390), each with light and dark.
//
// The run always ends (its Chrome closed, the test user dropped, the process exits), also after
// failures, when stopped, or after 12 minutes.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start` (migrations applied):
//   node .claude/skills/web-check/scripts/review-plan.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node review-plan.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-review-plan-${results.length}`).catch(() => {});
    await b.press('Escape').catch(() => {});
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

const S30 = JSON.parse(readFileSync(join(repo, 'src/test-utils/summary-synthetic-30.json'), 'utf8')).result;
const SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };
const MIN = 60_000;
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

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
  console.error('review-plan.mjs: still running after 12 minutes; stopping');
  void finish(1);
}, 12 * MIN);
watchdog.unref();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const path = () => b.evaluate('location.pathname + location.search');
const tap = async (css) => {
  const found = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  if (!found) throw new Error(`no element: ${css}`);
  await b.sleep(250);
  await b.clickSelector(css);
};
const splashShown = () =>
  b.evaluate(`(() => {
    const el = [...document.querySelectorAll('div, span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY');
    if (!el) return false;
    let opacity = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    return opacity > 0.05;
  })()`);
const waitSplash = () => waitFor(async () => !(await splashShown()), 'the splash screen gone', 20000);
const taken = new Set();
const shot = async (name) => {
  await b.sleep(500);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(700);
};
const shots = async (name) => {
  await shot(name);
  await dark(true);
  await shot(`${name}-dark`);
  await dark(false);
};

/** The lectures card's rows: [its text, its detail line, its lecture's id]. */
const rows = () =>
  b.evaluate(`[...document.querySelectorAll('[data-lectures="row"]')].map((r) => [r.textContent ?? '', r.querySelector('[data-lectures="detail"]')?.textContent ?? '', r.getAttribute('data-id')])`);
/** The sidebar's Review today badge ("4 due"), or null. */
const badge = () => b.evaluate(`document.querySelector('[data-testid="sidebar"] [aria-label$=" due"]')?.getAttribute('aria-label') ?? null`);
const reviewRow = async (fileId) => (await admin.from('review_schedule').select('id, reps, last_reviewed_at, due_at, flashcard_id').eq('file_id', fileId).maybeSingle()).data;
const ownSwitch = async (fileId) => (await admin.from('lectures').select('study_reminders').eq('id', fileId).single()).data?.study_reminders;
const openReview = async (query = '') => {
  await b.nav(`${BASE}/review${query}`);
  await waitSplash();
  await waitFor(() => b.evaluate(`!!document.querySelector('[data-review-card], [data-review="done"], [data-quiz-card], [data-quiz="done"]')`), 'the review screen', 20000);
  await b.sleep(600);
};
const openLibrary = async () => {
  await b.nav(`${BASE}/library`);
  await waitSplash();
  await waitFor(() => has('[data-testid="sidebar"]'), 'the sidebar', 20000);
  await b.sleep(800);
};
const PANEL = '[data-summarize="panel"]';
const openPanel = async (fileId) => {
  await b.nav(`${BASE}/doc/${fileId}?tab=summary&summarize=1&at=${Date.now()}`);
  await waitFor(() => has(PANEL), 'the summarize panel', 25000);
  await waitSplash();
  await waitFor(() => has('[data-summarize="reminders"]'), 'the study reminders row', 15000);
  await b.sleep(500);
};

const ids = {};
try {
  // ---------------------------------------------------------------------
  // The library
  // ---------------------------------------------------------------------
  const math = data.course.id;
  const science = data.science.id;
  const lecture = async (key, title, course, recorded, more = {}) => {
    const { data: file, error } = await user.client.from('files').insert({ kind: 'lecture', title, course_id: course }).select().single();
    if (error) throw new Error(`${title}: ${error.message}`);
    const l = await user.client.from('lectures').insert({ id: file.id, status: 'ready', duration_ms: 30 * MIN, recorded_at: recorded, ...more });
    if (l.error) throw new Error(`${title}: ${l.error.message}`);
    ids[key] = file.id;
  };
  await lecture('t1', 'Tema 1', math, daysAgo(1));
  await lecture('t2', 'Tema 2', math, daysAgo(3));
  await lecture('t3', 'Tema 3', math, daysAgo(7));
  await lecture('old', 'Tema 4 · old', math, daysAgo(40));
  await lecture('off', 'Tema 5 · off', math, daysAgo(1), { study_reminders: false });
  await lecture('done', 'Tema 6 · reviewed', math, daysAgo(3));
  await lecture('bio', 'Bio 1', science, daysAgo(1));
  {
    const r = await user.client.from('review_schedule').insert({ file_id: ids.done, due_at: daysAgo(-4), reps: 1, last_reviewed_at: new Date().toISOString() });
    if (r.error) throw new Error(`the reviewed lecture: ${r.error.message}`);
    const s = await user.client.from('course_settings').update({ study_reminders: false }).eq('course_id', science);
    if (s.error) throw new Error(`Science's default: ${s.error.message}`);
    const c = await user.client.from('flashcards').insert({ source: 'assistant', front: 'Sinapsis', back: 'La unión entre dos neuronas.', kind: 'term', file_id: ids.t2, course_id: math });
    if (c.error) throw new Error(`the card: ${c.error.message}`);
    const { error } = await admin.from('summaries').insert({
      user_id: user.id,
      file_id: ids.t2,
      mode: 'new',
      source_lecture_ids: [ids.t2],
      sliders: SLIDERS,
      status: 'done',
      result: S30,
      applied_settings: { targetWords: 600, takeaways: 4, selfTestCount: S30.selfTest.length, resources: { slides: false, photos: false, assistant: true, notes: true }, preview: '≈ 600 words' },
      model: 'claude-opus-5-5',
    });
    if (error) throw new Error(`the summary row: ${error.message}`);
    // A transcript, so the panel's calculator has words (Tema 1, and the seed's Lecture 1 for 390).
    for (const id of [ids.t1, data.lecture.id]) {
      const seg = await user.client.from('transcript_segments').insert(
        Array.from({ length: 3 }, (_, i) => ({ lecture_id: id, start_ms: i * 60_000, end_ms: i * 60_000 + 59_000, text: Array.from({ length: 300 }, (_, j) => `palabra${j}`).join(' ') })),
      );
      if (seg.error) throw new Error(`the transcript: ${seg.error.message}`);
    }
  }
  await b.signIn(BASE, user.email, user.password);
  await b.resize(1280, 900);

  await step('the count (1280): the sidebar badge 4; Lectures to review today: Tema 1 · Day 1, Tema 2 · Day 3, Tema 3 · Day 7, nothing else; Review opens a lecture’s questions, or its Summary tab', async () => {
    await openLibrary();
    await waitFor(async () => (await badge()) === '4 due', async () => `the badge: ${await badge()}`, 15000);
    await shots('review-plan-library-1280');
    await openReview();
    await waitFor(() => has('[data-lectures="today"]'), 'the lectures card', 15000);
    expect(await b.hasText('Lectures to review today', true), 'no heading');
    const r = await rows();
    const got = r.map(([, detail, id]) => [id, detail]);
    const want = [
      [ids.t1, 'Math · Day 1'],
      [ids.t2, 'Math · Day 3'],
      [ids.t3, 'Math · Day 7'],
    ];
    expect(JSON.stringify(got) === JSON.stringify(want), `rows: ${JSON.stringify(r)}`);
    expect((await attr(`[data-id="${ids.t2}"] [data-lectures="review"]`, 'data-target')) === 'quiz', 'Tema 2 (a self-test) doesn’t open its questions');
    expect((await attr(`[data-id="${ids.t3}"] [data-lectures="review"]`, 'data-target')) === 'summary', 'Tema 3 (no summary) doesn’t open its summary');
    await shots('review-plan-1280');
    await tap(`[data-id="${ids.t3}"] [data-lectures="review"]`);
    await waitFor(async () => (await path()).startsWith(`/doc/${ids.t3}`) && (await path()).includes('tab=summary'), async () => `Tema 3's Review went to ${await path()}`, 15000);
    report.push('RESULT | Review today 4 = 3 lectures (Day 1, 3, 7) + 1 card; left out: lapsed, switched off, reviewed today, a course defaulting off, made today');
  });

  await step('Mark reviewed (its menu): reviewed once in the database, the row gone, the badge 3; UNDO puts it back', async () => {
    await openReview();
    await waitFor(() => has(`[data-id="${ids.t1}"]`), 'Tema 1’s row', 15000);
    await tap(`[data-id="${ids.t1}"] [data-lectures="more"]`);
    await b.waitText('Mark reviewed', { exact: true, timeout: 5000 });
    await shot('review-plan-menu-1280');
    await b.click('Mark reviewed', { exact: true });
    const row = await waitFor(async () => {
      const r = await reviewRow(ids.t1);
      return r?.last_reviewed_at ? r : null;
    }, 'Tema 1’s review row');
    expect(row.reps === 1 && row.flashcard_id === null && Math.abs(Date.parse(row.last_reviewed_at) - Date.now()) < 2 * MIN, `the row: ${JSON.stringify(row)}`);
    // The next session (day 3) noted, at the start of its day.
    expect(Math.abs(Date.parse(row.due_at) - Date.now() - 2 * DAY) < DAY, `due_at: ${row.due_at}`);
    await waitFor(async () => !(await has(`[data-id="${ids.t1}"]`)), 'Tema 1 leaves the card');
    await b.waitText('UNDO', { exact: true, timeout: 5000 });
    await b.click('UNDO', { exact: true });
    await waitFor(async () => (await reviewRow(ids.t1))?.last_reviewed_at === null, 'UNDO: the review time back (none)');
    await waitFor(() => has(`[data-id="${ids.t1}"]`), 'Tema 1 back in the card', 10000);
    expect((await reviewRow(ids.t1)).reps === 0, 'reps after Undo');
  });

  await step('finishing a lecture’s questions (Tema 2: Review → Quiz me, its questions only): reviewed, said, out of the card', async () => {
    await openReview();
    await tap(`[data-id="${ids.t2}"] [data-lectures="review"]`);
    await waitFor(async () => (await path()).includes(`lecture=${ids.t2}`) && (await has('[data-quiz-card]')), 'Tema 2’s questions', 15000);
    const M = S30.selfTest.length;
    expect((await text('[data-review-progress="label"]')) === `Question 1 of ${M}`, `progress: ${await text('[data-review-progress="label"]')}`);
    await shot('review-plan-quiz-1280');
    for (let i = 0; i < M; i++) {
      await b.clickSelector('[aria-label="Next question"]');
      await b.sleep(250);
    }
    const row = await waitFor(async () => {
      const r = await reviewRow(ids.t2);
      return r?.last_reviewed_at ? r : null;
    }, 'Tema 2 reviewed in the database');
    expect(row.reps === 1, `the row: ${JSON.stringify(row)}`);
    await b.waitText('“Tema 2” reviewed', { exact: false, timeout: 5000 });
    await waitFor(async () => !(await has(`[data-id="${ids.t2}"]`)), 'Tema 2 leaves the card');
    report.push(`RESULT | Tema 2's ${M} questions finished: reviewed`);
  });

  await step('the lecture’s menu (the course page): Study reminders… on → Turn off: its switch off, the badge one less; UNDO: on again', async () => {
    await b.nav(`${BASE}/project/${math}`);
    await waitSplash();
    await waitFor(() => b.hasText('Tema 3', true), 'Tema 3’s tile', 20000);
    await waitFor(async () => (await badge()) === '3 due', async () => `the badge: ${await badge()}`, 15000);
    // The grid's tile (the sidebar's course tree lists it too; both menus are the same).
    await b.click('Tema 3', { button: 'right', exact: true, exclude: '[data-testid=sidebar]' });
    await b.waitText('Study reminders…', { exact: true, timeout: 5000 });
    await b.click('Study reminders…', { exact: true });
    await b.waitText('Study reminders are on', { exact: true, timeout: 8000 });
    expect(await b.hasText('comes up in Review today 1, 3, 7 and 21 days after the lecture, and before the exam.'), 'the dialog’s text');
    await shot('review-plan-reminders-dialog-1280');
    await b.click('Turn off', { exact: true });
    await waitFor(async () => (await ownSwitch(ids.t3)) === false, 'Tema 3’s switch off in the database');
    await waitFor(async () => (await badge()) === '2 due', async () => `the badge after Turn off: ${await badge()}`, 10000);
    await b.waitText('UNDO', { exact: true, timeout: 5000 });
    await b.click('UNDO', { exact: true });
    await waitFor(async () => (await ownSwitch(ids.t3)) === true, 'UNDO: on again');
    await waitFor(async () => (await badge()) === '3 due', async () => `the badge after Undo: ${await badge()}`, 10000);
  });

  await step('390 (iphone-10, iphone-01): the Library chip “Review today · 3”, Review “3 due today”, the card over Flashcards | Quiz me', async () => {
    await b.resize(390, 844);
    await b.nav(`${BASE}/library`);
    await waitSplash();
    await waitFor(() => b.hasText('Review today · 3', true), 'the Library chip', 15000);
    await shots('review-plan-library-390');
    await openReview();
    await waitFor(async () => (await text('[data-review="due"]')) === '3 due today', async () => `the header: ${await text('[data-review="due"]')}`, 10000);
    const titles = (await rows()).map((r) => r[2]);
    expect(JSON.stringify(titles) === JSON.stringify([ids.t1, ids.t3]), `rows at 390: ${JSON.stringify(await rows())}`);
    // The card is between the modes and the flashcard.
    const order = await b.evaluate(`(() => {
      const y = (css) => document.querySelector(css)?.getBoundingClientRect().top ?? -1;
      return [y('[aria-label="Flashcards"]'), y('[data-lectures="today"]'), y('[data-review-card], [data-review="done"]')];
    })()`);
    expect(order[0] < order[1] && order[1] < order[2], `order: ${JSON.stringify(order)}`);
    const wide = await b.evaluate('document.documentElement.scrollWidth');
    expect(wide <= 390, `the page is ${wide} px wide`);
    await shots('review-plan-390');
    await b.resize(1280, 900);
  });

  await step('the summarize panel (1280, desktop-02): the switch on after the choices; off + Save as course default; Generate: Tema 1 off in the database; the badge 2; 390 (iphone-05): a lecture following its course shows the default (off)', async () => {
    await openPanel(ids.t1);
    expect((await attr('[data-summarize="reminders"]', 'data-checked')) === 'true', 'the switch is not on');
    expect(await has('input[role="switch"][aria-label="Study reminders for this lecture"]'), 'the switch has no label');
    // After the panel's choices (the note on where it goes), before the footer.
    const order = await b.evaluate(`(() => {
      const y = (css) => document.querySelector(css)?.getBoundingClientRect().top ?? -1;
      return [y('[data-summarize="slider-followMarks"]'), y('[data-summarize="reminders"]')];
    })()`);
    expect(order[0] >= 0 && order[0] < order[1], `order: ${JSON.stringify(order)}`);
    await b.evaluate(`document.querySelector('[data-summarize="reminders"]').scrollIntoView({ block: 'center' })`);
    await shots('review-plan-panel-1280');
    await tap('input[role="switch"][aria-label="Study reminders for this lecture"]');
    await waitFor(async () => (await attr('[data-summarize="reminders"]', 'data-checked')) === 'false', 'the switch off');
    await tap('[data-summarize="save-default"]');
    await waitFor(async () => (await admin.from('course_settings').select('study_reminders').eq('course_id', math).single()).data?.study_reminders === false, 'Math’s default off in the database');
    expect((await text('[data-summarize="save-note"]')).includes('Saved as Math’s default'), `the note: ${await text('[data-summarize="save-note"]')}`);
    await tap('[data-summarize="generate"]');
    await waitFor(async () => (await ownSwitch(ids.t1)) === false, 'Tema 1’s switch off in the database', 15000);
    const req = (await admin.from('summaries').select('status').eq('file_id', ids.t1)).data ?? [];
    expect(req.length === 1 && req[0].status === 'pending', `the request: ${JSON.stringify(req)}`);
    await openLibrary();
    await waitFor(async () => (await badge()) === '2 due', async () => `the badge: ${await badge()} (Tema 3 keeps its own switch, and the card)`, 15000);
    // 390: the seed's Lecture 1 follows Math's default, now off.
    await b.resize(390, 844);
    await openPanel(data.lecture.id);
    expect((await attr('[data-summarize="reminders"]', 'data-checked')) === 'false', 'Lecture 1 doesn’t show Math’s default (off)');
    await b.evaluate(`document.querySelector('[data-summarize="reminders"]').scrollIntoView({ block: 'center' })`);
    await shots('review-plan-panel-390');
    await tap('[data-summarize="keep"]');
    await waitFor(async () => !(await has(PANEL)), 'the panel closed');
    expect((await ownSwitch(data.lecture.id)) === null, 'Cancel wrote the switch');
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites beside the mockups: desktop-04 (the sidebar), desktop-02 and iphone-05 (the panel), iphone-10 (Review), light and dark', async () => {
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
    await compose('review-plan-compose-sidebar', [['desktop-04 (mockup)', mock('desktop-04-library')], ['Library · light', shotOf('review-plan-library-1280')], ['Library · dark', shotOf('review-plan-library-1280-dark')], ['Review · Lectures today', shotOf('review-plan-1280')]], 640);
    await compose('review-plan-compose-panel', [['desktop-02 (mockup)', mock('desktop-02-stop-and-summarize')], ['Panel · light', shotOf('review-plan-panel-1280')], ['Panel · dark', shotOf('review-plan-panel-1280-dark')], ['Study reminders…', shotOf('review-plan-reminders-dialog-1280')]], 640);
    await compose('review-plan-compose-panel-iphone', [['iphone-05 (mockup)', mock('iphone-05-stop-and-summarize')], ['390 · light', shotOf('review-plan-panel-390')], ['390 · dark', shotOf('review-plan-panel-390-dark')]], 390);
    await compose('review-plan-compose-iphone', [['iphone-10 (mockup)', mock('iphone-10-review')], ['Review 390 · light', shotOf('review-plan-390')], ['Review 390 · dark', shotOf('review-plan-390-dark')], ['iphone-01 (mockup)', mock('iphone-01-library')], ['Library 390', shotOf('review-plan-library-390')]], 390);
    await b.resize(1280, 900);
    const wanted = ['review-plan-library-1280', 'review-plan-1280', 'review-plan-panel-1280', 'review-plan-panel-390', 'review-plan-390', 'review-plan-library-390'];
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
