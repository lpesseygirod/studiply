// extend.mjs — step 7.9, Extend with next lecture, Merge lectures and Make exam pack, in Chrome against
// local Supabase. NO paid call: the test user has no AI consent, so the app saves each request and never
// starts it; the check then plays the server and finishes the row itself (a result as summary-combine.ts
// stores it, built here from the 30-min synthetic lecture's summary). Nothing calls summarize, Anthropic
// or OpenAI (checked at the end).
//
// Steps (1280 unless said):
//   1. Lecture 1's Summary tab (its summary written in, as 7.7); the banner's + Extend with next lecture
//      opens the lecture picker: Lecture 1 the base, Lecture 2 (the next) chosen.
//   2. Continue → the summarize panel in Extend form: "Extend with next lecture", the two lectures, WHERE
//      IT GOES (A new Unit summary chosen; Add to this summary). Generate → a Unit summary file in the
//      course ("Math — Lectures 1–2"), the request row (mode extend, both lectures, target unit, the
//      anchors keyed by the request), its card ("Summary settings saved") while not started.
//   3. The check finishes it → the Unit summary written in: sections tagged "n · Lecture 2 · …", an
//      Update callout ("Update · Lecture 2 · 11:00") after the block it corrects, a Studiply comment on
//      the repeated words (author studiply, the lecture and time kept), the title gets the unit's topic,
//      its flashcards saved once; its notes line counts both lectures ("· Lectures 1, 2", no link).
//   4. The comment: author "Studiply", text "Lecture 2 · 18:30 · …", no Edit and no ▶ play chip (trim on
//      4: the time is kept for later).
//   4b. The Unit summary has a document's menus (advisor, 31 Oct): its document menu (Comments, Version
//      history, Export PDF…, Rename…, Move to…, Cut, Add to Favorites, Delete; no lecture items) and its
//      library tile menu (Open · Rename… · Move to… · Cut · Add to Favorites · Delete); Delete asks
//      "Delete Unit summary" (cancelled here).
//   5. "Add to this summary" from the document menu (the menu fits the window and scrolls: a lecture's is
//      taller than 900 px since 7.9): only what's new into Lecture 1's Summary tab (ids
//      x…, after her sections, before the lists), a version before ("Before the next lecture was added"),
//      her blocks' words unchanged.
//   6. Make exam pack… from the course's title menu: both lectures chosen (both have a summary) → panel →
//      Generate → an Exam pack file; finished → "Built from the summaries of 2 lectures (1, 2)" (no
//      notes check box), then per topic its exam signals, formula cards, key terms and a self-test with
//      the answers hidden.
//   7. 390 px: the picker as a sheet (+ Extend with next), the Unit summary, its comment, the exam pack.
//   8. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//   9. Composites (light and dark): shots/extend-compose-1280.png, shots/extend-compose-390.png.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/extend.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node extend.mjs
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
    await b.shot(`fail-extend-${results.length}`).catch(() => {});
    // A menu, dialog or picker left open would answer every later step.
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MIN = 60_000;
/** lib/summaryDoc summaryKey: "sm" and 8 characters of the summary's id. */
const keyOf = (id) => `sm${id.replace(/[^0-9a-z]/gi, '').toLowerCase().slice(0, 8).padEnd(8, '0')}`;

/** Lecture 2's own summary (Tema 2): S30's shape, other headings and words. */
function tema2() {
  const s = JSON.parse(JSON.stringify(S30));
  s.header = { ...s.header, title: 'La neurona y la sinapsis', number: 2, durationMin: 20 };
  const heads = ['La neurona', 'La sinapsis', 'El potencial de acción', 'Repaso'];
  const words = [
    'La neurona es la célula básica del sistema nervioso: soma, dendritas y axón.',
    'La sinapsis es la unión funcional entre dos neuronas; la presináptica libera neurotransmisores.',
    'El potencial de acción sigue la ley del todo o nada, después viene el periodo refractario.',
    'Repaso de lo visto en el tema.',
  ];
  s.sections.forEach((sec, i) => {
    sec.heading = heads[i % heads.length];
    sec.timestamp = `${[2, 6, 15, 18][i % 4]}:00`;
    sec.markChips = [];
    sec.blocks = sec.blocks.filter((bl) => bl.type !== 'capturedImage' && bl.type !== 'fromNotes' && bl.type !== 'confusedHere');
    sec.blocks.forEach((bl) => bl.type === 'paragraph' && (bl.text = words[i % words.length]));
  });
  s.glossary = [{ term: 'Sinapsis', definition: 'Unión funcional entre dos neuronas.' }];
  s.selfTest = [{ question: '¿Qué es la sinapsis?', kind: 'recall', answer: 'La unión funcional entre dos neuronas.', fromMarkId: '' }];
  s.flashcards = [{ front: 'Sinapsis', back: 'Unión funcional entre dos neuronas' }];
  s.examSignals = [{ text: 'La ley del todo o nada', timestamp: '16:40', source: 'professor', markId: '', level: 0 }];
  return s;
}
const T2 = tema2();
/** Lecture 2's blocks added: its first two sections (the rest "repeats"). */
const keepOf = (s) => s.sections.flatMap((sec, si) => (si < 2 ? sec.blocks.map((_bl, bi) => `s${si}-b${bi}`) : []));

const user = await makeUser();
const data = await seed(user.client);
const L1 = data.lecture.id;
const courseId = data.course.id;
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const texts = (css) => b.evaluate(`[...document.querySelectorAll(${JSON.stringify(css)})].map((e) => e.textContent)`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const taken = new Set();
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
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
const tap = async (css) => {
  const found = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  expect(found, `no element: ${css}`);
  await b.sleep(300);
  await b.clickSelector(css);
};
const scrollTo = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.scrollIntoView({ block: 'center' })`);
const docRow = async (fileId, tab) => (await admin.from('documents').select('id, content, updated_at').eq('file_id', fileId).eq('tab', tab).maybeSingle()).data;
const ids = (content) => (content?.content ?? []).map((x) => String(x.attrs?.blockId ?? ''));
const blockText = (n) => (n.text ?? '') + (n.content ?? []).map(blockText).join('');
const commentMarks = (content) => {
  const out = [];
  const walk = (n) => {
    for (const m of n.marks ?? []) if (m.type === 'comment') out.push({ ...m.attrs, words: n.text });
    (n.content ?? []).forEach(walk);
  };
  walk(content ?? {});
  return out;
};
const path = () => b.evaluate('location.pathname');
const waitSplash = () => waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
const openDoc = async (id, tab) => {
  await b.nav(`${BASE}/doc/${id}${tab ? `?tab=${tab}&at=${Date.now()}` : ''}`);
  await waitSplash();
};
/**
 * Opens the document menu and chooses an item. The menu never runs off the window (a lecture's is
 * taller than 900 px since 7.9: it scrolls), and the item is scrolled into it before the click.
 */
const documentMenu = async (item) => {
  await tap('[aria-label="Document menu"]');
  await b.waitText(item, { exact: true });
  const box = await b.evaluate(`(() => { const m = document.querySelector('[role=menu]'); if (!m) return null; const r = m.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, window: innerHeight }; })()`);
  expect(box && box.top >= 0 && box.bottom <= box.window, `the menu runs off the window: ${JSON.stringify(box)}`);
  // An item with an icon has the icon's glyph as its own first line of text: any line may be its words.
  const p = await b.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menuitem]')].find((x) => x.innerText.split('\\n').some((l) => l.trim() === ${JSON.stringify(item)})); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.bottom <= innerHeight && r.top >= 0 }; })()`);
  expect(p?.visible, `"${item}" can't be reached in the menu: ${JSON.stringify(p)}`);
  await b.sleep(200);
  await b.clickAt(p.x, p.y);
};
/** The newest request of a mode, once the app saved it. */
const pendingRow = (mode) =>
  waitFor(async () => {
    const { data: rows } = await admin.from('summaries').select('id, file_id, mode, status, source_lecture_ids, applied_settings').eq('user_id', user.id).eq('mode', mode).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
    return rows?.[0] ?? null;
  }, `the ${mode} request saved`, 15000);
/** A finished summary for a lecture (no call). */
const doneRow = async (fileId, result) => {
  const { data: row, error } = await admin
    .from('summaries')
    .insert({ user_id: user.id, file_id: fileId, mode: 'new', source_lecture_ids: [fileId], sliders: SLIDERS, status: 'done', result, applied_settings: { targetWords: 231, takeaways: 4, selfTestCount: 7, resources: { slides: false, photos: true, assistant: true, notes: true }, preview: '≈ 231 words' }, model: 'claude-opus-5-5' })
    .select('id')
    .single();
  if (error) throw new Error(`the summary row: ${error.message}`);
  return row.id;
};
/** The server's part, played by the check: the request finished with `result`. */
const finish = async (rowId, result) => {
  const { error } = await admin.from('summaries').update({ status: 'done', result, error: null }).eq('id', rowId);
  if (error) throw new Error(`finishing the request: ${error.message}`);
};
/** A comment and an Update on the base's anchors (as summary-combine's applyReconcile leaves them). */
const reconciled = (anchors, sum2) => {
  const longOnes = anchors.filter((a) => /-s\d+-b\d+$/.test(a.id) && a.text.split(' ').length > 8);
  expect(longOnes.length >= 2, `anchors: ${JSON.stringify(anchors.slice(0, 5))}`);
  const [onComment, onUpdate] = [longOnes[0], longOnes.at(-1)];
  return {
    lectureId: L2,
    // Since the fix after the first paid run: the lecture as written against the existing summary is in the result.
    summaryId: `${sum2}:1`,
    summary: T2,
    number: 2,
    title: 'Lecture 2',
    keep: keepOf(T2),
    comments: [{ anchor: onComment.id, quote: onComment.text.split(' ').slice(1, 5).join(' '), text: 'Lecture 2 · 18:30 · la profesora dijo que esto entra seguro en el examen', lectureId: L2, ms: 18 * MIN + 30_000 }],
    updates: [{ anchor: onUpdate.id, text: 'En realidad, la selección natural la propusieron a la vez Darwin y Wallace en 1858.', lectureId: L2, lecture: 2, ms: 11 * MIN }],
    leftOut: [],
    glossary: T2.glossary,
    selfTest: T2.selfTest,
    flashcards: T2.flashcards,
  };
};

let L2 = null;
let sum1 = null;
let sum2 = null;
let unitId = null;
let unitRow = null;
let packId = null;
try {
  // Lecture 2, after Lecture 1 in the course; the board photo of Lecture 1's summary.
  const { data: f2 } = await user.client.from('files').insert({ kind: 'lecture', title: 'Lecture 2', course_id: courseId }).select().single();
  L2 = f2.id;
  await user.client.from('lectures').insert({ id: L2, status: 'transcribing', duration_ms: 20 * MIN });
  const photoPath = `${user.id}/${L1}/board.png`;
  await admin.storage.from('photos').upload(photoPath, PNG, { contentType: 'image/png' });
  const { data: photo } = await admin.from('media').insert({ user_id: user.id, lecture_id: L1, kind: 'photo', storage_path: photoPath, mime_type: 'image/png', t_ms: 12 * MIN + 40_000, caption: 'Pizarra' }).select('id').single();
  const R1 = JSON.parse(JSON.stringify(S30).replaceAll('"photo-board"', JSON.stringify(photo.id)));

  await b.signIn(BASE, user.email, user.password);
  sum1 = await doneRow(L1, R1);
  sum2 = await doneRow(L2, T2);

  await step('the banner’s + Extend with next lecture: the lecture picker (Lecture 1 the base, Lecture 2 chosen)', async () => {
    await openDoc(L1, 'summary');
    await waitFor(() => has('[data-callout="notesCheck"]'), 'Lecture 1’s summary written in', 25000);
    await tap('[data-summary-banner="extend"]');
    await waitFor(() => has('[data-picker="panel"][data-mode="extend"]'), 'the picker', 10000);
    const panel = await text('[data-picker="panel"]');
    expect(panel.includes('Extend with next lecture') && panel.includes('Lecture 1 · Lecture 1') && panel.includes('The summary it’s added to'), `picker: ${panel}`);
    const rows = await b.evaluate(`[...document.querySelectorAll('[data-picker="lecture"]')].map((e) => ({ t: e.textContent, checked: e.getAttribute('data-checked') }))`);
    expect(rows.length === 1 && rows[0].t.includes('Lecture 2 · Lecture 2') && rows[0].checked === 'true', `rows: ${JSON.stringify(rows)}`);
    await shots('extend-picker-1280');
  });

  await step('Continue → the panel in Extend form; Generate → a Unit summary file and its request (not started: no consent)', async () => {
    await tap('[data-picker="continue"]');
    await waitFor(() => has('[data-summarize="extend-target"]'), 'the panel with WHERE IT GOES', 15000);
    const head = await text('[data-summarize="panel"]');
    expect(head.includes('Extend with next lecture') && head.includes('Lecture 1 · Lecture 1 + Lecture 2 · Lecture 2'), `panel: ${head.slice(0, 200)}`);
    expect((await attr('[data-summarize="extend-unit"]', 'data-checked')) === 'true' && (await attr('[data-summarize="extend-add"]', 'data-checked')) === 'false', 'A new Unit summary by default');
    await scrollTo('[data-summarize="extend-target"]');
    await shots('extend-panel-1280');
    await tap('[data-summarize="generate"]');
    unitRow = await pendingRow('extend');
    unitId = unitRow.file_id;
    expect(unitId !== L1, 'the request is on Lecture 1, not a new file');
    const { data: file } = await admin.from('files').select('kind, title, course_id').eq('id', unitId).single();
    expect(file.kind === 'unit_summary' && file.title === 'Math — Lectures 1–2' && file.course_id === courseId, `file: ${JSON.stringify(file)}`);
    const s = unitRow.applied_settings;
    expect(JSON.stringify(unitRow.source_lecture_ids) === JSON.stringify([L1, L2]) && s.target === 'unit', `row: ${JSON.stringify({ ids: unitRow.source_lecture_ids, target: s.target })}`);
    expect(s.anchors.length > 5 && s.anchors.every((a) => a.id.startsWith(`${keyOf(unitRow.id)}-s`)), `anchors: ${JSON.stringify(s.anchors.slice(0, 3))}`);
    await waitFor(async () => (await path()) === `/doc/${unitId}`, 'the Unit summary opened', 15000);
    await waitFor(() => has('[data-summarize="requested"]'), 'its card (settings saved)', 15000);
    report.push(`RESULT | Unit summary request ${unitRow.id}: ${s.anchors.length} anchors`);
  });

  await step('finished (played by the check) → the Unit summary written in: tagged sections, an Update, a Studiply comment, the title, its flashcards', async () => {
    const add = reconciled(unitRow.applied_settings.anchors, sum2);
    await finish(unitRow.id, {
      format: 'studiply-combined-v1',
      mode: 'extend',
      target: 'unit',
      base: { lectureId: L1, summaryId: sum1, number: 1, title: 'Lecture 1' },
      additions: [add],
      unit: {
        title: 'Bases biológicas de la conducta',
        takeaways: [
          { text: 'La conducta es un proceso biológico producido por el sistema nervioso.', fromMarkIds: [] },
          { text: 'La neurona y la sinapsis son la base de la comunicación nerviosa.', fromMarkIds: [] },
          { text: 'El potencial de acción sigue la ley del todo o nada.', fromMarkIds: [] },
        ],
        selfTest: [
          { question: '¿Qué estudia la Psicobiología?', kind: 'recall', answer: 'La conducta como proceso biológico.', fromMarkId: '' },
          { question: '¿Por qué la sinapsis es química?', kind: 'why', answer: 'Porque se transmite con neurotransmisores.', fromMarkId: '' },
        ],
        flashcards: [
          { front: 'Conducta', back: 'Todo lo que hace un organismo' },
          { front: 'Sinapsis', back: 'Unión funcional entre dos neuronas' },
        ],
        glossary: [...S30.glossary, ...T2.glossary],
      },
      checks: { noRepeats: { pass: true, checked: 12, turnedToComments: 0, leftOut: 0 } },
    });
    await openDoc(unitId);
    const doc = await waitFor(async () => {
      const row = await docRow(unitId, 'notes');
      return row && ids(row.content).some((id) => id.startsWith(keyOf(unitRow.id))) ? row : null;
    }, 'the Unit summary written in', 25000);
    await waitFor(() => has('[data-callout="update"]'), 'the editor showing it', 15000);
    const headings = await texts('.ProseMirror h2');
    expect(headings.some((h) => /^\d+ · Lecture 2 · La neurona/.test(h)), `headings: ${JSON.stringify(headings)}`);
    const label = await text('[data-callout="update"] .studiply-callout-label');
    expect(label === 'Update · Lecture 2 · 11:00', `the Update's label: ${label}`);
    // Its notes line counts both lectures' notes, without a link to "My notes" (its own first tab isn't her notes).
    const check = await text('[data-callout="notesCheck"]');
    expect(/\d+ of \d+ lines and \d+ of \d+ marks used · shown in green as “From your notes” · Lectures 1, 2/.test(check) && !(await has('[data-callout="notesCheck"] a')), `the notes line: ${check}`);
    const blocks = doc.content.content;
    const at = blocks.findIndex((x) => x.attrs?.blockId === add.updates[0].anchor);
    expect(blocks[at + 1]?.attrs?.kind === 'update', 'the Update right after the block it corrects');
    const [mark] = commentMarks(doc.content);
    expect(mark && mark.author === 'studiply' && mark.source?.lectureId === L2 && mark.source?.ms === 18 * MIN + 30_000 && add.comments[0].quote.includes(mark.words.trim().split(' ')[0]), `the comment mark: ${JSON.stringify(mark)}`);
    const { data: file } = await admin.from('files').select('title').eq('id', unitId).single();
    expect(file.title === 'Math — Lectures 1–2: Bases biológicas de la conducta', `title: ${file.title}`);
    const cards = await waitFor(async () => {
      const { data: rows } = await admin.from('flashcards').select('source, source_ref').eq('file_id', unitId);
      return rows?.length ? rows : null;
    }, 'the Unit summary’s flashcards', 10000);
    expect(cards.length === 2 && cards.every((c) => c.source === 'summary' && c.source_ref === unitRow.id), `flashcards: ${JSON.stringify(cards)}`);
    await shots('extend-unit-1280');
    await scrollTo('[data-callout="update"]');
    await shots('extend-update-1280');
    report.push(`RESULT | Unit summary: ${blocks.length} blocks, ${headings.length} headings`);
  });

  await step('the comment: author "Studiply", "Lecture 2 · 18:30 · …", no Edit, no ▶ play chip', async () => {
    await documentMenu('Comments');
    const card = await waitFor(() => b.evaluate(`(() => { const c = document.querySelector('[data-comment-author="studiply"]'); return c ? { t: c.textContent, chip: !!c.querySelector('.ts-chip, [aria-label^="Play"]') } : null; })()`), 'the Studiply comment card', 10000);
    expect(card.t.includes('Studiply') && card.t.includes('Lecture 2 · 18:30 · la profesora dijo que esto entra seguro en el examen'), `card: ${card.t}`);
    expect(!card.t.includes('Edit') && !card.chip, `no Edit, no play: ${JSON.stringify(card)}`);
    await shots('extend-comment-1280');
    await b.press('Escape');
    await b.sleep(300);
  });

  await step('the Unit summary has a document’s menus: its document menu and its library tile menu; Delete asks "Delete Unit summary"', async () => {
    await openDoc(unitId);
    await waitFor(() => has('[data-callout="update"]'), 'the Unit summary', 25000);
    await tap('[aria-label="Document menu"]');
    await b.waitText('Comments', { exact: true });
    // Each item's words (an icon's glyph is a line of its own: the words are its last line).
    const words = await b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].map((e) => e.innerText.trim().split('\\n').map((l) => l.trim()).filter(Boolean)).map((ls) => ls.find((l) => /[A-Za-z]/.test(l)) ?? '')`);
    for (const want of ['Comments', 'Version history', 'Export PDF…', 'Rename…', 'Move to…', 'Cut', 'Add to Favorites', 'Delete']) expect(words.includes(want), `no ${want} in ${JSON.stringify(words)}`);
    for (const not of ['Summarize', 'Extend with next lecture…', 'Merge lectures…', 'Make exam pack…', 'Export PDF']) expect(!words.includes(not), `${not} in ${JSON.stringify(words)}`);
    await shot('extend-unit-menu-1280');
    await b.press('Escape');
    await b.sleep(300);
    await b.nav(`${BASE}/project/${courseId}`);
    await waitSplash();
    const title = (await admin.from('files').select('title').eq('id', unitId).single()).data.title;
    await b.click(title, { button: 'right', exact: true, exclude: '[data-testid=sidebar]' });
    await b.sleep(500);
    const tile = await b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].map((e) => e.innerText.trim().split('\\n')[0])`);
    expect(tile.join('|') === 'Open|Rename…|Move to…|Cut|Add to Favorites|Delete', `tile menu: ${tile.join('|')}`);
    await b.click('Delete', { exact: true });
    await b.waitText('Delete Unit summary', { timeout: 3000 });
    await b.click('Cancel', { exact: true });
    await b.sleep(500);
    expect(!(await admin.from('files').select('deleted_at').eq('id', unitId).single()).data.deleted_at, 'deleted although cancelled');
  });

  await step('"Add to this summary" (document menu): only what’s new into Lecture 1’s Summary tab, a version before, her words unchanged', async () => {
    await openDoc(L1, 'summary');
    await waitFor(() => has('[data-callout="notesCheck"]'), 'Lecture 1’s Summary tab', 25000);
    const before = (await docRow(L1, 'summary')).content;
    await documentMenu('Extend with next lecture…');
    await waitFor(() => has('[data-picker="panel"][data-mode="extend"]'), 'the picker', 10000);
    await tap('[data-picker="continue"]');
    await waitFor(() => has('[data-summarize="extend-add"]'), 'the panel', 15000);
    await tap('[data-summarize="extend-add"]');
    await waitFor(async () => (await attr('[data-summarize="extend-add"]', 'data-checked')) === 'true', 'Add to this summary chosen', 3000);
    await tap('[data-summarize="generate"]');
    const row = await waitFor(async () => {
      const r = await pendingRow('extend');
      return r.id !== unitRow.id ? r : null;
    }, 'the second Extend request', 15000);
    expect(row.file_id === L1 && row.applied_settings.target === 'add', `row: ${JSON.stringify({ file: row.file_id, target: row.applied_settings.target })}`);
    // Her document's own block ids are the anchors.
    const herIds = new Set(ids(before));
    expect(row.applied_settings.anchors.length > 5 && row.applied_settings.anchors.every((a) => herIds.has(a.id)), 'the anchors are her Summary tab’s blocks');
    await finish(row.id, { format: 'studiply-combined-v1', mode: 'extend', target: 'add', base: { lectureId: L1, summaryId: sum1, number: 1, title: 'Lecture 1' }, additions: [reconciled(row.applied_settings.anchors, sum2)], unit: null, checks: { noRepeats: { pass: true, checked: 12, turnedToComments: 0, leftOut: 0 } } });
    await openDoc(L1, 'summary');
    const key = keyOf(row.id);
    const after = await waitFor(async () => {
      const r = await docRow(L1, 'summary');
      return ids(r?.content).some((id) => id.startsWith(`${key}-x0-`)) ? r.content : null;
    }, 'Lecture 2 added to the Summary tab', 25000);
    const hers = (c) => c.content.filter((x) => !String(x.attrs?.blockId ?? '').startsWith(`${key}-`)).map(blockText).join('\n');
    expect(hers(after) === hers(before), 'her blocks’ words changed');
    const all = after.content.map((x) => String(x.attrs?.blockId ?? ''));
    const firstX = all.findIndex((id) => id.startsWith(`${key}-x0-s`));
    const lists = all.findIndex((id) => /^sm[0-9a-z]{8}-(exam|questions|selftest)$/.test(id));
    expect(firstX > 0 && (lists < 0 || firstX < lists), `the new sections before the lists (${firstX}, ${lists})`);
    const { data: versions } = await admin.from('document_versions').select('name').eq('file_id', L1);
    expect(versions.some((v) => v.name === 'Before the next lecture was added'), `versions: ${JSON.stringify(versions)}`);
    await waitFor(() => b.evaluate(`[...document.querySelectorAll('.ProseMirror h2')].some((h) => h.textContent.includes('Lecture 2 · La neurona'))`), 'the added section on screen', 15000);
    await b.evaluate(`[...document.querySelectorAll('.ProseMirror h2')].find((h) => h.textContent.includes('Lecture 2 · La neurona'))?.scrollIntoView({ block: 'start' })`);
    await shot('extend-add-1280');
  });

  await step('Make exam pack… (the course’s title menu): both lectures chosen → panel → Generate → an Exam pack, written in when finished', async () => {
    await b.nav(`${BASE}/project/${courseId}`);
    await waitSplash();
    await tap('[data-testid=crumb-title]');
    await b.waitText('Make exam pack…', { exact: true });
    await b.click('Make exam pack…', { exact: true });
    await waitFor(() => has('[data-picker="panel"][data-mode="exam_pack"]'), 'the picker', 10000);
    const rows = await b.evaluate(`[...document.querySelectorAll('[data-picker="lecture"]')].map((e) => e.getAttribute('data-checked'))`);
    expect(JSON.stringify(rows) === '["true","true"]', `both chosen: ${JSON.stringify(rows)}`);
    await shots('exampack-picker-1280');
    await tap('[data-picker="continue"]');
    await waitFor(() => has('[data-summarize="generate"]'), 'the panel', 15000);
    expect((await text('[data-summarize="panel"]')).includes('Make exam pack'), 'the panel’s title');
    await tap('[data-summarize="generate"]');
    const row = await pendingRow('exam_pack');
    packId = row.file_id;
    const { data: file } = await admin.from('files').select('kind, title').eq('id', packId).single();
    expect(file.kind === 'exam_pack' && file.title === 'Exam pack · Math', `file: ${JSON.stringify(file)}`);
    await finish(row.id, {
      format: 'studiply-exampack-v1',
      mode: 'exam_pack',
      lectures: [
        { lectureId: L1, summaryId: sum1, number: 1, title: 'Lecture 1' },
        { lectureId: L2, summaryId: sum2, number: 2, title: 'Lecture 2' },
      ],
      leftOut: [],
      pack: {
        title: 'Psicobiología',
        topics: [
          {
            heading: 'Qué estudia la Psicobiología',
            examSignals: [{ text: 'Las **cinco preguntas** de la Psicobiología, de memoria', lecture: 1, t: '21:05' }, { text: 'Se repitió: las cinco preguntas entran seguro', lecture: 2, t: '7:00' }],
            formulas: [{ name: 'Heredabilidad', latex: 'h^2 = \\frac{V_G}{V_P}', legend: 'h² heredabilidad · V_G varianza genética · V_P varianza fenotípica' }],
            keyTerms: [{ term: 'Conducta', definition: 'Todo lo que hace un organismo y que podemos observar.' }],
            selfTest: [{ question: '¿Cuáles son las cinco preguntas?', kind: 'recall', answer: 'Estructuras, procesos, regulación, finalidad y evolución.', fromMarkId: '' }],
          },
          {
            heading: 'La neurona y la sinapsis',
            examSignals: [{ text: 'La ley del todo o nada', lecture: 2, t: '16:40' }],
            formulas: [],
            keyTerms: [{ term: 'Sinapsis', definition: 'Unión funcional entre dos neuronas.' }],
            selfTest: [{ question: '¿Por qué el potencial de acción es “todo o nada”?', kind: 'why', answer: 'Porque se dispara entero al pasar el umbral, o no se dispara.', fromMarkId: '' }],
          },
        ],
        flashcards: [{ front: 'Heredabilidad', back: 'h² = V_G / V_P' }],
      },
    });
    await openDoc(packId);
    await waitFor(() => has('[data-callout="exam"]'), 'the exam pack written in', 25000);
    // Its first line says what it's built from, and claims nothing about her notes (no notes check box).
    // Read from the saved document (its first block) and on screen (the first paragraph): in Pages view the
    // editor's first child is the page layout's own element (the page number "1"), not the first block.
    const saved = (await docRow(packId, 'notes'))?.content?.content ?? [];
    expect(saved[0]?.type === 'paragraph' && blockText(saved[0]) === 'Built from the summaries of 2 lectures (1, 2)', `the first block: ${JSON.stringify(saved[0])?.slice(0, 200)}`);
    expect(!saved.some((x) => x.attrs?.kind === 'notesCheck'), 'an exam pack with the notes check box');
    const first = await text('.ProseMirror p');
    expect(first === 'Built from the summaries of 2 lectures (1, 2)', `the first paragraph on screen: ${first}`);
    expect(!(await has('[data-callout="notesCheck"]')), 'an exam pack with "All your notes are in this summary"');
    const headings = await texts('.ProseMirror h2');
    expect(headings[0]?.startsWith('1 · Qué estudia la Psicobiología') && headings[1]?.startsWith('2 · La neurona y la sinapsis'), `headings: ${JSON.stringify(headings)}`);
    const hidden = await b.evaluate(`[...document.querySelectorAll('[data-callout="answer"] .studiply-callout-body')].map((e) => getComputedStyle(e).display)`);
    expect(hidden.length === 2 && hidden.every((d) => d === 'none'), `answers: ${JSON.stringify(hidden)}`);
    expect(await has('.ProseMirror [data-type="formula-card"], .ProseMirror .studiply-formula-card, .ProseMirror [data-formula-card]'), 'the formula card');
    await shots('exampack-1280');
  });

  await step('390 px: the picker as a sheet (+ Extend with next), the Unit summary and its comment, the exam pack', async () => {
    await b.resize(390, 844);
    await b.evaluate(`localStorage.setItem('studiply.view', JSON.stringify({ laptop: { pages: false, zoom: 1 } }))`);
    await openDoc(L1, 'summary');
    await waitFor(() => has('[data-summary-buttons="shown"]'), 'the two buttons', 25000);
    await tap('[data-summary-buttons="extend"]');
    await waitFor(() => has('[data-picker="panel"][data-mode="extend"]'), 'the picker sheet', 10000);
    await shots('extend-picker-390');
    await tap('[data-picker="cancel"]');
    await openDoc(unitId);
    await waitFor(() => has('[data-callout="update"]'), 'the Unit summary', 25000);
    await shots('extend-unit-390');
    await documentMenu('Comments');
    await waitFor(() => has('[data-comment-author="studiply"]'), 'the Studiply comment', 10000);
    await shots('extend-comment-390');
    await b.press('Escape');
    await openDoc(packId);
    await waitFor(() => has('[data-callout="exam"]'), 'the exam pack', 25000);
    await shots('exampack-390');
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites (light and dark): extend-compose-1280, extend-compose-390', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    await b.nav('about:blank');
    const compose = async (name, cells, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 16px -apple-system,sans-serif;margin:0 0 6px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:grid;grid-template-columns:repeat(2, ${w}px);gap:24px">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    const pairs = (list) => list.flatMap(([label, n]) => [[`${label} · light`, shotOf(n)], [`${label} · dark`, shotOf(`${n}-dark`)]]);
    await compose(
      'extend-compose-1280',
      [
        ...pairs([
          ['Lecture picker (Extend)', 'extend-picker-1280'],
          ['Summarize panel: where it goes', 'extend-panel-1280'],
          ['Unit summary', 'extend-unit-1280'],
          ['Update callout', 'extend-update-1280'],
          ['Studiply comment', 'extend-comment-1280'],
          ['Lecture picker (Exam pack)', 'exampack-picker-1280'],
          ['Exam pack', 'exampack-1280'],
        ]),
        ['Add to this summary · light', shotOf('extend-add-1280')],
      ],
      640,
    );
    await compose(
      'extend-compose-390',
      pairs([
        ['Lecture picker (sheet)', 'extend-picker-390'],
        ['Unit summary', 'extend-unit-390'],
        ['Studiply comment', 'extend-comment-390'],
        ['Exam pack', 'exampack-390'],
      ]),
      390,
    );
    await b.resize(1280, 900);
    const wanted = ['extend-picker-1280', 'extend-unit-1280', 'extend-update-1280', 'extend-comment-1280', 'exampack-1280', 'extend-picker-390', 'extend-unit-390', 'extend-comment-390', 'exampack-390'];
    const missing = wanted.filter((n) => !taken.has(n));
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
