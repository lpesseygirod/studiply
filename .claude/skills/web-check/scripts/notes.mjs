// notes.mjs — step 4.9: an earlier note (summaries, legacy-note-v1) becomes the
// lecture's Summary tab when that tab is opened (laptop 1280, a phone's width
// 390, dark mode). Local Supabase only (testuser.mjs refuses anything else).
//   - the first opening of that Summary tab never shows "No summary yet" (it
//     stays loading until the note is found), watched from the page's start;
//   - opening the Summary tab of a lecture with an earlier note converts it:
//     title, summary (paragraphs, heading, lists), the section headings in the
//     lecture's language (Spanish here), key concepts, formulas (KaTeX),
//     Definition callouts, unclear parts, the Clarify highlight as a quote and
//     an "Added context" callout, tags, Attachments with the photo shown (the
//     same file) and the PDF by name; saved as the lecture's summary tab with
//     each block's origin (the summary's from the note: ai; the rest student;
//     the attachments media);
//   - the earlier note (its summaries row) is left exactly as it was;
//   - a reload converts nothing again: the same blocks, one row;
//   - the student's typing in it stays after a reload;
//   - a note generated again afterwards (the generate flow still writes the
//     old format until Phase 7) does NOT reach the Summary tab; the old notes
//     view shows that newer note;
//   - a lecture whose Summary tab already has a document (the student's own)
//     keeps it: its older note doesn't overwrite it;
//   - a lecture with no note: "This lecture has no summary.", nothing made;
//   - 390 and dark: no sideways scroll; screenshots.
//   - every screenshot (and every opened Summary tab) waits until the app's
//     splash (STUDIPLY / AUTOMATED STUDY, on every page load) is gone, and
//     asserts it is.
//   - screenshots notes-summary-1280, notes-summary-attachments-1280,
//     notes-summary-1280-dark, notes-summary-390, notes-old-view-1280.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps (several: separated by |).
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node notes.mjs
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// The driver beside this file (installed), or in WEB_CHECK_SCRIPTS (a copy run from elsewhere).
const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const ONLY = process.env.WEB_CHECK_ONLY;
const results = [];
let b;
const step = async (name, fn) => {
  if (ONLY && !ONLY.split('|').some((part) => name.includes(part))) return;
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-notes-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const EDITOR = 'window.studiplyEditor';

/** `what`: the failure's words, or a function giving them (called only on a time-out, so it can read the page). */
async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(250);
  }
}

/**
 * A real JPEG, drawn on a canvas in Chrome: the photos bucket takes image/jpeg only (the app
 * converts every picture to JPEG, storage migration), so the lecture's photo is one.
 */
const jpeg = async () => {
  const dataUrl = await b.evaluate(`(() => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 120;
    const g = c.getContext('2d');
    g.fillStyle = '#4F43B0';
    g.fillRect(0, 0, 240, 120);
    g.fillStyle = '#FFFFFF';
    g.font = '40px sans-serif';
    g.fillText('Foto', 24, 76);
    return c.toDataURL('image/jpeg', 0.9);
  })()`);
  expect(typeof dataUrl === 'string' && dataUrl.startsWith('data:image/jpeg;base64,'), `the canvas gave ${String(dataUrl).slice(0, 30)}`);
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
};

// The earlier note, as step 1.9's import and today's generate flow store it.
const NOTE = {
  format: 'legacy-note-v1',
  title: 'Tema 3: la sinapsis',
  summaryLevel: 'standard',
  recordingMode: 'lecture',
  summary: 'La **sinapsis** es la unión entre *dos* neuronas.\n\n## Tipos\n- Química\n- Eléctrica\n\n1. Llega el potencial\n2. Se liberan neurotransmisores',
  keyConcepts: [{ term: 'Sinapsis', explanation: 'unión funcional' }, { term: 'Axón' }],
  formulas: [{ name: 'Ecuación de Nernst', expression: 'E = \\frac{RT}{zF} \\ln \\frac{[X]_o}{[X]_i}', description: 'El potencial de equilibrio.' }],
  definitions: [{ term: 'Neurona', definition: 'Célula del sistema nervioso.' }],
  tags: ['psicobiología', 'tema 3'],
  unclearParts: [{ excerpt: 'el canal de… algo', reason: 'Se oye mal en la grabación.' }],
  manualAnnotations: JSON.stringify({ clarifications: [{ highlightedParts: ['potencial de acción'], response: 'Un cambio rápido del voltaje de la membrana.', createdAt: '2026-10-01T10:00:00Z' }] }),
  isConfirmed: true,
  blocks: { summary: { origin: 'ai', editedAt: '2026-10-01T09:00:00.000Z', device: 'check' } },
};
const OLD_NOTE = { ...NOTE, title: 'Nota antigua', summary: 'Un resumen antiguo que no debe aparecer.', blocks: undefined };
const REGENERATED = { ...NOTE, summary: 'Resumen generado otra vez, después de convertir.' };

const user = await makeUser();
const c = user.client;
// Chrome first: the photo is drawn there (jpeg()).
b = await launch();
let course = null;
// The values the schema allows (migrations): lectures.status draft | recording | uploading |
// transcribing | ready | failed (the app's "completed" is "ready"); lectures.language a 2–3
// letter code; media.kind photo | slides | reading | link; the photos bucket JPEG only, the
// slides bucket PDF, PNG or JPEG; summaries.mode new | extend | merge | exam_pack and status
// pending | generating | checking | done | failed; documents.tab notes | summary | transcript | t-<uuid>.
const lecture = async (title) => {
  const { data: file, error } = await c.from('files').insert({ kind: 'lecture', title, course_id: course.id }).select().single();
  if (error) throw new Error(`the lecture ${title}: ${error.message}`);
  const { error: e2 } = await c.from('lectures').insert({ id: file.id, status: 'ready', duration_ms: 60000, language: 'es' });
  if (e2) throw new Error(`the lecture ${title}: ${e2.message}`);
  return file.id;
};
const addNote = async (lectureId, result) => {
  const { data, error } = await c
    .from('summaries')
    .insert({ file_id: lectureId, mode: 'new', source_lecture_ids: [lectureId], sliders: { summaryLevel: 'standard' }, result, status: 'done' })
    .select()
    .single();
  if (error) throw new Error(`the note: ${error.message}`);
  return data;
};
const OWN = { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'own-1', origin: 'student', editedAt: null }, content: [{ type: 'text', text: 'Mi resumen propio.' }] }] };
const photoId = randomUUID();
const pdfId = randomUUID();
let L1 = null;
let L2 = null;
let L3 = null;
let note1 = null;
/**
 * L1: an earlier note, a photo (JPEG) and a PDF. L2: no note. L3: the student's own Summary
 * document, and an older note. Inside the run's try, so a failure here still removes the user.
 */
const seedData = async () => {
  const made = await c.from('courses').insert({ name: 'Psicobiología' }).select().single();
  if (made.error) throw new Error(`the course: ${made.error.message}`);
  course = made.data;
  L1 = await lecture('Tema 3');
  note1 = await addNote(L1, NOTE);
  const photoPath = `${user.id}/${L1}/${photoId}.jpg`;
  const { error } = await c.storage.from('photos').upload(photoPath, await jpeg(), { contentType: 'image/jpeg' });
  if (error) throw new Error(`the photo: ${error.message}`);
  const { error: e2 } = await c.from('media').insert({ id: photoId, lecture_id: L1, kind: 'photo', storage_path: photoPath, mime_type: 'image/jpeg' });
  if (e2) throw new Error(`the photo row: ${e2.message}`);
  const pdfPath = `${user.id}/${L1}/${pdfId}.pdf`;
  const { error: e3 } = await c.storage.from('slides').upload(pdfPath, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), { contentType: 'application/pdf' });
  if (e3) throw new Error(`the PDF: ${e3.message}`);
  const { error: e4 } = await c.from('media').insert({ id: pdfId, lecture_id: L1, kind: 'slides', storage_path: pdfPath, mime_type: 'application/pdf', caption: 'Tema 3.pdf' });
  if (e4) throw new Error(`the PDF row: ${e4.message}`);
  L2 = await lecture('Tema 4');
  L3 = await lecture('Tema 5');
  await addNote(L3, OLD_NOTE);
  const { error: e5 } = await c.from('documents').insert({ file_id: L3, tab: 'summary', content: OWN });
  if (e5) throw new Error(`the own summary: ${e5.message}`);
};

const scheme = (v) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });
const editorText = () => b.evaluate(`${EDITOR}?.view?.dom ? ${EDITOR}.getText() : ''`);
/**
 * The app's splash (STUDIPLY / AUTOMATED STUDY, app/_layout.tsx) over the page: shown on every
 * page load, faded out after about 1.8 s, then removed. Its subtitle is nowhere else in the app.
 */
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const splashGone = async () => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  expect(!(await splashShown()), 'the splash screen is still over the page');
};
/** A screenshot of the page itself: never while the splash still covers it (asserted). */
const shot = async (name) => {
  await splashGone();
  await b.shot(name);
};
/** Opens a lecture's Summary tab and waits until `ready` (a function of the editor's text) holds and the splash is gone. */
const openSummary = async (lectureId, ready, what) => {
  await b.nav(`${BASE}/doc/${lectureId}?tab=summary`);
  await waitFor(async () => ready(await editorText()), async () => `${what} (the text: "${(await editorText()).slice(0, 120)}")`, 40000);
  await splashGone();
  await b.sleep(800);
};
/**
 * Installed in every new page before the app runs (until removed): notes whether the Summary tab's
 * "No summary yet" card (its label or its texts) ever appears, even for a moment.
 */
const NO_SUMMARY = ['No summary yet', 'This lecture has no summary', 'summarized yet'];
const WATCH_NO_SUMMARY = `(() => {
  window.__studiplySawNoSummary = false;
  const words = ${JSON.stringify(NO_SUMMARY)};
  const look = () => {
    const t = document.body ? document.body.textContent : '';
    if (words.some((w) => t.includes(w))) window.__studiplySawNoSummary = true;
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true });
})();`;
const summaryRows = async (lectureId) => (await admin.from('documents').select('*').eq('file_id', lectureId).eq('tab', 'summary')).data ?? [];
const noteRows = async (lectureId) => (await admin.from('summaries').select('*').eq('file_id', lectureId).order('created_at')).data ?? [];
const blocksOf = (row) => row?.content?.content ?? [];
const noSideScroll = () => b.evaluate(`document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1`);
let converted = null;

try {
  try {
    await seedData();
  } catch (err) {
    results.push(['FAIL', 'seeding the test data', err.message]);
    throw err;
  }
  await b.signIn(BASE, user.email, user.password);

  await step('1280: opening the Summary tab converts the earlier note (never showing "No summary yet" first): every section, headings in Spanish, the photo shown', async () => {
    // The first opening of an unconverted lecture: the tab stays loading until the note is found, then converts it.
    const { identifier } = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_NO_SUMMARY });
    try {
      await openSummary(L1, (t) => t.includes('Conceptos clave'), 'the converted Summary tab');
      const saw = await b.evaluate('window.__studiplySawNoSummary');
      expect(saw === false, saw === true ? '"No summary yet" showed before the note was converted' : `the watcher didn't run (${saw})`);
    } finally {
      await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
    const t = await editorText();
    for (const s of ['Tema 3: la sinapsis', 'Tipos', 'Química', 'Eléctrica', 'Fórmulas', 'Ecuación de Nernst', 'Definiciones', 'Neurona', 'Partes poco claras', 'el canal de… algo', 'Aclaraciones', 'potencial de acción', 'Un cambio rápido del voltaje', 'Etiquetas: psicobiología, tema 3', 'Adjuntos', 'PDF: Tema 3.pdf']) expect(t.includes(s), `no "${s}" in the Summary tab`);
    const dom = await b.evaluate(`(() => {
      const d = ${EDITOR}.view.dom;
      return {
        title: d.querySelector('.doc-title')?.textContent ?? null,
        bold: [...d.querySelectorAll('strong')].map((e) => e.textContent),
        lists: d.querySelectorAll('ul').length + d.querySelectorAll('ol').length,
        katex: !!d.querySelector('.katex'),
        definition: !!d.querySelector('[data-callout="definition"]'),
        added: d.querySelector('[data-callout="addedContext"]')?.textContent ?? null,
        quotes: [...d.querySelectorAll('blockquote')].map((e) => e.textContent.trim()),
      };
    })()`);
    expect(dom.title === 'Tema 3: la sinapsis', `title: ${dom.title}`);
    expect(dom.bold.includes('sinapsis') && dom.bold.includes('Sinapsis'), `bold: ${JSON.stringify(dom.bold)}`);
    expect(dom.lists >= 3 && dom.katex && dom.definition, JSON.stringify(dom));
    expect(dom.added && dom.added.includes('Un cambio rápido'), `the Added context callout: ${dom.added}`);
    expect(dom.quotes.includes('potencial de acción') && dom.quotes.includes('el canal de… algo'), `quotes: ${JSON.stringify(dom.quotes)}`);
    // The photo: the lecture's own file, shown.
    await waitFor(() => b.evaluate(`[...${EDITOR}.view.dom.querySelectorAll('img')].some((i) => i.complete && i.naturalWidth > 0)`), 'the photo shown', 20000);
    const rows = await summaryRows(L1);
    expect(rows.length === 1, `summary rows: ${rows.length}`);
    converted = rows[0];
    const byId = Object.fromEntries(blocksOf(converted).map((x) => [x.attrs?.blockId, x]));
    expect(byId['legacy-summary-0']?.attrs?.origin === 'ai', `the summary's origin: ${byId['legacy-summary-0']?.attrs?.origin}`);
    expect(byId['legacy-title-0']?.attrs?.origin === 'student', `the title's origin: ${byId['legacy-title-0']?.attrs?.origin}`);
    const photo = blocksOf(converted).find((x) => x.type === 'image');
    expect(photo?.attrs?.src === `media:${photoId}` && photo.attrs.origin === 'media', `the photo block: ${JSON.stringify(photo?.attrs)}`);
    await shot('notes-summary-1280');
    await b.evaluate(`[...${EDITOR}.view.dom.querySelectorAll('h2')].find((h) => h.textContent === 'Adjuntos')?.scrollIntoView({ block: 'center' })`);
    await b.sleep(500);
    await shot('notes-summary-attachments-1280');
  });

  await step('the earlier note is left exactly as it was', async () => {
    const rows = await noteRows(L1);
    expect(rows.length === 1, `notes: ${rows.length}`);
    expect(JSON.stringify(rows[0].result) === JSON.stringify(note1.result), 'the note changed');
    expect(rows[0].updated_at === note1.updated_at, `updated_at moved: ${note1.updated_at} → ${rows[0].updated_at}`);
  });

  await step('a reload converts nothing again: the same blocks, one row', async () => {
    expect(converted, 'no converted document from the first step');
    await openSummary(L1, (t) => t.includes('Conceptos clave'), 'the Summary tab after a reload');
    const rows = await summaryRows(L1);
    expect(rows.length === 1, `summary rows: ${rows.length}`);
    const ids = (row) => JSON.stringify(blocksOf(row).map((x) => x.attrs?.blockId));
    expect(ids(rows[0]) === ids(converted), 'the blocks changed');
    const headings = await b.evaluate(`[...${EDITOR}.view.dom.querySelectorAll('h2')].map((h) => h.textContent)`);
    expect(headings.filter((h) => h === 'Conceptos clave').length === 1, `headings: ${JSON.stringify(headings)}`);
  });

  await step('the student’s typing stays after a reload (never converted again)', async () => {
    await b.evaluate(`${EDITOR}.chain().focus('end').run()`);
    await b.type(' (mío)');
    await waitFor(async () => JSON.stringify((await summaryRows(L1))[0]?.content ?? {}).includes('(mío)'), 'the typing saved', 20000);
    await openSummary(L1, (t) => t.includes('(mío)'), 'the typing after a reload');
    expect((await summaryRows(L1)).length === 1, 'more than one summary row');
  });

  await step('a note generated again afterwards does not reach the Summary tab; the old notes view shows it', async () => {
    const ids = (row) => JSON.stringify(blocksOf(row).map((x) => x.attrs?.blockId));
    const before = ids((await summaryRows(L1))[0]);
    await b.sleep(1100); // a later created_at than the first note
    await addNote(L1, REGENERATED);
    await openSummary(L1, (t) => t.includes('(mío)'), 'the Summary tab after the new note');
    const t = await editorText();
    expect(!t.includes('generado otra vez'), 'the new note reached the Summary tab');
    const rows = await summaryRows(L1);
    expect(rows.length === 1, `summary rows: ${rows.length}`);
    expect(ids(rows[0]) === before, 'the Summary document’s blocks changed');
    const saved = JSON.stringify(rows[0].content);
    expect(saved.includes('(mío)') && !saved.includes('generado otra vez'), 'the saved Summary document changed');
    // The old notes view (as it is) shows the newest note.
    await b.nav(`${BASE}/note/${L1}`);
    await b.waitText('generado otra vez', { timeout: 30000 });
    await b.sleep(800);
    await shot('notes-old-view-1280');
  });

  await step('a lecture whose Summary tab is the student’s own keeps it; its older note doesn’t overwrite it', async () => {
    await openSummary(L3, (t) => t.includes('Mi resumen propio.'), 'the own Summary document');
    const t = await editorText();
    expect(!t.includes('Un resumen antiguo') && !t.includes('Conceptos clave'), 'the older note reached it');
    const rows = await summaryRows(L3);
    expect(rows.length === 1, `summary rows: ${rows.length}`);
    expect(JSON.stringify(blocksOf(rows[0]).map((x) => x.attrs?.blockId)) === JSON.stringify(['own-1']), `blocks: ${JSON.stringify(blocksOf(rows[0]).map((x) => x.attrs?.blockId))}`);
  });

  await step('a lecture with no note: "This lecture has no summary.", nothing made', async () => {
    await b.nav(`${BASE}/doc/${L2}?tab=summary`);
    await b.waitText('This lecture has no summary.', { timeout: 30000 });
    await b.sleep(1000);
    expect((await summaryRows(L2)).length === 0, 'a summary row was made');
  });

  await step('dark mode and 390: the converted tab, no sideways scroll', async () => {
    try {
      await openSummary(L1, (t) => t.includes('Conceptos clave'), 'the Summary tab');
      await scheme('dark');
      await b.sleep(600);
      await shot('notes-summary-1280-dark');
      await scheme('light');
      await b.resize(390, 844);
      await openSummary(L1, (t) => t.includes('Conceptos clave'), 'the Summary tab at 390');
      expect(await noSideScroll(), 'the page scrolls sideways at 390');
      await shot('notes-summary-390');
    } finally {
      await scheme('light');
      await b.resize(1280, 900);
    }
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
