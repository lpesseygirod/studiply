// course-settings.mjs — step 9.2-2, a course's settings, in Chrome against local Supabase (migration
// 20261029152700 applied; no new one). NO paid call, no AI request (checked at the end).
//
// The library seeded (Math, the seed's course; lectures dated by recorded_at, n days ago):
//   Tema 1 (1 day ago: its Day 1 today, so Review today is 1), Tema 0 · old (30 days ago: its last
//   session lapsed; with an exam tomorrow, the day before the exam is today), the seed's Lecture 1 (today).
//
// Steps:
//   1. Opening (1280): "Course settings…" in the course's menu (the Library tile's right-click) opens
//      /course-settings/<id> beside the sidebar: "‹ Math", "Course settings", EXAM · REVIEW PLAN ·
//      SUMMARIES, no subject type; the preview lists the course's lectures, newest first.
//   2. The exam date (the month calendar): tomorrow → saved; the calendar's day selected; the plan
//      follows at once (plan-9.2 §1: an exam tomorrow → one session, today, for every lecture before
//      it): Tema 1, Tema 0 and the seed's Lecture 1 (made today: L = today, E−1 = today) all have
//      "Day before the exam" today, so the sidebar badge is 3; Review's lectures card lists them.
//   3. BUILD-PLAN's check: an exam two weeks away → Tema 1's preview changes from today · +2 · +6 · +20
//      to today · +2 · +7 (a week before) · +13 (the day before); the rule line says so.
//   4. Clear exam date → none in the database; the preview back to 1 · 3 · 7 · 21; the badge 1.
//   5. Exam format (radios: Essay, then Not set) and Summary language (Spanish, then each lecture's own),
//      each saved on its own, with its checked state.
//   6. The course's study reminders default off → saved; every lecture without its own choice "Study
//      reminders off" in the preview; the badge gone (0); on again.
//   7. The 10 slider defaults: the preset Exam tomorrow → saved (shortly after); the summarize panel of
//      Tema 1 starts with them; Reset → the spec's defaults again.
//   8. Names and states: every button, radio and switch on the page has a name; radios aria-checked;
//      the two expanding rows aria-expanded; calendar days named "Monday 9 November 2026", the chosen
//      one aria-selected.
//   9. Offline (1280): opened from the course menu while offline: "Course settings need a connection",
//      nothing to change.
//  10. 390 (iphone-07's look): long-press Math in the Library → Course settings…: the page, the calendar
//      open, the sliders; nothing wider than the screen.
//  11. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//  12. Composites: desktop-05 beside 1280 light / dark (top, the calendar, the sliders); iphone-07 beside
//      390 light / dark.
//
// The run always ends (its Chrome closed, the test user dropped, the process exits), also after
// failures, when stopped, or after 12 minutes.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start` (migrations applied):
//   node .claude/skills/web-check/scripts/course-settings.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node course-settings.mjs
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
    await b.shot(`fail-course-settings-${results.length}`).catch(() => {});
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

const MIN = 60_000;
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
/** A local calendar day n days from today, "YYYY-MM-DD" (the app's days are local too). */
const dayIn = (n) => {
  const t = new Date();
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const SLIDER_ORDER = ['startingPoint', 'length', 'depth', 'examples', 'visuals', 'examFocus', 'selfTest', 'language', 'extraResources', 'followMarks'];
const COLUMNS = ['slider_starting_point', 'slider_length', 'slider_depth', 'slider_examples', 'slider_visuals', 'slider_exam_focus', 'slider_self_test', 'slider_language', 'slider_extra_resources', 'slider_follow_marks'];
const EXAM_TOMORROW = [5, 4, 5, 4, 4, 10, 10, 7, 6, 9];
const DEFAULTS = [2, 5, 6, 5, 4, 5, 5, 4, 6, 7];

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
  console.error('course-settings.mjs: still running after 12 minutes; stopping');
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
const scrollTo = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.scrollIntoView({ block: 'start' })`);

const PAGE = '[data-course-settings="page"]';
const settingsRow = async () => (await admin.from('course_settings').select('*').eq('course_id', data.course.id).single()).data;
const badge = () => b.evaluate(`document.querySelector('[data-testid="sidebar"] [aria-label$=" due"]')?.getAttribute('aria-label') ?? null`);
/** A lecture's preview: its upcoming days ("off" when its study reminders are off). */
const previewDays = (id) => attr(`[data-course-settings="plan-lecture"][data-id="${id}"]`, 'data-days');
const loaded = () => waitFor(() => has('[data-course-settings="exam-date"]'), 'the course settings', 20000);
/** Opens the course's menu on its Library tile (right-click, or a long press at 390) and picks Course settings…. */
const openFromMenu = async ({ hold = false } = {}) => {
  await b.nav(`${BASE}/library`);
  await waitSplash();
  await waitFor(() => b.hasText('Math', true), 'the Library', 20000);
  await b.sleep(800);
  await b.click('Math', hold ? { holdMs: 800, exclude: '[data-testid=sidebar]' } : { button: 'right', exclude: '[data-testid=sidebar]' });
  await b.waitText('Course settings…', { exact: true, timeout: 5000 });
  await b.click('Course settings…', { exact: true });
};
/** The calendar open, at the day's month, then the day chosen. */
const pickDay = async (day) => {
  if (!(await has('[data-calendar="month"]'))) await tap('[data-course-settings="exam-date"]');
  await waitFor(() => has('[data-calendar="month"]'), 'the calendar');
  for (let i = 0; i < 30; i++) {
    const month = await attr('[data-calendar="month"]', 'data-month');
    if (month === day.slice(0, 7)) break;
    await tap(month < day.slice(0, 7) ? '[data-calendar="next"]' : '[data-calendar="previous"]');
    await b.sleep(150);
  }
  await tap(`[data-day="${day}"]`);
};

const ids = {};
try {
  const lecture = async (key, title, recorded) => {
    const { data: file, error } = await user.client.from('files').insert({ kind: 'lecture', title, course_id: data.course.id }).select().single();
    if (error) throw new Error(`${title}: ${error.message}`);
    const l = await user.client.from('lectures').insert({ id: file.id, status: 'ready', duration_ms: 30 * MIN, recorded_at: recorded });
    if (l.error) throw new Error(`${title}: ${l.error.message}`);
    ids[key] = file.id;
  };
  await lecture('t1', 'Tema 1', daysAgo(1));
  await lecture('t0', 'Tema 0 · old', daysAgo(30));
  ids.l1 = data.lecture.id;
  await b.signIn(BASE, user.email, user.password);
  await b.resize(1280, 900);

  const standard = [dayIn(0), dayIn(2), dayIn(6), dayIn(20)].join(',');

  await step('opening (1280): Course settings… in the course’s menu; ‹ Math, the title, three sections, no subject type; the preview, newest first', async () => {
    await openFromMenu();
    await waitFor(async () => (await path()).startsWith(`/course-settings/${data.course.id}`), async () => `at ${await path()}`, 10000);
    await loaded();
    expect(await has('[data-testid="sidebar"]'), 'no sidebar beside it');
    expect(await b.hasText('Course settings', true), 'no title');
    expect(await has('[aria-label="Back to Math"]'), 'no ‹ Math');
    for (const h of ['EXAM', 'REVIEW PLAN', 'SUMMARIES']) expect(await b.hasText(h, true), `no ${h}`);
    const all = await b.evaluate(`document.querySelector(${JSON.stringify(PAGE)}).innerText`);
    expect(!/subject/i.test(all), 'a subject type is shown');
    const order = await b.evaluate(`[...document.querySelectorAll('[data-course-settings="plan-lecture"]')].map((e) => e.getAttribute('data-id'))`);
    expect(JSON.stringify(order) === JSON.stringify([ids.l1, ids.t1, ids.t0]), `preview order: ${JSON.stringify(order)}`);
    expect((await previewDays(ids.t1)) === standard, `Tema 1: ${await previewDays(ids.t1)}`);
    expect((await previewDays(ids.t0)) === '', `Tema 0: ${await previewDays(ids.t0)}`);
    await waitFor(async () => (await badge()) === '1 due', async () => `the badge: ${await badge()}`);
    await shots('course-settings-1280');
  });

  await step('the exam date (the calendar): tomorrow → saved, selected; at once the plan follows: the day before the exam is today for all three lectures, the badge 3, Review’s card', async () => {
    const tomorrow = dayIn(1);
    await pickDay(tomorrow);
    await waitFor(async () => (await settingsRow()).exam_date === tomorrow, async () => `exam_date: ${(await settingsRow()).exam_date}`);
    expect((await attr(`[data-day="${tomorrow}"]`, 'aria-selected')) === 'true', 'the chosen day isn’t selected');
    expect((await attr('[data-course-settings="exam-date"]', 'aria-expanded')) === 'true', 'the row isn’t expanded');
    // An exam tomorrow: one session, today, for every lecture before it (the made-today Lecture 1 too).
    for (const [key, name] of [['t0', 'Tema 0'], ['t1', 'Tema 1'], ['l1', 'Lecture 1']]) {
      await waitFor(async () => (await previewDays(ids[key])) === dayIn(0), async () => `${name}: ${await previewDays(ids[key])}`);
    }
    await waitFor(async () => (await badge()) === '3 due', async () => `the badge: ${await badge()}`);
    await scrollTo('[data-calendar="month"]');
    await shots('course-settings-calendar-1280');
    await b.nav(`${BASE}/review`);
    await waitSplash();
    await waitFor(() => has(`[data-lectures="row"][data-id="${ids.t0}"]`), 'Tema 0 in Review’s card', 20000);
    const rows = await b.evaluate(`[...document.querySelectorAll('[data-lectures="row"]')].map((r) => [r.getAttribute('data-id'), r.querySelector('[data-lectures="detail"]')?.textContent ?? ''])`);
    expect(rows.length === 3 && rows.every(([, d]) => d === 'Math · Day before the exam'), `the card: ${JSON.stringify(rows)}`);
    expect(JSON.stringify(rows.map(([id]) => id).sort()) === JSON.stringify([ids.l1, ids.t0, ids.t1].sort()), `the card: ${JSON.stringify(rows)}`);
  });

  await step('BUILD-PLAN: an exam two weeks away changes the plan (Tema 1: today · +2 · +7 a week before · +13 the day before)', async () => {
    await b.nav(`${BASE}/course-settings/${data.course.id}`);
    await waitSplash();
    await loaded();
    const exam = dayIn(14);
    await pickDay(exam);
    await waitFor(async () => (await settingsRow()).exam_date === exam, 'the exam date two weeks away');
    const want = [dayIn(0), dayIn(2), dayIn(7), dayIn(13)].join(',');
    await waitFor(async () => (await previewDays(ids.t1)) === want, async () => `Tema 1: ${await previewDays(ids.t1)} (was ${standard})`);
    expect(want !== standard, 'the plan did not change');
    const line = await text(`[data-course-settings="plan-lecture"][data-id="${ids.t1}"]`);
    expect(line.includes('(a week before the exam)') && line.includes('(day before the exam)'), `the line: ${line}`);
    expect((await text('[data-course-settings="rule"]')).includes('a week before the exam and the day before'), 'the rule line');
    await scrollTo('[data-course-settings="plan"]');
    await shots('course-settings-plan-1280');
    report.push(`RESULT | Tema 1's plan: ${standard} → ${want} (an exam on ${exam})`);
  });

  await step('Clear exam date: none in the database; the preview back to 1 · 3 · 7 · 21; the badge 1', async () => {
    await tap('[data-course-settings="clear-exam"]');
    await waitFor(async () => (await settingsRow()).exam_date === null, 'exam_date cleared');
    await waitFor(async () => (await previewDays(ids.t1)) === standard, async () => `Tema 1: ${await previewDays(ids.t1)}`);
    await waitFor(async () => (await badge()) === '1 due', async () => `the badge: ${await badge()}`);
    expect((await text('[data-course-settings="exam-date"]')).includes('Not set'), 'the row doesn’t say Not set');
  });

  await step('exam format and summary language: each saved on its own, checked', async () => {
    await tap('[data-course-settings="exam-format-essay"]');
    await waitFor(async () => (await settingsRow()).exam_format === 'essay', 'exam_format essay');
    expect((await attr('[data-course-settings="exam-format-essay"]', 'aria-checked')) === 'true', 'Essay not checked');
    expect((await attr('[data-course-settings="exam-format-none"]', 'aria-checked')) === 'false', 'Not set still checked');
    await tap('[data-course-settings="exam-format-none"]');
    await waitFor(async () => (await settingsRow()).exam_format === null, 'exam_format cleared');
    await tap('[data-course-settings="language"]');
    await waitFor(() => has('[data-course-settings="language-es"]'), 'the languages');
    expect((await attr('[data-course-settings="language"]', 'aria-expanded')) === 'true', 'the language row isn’t expanded');
    await tap('[data-course-settings="language-es"]');
    await waitFor(async () => (await settingsRow()).summary_language === 'es', 'summary_language es');
    expect((await attr('[data-course-settings="language-es"]', 'aria-checked')) === 'true', 'Spanish not checked');
    expect((await text('[data-course-settings="language"]')).includes('Spanish'), 'the row doesn’t say Spanish');
    await tap('[data-course-settings="language-own"]');
    await waitFor(async () => (await settingsRow()).summary_language === null, 'summary_language: each lecture’s own');
    const row = await settingsRow();
    expect(row.exam_date === null && row.exam_format === null, `other fields changed: ${JSON.stringify(row)}`);
  });

  await step('the study reminders default: off → saved; lectures without their own choice off in the preview; the badge gone; on again', async () => {
    const sw = 'input[role="switch"][aria-label="Study reminders for this course’s lectures"]';
    await tap(sw);
    await waitFor(async () => (await settingsRow()).study_reminders === false, 'study_reminders off');
    await waitFor(async () => (await previewDays(ids.t1)) === 'off', async () => `Tema 1: ${await previewDays(ids.t1)}`);
    expect(await b.hasText('Study reminders off', true), 'no "Study reminders off"');
    await waitFor(async () => (await badge()) === null, async () => `the badge: ${await badge()}`);
    await tap(sw);
    await waitFor(async () => (await settingsRow()).study_reminders === true, 'study_reminders on again');
    await waitFor(async () => (await badge()) === '1 due', async () => `the badge: ${await badge()}`);
  });

  await step('the 10 slider defaults: Exam tomorrow → saved; Tema 1’s summarize panel starts with them; Reset → the spec’s', async () => {
    await tap('[data-course-settings="preset-examTomorrow"]');
    await waitFor(async () => {
      const r = await settingsRow();
      return JSON.stringify(COLUMNS.map((k) => r[k])) === JSON.stringify(EXAM_TOMORROW);
    }, async () => {
      const r = await settingsRow();
      return `sliders saved: ${JSON.stringify(COLUMNS.map((k) => r[k]))}`;
    }, 8000);
    const shown = await b.evaluate(`${JSON.stringify(SLIDER_ORDER)}.map((k) => document.querySelector('[data-course-settings="slider-' + k + '"]')?.getAttribute('data-value'))`);
    expect(JSON.stringify(shown.map(Number)) === JSON.stringify(EXAM_TOMORROW), `shown: ${JSON.stringify(shown)}`);
    await scrollTo('[data-course-settings="slider-startingPoint"]');
    await shots('course-settings-sliders-1280');
    await b.nav(`${BASE}/doc/${ids.t1}?tab=summary&summarize=1&at=${Date.now()}`);
    await waitFor(() => has('[data-summarize="slider-followMarks"]'), 'Tema 1’s summarize panel', 25000);
    await waitSplash();
    const panel = await b.evaluate(`${JSON.stringify(SLIDER_ORDER)}.map((k) => Number(document.querySelector('[data-summarize="slider-' + k + '"]')?.getAttribute('data-value')))`);
    expect(JSON.stringify(panel) === JSON.stringify(EXAM_TOMORROW), `the panel starts with ${JSON.stringify(panel)}`);
    expect((await attr('[data-summarize="reminders"]', 'data-checked')) === 'true', 'the panel’s study reminders aren’t the course’s (on)');
    await tap('[data-summarize="keep"]');
    await b.nav(`${BASE}/course-settings/${data.course.id}`);
    await waitSplash();
    await loaded();
    await tap('[data-course-settings="preset-reset"]');
    await waitFor(async () => {
      const r = await settingsRow();
      return JSON.stringify(COLUMNS.map((k) => r[k])) === JSON.stringify(DEFAULTS);
    }, 'Reset saved', 8000);
  });

  await step('names and states: every control named; radios checked or not; rows expanded; calendar days named, the chosen one selected', async () => {
    await pickDay(dayIn(10));
    await waitFor(async () => (await settingsRow()).exam_date === dayIn(10), 'a date for the check');
    const found = await b.evaluate(`(() => {
      const page = document.querySelector(${JSON.stringify(PAGE)});
      const controls = [...page.querySelectorAll('[role=button], [role=radio], [role=switch], button, [role=slider]')];
      const unnamed = controls.filter((e) => !(e.getAttribute('aria-label') || e.innerText.trim())).map((e) => e.outerHTML.slice(0, 120));
      const radios = [...page.querySelectorAll('[role=radio]')];
      const noState = radios.filter((e) => !['true', 'false'].includes(e.getAttribute('aria-checked'))).length;
      const days = [...page.querySelectorAll('[data-day]')];
      const badDay = days.filter((e) => !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \\d{1,2} [A-Z][a-z]+ \\d{4}$/.test(e.getAttribute('aria-label') ?? '')).length;
      const selected = days.filter((e) => e.getAttribute('aria-selected') === 'true').map((e) => e.getAttribute('data-day'));
      return { controls: controls.length, unnamed, radios: radios.length, noState, days: days.length, badDay, selected };
    })()`);
    expect(found.controls > 20 && found.unnamed.length === 0, `unnamed: ${JSON.stringify(found.unnamed)}`);
    expect(found.radios >= 6 && found.noState === 0, `radios: ${JSON.stringify(found)}`);
    expect(found.days >= 28 && found.badDay === 0, `days: ${JSON.stringify(found)}`);
    expect(JSON.stringify(found.selected) === JSON.stringify([dayIn(10)]), `selected: ${JSON.stringify(found.selected)}`);
    for (const label of ['Previous month', 'Next month']) expect(await has(`[aria-label="${label}"]`), `no ${label}`);
    await tap('[data-course-settings="clear-exam"]');
    await waitFor(async () => (await settingsRow()).exam_date === null, 'cleared after the check');
    report.push(`RESULT | ${found.controls} controls named, ${found.radios} radios with their state, ${found.days} days named`);
  });

  await step('offline (1280): opened from the course menu, “Course settings need a connection”; nothing to change', async () => {
    await b.nav(`${BASE}/library`);
    await waitSplash();
    await waitFor(() => b.hasText('Math', true), 'the Library', 20000);
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    try {
      await b.click('Math', { button: 'right', exclude: '[data-testid=sidebar]' });
      await b.waitText('Course settings…', { exact: true, timeout: 5000 });
      await b.click('Course settings…', { exact: true });
      // The web learns it is offline from the request that fails.
      await waitFor(() => has('[data-course-settings="offline"]'), 'the offline line', 20000);
      expect(await b.hasText('Course settings need a connection', true), 'no offline line');
      expect(!(await has('[data-course-settings="exam-date"]')) && !(await has('[role="switch"]')) && !(await has('[data-calendar="month"]')), 'something to change offline');
      await shots('course-settings-offline-1280');
    } finally {
      await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
  });

  await step('390 (iphone-07’s look): a long press on Math → Course settings…; the page, the calendar, the sliders; nothing wider than the screen', async () => {
    await b.resize(390, 844);
    await openFromMenu({ hold: true });
    await waitFor(async () => (await path()).startsWith(`/course-settings/${data.course.id}`), async () => `at ${await path()}`, 10000);
    await loaded();
    await shots('course-settings-390');
    await tap('[data-course-settings="exam-date"]');
    await waitFor(() => has('[data-calendar="month"]'), 'the calendar at 390');
    await scrollTo('[data-calendar="month"]');
    await shots('course-settings-calendar-390');
    await scrollTo('[data-course-settings="slider-startingPoint"]');
    await shots('course-settings-sliders-390');
    const wide = await b.evaluate('document.documentElement.scrollWidth');
    expect(wide <= 390, `the page is ${wide} px wide`);
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites: desktop-05 beside 1280 light and dark; iphone-07 beside 390 light and dark', async () => {
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
    await compose('course-settings-compose-1280', [['desktop-05 (mockup)', mock('desktop-05-settings')], ['Course settings · light', shotOf('course-settings-1280')], ['dark', shotOf('course-settings-1280-dark')], ['The calendar', shotOf('course-settings-calendar-1280')]], 640);
    await compose('course-settings-compose-1280-more', [['The plan (exam in 2 weeks)', shotOf('course-settings-plan-1280')], ['dark', shotOf('course-settings-plan-1280-dark')], ['The sliders', shotOf('course-settings-sliders-1280')], ['Offline', shotOf('course-settings-offline-1280')]], 640);
    await compose('course-settings-compose-390', [['iphone-07 (mockup)', mock('iphone-07-settings')], ['390 · light', shotOf('course-settings-390')], ['390 · dark', shotOf('course-settings-390-dark')], ['The calendar', shotOf('course-settings-calendar-390')], ['The sliders', shotOf('course-settings-sliders-390')]], 390);
    await b.resize(1280, 900);
    const wanted = ['course-settings-1280', 'course-settings-1280-dark', 'course-settings-calendar-1280', 'course-settings-plan-1280', 'course-settings-sliders-1280', 'course-settings-offline-1280', 'course-settings-390', 'course-settings-390-dark', 'course-settings-calendar-390', 'course-settings-sliders-390'];
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
