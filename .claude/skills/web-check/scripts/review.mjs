// review.mjs — step 9.1, Quiz me and flashcards, in Chrome against local Supabase (the migration
// 20261029152000_review_cards applied). NO paid call: the summary is a finished `summaries` row the
// check puts in (the 30-min synthetic lecture's, src/test-utils/summary-synthetic-30.json); the
// assistant's and Make flashcard's cards are rows too; nothing calls summarize, Anthropic or OpenAI
// (checked at the end).
//
// Steps:
//   1. The summary's cards: opening its Summary tab saves its flashcards, key terms (kind term) and
//      self-test (kind question), each once (no front twice); every card is due (its review row made
//      by the database); opening it again adds none.
//   2. Quiz me in the document (1280): a "Quiz me" pill on each section heading with a cue; the
//      document menu's "Quiz me" hides every section behind "? cue" and Reveal; Reveal shows one
//      again; "Show all sections"; the documents row never changes (no save).
//   3. Review, Flashcards (1280, desktop-08): no sidebar; the top bar "Review today · Math › Lecture 1",
//      the title, Quiz me | Flashcards; "Card 1 of N", "From your marks: …" (one lecture's cards);
//      the card's label and front, "Click to flip"; the four buttons with 1 min / 1 day / 3 days /
//      7 days. Space flips (the answer and "From Lecture 1"); key 3 (Good) writes the next review
//      (due in 3 days, reps 1, good); Again (due in a minute) brings the card back at the end (N + 1);
//      Hard and Easy as the rule says; → skips without writing; Delete card (Undo toast) trashes the
//      card and its review row, Undo brings both back; every card rated: "All done for today", and
//      the Review today count in the database 0.
//   4. Review, Quiz me (1280, desktop-07): "Question 1 of M" (the self-test), the mark chip when the
//      question came from a mark ("Exam 9/10 · from 06:40"), Show answer (the answer in the card),
//      Next question.
//   5. 390 (iphone-10): Review: "N due today", Flashcards | Quiz me, "TERM · MATH"-style label,
//      "Tap to flip", the four buttons without intervals, the swipe hint; a tap flips; a swipe skips
//      (no review written); the Summary tab's dark Quiz me button hides every section, "Show all".
//   6. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//   7. Composites beside the mockups: review-compose-quiz (desktop-07), review-compose-cards
//      (desktop-08), review-compose-iphone (iphone-10), each light and dark.
//
// The run always ends (its Chrome closed, the process exits), also after failures, when stopped, or
// after 15 minutes. It needs cdp.mjs with the no-throttling flags (2 Nov): without them a headless
// Chrome on macOS can stop drawing frames when nobody is at the screen, and every animation stalls.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start` (migrations applied), and
// `npm run editor:build` done:
//   node .claude/skills/web-check/scripts/review.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node review.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
    await b.shot(`fail-review-${results.length}`).catch(() => {});
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
const plain = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const key = (s) => plain(s).toLowerCase();

const user = await makeUser();
const data = await seed(user.client);
const lectureId = data.lecture.id;
b = await launch();

/**
 * The run always ends: its Chrome closed and the test user dropped, then the process exits, also
 * when it is stopped (Ctrl-C, a kill) or runs past 15 minutes (something waiting for ever).
 */
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
  console.error('review.mjs: still running after 15 minutes; stopping');
  void finish(1);
}, 15 * MIN);
watchdog.unref();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const count = (css) => b.evaluate(`document.querySelectorAll(${JSON.stringify(css)}).length`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
/**
 * The splash still over the page: its "AUTOMATED STUDY" there and not yet faded out (its layers'
 * opacity multiplied). It is removed when its fade ends; a fade that ended visually counts as gone.
 */
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
const cards = async () => (await admin.from('flashcards').select('id, front, back, kind, source, deleted_at, file_id').eq('user_id', user.id)).data ?? [];
const schedule = async (flashcardId) => (await admin.from('review_schedule').select('due_at, interval_days, ease, reps, last_grade, last_reviewed_at').eq('flashcard_id', flashcardId).maybeSingle()).data;
const dueToday = async () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const { count: n } = await admin.from('review_schedule').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('flashcard_id', 'is', null).lte('due_at', end.toISOString());
  return n ?? 0;
};
const summaryTab = async () => (await admin.from('documents').select('content, updated_at').eq('file_id', lectureId).eq('tab', 'summary').maybeSingle()).data;
const openSummary = async () => {
  await b.nav(`${BASE}/doc/${lectureId}?tab=summary&at=${Date.now()}`);
  await waitFor(() => has('[data-callout="notesCheck"]'), 'the summary written into the Summary tab', 25000);
  await waitSplash();
  await b.sleep(800);
};
const openReview = async (mode) => {
  await b.nav(`${BASE}/review${mode === 'quiz' ? '?mode=quiz' : ''}`);
  await waitSplash();
  await waitFor(() => b.evaluate(`!!document.querySelector('[data-review-card], [data-review="done"], [data-quiz-card], [data-quiz="done"]')`), 'the review card', 20000);
  await b.sleep(600);
};
/** The card shown: its side, label, main text, the progress line. */
const shownCard = () =>
  b.evaluate(`(() => {
    const card = document.querySelector('[data-review-card]');
    if (!card) return null;
    const texts = [...card.querySelectorAll('div, span')].filter((e) => e.childElementCount === 0).map((e) => e.textContent.trim()).filter(Boolean);
    return { side: card.getAttribute('data-review-card'), texts, label: document.querySelector('[data-review-progress="label"]')?.textContent ?? '', marks: document.querySelector('[data-review-progress="marks"]')?.textContent ?? '' };
  })()`);
const cardByFront = async (front) => (await cards()).find((c) => key(c.front) === key(front) && !c.deleted_at);
const near = (iso, ms, slack = 2 * MIN) => Math.abs(Date.parse(iso) - (Date.now() + ms)) < slack;
const key3 = async (k) => b.chord({ key: k, code: `Digit${k}`, keyCode: 48 + Number(k), text: k });
const space = () => b.chord({ key: ' ', code: 'Space', keyCode: 32 });

try {
  await b.signIn(BASE, user.email, user.password);
  const { error } = await admin.from('summaries').insert({
    user_id: user.id,
    file_id: lectureId,
    mode: 'new',
    source_lecture_ids: [lectureId],
    sliders: SLIDERS,
    status: 'done',
    result: S30,
    applied_settings: { targetWords: 600, takeaways: 4, selfTestCount: S30.selfTest.length, resources: { slides: false, photos: false, assistant: true, notes: true }, preview: '≈ 600 words' },
    model: 'claude-opus-5-5',
  });
  if (error) throw new Error(`the summary row: ${error.message}`);
  // The assistant's Flashcards and Make flashcard (6.3), on the same lecture.
  await user.client.from('flashcards').insert([
    { source: 'assistant', front: 'Ontogenia', back: 'El desarrollo del individuo.', file_id: lectureId, course_id: data.course.id },
    { source: 'selection', front: 'Heredabilidad', back: 'Varianza genética / varianza fenotípica.', file_id: lectureId, course_id: data.course.id },
  ]);

  let expected = 0;
  await step('the summary’s cards: its flashcards, key terms and self-test, each once; all due; none again on reopening', async () => {
    await b.resize(1280, 900);
    await openSummary();
    const fronts = [...S30.glossary.map((g) => g.term), ...S30.flashcards.map((c) => c.front), ...S30.selfTest.map((q) => q.question)];
    // Each front once per lecture: the assistant's "Ontogenia" and Make flashcard's "Heredabilidad"
    // (inserted above) are two of the glossary's terms, so the summary leaves those out.
    const had = new Set(['Ontogenia', 'Heredabilidad'].map(key));
    expected = new Set(fronts.map(key).filter((k) => !had.has(k))).size;
    const list = await waitFor(async () => {
      const all = (await cards()).filter((c) => c.source === 'summary');
      return all.length >= expected ? all : null;
    }, async () => `summary cards: ${(await cards()).filter((c) => c.source === 'summary').length} of ${expected}`, 20000);
    expect(list.length === expected, `${list.length} summary cards, ${expected} expected`);
    expect(new Set(list.map((c) => key(c.front))).size === list.length, 'a front saved twice');
    const kinds = new Set(list.map((c) => c.kind));
    expect(kinds.has('term') && kinds.has('question') && kinds.has('card'), `kinds: ${[...kinds].join(', ')}`);
    const all = await cards();
    for (const c of all) {
      const s = await schedule(c.id);
      expect(s && Date.parse(s.due_at) <= Date.now() + 1000 && s.reps === 0, `card ${c.front}: ${JSON.stringify(s)}`);
    }
    await openSummary();
    await b.sleep(2000);
    expect((await cards()).length === all.length, 'cards added again on reopening');
    report.push(`RESULT | ${list.length} summary cards (${[...kinds].join(', ')}) + 2 others, all due`);
  });

  await step('Quiz me in the document: pills, every section behind its cue (menu), Reveal, Show all; never saved', async () => {
    await openSummary();
    const sections = await count('.ProseMirror h2[data-cue]');
    expect(sections > 1 && (await count('.studiply-quiz-pill')) === sections, `pills: ${await count('.studiply-quiz-pill')}, cue headings ${sections}`);
    const before = (await summaryTab()).updated_at;
    await b.clickSelector('[aria-label="Document menu"]');
    await b.waitText('Version history', { exact: true, timeout: 5000 });
    // The menu's item, not a section's "Quiz me" pill in the page (the first match in the page's order).
    await b.click('Quiz me', { exact: true, exclude: '.ProseMirror' });
    await waitFor(async () => (await count('.studiply-quiz-cue')) === sections, async () => `the cue boxes: ${await count('.studiply-quiz-cue')} of ${sections}`);
    const hidden = await b.evaluate(`[...document.querySelectorAll('.studiply-quiz-hidden')].every((e) => getComputedStyle(e).display === 'none') && document.querySelectorAll('.studiply-quiz-hidden').length`);
    expect(hidden > 0, 'no hidden blocks');
    await b.evaluate(`document.querySelector('.studiply-quiz-cue')?.scrollIntoView({ block: 'center' })`);
    await shots('review-quiz-doc-1280');
    await b.clickSelector('.studiply-quiz-reveal');
    await waitFor(async () => (await count('.studiply-quiz-cue')) === sections - 1, 'one section revealed');
    await b.clickSelector('[aria-label="Document menu"]');
    await b.waitText('Show all sections', { exact: true, timeout: 5000 });
    await b.click('Show all sections', { exact: true, exclude: '.ProseMirror' });
    await waitFor(async () => (await count('.studiply-quiz-cue')) === 0 && (await count('.studiply-quiz-hidden')) === 0, 'all shown');
    // A pill alone.
    await b.clickSelector('.studiply-quiz-pill');
    await waitFor(async () => (await count('.studiply-quiz-cue')) === 1, 'one section by its pill');
    await b.sleep(2500);
    expect((await summaryTab()).updated_at === before, 'the documents row changed (Quiz me saved something)');
  });

  await step('Review, Flashcards (1280): top bar, Card n of N, the card, Space, Good/Again/Hard/Easy written as the rule says, skip, Delete + Undo, All done', async () => {
    await openReview();
    expect(!(await has('[aria-label="Hide sidebar"]')) && !(await b.hasText('Courses · drop files here')), 'the sidebar is shown');
    expect(await b.hasText('Review today · Math › Lecture 1', true), 'the top bar has no "Review today · Math › Lecture 1"');
    expect(await b.evaluate(`document.querySelector('[aria-label="Flashcards"]')?.getAttribute('aria-selected') === 'true'`), 'Flashcards not selected');
    const total = await dueToday();
    let c = await shownCard();
    expect(c.side === 'front' && c.label === `Card 1 of ${total}` && /^From your marks: /.test(c.marks), `the first card: ${JSON.stringify(c)}`);
    expect(c.texts.includes('Click to flip') && /^(TERM|QUESTION|FLASHCARD)$/.test(c.texts[0]), `the front: ${JSON.stringify(c.texts)}`);
    for (const [label, when] of [['Again', '1 min'], ['Hard', '1 day'], ['Good', '3 days'], ['Easy', '7 days']]) {
      expect(await b.evaluate(`(() => { const e = document.querySelector('[aria-label="${label}"]'); return !!e && e.textContent.includes('${when}'); })()`), `${label} without "${when}"`);
    }
    await shots('review-cards-1280');
    await space();
    await waitFor(async () => (await shownCard())?.side === 'back', 'Space flips the card');
    c = await shownCard();
    expect(c.texts[0] === 'ANSWER' && c.texts.some((t) => t === 'From Lecture 1'), `the back: ${JSON.stringify(c.texts)}`);
    await shots('review-cards-back-1280');
    const front = c.texts[1];
    // Good (key 3): due in 3 days.
    await key3('3');
    const good = await waitFor(async () => {
      const s = await schedule((await cardByFront(front)).id);
      return s?.last_grade === 'good' ? s : null;
    }, 'the Good review written');
    expect(good.reps === 1 && good.interval_days === 3 && near(good.due_at, 3 * DAY), `Good: ${JSON.stringify(good)}`);
    // Again (click): due in a minute, back at the end of the session.
    c = await shownCard();
    const againFront = c.texts[1];
    await b.clickSelector('[aria-label="Again"]');
    const again = await waitFor(async () => {
      const s = await schedule((await cardByFront(againFront)).id);
      return s?.last_grade === 'again' ? s : null;
    }, 'the Again review written');
    expect(again.reps === 0 && near(again.due_at, MIN, 30_000), `Again: ${JSON.stringify(again)}`);
    c = await shownCard();
    expect(c.label === `Card 3 of ${total + 1}`, `after Again: ${c.label}`);
    // Hard and Easy.
    for (const [grade, days] of [['Hard', 1], ['Easy', 7]]) {
      const f = (await shownCard()).texts[1];
      await b.clickSelector(`[aria-label="${grade}"]`);
      const s = await waitFor(async () => {
        const r = await schedule((await cardByFront(f)).id);
        return r?.last_grade === grade.toLowerCase() ? r : null;
      }, `the ${grade} review written`);
      expect(s.interval_days === days && near(s.due_at, days * DAY), `${grade}: ${JSON.stringify(s)}`);
    }
    // → skips: no review written, the next card shown.
    const skipped = (await shownCard()).texts[1];
    await b.chord({ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 });
    await waitFor(async () => (await shownCard()).texts[1] !== skipped, 'the next card after →');
    expect(!(await schedule((await cardByFront(skipped)).id)).last_reviewed_at, 'a skipped card was reviewed');
    // Delete card (on the back), Undo.
    await space();
    await waitFor(async () => (await shownCard())?.side === 'back', 'flipped');
    const gone = (await shownCard()).texts[1];
    const goneId = (await cardByFront(gone)).id;
    // The trash is the card's sibling over its corner, never a button inside the card's button.
    const nesting = await b.evaluate(`({
      inCard: !!document.querySelector('[data-review-card] [aria-label="Delete card"]'),
      nested: [...document.querySelectorAll('button, [role="button"]')].filter((e) => e.parentElement?.closest('button, [role="button"]')).length,
    })`);
    expect(!nesting.inCard && nesting.nested === 0, `buttons inside buttons: ${JSON.stringify(nesting)}`);
    await b.clickSelector('[aria-label="Delete card"]');
    await waitFor(async () => (await admin.from('flashcards').select('deleted_at').eq('id', goneId).single()).data?.deleted_at, 'the card in the trash');
    expect(!(await schedule(goneId)), 'its review row is still there');
    await b.waitText('UNDO', { exact: true, timeout: 5000 });
    await b.click('UNDO', { exact: true });
    await waitFor(async () => !(await admin.from('flashcards').select('deleted_at').eq('id', goneId).single()).data?.deleted_at && (await schedule(goneId)), 'Undo restores the card and its row');
    // Every other card Good, until All done.
    for (let i = 0; i < 80 && !(await has('[data-review="done"]')); i++) {
      await key3('3');
      await b.sleep(350);
    }
    await waitFor(() => has('[data-review="done"]'), '"All done for today"');
    expect(await b.hasText('All done for today', true), 'no "All done for today"');
    await shot('review-cards-done-1280');
    // Undo brought the deleted card back as due: it counts.
    const left = await dueToday();
    expect(left <= 1, `still due today: ${left}`);
    report.push(`RESULT | ${total} cards reviewed at 1280 (Again came back), ${left} due after the session (the restored card)`);
  });

  await step('Review, Quiz me (1280): Question n of M, the mark chip, Show answer, Next question', async () => {
    await openReview('quiz');
    expect(await b.evaluate(`document.querySelector('[aria-label="Quiz me"]')?.getAttribute('aria-selected') === 'true'`), 'Quiz me not selected');
    const M = S30.selfTest.length;
    const label = await text('[data-review-progress="label"]');
    expect(label === `Question 1 of ${M}`, `progress: ${label}`);
    const withMark = S30.selfTest.findIndex((q) => q.fromMarkId && !/^(assistant|repetition):/.test(q.fromMarkId));
    for (let i = 0; i < withMark; i++) {
      await b.clickSelector('[aria-label="Next question"]');
      await b.sleep(200);
    }
    if (withMark >= 0) {
      const chip = await text('[data-quiz-chip]');
      expect(/^(Exam|Confused|Important) \d+\/10( · from \d{2}:\d{2})?$/.test(chip), `the chip: "${chip}"`);
    }
    await shots('review-quiz-1280');
    await b.clickSelector('[aria-label="Show answer"]');
    await waitFor(() => has('[data-quiz-answer="shown"]'), 'the answer');
    await shots('review-quiz-answer-1280');
    await b.clickSelector('[aria-label="Next question"]');
    await waitFor(async () => !(await has('[data-quiz-answer="shown"]')), 'the next question, its answer hidden');
    report.push(`RESULT | Quiz me: ${M} questions${withMark >= 0 ? ', a mark chip' : ''}`);
  });

  await step('390 (iphone-10): Review tab, N due today, the card, tap flips, swipe skips; the Summary tab’s Quiz me button', async () => {
    // Fresh cards for this run (due at once).
    await user.client.from('flashcards').insert(['Sinapsis', 'Neurona', 'Axón'].map((front) => ({ source: 'assistant', front, back: `Definición de ${front}.`, kind: 'term', file_id: lectureId, course_id: data.course.id })));
    await b.resize(390, 844);
    await openReview();
    const due = await text('[data-review="due"]');
    expect(/^\d+ due today$/.test(due), `"${due}"`);
    let c = await shownCard();
    expect(c.texts.includes('Tap to flip') && / · MATH$/.test(c.texts[0]), `the card: ${JSON.stringify(c.texts)}`);
    expect(await b.hasText('Tap to flip · swipe left or right for the next card', true), 'the swipe hint');
    expect(!(await b.evaluate(`document.querySelector('[aria-label="Good"]')?.textContent.includes('days')`)), 'intervals shown at 390');
    await shots('review-cards-390');
    const first = c.texts[1];
    const r = await b.evaluate(`(() => { const e = document.querySelector('[data-review-card]').getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2, w: e.width }; })()`);
    await b.mouseDrag({ x: r.x, y: r.y }, { x: r.x - r.w * 0.6, y: r.y + 4 }, { steps: 14 });
    await waitFor(async () => (await shownCard())?.texts[1] !== first, 'the swipe skips to the next card');
    expect(!(await schedule((await cardByFront(first)).id)).last_reviewed_at, 'a swiped card was reviewed');
    c = await shownCard();
    await b.clickSelector('[data-review-card]');
    await waitFor(async () => (await shownCard())?.side === 'back', 'a tap flips');
    // The Summary tab's dark button.
    await b.nav(`${BASE}/doc/${lectureId}?tab=summary&at=${Date.now()}`);
    await waitFor(() => has('[data-summary-buttons="quiz"]'), 'the Quiz me button under the summary', 25000);
    await waitSplash();
    await b.evaluate(`document.querySelector('[data-summary-buttons="quiz"]').scrollIntoView({ block: 'center' })`);
    await b.clickSelector('[data-summary-buttons="quiz"]');
    await waitFor(async () => (await count('.studiply-quiz-cue')) === (await count('.ProseMirror h2[data-cue]')), 'every section quizzed');
    expect((await text('[data-summary-buttons="quiz"]')) === 'Show all', 'the button says Show all');
    await shots('review-quiz-doc-390');
    await b.clickSelector('[data-summary-buttons="quiz"]');
    await waitFor(async () => (await count('.studiply-quiz-cue')) === 0, 'all shown again');
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites beside the mockups: desktop-07 (quiz), desktop-08 (cards), iphone-10, light and dark', async () => {
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
      // Each image loaded (or 5 s at most): decode() waits for a frame the page may never draw, which hung the run.
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
    await compose('review-compose-quiz', [['desktop-07 (mockup)', mock('desktop-07-review-quiz')], ['Quiz me · light', shotOf('review-quiz-1280')], ['Quiz me · dark', shotOf('review-quiz-1280-dark')], ['Show answer', shotOf('review-quiz-answer-1280')]], 640);
    await compose('review-compose-cards', [['desktop-08 (mockup)', mock('desktop-08-review-flashcards')], ['Flashcards · light', shotOf('review-cards-1280')], ['Flashcards · dark', shotOf('review-cards-1280-dark')], ['Flipped', shotOf('review-cards-back-1280')]], 640);
    await compose('review-compose-iphone', [['iphone-10 (mockup)', mock('iphone-10-review')], ['390 · light', shotOf('review-cards-390')], ['390 · dark', shotOf('review-cards-390-dark')], ['Summary · Quiz me', shotOf('review-quiz-doc-390')]], 390);
    await b.resize(1280, 900);
    const wanted = ['review-quiz-1280', 'review-quiz-1280-dark', 'review-cards-1280', 'review-cards-1280-dark', 'review-cards-390', 'review-cards-390-dark', 'review-quiz-doc-1280', 'review-quiz-doc-390'];
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
