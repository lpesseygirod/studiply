// quiz.mjs — step 9.1b, Create a quiz: the New quiz panel and the Quiz me tab's quizzes, in Chrome
// against local Supabase (the migrations 20261029152100_quizzes and 20261029152200_quiz_checks
// applied). NO AI call: every /functions/v1/* request the page makes is answered in the page (and
// listed). Step 9.1b-2: the quiz function's answers are the page's (a past exam's format; 202 for a
// quiz, or 429), and this check plays the server's part with admin writes (the row writing, its
// questions, ready or failed), so the app's states are seen as the student sees them. Step 9.1b-3:
// taking quizzes; the grade requests (mode grade) are held in the page while this check writes the
// AI's grades as the quiz function would (only where an answer is still pending). The last steps
// check nothing reached the quiz function on the server or Anthropic.
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
//      row). 9.1b-2: its format is read at once, after the two permissions (the transcript; photos
//      and PDFs: a PDF) answered Allow: one format request to the quiz function (answered in the page:
//      12 questions, 8 multiple choice with 4 options, 2 true/false, 2 short answers); its line says
//      "12 questions · multiple choice, true/false, short answer"; Number of questions moves to 2 (its
//      length) and the preview follows the calculator with the exam's mix. The choices (a total time
//      limit with the calculator's estimate, pass/fail at 70 %, no hints); Save as course default
//      writes the course's quiz_* values.
//   4. Create quiz: the panel closes; the quiz saved (its settings, the calculator's plan, its sources)
//      and started: one quiz request with its id (no more permission asked). The check plays the
//      server: the row "generating" → Quiz me shows "10 questions · Writing your quiz…" with its
//      spinner; 10 questions written and the row ready → within the list's 5 s reads "10 questions ·
//      Ready", Take enabled.
//   5. Delete with Undo: … → Delete quiz; the row leaves the list; Undo brings it back.
//   6. Saved, not started: a quiz saved but never started, the permissions withdrawn: Start → "Send
//      the transcript to Anthropic?" → Not now: nothing sent, the row says "Nothing was sent: Studiply
//      needs your permission"; Start again, Allow, the function answers 429: "The quiz wasn’t started"
//      and the row says "Today’s limit is reached; try again tomorrow".
//   7. Failed and too long: a failed quiz ("Couldn’t be written · Claude couldn’t be reached") → Try
//      again → one request, writing again (the check plays the server); deleted while writing and
//      Undo; a quiz left "generating" for 6 minutes shows "Couldn’t be written · It took too long"
//      with Try again. Screenshots quiz-states-1280 (light, dark).
//   8. 390 (iphone-05): + New quiz opens the full-screen sheet: one column of sliders, the presets as
//      chips that scroll, Save as course default after the sliders, Cancel · Create quiz at the
//      bottom; a quiz of Lecture 1 only (started: the request made); the list newest first; the
//      list's states at 390, none cut (quiz-list-390, light and dark).
//   Step 9.1b-3 (taking quizzes; a quiz of each of the 8 types seeded ready, one from the Exam 9 mark):
//   9. Laptop (desktop-07): Take opens /review/quiz/<id>: the top bar's "Review today · Math", "Question
//      1 of 8", "From your marks: 1 Exam", the 720 px card; Check greyed until there is an answer. Every
//      type answered, with the laptop's keys where they apply: multiple choice by its letter (Show hint
//      first: the hint, hint_used saved) and Enter, right, its source chip plays the lecture in the mini
//      player; true/false by "2" (False), wrong: the right answer and the "Added context · not from the
//      lecture" box; a short answer code can't match (Enter in its field): one grade request (held),
//      "Grading your answer…", the check writes the AI's partly → "½ Partly" with its reason; fill in the
//      blank half right: partly; a long answer (word count; ⌘ + Enter): the AI's wrong; match pairs
//      chosen in their menus (the right column shuffled): right; put in order with ↑ (shown shuffled):
//      right; a calculation "1.234,5" for 1234.5: right. Enter goes on after each. Results: 6.3 / 10,
//      8 rows, "4 wrong answers saved for review" (4 quiz cards); her grade on the true/false row →
//      Correct: "Changed by you (was: Wrong)", 7.5 / 10, the database the same. Shots quiz-take-1280,
//      quiz-feedback-1280, quiz-results-1280 (light, dark).
//  10. One question answered → Escape: back on the list with the answers kept; the row says Resume;
//      Resume goes on at "Question 2 of 3" in the same attempt; the end (10 / 10); Take again: a new
//      attempt at "Question 1 of 3"; Quit.
//  11. The list: "Last: 7.5 / 10" (an attempt finished earlier, one grade hers); … → Results opens that
//      attempt's results ("Changed by you (was: Wrong)"); Done.
//  12. After each at the end, 10 s a question: a calculation typed but not sent when the time runs out
//      is saved (and graded) and the next question comes; no feedback (at the end); the last question's
//      button says Finish; Enter finishes: 5 / 10.
//  13. The whole quiz's time (1 minute; the attempt started 40 s ago): Resume → "0:xx left"; what she
//      typed is saved when it runs out, the question not reached written wrong; the results: 0 / 10.
//  14. 390 (iphone-10): Take full screen (no tab bar, ‹ Quit, "Question 1 of 2"), a multiple choice and
//      a calculation with their feedback, the results (10 / 10), nothing wider than the screen
//      (quiz-take-390, quiz-feedback-390, quiz-results-390, light and dark).
//  15. The laptop offline (a quiz being written makes the list read every 5 s, so it notices): Take
//      greyed ("Taking a quiz needs a connection on the laptop"); back online: Take again.
//  Steps 9–15 each take a quiz of their own and start clean (1280 or 390, light, online, the list), so
//  one failure doesn't carry over. Everything of the quiz screen is read and clicked inside its root,
//  [data-quiz-screen="<quiz id>"]: the Review tab stays mounted under a quiz being taken (at 1280
//  covered, not hidden), and its 9.1 self-test card has the same data-quiz-card and the same progress
//  label (ReviewProgress, which the quiz screen reuses).
//  QUIZ_STEPS=9,13 runs only those steps (9–17 need none of 1–8).
//  16. No request reached the quiz function on the server or Anthropic (the page's requests to it,
//      answered in the page, are listed in the report).
//  17. Composites beside the mockups, light and dark: quiz-compose-panel-1280 (desktop-02),
//      quiz-compose-panel-390 (iphone-05), quiz-compose-take-1280 (desktop-07), quiz-compose-take-390
//      (iphone-10).
//
// The run always ends (its Chrome closed, the process exits), also after failures, when stopped, or
// after 20 minutes.
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
const { planQuiz, countValueFor, DEFAULT_TYPES, QUIZ_SLIDER_DEFAULTS, QUIZ_PRESETS, QUIZ_SLIDER_KEYS } = await import(pathToFileURL(join(repo, 'supabase/functions/_shared/quiz-plan.ts')).href);

const results = [];
const report = [];
let b;
/** QUIZ_STEPS=9,12 runs only those steps (the taking steps 9–15 need none of 1–8). */
const ONLY = process.env.QUIZ_STEPS ? new Set(process.env.QUIZ_STEPS.split(',').map(Number)) : null;
let stepNo = 0;
const step = async (name, fn) => {
  stepNo += 1;
  if (ONLY && !ONLY.has(stepNo)) {
    results.push(['SKIP', name]);
    return;
  }
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-quiz-${results.length}`).catch(() => {});
    // A dialog left open would answer every later step.
    await b.press('Escape').catch(() => {});
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
/** The page's requests to the quiz function (answered in the page): their bodies, in order. */
const quizCalls = async () => (await b.evaluate('window.__quizBodies').catch(() => [])) ?? [];
const S30 = JSON.parse(readFileSync(join(repo, 'src/test-utils/summary-synthetic-30.json'), 'utf8')).result;
const SUMMARY_SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };
/** The format the page answers for a past exam (as the quiz function's Sonnet read would). */
const FORMAT = { language: 'es', questionCount: 12, types: [{ type: 'multiple_choice', count: 8 }, { type: 'true_false', count: 2 }, { type: 'short_answer', count: 2 }], optionsPerQuestion: 4, avgQuestionWords: 15, styleNotes: 'Short stems.', examples: [] };
const FORMAT_LINE = '12 questions · multiple choice, true/false, short answer';

/**
 * Before the app: every Edge Function request is answered in the page and listed. The quiz function
 * (9.1b-2): a format request gets FORMAT; a quiz request waits 1.5 s (so the check can play the
 * server's part first) and gets 202, or 429 daily_limit when window.__quizReply says so. 9.1b-3: a
 * grade request waits while window.__gradeHold is set (the check writes the AI's grades meanwhile),
 * then gets 200.
 */
const PAGE_SETUP = `(() => {
  const realFetch = window.fetch.bind(window);
  window.__functionCalls = [];
  window.__quizBodies = [];
  window.__quizReply = 'ok';
  window.__gradeHold = false;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/')) {
      window.__functionCalls.push(url);
      if (/\\/functions\\/v1\\/quiz\\b/.test(url)) {
        let body = {};
        try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
        window.__quizBodies.push(body);
        const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
        if (body.mode === 'format') return json(200, { format: ${JSON.stringify(FORMAT)} });
        if (body.mode === 'grade') {
          for (const until = Date.now() + 20000; window.__gradeHold && Date.now() < until; ) await new Promise((r) => setTimeout(r, 100));
          return json(200, { graded: 1, left: 0 });
        }
        await new Promise((r) => setTimeout(r, 1500));
        if (window.__quizReply === 'daily_limit') return json(429, { code: 'daily_limit', error: 'You have reached today’s limit for the assistant and summaries. Try again tomorrow.' });
        return json(202, { quizId: body.quizId, status: 'generating' });
      }
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
  console.error('quiz.mjs: still running after 20 minutes; stopping');
  void finish(1);
}, 20 * MIN);
watchdog.unref();

const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

/**
 * The tab navigator keeps the Review tab mounted under a quiz being taken (at 1280 covered, not
 * hidden), and its 9.1 self-test card has the same data-quiz-card and the same progress label
 * (ReviewProgress, which the quiz screen reuses). So everything of the quiz screen (data-quiz-…,
 * data-review-progress) is read inside its root, [data-quiz-screen="<the quiz being taken>"]; the rest
 * (the list, the panel) on the page, visible only.
 */
let screenId = null;
const VISIBLE = `((css) => [...document.querySelectorAll(css)].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'))`;
const IN_SCREEN = `((css, id) => { const root = id ? document.querySelector('[data-quiz-screen="' + id + '"]') : null; return root ? [...root.querySelectorAll(css)] : []; })`;
const ofScreen = (css) => /\[data-(quiz-|review-progress)/.test(css);
const visible = (css) => (ofScreen(css) ? `${IN_SCREEN}(${JSON.stringify(css)}, ${JSON.stringify(screenId)})` : `${VISIBLE}(${JSON.stringify(css)})`);
/** On the list again (the quiz screen stays mounted under it, so the list's own selectors aren't enough). */
const onList = async () => (await b.evaluate('location.pathname')) === '/review' && (await has('[data-quizzes="new"]'));
const has = (css) => b.evaluate(`${visible(css)}.length > 0`);
const count = (css) => b.evaluate(`${visible(css)}.length`);
const text = (css) => b.evaluate(`${visible(css)}[0]?.textContent ?? ''`);
const attr = (css, name) => b.evaluate(`${visible(css)}[0]?.getAttribute(${JSON.stringify(name)}) ?? null`);
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
 * A click on an element, scrolled into view first: clickSelector clicks where the element is, also
 * outside a scroll area (the first run's type chip was below it: the click missed).
 */
const tap = async (css) => {
  const found = await b.evaluate(`(() => { const e = ${visible(css)}[0]; if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  if (!found) throw new Error(`no element: ${css}`);
  await b.sleep(250);
  const p = await b.evaluate(`(() => { const r = ${visible(css)}[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await b.clickAt(p.x, p.y);
};
/** A permission dialog (src/services/consent.service.ts) answered: Allow or Not now. */
const answer = async (title, button, timeout = 8000) => {
  await b.waitText(title, { timeout });
  await b.sleep(250);
  await b.click(button, { exact: true });
  await b.sleep(400);
};
/** The permission dialogs that come within `ms`, answered (transcript, images); the titles seen. */
const answerAny = async (answers, ms = 3000) => {
  const seen = [];
  const until = Date.now() + ms;
  while (Date.now() < until) {
    let hit = false;
    for (const [title, button] of Object.entries(answers)) {
      if (await b.hasText(title, true)) {
        await b.click(button, { exact: true });
        await b.sleep(400);
        seen.push(title);
        hit = true;
      }
    }
    if (!hit) await b.sleep(200);
  }
  return seen;
};
const ASK_TRANSCRIPT = 'Send the transcript to Anthropic?';
const ASK_IMAGES = 'Send photos and PDFs to Anthropic?';
const row = (id) => `[data-quizzes="row"][data-id="${id}"]`;
const rowDetail = (id) => text(`${row(id)} [data-quizzes="detail"]`);
const rowSub = (id) => text(`${row(id)} [data-quizzes="sub"]`);
/** The server's part (step 9.1b-2): the row writing, then its questions and ready (or failed). */
const server = {
  writing: (id) => admin.from('quizzes').update({ status: 'generating', error: null }).eq('id', id),
  ready: async (id, n) => {
    const rows = Array.from({ length: n }, (_, i) => ({ user_id: user.id, quiz_id: id, position: i, type: 'true_false', prompt: `La conducta es biológica (${i + 1}).`, data: { correct: true }, answer_text: 'Verdadero', explanation: 'Lo dijo la profesora.', source_file_id: L1, source_ms: 60_000 * (i + 1), focus: 'any', difficulty: 'medium' }));
    const q = await admin.from('quiz_questions').insert(rows);
    if (q.error) throw new Error(`the questions: ${q.error.message}`);
    const r = await admin.from('quizzes').update({ status: 'ready', error: null, question_count: n, checks: { version: 1, requested: n, written: n, dropped: [] } }).eq('id', id);
    if (r.error) throw new Error(`ready: ${r.error.message}`);
  },
  failed: (id, error) => admin.from('quizzes').update({ status: 'failed', error }).eq('id', id),
};
/** The preset steps 2–6 use (a constant: a failed step 2 no longer leaves the later steps without it). */
const preset = QUIZ_PRESETS.examTomorrow.sliders;
/** After the past exam's format is read, Number of questions is its length (12 → 2). */
const presetWithExam = { ...preset, count: countValueFor(FORMAT.questionCount) };
const examFormat = { questionCount: FORMAT.questionCount, types: FORMAT.types };

let L2 = null;
let L3 = null;
let apuntes = null;
let examMark = null;
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
const CHOICES = { types: DEFAULT_TYPES, timeLimit: { kind: 'none' }, language: null, answers: 'afterEach', explanations: true, hints: true, grading: { kind: 'score' }, wrongComeBack: true };
const settingsWith = (choices = {}) => ({ version: 1, sliders: QUIZ_SLIDER_DEFAULTS, choices: { ...CHOICES, ...choices }, topic: { wholeCourse: false, lectureIds: [L1] }, resources: { notes: true, summaries: true, lectureMedia: false, fileIds: [] }, pastExamIds: [] });
/** A quiz row as the panel saves one (for the states of steps 6 and 7), as the student (RLS). */
const savedQuiz = async (title, over = {}) => {
  const plan = planQuiz(input({ lectures: [{ id: L1, durationMs: 30 * MIN }], flaggedSpans: S30.examSignals.length }));
  const r = await user.client.from('quizzes').insert({ course_id: data.course.id, title, status: 'pending', settings: settingsWith(), plan, question_count: plan.count, ...over }).select('id').single();
  if (r.error) throw new Error(`a quiz: ${r.error.message}`);
  return r.data.id;
};

// ---------- step 9.1b-3: quizzes to take ----------

/** A ready quiz with its questions (as the quiz function writes them); its id and its questions by id. */
const readyQuiz = async (title, questions, choices = {}) => {
  const q = await admin.from('quizzes').insert({ user_id: user.id, course_id: data.course.id, title, status: 'ready', language: 'es', settings: settingsWith(choices), plan: {}, question_count: questions.length }).select('id').single();
  if (q.error) throw new Error(`${title}: ${q.error.message}`);
  const rows = questions.map((x, position) => ({ user_id: user.id, quiz_id: q.data.id, position, focus: 'any', difficulty: 'medium', explanation: '', hint: '', added_context: '', answer_text: '', ...x }));
  const r = await admin.from('quiz_questions').insert(rows).select('id, type, prompt, data');
  if (r.error) throw new Error(`${title}'s questions: ${r.error.message}`);
  return { id: q.data.id, questions: new Map(r.data.map((x) => [x.id, x])) };
};
const PAIRS = [
  { left: 'Darwin', right: 'Selección natural' },
  { left: 'Cajal', right: 'Doctrina neuronal' },
  { left: 'Broca', right: 'Área del lenguaje' },
];
const STEPS = ['Estímulo', 'Receptor', 'Vía aferente', 'Respuesta'];
const ALL_TYPES = () => [
  { type: 'multiple_choice', prompt: '¿Cuál de estas NO es una de las 5 preguntas de la Psicobiología?', data: { options: ['Estructuras', 'Memoria', 'Regulación', 'Evolución'], correct: 1 }, answer_text: 'Memoria', explanation: 'Las cinco: descripción, mecanismo, desarrollo, evolución y función.', hint: 'Piensa en lo que dijo al principio.', mark_id: examMark, source_file_id: L1, source_ms: 400000 },
  { type: 'true_false', prompt: 'La psicobiología estudia las bases biológicas de la conducta.', data: { correct: true }, answer_text: 'True', explanation: 'Es su definición.', added_context: 'En otros manuales se llama «psicología fisiológica».' },
  { type: 'short_answer', prompt: '¿Qué indica el parentesco filogenético?', data: { modelAnswer: 'Un antepasado común' }, answer_text: 'Un antepasado común' },
  { type: 'fill_blank', prompt: 'Completa:', data: { text: 'La ___ transmite el impulso por la ___.', blanks: [{ answer: 'neurona', accept: [] }, { answer: 'sinapsis', accept: [] }] }, answer_text: 'neurona · sinapsis' },
  { type: 'long_answer', prompt: 'Explica las cinco preguntas de la psicobiología.', data: { modelAnswer: 'Descripción, mecanismo, desarrollo, evolución y función.', keyPoints: ['descripción', 'mecanismo', 'desarrollo', 'evolución', 'función'] }, answer_text: 'Descripción, mecanismo, desarrollo, evolución y función.' },
  { type: 'match_pairs', prompt: 'Une cada autor con su idea.', data: { pairs: PAIRS }, answer_text: PAIRS.map((p) => `${p.left} → ${p.right}`).join('; ') },
  { type: 'order_steps', prompt: 'Ordena el arco reflejo.', data: { steps: STEPS }, answer_text: STEPS.map((s, i) => `${i + 1}. ${s}`).join(' ') },
  { type: 'numeric', prompt: 'Calcula el tiempo de reacción total.', data: { answer: 1234.5, tolerance: 0.1, relative: false, unit: 'ms', decimals: 1 }, answer_text: '1234,5 ms' },
];
const twoNumeric = () => [
  { type: 'numeric', prompt: 'Primera cuenta.', data: { answer: 1234.5, tolerance: 0.1, relative: false, unit: 'ms', decimals: 1 }, answer_text: '1234,5 ms' },
  { type: 'numeric', prompt: 'Segunda cuenta.', data: { answer: 42, tolerance: 0.5, relative: false, unit: '', decimals: 0 }, answer_text: '42' },
];

const threeNumeric = () => [...twoNumeric(), { type: 'numeric', prompt: 'Tercera cuenta.', data: { answer: 7, tolerance: 0.5, relative: false, unit: '', decimals: 0 }, answer_text: '7' }];
/** The calculation on screen answered right (its own answer typed), not sent. */
const answerNumeric = async (quiz) => {
  const c = await current();
  await fillNth('[data-quiz-field="numeric"]', 0, String(quiz.questions.get(c.id).data.answer));
};

const KEY = (k) => (/^[0-9]$/.test(k) ? { code: `Digit${k}`, key: k, keyCode: 48 + Number(k) } : { code: `Key${k.toUpperCase()}`, key: k, keyCode: k.toUpperCase().charCodeAt(0) });
const keyTap = (k) => b.chord(KEY(k));
const blur = () => b.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
/** The question on screen: its phase (question | feedback), type and id. */
const current = () => b.evaluate(`(() => { const c = ${visible('[data-quiz-card][data-quiz-question]')}[0]; return c ? { phase: c.getAttribute('data-quiz-card'), type: c.getAttribute('data-quiz-type'), id: c.getAttribute('data-quiz-question') } : null; })()`);
const progressLabel = () => text('[data-review-progress="label"]');
const fillNth = async (css, n, value) => {
  await b.evaluate(`(() => { const e = ${visible(css)}[${n}]; e.scrollIntoView({ block: 'center' }); e.focus(); })()`);
  await b.sleep(150);
  await b.type(value);
};
const attemptOf = async (quizId, status = 'in_progress') => (await admin.from('quiz_attempts').select('*').eq('quiz_id', quizId).eq('status', status).order('started_at', { ascending: false }).limit(1).maybeSingle()).data;
const answersOf = async (attemptId) => (await admin.from('quiz_answers').select('*').eq('attempt_id', attemptId)).data ?? [];
const gradeCalls = async () => (await quizCalls()).filter((c) => c.mode === 'grade');
/** The AI's grade as the quiz function writes it: only where the answer is still pending. */
const aiGrade = (attemptId, questionId, verdict, reason) =>
  admin.from('quiz_answers').update({ verdict, points: verdict === 'correct' ? 1 : verdict === 'partly' ? 0.5 : 0, reason, graded_by: 'ai' }).eq('attempt_id', attemptId).eq('question_id', questionId).eq('verdict', 'pending');
/** A question's answer typed or chosen as `how` says (right, or the planned partly/wrong one), not sent. */
const fill = async (q, how = 'planned') => {
  switch (q.type) {
    case 'multiple_choice':
      return keyTap(how === 'wrong' ? 'a' : 'b');
    case 'true_false':
      return keyTap(how === 'right' ? '1' : '2');
    case 'short_answer':
      return fillNth('[data-quiz-field="text"]', 0, how === 'right' ? 'Un antepasado común' : 'Que se parecen');
    case 'fill_blank':
      await fillNth('[data-quiz-field="text"]', 0, 'neurona');
      return fillNth('[data-quiz-field="text"]', 1, how === 'right' ? 'sinapsis' : 'axón');
    case 'long_answer':
      return fillNth('[data-quiz-field="long"]', 0, 'Se pregunta cómo es la conducta y para qué sirve.');
    case 'match_pairs':
      for (let i = 0; i < PAIRS.length; i++) {
        await tap(`[data-quiz-pair-choice="${i}"]`);
        await b.waitText(PAIRS[i].right, { exact: true, timeout: 4000 });
        await b.click(PAIRS[i].right, { exact: true });
        await b.sleep(300);
      }
      return;
    case 'order_steps':
      for (let guard = 0; guard < 12; guard++) {
        const order = await b.evaluate(`${visible('[data-quiz-step]')}.map((e) => Number(e.getAttribute('data-quiz-step')))`);
        const at = order.findIndex((k, i) => k !== i);
        if (at === -1) return;
        await tap(`[data-quiz-step="${at}"] [aria-label^="Move up"]`);
        await b.sleep(250);
      }
      throw new Error('the steps never got in order');
    case 'numeric':
      return fillNth('[data-quiz-field="numeric"]', 0, how === 'wrong' ? '12' : '1.234,5');
  }
};
/** Each taking step starts the same way, whatever the step before left: 1280 (or 390), light, nothing held. */
const clean = async (width = 1280) => {
  screenId = null;
  await b.press('Escape').catch(() => {});
  await dark(false);
  await b.resize(width, width === 390 ? 844 : 900);
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
  await openQuizTab();
  await b.evaluate('window.__gradeHold = false');
};
const openTaking = async (quizId, button = 'take') => {
  await openQuizTab();
  await waitFor(() => has(`${row(quizId)} [data-quizzes="${button}"]`), async () => `${button} on the row (${await text(row(quizId))})`, 10000);
  screenId = quizId;
  await tap(`${row(quizId)} [data-quizzes="${button}"]`);
  await waitForScreen(quizId);
};
/** The quiz screen of `quizId` on screen: its route, and its root holding a question or the results. */
const waitForScreen = async (quizId) => {
  screenId = quizId;
  await waitFor(async () => (await b.evaluate('location.pathname')) === `/review/quiz/${quizId}`, async () => `the route (${await b.evaluate('location.pathname')})`, 20000);
  await waitFor(() => has('[data-quiz-card], [data-quiz-results]'), 'the quiz screen’s card or results', 20000);
  await b.sleep(400);
};
let allTypes = null;
let timed = null;
let total = null;

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
  const marks = await user.client
    .from('marks')
    .insert([
      { lecture_id: L1, type: 'exam', level: 9, t_ms: 400000 },
      { lecture_id: L1, type: 'confused', level: 7, t_ms: 900000 },
      { lecture_id: L2, type: 'exam', level: 8, t_ms: 600000 },
    ])
    .select('id, lecture_id, type');
  if (marks.error) throw new Error(`the marks: ${marks.error.message}`);
  examMark = marks.data.find((m) => m.lecture_id === L1 && m.type === 'exam').id;
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
  await step('+ From my library adds Apuntes.pdf; + Upload past exam: the two permissions, its format read (one request), its line, Number of questions to its length, the preview with its mix; the choices; Save as course default', async () => {
    await tap('[data-newquiz="add-library-resource"]');
    await waitFor(() => has(`[data-newquiz="library-file"][data-id="${apuntes}"]`), 'Apuntes.pdf in the library list');
    await tap(`[data-newquiz="library-file"][data-id="${apuntes}"]`);
    await waitFor(() => has(`[data-newquiz="resource-file"][data-id="${apuntes}"]`), 'Apuntes.pdf among the resources');
    await tap('[data-newquiz="library-done"]');
    await waitFor(async () => !(await has('[data-newquiz="library"]')), 'the library list closed');

    await b.chooseFiles([join(OUT, 'quiz-check', 'Parcial 2024.pdf')], () => tap('[data-newquiz="add-upload-pastExam"]'));
    await waitFor(() => has('[data-newquiz="past-exam"]'), 'the past exam row', 20000);
    // 9.1b-2: reading its format sends it to Anthropic: the transcript permission, then photos and PDFs (a PDF).
    await answer(ASK_TRANSCRIPT, 'Allow', 15000);
    await answer(ASK_IMAGES, 'Allow');
    pastExam = await attr('[data-newquiz="past-exam"]', 'data-id');
    await waitFor(async () => (await text('[data-newquiz="past-exam"]')).includes(FORMAT_LINE), async () => `past exam: ${await text('[data-newquiz="past-exam"]')}`, 10000);
    expect((await text('[data-newquiz="past-exam"]')).includes('Parcial 2024.pdf'), `past exam: ${await text('[data-newquiz="past-exam"]')}`);
    const calls = await quizCalls();
    expect(calls.length === 1 && calls[0].mode === 'format' && calls[0].fileId === pastExam, `the quiz function's requests: ${JSON.stringify(calls)}`);
    const { data: row } = await admin.from('files').select('kind, title, course_id, folder_id').eq('id', pastExam).maybeSingle();
    expect(row?.kind === 'pdf' && row.title === 'Parcial 2024.pdf' && row.course_id === data.course.id && row.folder_id === null, `the uploaded file: ${JSON.stringify(row)}`);
    const { data: consent } = await admin.from('ai_consent').select('scope').eq('user_id', user.id);
    expect((consent ?? []).map((c) => c.scope).sort().join(',') === 'assistant_summary,images', `consent rows: ${JSON.stringify(consent)}`);
    // Its length is Number of questions (12 → 2) and the preview follows its mix.
    await waitFor(async () => (await sliderValues()).count === presetWithExam.count, async () => `Number of questions: ${(await sliderValues()).count}`);
    const types = DEFAULT_TYPES.filter((t) => t !== 'true_false');
    const plan = planQuiz(input({ types, sliders: presetWithExam, pastExam: examFormat }));
    await previewIs(plan, 'with the past exam');
    report.push(`RESULT | with the past exam: ${plan.preview}`);

    await tap('[data-newquiz="limit"][data-key="total"]');
    await waitFor(() => has('[data-newquiz="limit-minutes"]'), 'the minutes field');
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
    expect(settings.quiz_difficulty === 7 && settings.quiz_count === presetWithExam.count && settings.quiz_exam_focus === 10 && settings.quiz_weak_spots === 8 && settings.quiz_detail === 5, `course_settings: ${JSON.stringify(settings)}`);
  });

  let quizId = null;
  await step('Create quiz: saved and started (one request, no permission asked again); the check plays the server: Writing your quiz… with its spinner, then within the 5 s reads Ready, Take enabled', async () => {
    const types = DEFAULT_TYPES.filter((t) => t !== 'true_false');
    const plan = planQuiz(input({ types, sliders: presetWithExam, pastExam: examFormat }));
    const before = (await quizCalls()).length;
    await tap('[data-newquiz="create"]');
    // The start request (the page answers after 1.5 s): the server's part first, the row writing.
    const call = await waitFor(async () => (await quizCalls()).slice(before).find((c) => c.quizId && !c.mode), 'the quiz request', 15000);
    quizId = call.quizId;
    await server.writing(quizId);
    await waitFor(async () => !(await has(PANEL)), 'the panel closed', 15000);
    expect(!(await b.hasText(ASK_TRANSCRIPT, true)), 'a permission asked again');
    const { data: q } = await admin.from('quizzes').select('*').eq('id', quizId).single();
    expect(q.title === 'Math · whole course' && q.course_id === data.course.id && q.question_count === plan.count && !q.deleted_at, `the row: ${JSON.stringify({ ...q, settings: undefined, plan: undefined })}`);
    const s = q.settings;
    expect(canon(s.sliders) === canon(presetWithExam), `settings.sliders: ${JSON.stringify(s.sliders)}`);
    expect(JSON.stringify(s.choices.types) === JSON.stringify(types), `types: ${JSON.stringify(s.choices.types)}`);
    expect(s.choices.grading.kind === 'passFail' && s.choices.grading.threshold === 70 && s.choices.hints === false && s.choices.timeLimit.kind === 'total' && s.choices.timeLimit.minutes === Math.max(5, Math.ceil(plan.minutes / 5) * 5), `choices: ${JSON.stringify(s.choices)}`);
    expect(s.topic.wholeCourse === true && JSON.stringify(s.topic.lectureIds) === JSON.stringify([L1, L2]), `topic: ${JSON.stringify(s.topic)}`);
    expect(JSON.stringify(s.resources.fileIds) === JSON.stringify([apuntes]) && s.resources.notes === true && JSON.stringify(s.pastExamIds) === JSON.stringify([pastExam]), `resources: ${JSON.stringify(s.resources)}, past exams ${JSON.stringify(s.pastExamIds)}`);
    expect(canon(q.plan) === canon(plan), 'the plan saved is not the calculator’s');
    const { data: sources } = await admin.from('quiz_sources').select('role, file_id, position').eq('quiz_id', q.id).order('role').order('position');
    const roles = (sources ?? []).map((x) => `${x.role}:${x.file_id === L1 ? 'L1' : x.file_id === L2 ? 'L2' : x.file_id === apuntes ? 'apuntes' : x.file_id === pastExam ? 'exam' : x.file_id}`);
    expect(JSON.stringify(roles) === JSON.stringify(['lecture:L1', 'lecture:L2', 'past_exam:exam', 'resource:apuntes']), `sources: ${JSON.stringify(roles)}`);

    await waitFor(async () => (await rowDetail(quizId)) === `${plan.count} questions · Writing your quiz…`, async () => `the row: ${await rowDetail(quizId)}`, 15000);
    expect(await has(`${row(quizId)} [data-quizzes="writing"]`), 'no spinner while writing');
    expect((await rowSub(quizId)) === 'About 1–2 minutes, you can keep working', `under it: ${await rowSub(quizId)}`);
    expect((await attr(`${row(quizId)} [data-quizzes="take"]`, 'aria-disabled')) === 'true', 'Take is not greyed while writing');
    await shots('quiz-list-1280-writing');

    await server.ready(quizId, plan.count);
    await waitFor(async () => (await rowDetail(quizId)) === `${plan.count} questions · Ready`, async () => `the row after ready: ${await rowDetail(quizId)}`, 15000);
    expect(!(await has(`${row(quizId)} [data-quizzes="writing"]`)), 'the spinner still there');
    // 9.1b-3: Take opens the quiz (steps 9–15 take quizzes of their own).
    expect((await attr(`${row(quizId)} [data-quizzes="take"]`, 'aria-disabled')) !== 'true', 'Take still greyed');
    expect((await quizCalls()).filter((c) => c.quizId && !c.mode).length === 1, `quiz requests: ${JSON.stringify(await quizCalls())}`);
    report.push(`RESULT | quiz created and written (played): ${plan.count} questions, ${plan.slots.length} slots`);
    await shots('quiz-list-1280');
  });

  await step('Delete with Undo: … → Delete quiz; the row leaves the list; Undo brings it back', async () => {
    await tap(`${row(quizId)} [data-quizzes="more"]`);
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

  let notStarted = null;
  await step('saved, not started: Start → Not now sends nothing (the row says why); Start → Allow → 429: “The quiz wasn’t started”, the row says today’s limit', async () => {
    // A quiz saved but never started; the permissions withdrawn (asked again).
    notStarted = await savedQuiz('Math · Lecture 1 (saved)');
    await admin.from('ai_consent').delete().eq('user_id', user.id);
    await openQuizTab();
    await waitFor(async () => (await rowDetail(notStarted)).endsWith('· Saved · not started'), async () => `the row: ${await rowDetail(notStarted)}`);
    expect(await has(`${row(notStarted)} [data-quizzes="start"]`), 'no Start');
    const before = (await quizCalls()).length;
    await tap(`${row(notStarted)} [data-quizzes="start"]`);
    await answer(ASK_TRANSCRIPT, 'Not now');
    await waitFor(async () => (await rowSub(notStarted)) === 'Nothing was sent: Studiply needs your permission', async () => `under the row: ${await rowSub(notStarted)}`);
    expect((await quizCalls()).length === before, `a request after Not now: ${JSON.stringify((await quizCalls()).slice(before))}`);

    await b.evaluate(`window.__quizReply = 'daily_limit'`);
    await tap(`${row(notStarted)} [data-quizzes="start"]`);
    await answer(ASK_TRANSCRIPT, 'Allow');
    await b.waitText('The quiz wasn’t started', { timeout: 10000 });
    await b.click('OK', { exact: true });
    await waitFor(async () => (await rowSub(notStarted)) === 'Today’s limit is reached; try again tomorrow', async () => `under the row: ${await rowSub(notStarted)}`);
    expect((await quizCalls()).slice(before).filter((c) => c.quizId === notStarted).length === 1, `requests: ${JSON.stringify((await quizCalls()).slice(before))}`);
    await b.evaluate(`window.__quizReply = 'ok'`);
    const { data: status } = await admin.from('quizzes').select('status').eq('id', notStarted).single();
    expect(status.status === 'pending', `the app wrote a status: ${status.status}`);
  });

  await step('failed → Try again → writing again (the check plays the server); deleted while writing and Undo; one left generating 6 minutes: It took too long, with Try again', async () => {
    await server.failed(notStarted, 'claude_failed');
    // Left generating with no news for 6 minutes (as a run the platform stopped would leave it).
    const stale = await savedQuiz('Math · Lecture 1 (stale)', { status: 'generating', updated_at: new Date(Date.now() - 6 * MIN).toISOString() });
    await openQuizTab();
    await waitFor(async () => (await rowDetail(notStarted)) === 'Couldn’t be written', async () => `the failed row: ${await rowDetail(notStarted)}`);
    expect((await rowSub(notStarted)) === 'Claude couldn’t be reached' && (await has(`${row(notStarted)} [data-quizzes="retry"]`)), `failed: ${await rowSub(notStarted)}`);
    expect((await rowDetail(stale)) === 'Couldn’t be written' && (await rowSub(stale)) === 'It took too long' && (await has(`${row(stale)} [data-quizzes="retry"]`)), `stale: ${await rowDetail(stale)} · ${await rowSub(stale)}`);
    await shots('quiz-states-1280');

    const before = (await quizCalls()).length;
    await tap(`${row(notStarted)} [data-quizzes="retry"]`);
    await waitFor(async () => (await quizCalls()).slice(before).some((c) => c.quizId === notStarted), 'the Try again request', 10000);
    await server.writing(notStarted);
    await waitFor(async () => (await rowDetail(notStarted)).endsWith('· Writing your quiz…'), async () => `after Try again: ${await rowDetail(notStarted)}`, 15000);

    // Deleted while it is written (the server stops before its next call: Jest), and Undo.
    await tap(`${row(notStarted)} [data-quizzes="more"]`);
    await b.waitText('Delete quiz', { exact: true, timeout: 4000 });
    await b.click('Delete quiz', { exact: true });
    await waitFor(async () => !(await has(row(notStarted))), 'the writing row gone');
    await b.click('UNDO', { exact: true });
    await waitFor(() => has(row(notStarted)), 'the row back after Undo');

    // Try again on the stale one: one request (the server claims a quiz left generating that long).
    const before2 = (await quizCalls()).length;
    await tap(`${row(stale)} [data-quizzes="retry"]`);
    await waitFor(async () => (await quizCalls()).slice(before2).some((c) => c.quizId === stale), 'the stale quiz’s request', 10000);
    const { data: still } = await admin.from('quizzes').select('status').eq('id', stale).single();
    expect(still.status === 'generating', `the app wrote a status: ${still.status}`);
  });

  await step('390 (iphone-05): the full-screen sheet, one column, presets as chips, Save as course default after the sliders; a quiz of Lecture 1 (started); the list newest first, its states at 390', async () => {
    await b.resize(390, 844);
    await openQuizTab();
    const rowsBefore = await count('[data-quizzes="row"]');
    await openPanel();
    expect((await attr(PANEL, 'data-layout')) === 'sheet', `layout: ${await attr(PANEL, 'data-layout')}`);
    const box = await b.evaluate(`(() => { const r = document.querySelector('${PANEL}').getBoundingClientRect(); return { x: r.x, w: r.width, bottom: r.bottom }; })()`);
    expect(box.x === 0 && box.w === 390 && box.bottom >= 840, `the sheet: ${JSON.stringify(box)}`);
    // The course's defaults saved at 1280 (Exam tomorrow, Number of questions the past exam's) fill the sliders.
    const values = await sliderValues();
    expect(QUIZ_SLIDER_KEYS.every((k) => values[k] === presetWithExam[k]), `sliders (the course's defaults): ${JSON.stringify(values)}`);
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
    const plan = planQuiz(input({ sliders: presetWithExam, lectures: [{ id: L1, durationMs: 30 * MIN }], flaggedSpans: S30.examSignals.length }));
    await previewIs(plan, '390, Lecture 1');
    const before = (await quizCalls()).length;
    await tap('[data-newquiz="create"]');
    // The permissions were withdrawn in step 6 (the transcript's given again): any asked now is answered.
    const asked = await answerAny({ [ASK_TRANSCRIPT]: 'Allow', [ASK_IMAGES]: 'Not now' }, 4000);
    await waitFor(async () => !(await has(PANEL)), 'the sheet closed', 15000);
    await waitFor(async () => (await count('[data-quizzes="row"]')) === rowsBefore + 1, 'the new quiz listed');
    const titles = await b.evaluate(`[...document.querySelectorAll('[data-quizzes="row"]')].map((r) => r.textContent)`);
    expect(titles[0].startsWith('Math · Lecture 1'), `the list's order: ${JSON.stringify(titles)}`);
    expect((await quizCalls()).slice(before).filter((c) => c.quizId && !c.mode).length === 1, `the 390 quiz wasn't started: ${JSON.stringify((await quizCalls()).slice(before))}`);
    report.push(`RESULT | 390: the quiz started${asked.length ? ` (asked: ${asked.join(' · ')})` : ''}`);
    // The states readable at 390: no state line or reason cut (sideways or by a line clamp); the
    // writing row's state whole; a quiz saved but not started always says why (here: never tried).
    const cut = await b.evaluate(`[...document.querySelectorAll('[data-quizzes="row"] [data-quizzes="detail"], [data-quizzes="row"] [data-quizzes="sub"]')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map((e) => e.textContent)`);
    expect(cut.length === 0, `state text cut at 390: ${JSON.stringify(cut)}`);
    expect((await rowDetail(notStarted)).endsWith('· Writing your quiz…'), `the writing row at 390: ${await rowDetail(notStarted)}`);
    const newest = await attr('[data-quizzes="row"]', 'data-id');
    expect((await rowDetail(newest)).endsWith('· Saved · not started') && (await rowSub(newest)) === 'Not started yet', `the not-started row's reason: ${await rowDetail(newest)} · ${await rowSub(newest)}`);
    await shots('quiz-list-390');
    await b.resize(1280, 900);
  });

  // ---------- step 9.1b-3: taking quizzes ----------

  let firstAttempt = null;
  await step('laptop (desktop-07): Take; the top bar, Question 1 of 8, From your marks; every type answered (keys, hint, mini player, the AI’s grades played); results 6.3 / 10, 4 to review; her grade → 7.5 / 10', async () => {
    // The consent the grading asks for (the transcript permission), given as the student would have.
    await user.client.from('ai_consent').insert({ scope: 'assistant_summary', policy_version: 'dev-2026-10-elevenlabs' }).then(() => {}, () => {});
    allTypes = await readyQuiz('Psico · every type', ALL_TYPES());
    await clean();
    await openTaking(allTypes.id);
    expect((await b.evaluate('location.pathname')) === `/review/quiz/${allTypes.id}`, `the route: ${await b.evaluate('location.pathname')}`);
    expect(await b.hasText('Review today · Math'), 'the top bar’s breadcrumb');
    expect((await text('[role="tab"][aria-selected="true"]')) === 'Quiz me', `the top bar's mode: ${await text('[role="tab"][aria-selected="true"]')}`);
    expect((await progressLabel()) === 'Question 1 of 8', `the label: ${await progressLabel()}`);
    expect((await text('[data-review-progress="marks"]')) === 'From your marks: 1 Exam', `the marks line: ${await text('[data-review-progress="marks"]')}`);
    const width = await b.evaluate(`${visible('[data-quiz-card][data-quiz-question]')}[0].getBoundingClientRect().width`);
    expect(width >= 700 && width <= 721, `the card's width: ${width}`);
    firstAttempt = (await attemptOf(allTypes.id)).id;
    const seen = [];
    for (let n = 1; n <= 8; n++) {
      const q0 = await waitFor(async () => {
        const c = await current();
        return c?.phase === 'question' ? c : null;
      }, `question ${n}`);
      const q = { ...allTypes.questions.get(q0.id), type: q0.type, id: q0.id };
      seen.push(q.type);
      expect((await progressLabel()) === `Question ${n} of 8`, `the label at ${n}: ${await progressLabel()}`);
      if (!['order_steps'].includes(q.type)) expect((await attr('[data-quiz-action="check"]', 'aria-disabled')) === 'true', `Check enabled before an answer (${q.type})`);
      const graded = (await gradeCalls()).length;
      switch (q.type) {
        case 'multiple_choice': {
          expect((await text('[data-quiz-chip]')).startsWith('Exam 9/10 · from 06:40'), `the mark chip: ${await text('[data-quiz-chip]')}`);
          await shots('quiz-take-1280');
          await tap('[data-quiz-action="hint"]');
          await waitFor(() => has('[data-quiz-hint]'), 'the hint');
          await blur();
          await fill(q, 'right');
          await waitFor(async () => (await attr('[data-quiz-option="B"]', 'data-on')) === 'yes', 'B chosen by its key');
          await b.press('Enter');
          await waitFor(() => has('[data-quiz-feedback="correct"]'), 'Right');
          await tap('[data-quiz-source]');
          await waitFor(() => has('[aria-label="Recording player"]'), 'the mini player');
          break;
        }
        case 'true_false':
          await blur();
          await fill(q, 'wrong');
          await b.press('Enter');
          await waitFor(() => has('[data-quiz-feedback="wrong"]'), 'Wrong');
          expect((await text('[data-quiz-right]')) === 'True', `the right answer: ${await text('[data-quiz-right]')}`);
          expect((await text('[data-quiz-added]')).startsWith('Added context · not from the lecture'), 'the added-context box');
          await shots('quiz-feedback-1280');
          break;
        case 'short_answer':
        case 'long_answer': {
          await b.evaluate('window.__gradeHold = true');
          await fill(q);
          // The text settled in the field and in the app (its word count / Check enabled) before the key.
          if (q.type === 'long_answer') await waitFor(async () => (await attr('[data-quiz-words]', 'data-quiz-words')) === '10', async () => `the word count: ${await attr('[data-quiz-words]', 'data-quiz-words')}`);
          await waitFor(async () => (await attr('[data-quiz-action="check"]', 'aria-disabled')) !== 'true', 'Check enabled by the answer');
          await b.sleep(300);
          if (q.type === 'long_answer') await b.chord({ code: 'Enter', key: 'Enter', meta: true, keyCode: 13 });
          else await b.press('Enter');
          // The phase, and any dialog open, when something doesn't come.
          const state = async () => `phase ${(await current())?.phase ?? '?'}; dialog: ${(await b.hasText(ASK_TRANSCRIPT, true)) ? ASK_TRANSCRIPT : 'none'}; grade requests ${(await gradeCalls()).length - graded}`;
          await waitFor(async () => (await current())?.phase === 'feedback', async () => `Check by ${q.type === 'long_answer' ? '⌘ + Enter' : 'Enter'} (${await state()})`, 8000);
          await answerAny({ [ASK_TRANSCRIPT]: 'Allow' }, 4000);
          await waitFor(async () => (await gradeCalls()).length > graded, async () => `the grade request (decision 5: right after Check) (${await state()})`, 15000);
          const call = (await gradeCalls()).at(-1);
          expect(call.quizId === allTypes.id && call.attemptId === firstAttempt, `the grade request: ${JSON.stringify(call)}`);
          await waitFor(() => has('[data-quiz-feedback="pending"]'), 'Grading your answer…');
          const verdict = q.type === 'short_answer' ? 'partly' : 'wrong';
          const g = await aiGrade(firstAttempt, q.id, verdict, verdict === 'partly' ? 'Falta decir que es común.' : 'No nombra las cinco preguntas.');
          if (g.error) throw new Error(`the AI's grade: ${g.error.message}`);
          await b.evaluate('window.__gradeHold = false');
          await waitFor(() => has(`[data-quiz-feedback="${verdict}"]`), `the AI's ${verdict}`, 10000);
          expect((await text('[data-quiz-reason]')).length > 5, 'the reason');
          break;
        }
        case 'fill_blank':
          await fill(q);
          await tap('[data-quiz-action="check"]');
          await waitFor(() => has('[data-quiz-feedback="partly"]'), 'partly (one blank of two)');
          break;
        case 'match_pairs': {
          const shown = await b.evaluate(`${visible('[data-quiz-pair-choice]')}.map((e) => e.textContent)`);
          expect(shown.every((t) => t.startsWith('Choose')), `pairs chosen before: ${JSON.stringify(shown)}`);
          await fill(q, 'right');
          await tap('[data-quiz-action="check"]');
          await waitFor(() => has('[data-quiz-feedback="correct"]'), 'the pairs right');
          break;
        }
        case 'order_steps': {
          const shown = await b.evaluate(`${visible('[data-quiz-step]')}.map((e) => Number(e.getAttribute('data-quiz-step')))`);
          expect(shown.some((k, i) => k !== i), `the steps shown in the right order: ${shown}`);
          await fill(q, 'right');
          await tap('[data-quiz-action="check"]');
          await waitFor(() => has('[data-quiz-feedback="correct"]'), 'the steps right');
          break;
        }
        case 'numeric':
          await fill(q, 'right');
          await b.press('Enter');
          await waitFor(() => has('[data-quiz-feedback="correct"]'), '1.234,5 right');
          break;
      }
      // Enter goes on (a locked field doesn't keep it). A button clicked last (the source chip) keeps the
      // focus and answers Enter itself, as on any web page: the focus is left first. A locked field keeps
      // it (Enter there must go on: react-native-web's fields stop key events, the app listens in capture).
      await b.evaluate(`(() => { const a = document.activeElement; if (a && !/^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur?.(); })()`);
      await b.press('Enter');
      await waitFor(async () => (n === 8 ? has('[data-quiz-results]') : (await current())?.phase === 'question' && (await current()).id !== q.id), `after question ${n}`);
    }
    expect(new Set(seen).size === 8, `the types seen: ${seen.join(', ')}`);
    await waitFor(async () => (await attr('[data-quiz-results]', 'data-quiz-results')) === 'done', 'the results, all graded');
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '6.3 / 10', `score: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
    expect((await count('[data-quiz-result-row]')) === 8, `rows: ${await count('[data-quiz-result-row]')}`);
    expect((await attr('[data-quiz-to-review]', 'data-quiz-to-review')) === '4', `to review: ${await text('[data-quiz-to-review]')}`);
    const done = (await admin.from('quiz_attempts').select('*').eq('id', firstAttempt).single()).data;
    expect(done.status === 'finished' && Number(done.score) === 6.3 && done.duration_ms > 0, `the attempt: ${JSON.stringify(done)}`);
    const answers = await answersOf(firstAttempt);
    const mc = answers.find((a) => allTypes.questions.get(a.question_id).type === 'multiple_choice');
    expect(answers.length === 8 && mc.hint_used === true && mc.graded_by === 'code', `answers: ${answers.length}, the MC: ${JSON.stringify(mc)}`);
    const cards = (await admin.from('flashcards').select('id').eq('user_id', user.id).eq('source', 'quiz').is('deleted_at', null)).data ?? [];
    expect(cards.length === 4, `quiz cards: ${cards.length}`);

    // Her grade on the true/false row.
    const tf = [...allTypes.questions.values()].find((x) => x.type === 'true_false');
    const n = await b.evaluate(`${visible('[data-quiz-result-row]')}.find((r) => r.textContent.includes(${JSON.stringify(tf.prompt)}))?.getAttribute('data-quiz-result-row')`);
    await tap(`[data-quiz-result-row="${n}"] [data-quiz-verdict]`);
    await b.waitText('Your grade', { timeout: 4000 });
    await b.click('Correct', { exact: true });
    await waitFor(async () => (await text(`[data-quiz-result-row="${n}"] [data-quiz-changed]`)) === 'Changed by you (was: Wrong)', 'Changed by you (was: Wrong)');
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '7.5 / 10', `score after her grade: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
    const mine = answers.find((a) => a.question_id === tf.id);
    const after = (await admin.from('quiz_answers').select('verdict, original_verdict, graded_by').eq('id', mine.id).single()).data;
    expect(after.verdict === 'correct' && after.original_verdict === 'wrong' && after.graded_by === 'student', `her grade saved: ${JSON.stringify(after)}`);
    await waitFor(async () => Number((await admin.from('quiz_attempts').select('score').eq('id', firstAttempt).single()).data.score) === 7.5, 'the database’s score 7.5');
    report.push(`RESULT | every type taken: 6.3 / 10 → her grade → 7.5 / 10; grade requests ${(await gradeCalls()).length}`);
    await shots('quiz-results-1280');
  });

  await step('one answer → Escape: answers kept, the row says Resume; Resume goes on at Question 2 of 3; the end; Take again: a new attempt; Quit', async () => {
    const quiz = await readyQuiz('Psico · resume', threeNumeric());
    await clean();
    await openTaking(quiz.id);
    const first = await attemptOf(quiz.id);
    await answerNumeric(quiz);
    await tap('[data-quiz-action="check"]');
    await waitFor(async () => (await current())?.phase === 'feedback', 'its feedback');
    await b.press('Escape');
    await waitFor(onList, 'back on the list', 8000);
    await waitFor(() => has(`${row(quiz.id)} [data-quizzes="resume"]`), async () => `Resume on the row (${await text(row(quiz.id))})`);
    expect((await answersOf(first.id)).length === 1, 'the answer not kept');
    await openTaking(quiz.id, 'resume');
    await waitFor(async () => (await progressLabel()) === 'Question 2 of 3', async () => `resumed at: ${await progressLabel()}`);
    expect((await attemptOf(quiz.id)).id === first.id, 'a new attempt instead of the same one');
    for (let n = 2; n <= 3; n++) {
      await answerNumeric(quiz);
      await b.press('Enter');
      await waitFor(async () => (await current())?.phase === 'feedback', `feedback ${n}`);
      await blur();
      await b.press('Enter');
    }
    await waitFor(() => has('[data-quiz-results]'), 'the results');
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '10 / 10', `score: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
    await tap('[data-quiz-action="again"]');
    await waitFor(async () => (await current())?.phase === 'question' && (await progressLabel()) === 'Question 1 of 3', 'a new attempt');
    const again = await attemptOf(quiz.id);
    expect(again && again.id !== first.id, 'Take again made no new attempt');
    await tap('[data-quiz-action="quit"]');
    await waitFor(onList, 'the list after Quit');
  });

  await step('the list: “Last: 7.5 / 10”; … → Results opens that attempt’s results; Done', async () => {
    const quiz = await readyQuiz('Psico · last score', twoNumeric());
    const ids = [...quiz.questions.keys()];
    const a = await admin.from('quiz_attempts').insert({ user_id: user.id, quiz_id: quiz.id, status: 'finished', started_at: new Date(Date.now() - 5 * MIN).toISOString(), finished_at: new Date().toISOString(), duration_ms: 300000, max_points: 2 }).select('id').single();
    if (a.error) throw new Error(`the attempt: ${a.error.message}`);
    const ans = await admin.from('quiz_answers').insert([
      { user_id: user.id, attempt_id: a.data.id, question_id: ids[0], response: { text: '1234,5' }, verdict: 'correct', points: 1, graded_by: 'code' },
      { user_id: user.id, attempt_id: a.data.id, question_id: ids[1], response: { text: '40' }, verdict: 'partly', points: 0.5, graded_by: 'student', original_verdict: 'wrong' },
    ]);
    if (ans.error) throw new Error(`the answers: ${ans.error.message}`);
    await clean();
    await waitFor(async () => (await rowSub(quiz.id)).includes('Last: 7.5 / 10'), async () => `the row: ${await rowSub(quiz.id)}`);
    await tap(`${row(quiz.id)} [data-quizzes="more"]`);
    await b.waitText('Results', { exact: true, timeout: 4000 });
    await b.click('Results', { exact: true });
    await waitForScreen(quiz.id);
    await waitFor(() => has('[data-quiz-results]'), 'the results');
    expect((await b.evaluate('location.search')).includes(`attempt=${a.data.id}`), `the results' attempt: ${await b.evaluate('location.search')}`);
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '7.5 / 10', `score: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
    expect((await text('[data-quiz-changed]')) === 'Changed by you (was: Wrong)', `her grade's line: ${await text('[data-quiz-changed]')}`);
    await tap('[data-quiz-action="done"]');
    await waitFor(onList, 'the list after Done');
  });

  await step('at the end, 10 s a question: what she typed is saved and graded when the time runs out, the next question comes (no feedback); Finish; 5 / 10', async () => {
    timed = await readyQuiz('Psico · 10 s each', twoNumeric(), { answers: 'atEnd', timeLimit: { kind: 'perQuestion', seconds: 10 } });
    await clean();
    await openTaking(timed.id);
    expect(/^0:(0\d|10) left$/.test(await text('[data-review-progress="marks"]')), `the time: ${await text('[data-review-progress="marks"]')}`);
    const first = await current();
    await fillNth('[data-quiz-field="numeric"]', 0, '12');
    await waitFor(async () => (await progressLabel()) === 'Question 2 of 2', 'the next question after 10 s', 16000);
    expect(!(await has('[data-quiz-feedback]')), 'feedback shown at the end mode');
    const attempt = await attemptOf(timed.id);
    const saved = (await answersOf(attempt.id)).find((a) => a.question_id === first.id);
    expect(saved?.response?.text === '12' && saved.verdict === 'wrong' && saved.graded_by === 'code', `the typed answer: ${JSON.stringify(saved)}`);
    expect((await text('[data-quiz-action="next"]')) === 'Finish', `the last button: ${await text('[data-quiz-action="next"]')}`);
    const second = await current();
    const right = timed.questions.get(second.id).data.answer;
    await fillNth('[data-quiz-field="numeric"]', 0, String(right));
    await b.press('Enter');
    await waitFor(() => has('[data-quiz-results]'), 'the results after Finish');
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '5 / 10', `score: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
  });

  await step('the whole quiz’s time (1 min, started 40 s ago): Resume; what she typed is saved when it runs out, the question not reached is wrong; 0 / 10', async () => {
    total = await readyQuiz('Psico · 1 minute', twoNumeric(), { timeLimit: { kind: 'total', minutes: 1 } });
    const a = await admin.from('quiz_attempts').insert({ user_id: user.id, quiz_id: total.id, status: 'in_progress', started_at: new Date(Date.now() - 40_000).toISOString(), max_points: 2 }).select('id').single();
    if (a.error) throw new Error(`the attempt: ${a.error.message}`);
    await clean();
    await openTaking(total.id, 'resume');
    // Some seconds left (a slow page load eats into the 20 s): whatever is shown, under a minute.
    expect(/^0:[0-2]\d left$/.test(await text('[data-review-progress="marks"]')), `the time: ${await text('[data-review-progress="marks"]')}`);
    const q = await current();
    await fillNth('[data-quiz-field="numeric"]', 0, '99');
    await waitFor(() => has('[data-quiz-results]'), 'the results when the time ran out', 35000);
    const answers = await answersOf(a.data.id);
    const typed = answers.find((x) => x.question_id === q.id);
    const other = answers.find((x) => x.question_id !== q.id);
    expect(answers.length === 2 && typed?.response?.text === '99' && typed.verdict === 'wrong' && other?.verdict === 'wrong' && JSON.stringify(other.response) === '{}', `answers: ${JSON.stringify(answers.map((x) => [x.response, x.verdict]))}`);
    const done = (await admin.from('quiz_attempts').select('status').eq('id', a.data.id).single()).data;
    expect(done.status === 'finished', `the attempt: ${done.status}`);
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '0 / 10', `score: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
  });

  await step('390 (iphone-10): Take full screen (no tab bar, ‹ Quit, Question n of 2), an answer and its feedback, the results; nothing wider than the screen', async () => {
    const quiz = await readyQuiz('Psico · 390', [ALL_TYPES()[0], twoNumeric()[1]]);
    await clean(390);
    await openTaking(quiz.id);
    const tabBar = await b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'Library' && e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0)`);
    expect(!tabBar, 'the tab bar shown');
    expect((await text('[data-quiz-action="quit"]')).includes('Quit'), '‹ Quit');
    expect(await b.hasText('Question 1 of 2', true), 'the phone’s Question 1 of 2');
    const wide = () => b.evaluate('document.documentElement.scrollWidth > 391');
    expect(!(await wide()), 'wider than the screen (question)');
    await shots('quiz-take-390');
    for (let n = 1; n <= 2; n++) {
      const c = await current();
      if (c.type === 'multiple_choice') {
        await blur();
        await keyTap('b');
      } else await answerNumeric(quiz);
      await tap('[data-quiz-action="check"]');
      await waitFor(async () => (await current())?.phase === 'feedback', `the feedback at 390 (${n})`);
      expect(!(await wide()), 'wider than the screen (feedback)');
      if (n === 1) await shots('quiz-feedback-390');
      await tap('[data-quiz-action="next"]');
    }
    await waitFor(() => has('[data-quiz-results]'), 'the results at 390');
    expect((await attr('[data-quiz-score]', 'data-quiz-score')) === '10 / 10', `score: ${await attr('[data-quiz-score]', 'data-quiz-score')}`);
    expect(!(await wide()), 'wider than the screen (results)');
    await shots('quiz-results-390');
    await tap('[data-quiz-action="done"]');
    await waitFor(onList, 'the list after Done');
  });

  await step('the laptop offline: Take greyed (“Taking a quiz needs a connection on the laptop”); online again: Take again', async () => {
    const quiz = await readyQuiz('Psico · offline', twoNumeric());
    // A quiz being written: the list reads it every 5 s, so going offline is noticed (as any request would).
    const writing = await savedQuiz('Math · being written', { status: 'generating' });
    try {
      await clean();
      const take = `${row(quiz.id)} [data-quizzes="take"]`;
      await waitFor(async () => (await attr(take, 'aria-disabled')) !== 'true', 'Take enabled online');
      await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      try {
        await waitFor(async () => (await attr(take, 'aria-disabled')) === 'true', 'Take greyed offline', 20000);
        expect((await attr(take, 'aria-label')) === 'Take Psico · offline', `its label: ${await attr(take, 'aria-label')}`);
        await shots('quiz-list-1280-offline');
      } finally {
        await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      }
      await waitFor(async () => (await attr(take, 'aria-disabled')) !== 'true', 'Take enabled again online', 30000);
    } finally {
      await admin.from('quizzes').update({ deleted_at: new Date().toISOString() }).eq('id', writing);
    }
  });

  await step('no request reached the quiz function on the server or Anthropic (the page answered every one)', async () => {
    const out = requests.filter((u) => /functions\/v1\/quiz\b|anthropic\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
    const calls = await quizCalls();
    report.push(`RESULT | the quiz function asked in the page: ${calls.map((c) => c.mode ?? 'quiz').join(', ') || 'never'}`);
    const others = ((await b.evaluate('window.__functionCalls').catch(() => [])) ?? []).filter((u) => !/\/functions\/v1\/quiz\b/.test(u));
    report.push(`RESULT | other function requests answered in the page: ${others.length ? others.map((u) => u.replace(/^.*\/functions\/v1\//, '')).join(', ') : 'none'}`);
  });

  await step('the composites beside the mockups: desktop-02 and iphone-05 (the panel), desktop-07 and iphone-10 (taking a quiz), light and dark', async () => {
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
    await compose(
      'quiz-compose-take-1280',
      [
        ['desktop-07 (mockup)', mock('desktop-07-review-quiz')],
        ['Question · light', shotOf('quiz-take-1280')],
        ['Question · dark', shotOf('quiz-take-1280-dark')],
        ['Feedback · light', shotOf('quiz-feedback-1280')],
        ['Feedback · dark', shotOf('quiz-feedback-1280-dark')],
        ['Results · light', shotOf('quiz-results-1280')],
        ['Results · dark', shotOf('quiz-results-1280-dark')],
      ],
      560,
    );
    await compose(
      'quiz-compose-take-390',
      [
        ['iphone-10 (mockup)', mock('iphone-10-review')],
        ['Question · light', shotOf('quiz-take-390')],
        ['Question · dark', shotOf('quiz-take-390-dark')],
        ['Feedback · light', shotOf('quiz-feedback-390')],
        ['Feedback · dark', shotOf('quiz-feedback-390-dark')],
        ['Results · light', shotOf('quiz-results-390')],
        ['Results · dark', shotOf('quiz-results-390-dark')],
      ],
      390,
    );
    await b.resize(1280, 900);
    const wanted = [
      'quiz-panel-1280', 'quiz-panel-1280-dark', 'quiz-panel-1280-sliders', 'quiz-panel-1280-sliders-dark', 'quiz-panel-390', 'quiz-panel-390-dark', 'quiz-panel-390-sliders', 'quiz-panel-390-sliders-dark',
      'quiz-list-1280-writing', 'quiz-list-1280', 'quiz-states-1280', 'quiz-states-1280-dark', 'quiz-list-390', 'quiz-list-390-dark',
      'quiz-take-1280', 'quiz-take-1280-dark', 'quiz-feedback-1280', 'quiz-feedback-1280-dark', 'quiz-results-1280', 'quiz-results-1280-dark',
      'quiz-take-390', 'quiz-take-390-dark', 'quiz-feedback-390', 'quiz-feedback-390-dark', 'quiz-results-390', 'quiz-results-390-dark',
    ];
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
