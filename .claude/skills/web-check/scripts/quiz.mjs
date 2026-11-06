// quiz.mjs — step 9.1b-1, Create a quiz: the New quiz panel and the Quiz me tab's quizzes, in Chrome
// against local Supabase (the migration 20261029152100_quizzes applied). NO AI call: 9.1b-1 calls no
// function; every /functions/v1/* request the page makes is answered in the page anyway (and listed),
// and the last step checks nothing reached the quiz function or Anthropic.
//
// The material: Math (the test user's course) with Lecture 1 (30 min, transcribed, a finished summary
// — the 30-min synthetic lecture's, src/test-utils/summary-synthetic-30.json — an Exam 9 and a
// Confused 7 mark), Lecture 2 in the folder Funcions (45 min, transcribed, no summary, an Exam 8
// mark), Lecture 3 (not transcribed), and a library PDF "Apuntes.pdf".
//
// Steps:
//   1. Laptop (1280), Review → Quiz me → + New quiz: the centred panel (desktop-02's frame) on Math:
//      "New quiz", the counts line, Whole course with Lecture 1 and Lecture 2 ticked, Lecture 3 greyed
//      ("No transcript yet"); My notes and marks always included; the 10 sliders at the defaults
//      (every slider 5, Number of questions 2); the preview line equal to the calculator's
//      (supabase/functions/_shared/quiz-plan.ts, loaded here: Node strips its types).
//   2. The preview follows the calculator: a lecture unticked (the counts line too), a question type
//      unticked, the preset Exam tomorrow (its values on the sliders; Exam focus 10's notice when
//      too few moments are flagged).
//   3. + From my library adds Apuntes.pdf; + Upload past exam uploads a PDF into the course (a files
//      row) and shows it with "Format read in a later update"; the choices (a total time limit with
//      the calculator's estimate, pass/fail at 70 %, no hints); Save as course default writes the
//      course's quiz_* values.
//   4. Create quiz: the panel closes; a pending `quizzes` row with its settings (sliders, choices,
//      topic, resources, past exam) and plan (the calculator's), its question count, its sources
//      (2 lectures, 1 resource, 1 past exam); Quiz me lists it first: "25 questions · Saved ·
//      written in a later update", Take greyed; no function was called.
//   5. Delete with Undo: … → Delete quiz; the row leaves the list (deleted_at set); Undo brings it back.
//   6. 390 (iphone-05): + New quiz opens the full-screen sheet: one column of sliders, the presets as
//      chips that scroll, Save as course default after the sliders, Cancel · Create quiz at the
//      bottom; a quiz of Lecture 1 only; the list newest first.
//   7. No request reached the quiz function or Anthropic, and the page never asked for the quiz
//      function (any other function request, answered in the page, is listed in the report).
//   8. Composites beside the mockups, light and dark: quiz-compose-panel-1280 (desktop-02),
//      quiz-compose-panel-390 (iphone-05).
//
// The run always ends (its Chrome closed, the process exits), also after failures, when stopped, or
// after 15 minutes.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start` (migrations applied):
//   node .claude/skills/web-check/scripts/quiz.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node quiz.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, OUT, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
// The app's own calculator (TypeScript without imports; Node 22.18+ strips the types).
const { planQuiz, DEFAULT_TYPES, QUIZ_SLIDER_DEFAULTS, QUIZ_PRESETS, QUIZ_SLIDER_KEYS } = await import(pathToFileURL(join(repo, 'supabase/functions/_shared/quiz-plan.ts')).href);

const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-quiz-${results.length}`).catch(() => {});
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
/** JSON with every object's keys sorted: jsonb keeps its own key order, so rows are compared this way. */
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))) : x));
const quizCalls = async () => ((await b.evaluate('window.__functionCalls').catch(() => [])) ?? []).filter((u) => /\/functions\/v1\/quiz\b/.test(u));
const S30 = JSON.parse(readFileSync(join(repo, 'src/test-utils/summary-synthetic-30.json'), 'utf8')).result;
const SUMMARY_SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };

/**
 * Before the app: every Edge Function request is answered in the page (an empty 200) and listed, so
 * nothing reaches a function even if one were called (9.1b-1 calls none: step 7 checks the list).
 */
const PAGE_SETUP = `(() => {
  const realFetch = window.fetch.bind(window);
  window.__functionCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/')) {
      window.__functionCalls.push(url);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

const user = await makeUser();
const data = await seed(user.client);
const L1 = data.lecture.id;
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
  console.error('quiz.mjs: still running after 15 minutes; stopping');
  void finish(1);
}, 15 * MIN);
watchdog.unref();

const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const count = (css) => b.evaluate(`document.querySelectorAll(${JSON.stringify(css)}).length`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
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
const PANEL = '[data-newquiz="panel"]';
const openQuizTab = async () => {
  await b.nav(`${BASE}/review?mode=quiz&at=${Date.now()}`);
  await waitSplash();
  await waitFor(() => has('[data-quizzes="new"]'), '+ New quiz in the Quiz me tab', 20000);
  await b.sleep(500);
};
const openPanel = async () => {
  await b.clickSelector('[data-quizzes="new"]');
  await waitFor(() => has(PANEL), 'the New quiz panel', 8000);
  await waitFor(() => has('[data-newquiz="preview"]'), async () => `the preview line (panel: ${(await text(PANEL)).slice(0, 300)})`, 20000);
  await b.sleep(400);
};
const sliderValues = () => b.evaluate(`Object.fromEntries([...document.querySelectorAll('[data-newquiz^="slider-"]')].map((e) => [e.getAttribute('data-newquiz').slice(7), Number(e.getAttribute('data-value'))]))`);
const checked = (css) => attr(css, 'data-checked').then((v) => v === 'true');
const scrollPanelTo = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.scrollIntoView({ block: 'start' })`);
/**
 * A click on an element of the panel, scrolled into view first: clickSelector clicks where the element
 * is, also outside the panel's scroll area (the first run's type chip was below it: the click missed).
 */
const tap = async (css) => {
  const found = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  if (!found) throw new Error(`no element: ${css}`);
  await b.sleep(250);
  await b.clickSelector(css);
};
/** The preset steps 2–6 use (a constant: a failed step 2 no longer leaves the later steps without it). */
const preset = QUIZ_PRESETS.examTomorrow.sliders;

let L2 = null;
let L3 = null;
let apuntes = null;
// What the panel gives the calculator for the whole course (Lecture 1 and 2).
const calc1 = S30.modulesUsed.some((m) => ['formula', 'workedExample', 'keyFigures'].includes(m)) || ['math', 'finance', 'science', 'programming'].includes(S30.subjectType);
const flaggedSpans = S30.examSignals.length + 1; // Lecture 1's summary's signals; Lecture 2 (no summary): its Exam mark.
const input = (over = {}) => ({
  sliders: QUIZ_SLIDER_DEFAULTS,
  types: DEFAULT_TYPES,
  pastExam: null,
  // No subject set: Lecture 1's summary decides (Lecture 2 has none).
  hasCalculations: calc1,
  lectures: [
    { id: L1, durationMs: 30 * MIN },
    { id: L2, durationMs: 45 * MIN },
  ],
  flaggedSpans,
  weakSpots: 1, // Lecture 1's Confused mark
  pendingWrong: 0,
  wrongComeBack: true,
  ...over,
});
const previewIs = async (plan, what) => {
  await waitFor(async () => (await text('[data-newquiz="preview"]')) === plan.preview, async () => `${what}: preview "${await text('[data-newquiz="preview"]')}", calculator "${plan.preview}"`, 5000);
  const notice = await text('[data-newquiz="notice"]');
  expect(notice === (plan.notice ?? ''), `${what}: notice "${notice}", calculator "${plan.notice ?? ''}"`);
};

try {
  // The material (as the student: RLS applies; the summary row as the server writes it).
  await admin.from('lectures').update({ duration_ms: 30 * MIN, status: 'ready' }).eq('id', L1);
  const f2 = await user.client.from('files').insert({ kind: 'lecture', title: 'Lecture 2', course_id: data.course.id, folder_id: data.folder.id }).select('id').single();
  if (f2.error) throw new Error(`Lecture 2: ${f2.error.message}`);
  L2 = f2.data.id;
  await user.client.from('lectures').insert({ id: L2, status: 'ready', duration_ms: 45 * MIN });
  const f3 = await user.client.from('files').insert({ kind: 'lecture', title: 'Lecture 3', course_id: data.course.id }).select('id').single();
  if (f3.error) throw new Error(`Lecture 3: ${f3.error.message}`);
  L3 = f3.data.id;
  await user.client.from('lectures').insert({ id: L3, status: 'draft', duration_ms: 0 });
  for (const [lecture, words] of [
    [L1, 'La profesora explica las cinco preguntas de la Psicobiología.'],
    [L2, 'El valor actual neto descuenta los flujos de caja.'],
  ]) {
    const { error } = await user.client.from('transcript_segments').insert({ lecture_id: lecture, start_ms: 0, end_ms: 6000, text: words });
    if (error) throw new Error(`a transcript: ${error.message}`);
  }
  const marks = await user.client.from('marks').insert([
    { lecture_id: L1, type: 'exam', level: 9, t_ms: 400000 },
    { lecture_id: L1, type: 'confused', level: 7, t_ms: 900000 },
    { lecture_id: L2, type: 'exam', level: 8, t_ms: 600000 },
  ]);
  if (marks.error) throw new Error(`the marks: ${marks.error.message}`);
  const summary = await admin.from('summaries').insert({
    user_id: user.id,
    file_id: L1,
    mode: 'new',
    source_lecture_ids: [L1],
    sliders: SUMMARY_SLIDERS,
    status: 'done',
    result: S30,
    applied_settings: { targetWords: 600, takeaways: 4, selfTestCount: S30.selfTest.length, resources: { slides: false, photos: false, assistant: true, notes: true }, preview: '≈ 600 words' },
    model: 'claude-opus-5-5',
  });
  if (summary.error) throw new Error(`the summary: ${summary.error.message}`);
  const pdf = await user.client.from('files').insert({ kind: 'pdf', title: 'Apuntes.pdf', course_id: data.course.id }).select('id').single();
  if (pdf.error) throw new Error(`Apuntes.pdf: ${pdf.error.message}`);
  apuntes = pdf.data.id;
  // A past exam to upload (a one-page PDF).
  const dir = join(OUT, 'quiz-check');
  mkdirSync(dir, { recursive: true });
  const examPdf = join(dir, 'Parcial 2024.pdf');
  writeFileSync(examPdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

  await b.signIn(BASE, user.email, user.password);
  await b.resize(1280, 900);

  await step('laptop: Review → Quiz me → + New quiz: the centred panel on Math, the counts, Whole course (Lecture 3 greyed), notes always in, the 10 sliders at the defaults, the calculator’s preview', async () => {
    await openQuizTab();
    expect((await count('[data-quizzes="row"]')) === 0, 'quizzes listed before any was made');
    await openPanel();
    expect((await attr(PANEL, 'data-layout')) === 'card', `layout: ${await attr(PANEL, 'data-layout')}`);
    const box = await b.evaluate(`(() => { const r = document.querySelector('${PANEL}').getBoundingClientRect(); return { x: r.x, w: r.width }; })()`);
    expect(Math.abs(box.x + box.w / 2 - 640) < 4 && box.w <= 860, `the panel's place: ${JSON.stringify(box)}`);
    expect((await text(PANEL)).includes('New quiz'), 'no title');
    const counts = await text('[data-newquiz="counts"]');
    expect(counts === 'Math · 2 lectures · 1 h 15 min · 3 marks (2 Exam · 1 Confused)', `counts: ${counts}`);
    expect(await checked('[data-newquiz="course"][data-key="' + data.course.id + '"]'), 'Math not chosen');
    expect(await checked('[data-newquiz="whole-course"]'), 'Whole course not ticked');
    expect((await checked(`[data-newquiz="lecture"][data-id="${L1}"]`)) && (await checked(`[data-newquiz="lecture"][data-id="${L2}"]`)), 'Lecture 1 and 2 not ticked');
    expect(!(await checked(`[data-newquiz="lecture"][data-id="${L3}"]`)), 'Lecture 3 ticked');
    expect((await attr(`[data-newquiz="lecture"][data-id="${L3}"]`, 'aria-disabled')) === 'true' && (await text(`[data-newquiz="lecture"][data-id="${L3}"]`)).includes('No transcript yet'), 'Lecture 3 not greyed');
    expect((await has('[data-newquiz="folder"]')) && (await text('[data-newquiz="folder"]')).includes('Funcions'), 'no folder row');
    expect((await text('[data-newquiz="resource-notes"]')).includes('Always included'), 'My notes and marks not always included');
    expect((await attr('[data-newquiz="resource-notes"]', 'aria-disabled')) === 'true', 'My notes and marks can be unticked');
    expect((await text('[data-newquiz="resource-summaries"]')).includes('1 of 2 lectures have one'), `summaries: ${await text('[data-newquiz="resource-summaries"]')}`);
    const values = await sliderValues();
    expect(QUIZ_SLIDER_KEYS.every((k) => values[k] === QUIZ_SLIDER_DEFAULTS[k]) && Object.keys(values).length === 10, `sliders: ${JSON.stringify(values)}`);
    expect((await text(PANEL)).includes('1 · gentle') && (await text(PANEL)).includes('10 · 50 questions'), 'the sliders’ labelled ends');
    const plan = planQuiz(input());
    await previewIs(plan, 'the defaults');
    expect(plan.preview.startsWith('10 questions · '), plan.preview);
    expect((await attr('[data-newquiz="create"]', 'aria-disabled')) !== 'true', 'Create quiz greyed');
    report.push(`RESULT | the defaults: ${plan.preview}`);
    await shots('quiz-panel-1280');
    await scrollPanelTo('[data-newquiz="slider-difficulty"]');
    await shots('quiz-panel-1280-sliders');
    await scrollPanelTo('[data-newquiz="whole-course"]');
  });

  await step('the preview follows the calculator: a lecture unticked (and the counts), a type unticked, the preset Exam tomorrow', async () => {
    await tap(`[data-newquiz="lecture"][data-id="${L2}"]`);
    await waitFor(async () => !(await checked('[data-newquiz="whole-course"]')), 'Whole course unticked');
    expect((await text('[data-newquiz="counts"]')) === 'Math · 1 lecture · 30 min · 2 marks (1 Exam · 1 Confused)', `counts: ${await text('[data-newquiz="counts"]')}`);
    await previewIs(planQuiz(input({ lectures: [{ id: L1, durationMs: 30 * MIN }], flaggedSpans: S30.examSignals.length })), 'Lecture 1 only');
    await tap('[data-newquiz="whole-course"]');
    await waitFor(() => checked(`[data-newquiz="lecture"][data-id="${L2}"]`), 'Lecture 2 ticked again');
    await previewIs(planQuiz(input()), 'the whole course again');

    await tap('[data-newquiz="type"][data-key="true_false"]');
    await waitFor(async () => !(await checked('[data-newquiz="type"][data-key="true_false"]')), 'true/false unticked');
    const types = DEFAULT_TYPES.filter((t) => t !== 'true_false');
    await previewIs(planQuiz(input({ types })), 'without true/false');

    await tap('[data-newquiz="preset-examTomorrow"]');
    await waitFor(async () => (await sliderValues()).examFocus === 10, 'the preset on the sliders');
    const values = await sliderValues();
    expect(QUIZ_SLIDER_KEYS.every((k) => values[k] === preset[k]), `sliders after Exam tomorrow: ${JSON.stringify(values)}`);
    const plan = planQuiz(input({ types, sliders: preset }));
    await previewIs(plan, 'Exam tomorrow');
    report.push(`RESULT | Exam tomorrow: ${plan.preview}${plan.notice ? ` (${plan.notice})` : ''}`);
  });

  let pastExam = null;
  await step('+ From my library adds Apuntes.pdf; + Upload past exam uploads a PDF into the course ("Format read in a later update"); the choices; Save as course default', async () => {
    await tap('[data-newquiz="add-library-resource"]');
    await waitFor(() => has(`[data-newquiz="library-file"][data-id="${apuntes}"]`), 'Apuntes.pdf in the library list');
    await tap(`[data-newquiz="library-file"][data-id="${apuntes}"]`);
    await waitFor(() => has(`[data-newquiz="resource-file"][data-id="${apuntes}"]`), 'Apuntes.pdf among the resources');
    await tap('[data-newquiz="library-done"]');
    await waitFor(async () => !(await has('[data-newquiz="library"]')), 'the library list closed');

    await b.chooseFiles([join(OUT, 'quiz-check', 'Parcial 2024.pdf')], () => tap('[data-newquiz="add-upload-pastExam"]'));
    await waitFor(() => has('[data-newquiz="past-exam"]'), 'the past exam row', 20000);
    expect((await text('[data-newquiz="past-exam"]')).includes('Parcial 2024.pdf') && (await text('[data-newquiz="past-exam"]')).includes('Format read in a later update'), `past exam: ${await text('[data-newquiz="past-exam"]')}`);
    pastExam = await attr('[data-newquiz="past-exam"]', 'data-id');
    const { data: row } = await admin.from('files').select('kind, title, course_id, folder_id').eq('id', pastExam).maybeSingle();
    expect(row?.kind === 'pdf' && row.title === 'Parcial 2024.pdf' && row.course_id === data.course.id && row.folder_id === null, `the uploaded file: ${JSON.stringify(row)}`);

    await tap('[data-newquiz="limit"][data-key="total"]');
    await waitFor(() => has('[data-newquiz="limit-minutes"]'), 'the minutes field');
    const plan = planQuiz(input({ types: DEFAULT_TYPES.filter((t) => t !== 'true_false'), sliders: preset }));
    const suggested = Math.max(5, Math.ceil(plan.minutes / 5) * 5);
    expect((await b.evaluate(`document.querySelector('[data-newquiz="limit-minutes"]').value`)) === String(suggested), `minutes: ${await b.evaluate(`document.querySelector('[data-newquiz="limit-minutes"]').value`)} (estimate ${plan.minutes} → ${suggested})`);
    await tap('[data-newquiz="grading"][data-key="passFail"]');
    await waitFor(() => has('[data-newquiz="pass-mark"]'), 'the pass mark field');
    await b.evaluate(`document.querySelector('[data-newquiz="pass-mark"]').scrollIntoView({ block: 'center' })`);
    await b.fill('[data-newquiz="pass-mark"]', '70');
    await waitFor(async () => (await b.evaluate(`document.querySelector('[data-newquiz="pass-mark"]').value`)) === '70', 'the pass mark typed');
    await tap('[data-newquiz="hints"]');
    await waitFor(async () => !(await checked('[data-newquiz="hints"]')), 'hints off');
    await shots('quiz-panel-1280-choices');

    await tap('[data-newquiz="save-default"]');
    await waitFor(async () => (await text('[data-newquiz="save-note"]')) === 'Saved as Math’s default', async () => `the saved note: ${await text('[data-newquiz="save-note"]')}`);
    const { data: settings } = await admin.from('course_settings').select('quiz_difficulty, quiz_count, quiz_exam_focus, quiz_weak_spots, quiz_detail').eq('course_id', data.course.id).single();
    expect(settings.quiz_difficulty === 7 && settings.quiz_count === 5 && settings.quiz_exam_focus === 10 && settings.quiz_weak_spots === 8 && settings.quiz_detail === 5, `course_settings: ${JSON.stringify(settings)}`);
  });

  let quizId = null;
  await step('Create quiz: a pending quiz with its settings, plan and sources; Quiz me lists it first, Take greyed; no function called', async () => {
    const types = DEFAULT_TYPES.filter((t) => t !== 'true_false');
    const plan = planQuiz(input({ types, sliders: preset }));
    await tap('[data-newquiz="create"]');
    await waitFor(async () => !(await has(PANEL)), 'the panel closed', 15000);
    const { data: rows } = await admin.from('quizzes').select('*').eq('user_id', user.id);
    expect(rows?.length === 1, `quizzes: ${rows?.length}`);
    const q = rows[0];
    quizId = q.id;
    expect(q.status === 'pending' && q.title === 'Math · whole course' && q.course_id === data.course.id && q.question_count === plan.count && !q.deleted_at, `the row: ${JSON.stringify({ ...q, settings: undefined, plan: undefined })}`);
    const s = q.settings;
    expect(canon(s.sliders) === canon(preset), `settings.sliders: ${JSON.stringify(s.sliders)}`);
    expect(JSON.stringify(s.choices.types) === JSON.stringify(types), `types: ${JSON.stringify(s.choices.types)}`);
    expect(s.choices.grading.kind === 'passFail' && s.choices.grading.threshold === 70 && s.choices.hints === false && s.choices.timeLimit.kind === 'total' && s.choices.timeLimit.minutes === Math.max(5, Math.ceil(plan.minutes / 5) * 5), `choices: ${JSON.stringify(s.choices)}`);
    expect(s.topic.wholeCourse === true && JSON.stringify(s.topic.lectureIds) === JSON.stringify([L1, L2]), `topic: ${JSON.stringify(s.topic)}`);
    expect(JSON.stringify(s.resources.fileIds) === JSON.stringify([apuntes]) && s.resources.notes === true && JSON.stringify(s.pastExamIds) === JSON.stringify([pastExam]), `resources: ${JSON.stringify(s.resources)}, past exams ${JSON.stringify(s.pastExamIds)}`);
    expect(canon(q.plan) === canon(plan), 'the plan saved is not the calculator’s');
    const { data: sources } = await admin.from('quiz_sources').select('role, file_id, position').eq('quiz_id', q.id).order('role').order('position');
    const roles = (sources ?? []).map((x) => `${x.role}:${x.file_id === L1 ? 'L1' : x.file_id === L2 ? 'L2' : x.file_id === apuntes ? 'apuntes' : x.file_id === pastExam ? 'exam' : x.file_id}`);
    expect(JSON.stringify(roles) === JSON.stringify(['lecture:L1', 'lecture:L2', 'past_exam:exam', 'resource:apuntes']), `sources: ${JSON.stringify(roles)}`);
    await waitFor(async () => (await count('[data-quizzes="row"]')) === 1, 'the quiz in the list');
    const detail = await text('[data-quizzes="row"] [data-quizzes="detail"]');
    expect(detail === `${plan.count} questions · Saved · written in a later update`, `the row: ${detail}`);
    expect((await attr('[data-quizzes="row"] [data-quizzes="take"]', 'aria-disabled')) === 'true', 'Take is not greyed');
    expect((await quizCalls()).length === 0, `the quiz function was called: ${JSON.stringify(await quizCalls())}`);
    report.push(`RESULT | quiz saved: ${plan.count} questions, ${plan.slots.length} slots, status pending`);
    await shots('quiz-list-1280');
  });

  await step('Delete with Undo: … → Delete quiz; the row leaves the list; Undo brings it back', async () => {
    await tap('[data-quizzes="row"] [data-quizzes="more"]');
    await b.waitText('Delete quiz', { exact: true, timeout: 4000 });
    await b.click('Delete quiz', { exact: true });
    await waitFor(async () => (await count('[data-quizzes="row"]')) === 0, 'the row gone');
    const { data: gone } = await admin.from('quizzes').select('deleted_at').eq('id', quizId).single();
    expect(!!gone.deleted_at, 'deleted_at not set');
    await b.waitText('Deleted “Math · whole course”', { timeout: 4000 });
    // The toast's button (UndoToast.tsx) says UNDO.
    await b.click('UNDO', { exact: true });
    await waitFor(async () => (await count('[data-quizzes="row"]')) === 1, 'the row back');
    const { data: back } = await admin.from('quizzes').select('deleted_at').eq('id', quizId).single();
    expect(back.deleted_at === null, 'deleted_at still set after Undo');
  });

  await step('390 (iphone-05): the full-screen sheet, one column, presets as chips, Save as course default after the sliders; a quiz of Lecture 1; the list newest first', async () => {
    await b.resize(390, 844);
    await openQuizTab();
    await openPanel();
    expect((await attr(PANEL, 'data-layout')) === 'sheet', `layout: ${await attr(PANEL, 'data-layout')}`);
    const box = await b.evaluate(`(() => { const r = document.querySelector('${PANEL}').getBoundingClientRect(); return { x: r.x, w: r.width, bottom: r.bottom }; })()`);
    expect(box.x === 0 && box.w === 390 && box.bottom >= 840, `the sheet: ${JSON.stringify(box)}`);
    // The course's defaults saved at 1280 (Exam tomorrow) fill the sliders.
    const values = await sliderValues();
    expect(QUIZ_SLIDER_KEYS.every((k) => values[k] === preset[k]), `sliders (the course's defaults): ${JSON.stringify(values)}`);
    const xs = await b.evaluate(`[...document.querySelectorAll('[data-newquiz^="slider-"]')].map((e) => Math.round(e.getBoundingClientRect().x))`);
    expect(new Set(xs).size === 1, `the sliders aren't one column: ${xs.join(', ')}`);
    expect(await has('[data-newquiz="chips"]'), 'no scrolling chips');
    const order = await b.evaluate(`(() => { const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1; return { last: y('[data-newquiz="slider-detail"]'), save: y('[data-newquiz="save-default"]') }; })()`);
    expect(order.save > order.last, `Save as course default isn't after the sliders: ${JSON.stringify(order)}`);
    const buttons = await b.evaluate(`(() => { const r = document.querySelector('[data-newquiz="create"]').getBoundingClientRect(); return { bottom: r.bottom }; })()`);
    expect(buttons.bottom > 760, `Create quiz isn't at the bottom: ${JSON.stringify(buttons)}`);
    await shots('quiz-panel-390');
    await scrollPanelTo('[data-newquiz="chips"]');
    await shots('quiz-panel-390-sliders');
    await tap(`[data-newquiz="lecture"][data-id="${L2}"]`);
    await waitFor(async () => !(await checked(`[data-newquiz="lecture"][data-id="${L2}"]`)), 'Lecture 2 unticked');
    const plan = planQuiz(input({ sliders: preset, lectures: [{ id: L1, durationMs: 30 * MIN }], flaggedSpans: S30.examSignals.length }));
    await previewIs(plan, '390, Lecture 1');
    await tap('[data-newquiz="create"]');
    await waitFor(async () => !(await has(PANEL)), 'the sheet closed', 15000);
    await waitFor(async () => (await count('[data-quizzes="row"]')) === 2, 'two quizzes listed');
    const titles = await b.evaluate(`[...document.querySelectorAll('[data-quizzes="row"]')].map((r) => r.textContent)`);
    expect(titles[0].startsWith('Math · Lecture 1') && titles[1].startsWith('Math · whole course'), `the list's order: ${JSON.stringify(titles)}`);
    await shots('quiz-list-390');
    await b.resize(1280, 900);
  });

  await step('no request reached the quiz function or Anthropic, and the page never asked for the quiz function', async () => {
    const out = requests.filter((u) => /functions\/v1\/quiz\b|anthropic\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
    expect((await quizCalls()).length === 0, `the quiz function asked for in the page: ${JSON.stringify(await quizCalls())}`);
    const others = (await b.evaluate('window.__functionCalls').catch(() => [])) ?? [];
    report.push(`RESULT | other function requests answered in the page: ${others.length ? others.map((u) => u.replace(/^.*\/functions\/v1\//, '')).join(', ') : 'none'}`);
  });

  await step('the composites beside the mockups: desktop-02 (the panel at 1280), iphone-05 (the sheet at 390), light and dark', async () => {
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
      // Each image loaded (or 5 s at most).
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
      'quiz-compose-panel-1280',
      [
        ['desktop-02 (mockup: the frame)', mock('desktop-02-stop-and-summarize')],
        ['New quiz · light', shotOf('quiz-panel-1280')],
        ['New quiz · dark', shotOf('quiz-panel-1280-dark')],
        ['Sliders · light', shotOf('quiz-panel-1280-sliders')],
        ['Sliders · dark', shotOf('quiz-panel-1280-sliders-dark')],
      ],
      560,
    );
    await compose(
      'quiz-compose-panel-390',
      [
        ['iphone-05 (mockup: the sheet)', mock('iphone-05-stop-and-summarize')],
        ['390 · light', shotOf('quiz-panel-390')],
        ['390 · dark', shotOf('quiz-panel-390-dark')],
        ['Sliders · light', shotOf('quiz-panel-390-sliders')],
        ['Sliders · dark', shotOf('quiz-panel-390-sliders-dark')],
      ],
      390,
    );
    await b.resize(1280, 900);
    const wanted = ['quiz-panel-1280', 'quiz-panel-1280-dark', 'quiz-panel-1280-sliders', 'quiz-panel-1280-sliders-dark', 'quiz-panel-390', 'quiz-panel-390-dark', 'quiz-panel-390-sliders', 'quiz-panel-390-sliders-dark'];
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
