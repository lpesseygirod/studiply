// summary-pdf.mjs — step 8.3, a summary's PDF (SUMMARY-SPEC "PDF export"), on the laptop, against local
// Supabase. NO paid call: the summaries are finished `summaries` rows the check puts in (the 30-min
// synthetic lecture's, src/test-utils/summary-synthetic-30.json, with its board photo; the 8.1 modules
// fixture, summary-modules.json); nothing calls summarize, Anthropic or OpenAI (checked at the end).
// The print document is caught as window.studiplyPrint (as export.mjs does); Chrome's own PDF of it is
// made with Page.printToPDF and read (pages, paper, fonts: each font named and how it is embedded).
//
// Steps:
//   1. The options sheet: Export PDF… on a Summary tab shows Self-test (on), Transcript appendix (off),
//      Paper A4 / Letter (A4: the page setup's), no Page numbers; the hint names
//      "Math – Lecture 1 – YYYY-MM-DD.pdf". On My notes (no summary) the 4.8a dialog, unchanged.
//   2. The default export: the file name; page 1 opens with the title and the meta line, no running
//      header; from page 2 "Math" left and "Lecture 1" right; every page "Studiply" and "Page k of n";
//      times as plain [m:ss] (no chip), no "tap to show", the app's links as words; "Answers" on the last
//      page, one per self-test question, no answer callout before it; no callout, formula, module,
//      graph, photo or table on two pages (except one taller than a page); the header and footer clear
//      of the text (its drawn lines, not the blocks' boxes, which run through the margins when split).
//   3. Chrome's own PDF of it: one PDF page per page, A4 (595.28 × 841.89 pt), every font embedded (as
//      a font file, or as Type3 glyphs: how Chrome embeds macOS's San Francisco), KaTeX's own fonts
//      among them (not Times and STIX in their place).
//   4. Options: self-test off (no Self-test, no Answers); the transcript appendix ("Transcript" from a
//      new page after the Answers, its times as [m:ss]); Letter (the print's @page and Chrome's PDF
//      612 × 792 pt).
//   5. Short tables move whole in a summary: the modules fixture's Summary tab, in the page view (no
//      page gap inside a table) and in its PDF (no table on two pages).
//   6. The dialog at 1280, 390 and in dark mode; no request to summarize, transcribe-chunk, Anthropic or
//      OpenAI.
//   7. Composites: every page of the default PDF in colour and in greyscale (the black-and-white
//      check), the Letter and appendix pages: shots/summary-pdf-compose.png, summary-pdf-compose-grey.png.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start`, and `npm run editor:build` done:
//   node .claude/skills/web-check/scripts/summary-pdf.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node summary-pdf.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS, OUT } = await import(new URL('cdp.mjs', scripts).href);
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
    await b.shot(`fail-summary-pdf-${results.length}`).catch(() => {});
    // A dialog or the print frame left open would answer every later step.
    await b.evaluate(`document.getElementById('print-check')?.remove()`).catch(() => {});
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
const MODULES = JSON.parse(readFileSync(join(repo, 'src/test-utils/summary-modules.json'), 'utf8'));
const SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };
const today = new Date();
const DAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const FILE_NAME = `Math – Lecture 1 – ${DAY}.pdf`;
const QUESTIONS = S30.selfTest.length;
/** A transcript long enough for a few pages: one paragraph per 30 s, each starting with its chip (transcriptDoc's shape). */
const SENTENCE = 'La psicobiología estudia las bases biológicas de la conducta, desde las neuronas hasta los sistemas que regulan el sueño y la memoria.';
const TRANSCRIPT = {
  type: 'doc',
  content: Array.from({ length: 80 }, (_, i) => ({
    type: 'paragraph',
    attrs: { blockId: `t-${i * 30_000 + 5000}`, origin: 'media', editedAt: null },
    content: [{ type: 'timestampChip', attrs: { ms: i * 30_000 + 5000 } }, { type: 'text', text: ` ${SENTENCE} (${i + 1})` }],
  })),
};

const user = await makeUser();
const data = await seed(user.client);
const lectureId = data.lecture.id;
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const waitSplash = () => waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
const taken = new Set();
const shot = async (name) => {
  await b.sleep(400);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(700);
};
const view = (pages) => b.evaluate(`localStorage.setItem('studiply.view', JSON.stringify({ laptop: { pages: ${pages}, zoom: ${pages ? "'fit'" : 1} } }))`);
const openTab = async (id, tab, until) => {
  await b.nav(`${BASE}/doc/${id}?tab=${tab}&at=${Date.now()}`);
  await waitFor(() => has(until), `the ${tab} tab (${until})`, 25000);
  await waitSplash();
  await b.sleep(800);
};
const checked = (label) => b.evaluate(`document.querySelector('[aria-label=${JSON.stringify(label)}]')?.getAttribute('aria-checked') ?? null`);
const openDialog = async () => {
  await b.clickSelector('[aria-label="Document menu"]');
  await b.waitText('Version history', { exact: true, timeout: 5000 });
  await b.click('Export PDF…', { exact: true });
  await waitFor(() => has('[aria-label="Export"]'), 'the export dialog');
  await b.sleep(600);
};
/** Export with these options changed from the defaults; the print document as the laptop made it. */
const exportPdf = async ({ selfTest = true, appendix = false, letter = false } = {}) => {
  await b.evaluate('window.studiplyPrint = undefined');
  await openDialog();
  await waitFor(() => has('[aria-label="Self-test"]'), 'the summary options');
  if (!selfTest) await b.clickSelector('[aria-label="Self-test"]');
  if (appendix) {
    await waitFor(async () => (await b.evaluate(`document.querySelector('[aria-label="Transcript appendix"]')?.getAttribute('aria-disabled')`)) !== 'true', 'the transcript appendix enabled');
    await b.clickSelector('[aria-label="Transcript appendix"]');
  }
  if (letter) await b.clickSelector('[aria-label="Letter"]');
  await b.clickSelector('[aria-label="Export"]');
  const made = await waitFor(() => b.evaluate('window.studiplyPrint ? { pages: window.studiplyPrint.pages, title: window.studiplyPrint.title, fileName: window.studiplyPrint.fileName } : null'), 'the print document', 120000);
  await waitFor(async () => !(await has('[aria-label="Export"]')), 'the dialog closed', 15000);
  return made;
};
/** The print document in a frame over the app, to read it and see it. */
const showPrint = () =>
  b.evaluate(`(async () => {
    document.getElementById('print-check')?.remove();
    const f = document.createElement('iframe');
    f.id = 'print-check';
    Object.assign(f.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', border: '0', zIndex: '99999', background: '#e5e5e5' });
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open(); d.write(window.studiplyPrint.html); d.close();
    await Promise.all([...d.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    await d.fonts.ready;
    await new Promise((r) => setTimeout(r, 400));
    return true;
  })()`);
const hidePrint = () => b.evaluate(`document.getElementById('print-check')?.remove()`);
/**
 * Each page of the shown print: its text; its header and footer; the whole blocks on it (callouts,
 * formula cards, modules, graphs, photos, tables, display formulas) with their height; whether the
 * header and footer stay clear of the text.
 */
const readPrint = () =>
  b.evaluate(`(() => {
    const d = document.getElementById('print-check').contentDocument;
    const WHOLE = '.studiply-callout, .studiply-formula-card, .studiply-module, .studiply-graph, .studiply-photo, .tableWrapper, table, [data-type="block-math"]';
    return [...d.querySelectorAll('.studiply-print-page')].map((page) => {
      const body = page.querySelector('.studiply-print-body').getBoundingClientRect();
      const blocks = [...page.querySelectorAll('.studiply-print-block')];
      // The lines of text shown on this page (not the blocks' boxes: a paragraph split over two pages
      // has one box running through both pages' margins, its lines don't). Text that isn't drawn is
      // left out: the page gaps and page breaks (hidden), KaTeX's MathML copy for screen readers.
      const box = page.getBoundingClientRect();
      const lines = [];
      const walker = d.createTreeWalker(page.querySelector('.studiply-print-body'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.data.trim() || !el || el.closest('.katex-mathml, .studiply-page-gap, .page-break') || getComputedStyle(el).visibility === 'hidden') continue;
        const r = d.createRange();
        r.selectNodeContents(n);
        for (const rect of r.getClientRects()) if (rect.width > 0 && rect.height > 0 && rect.bottom > box.top + 1 && rect.top < box.bottom - 1) lines.push(rect);
      }
      const head = page.querySelector('.studiply-print-header');
      const foot = page.querySelector('.studiply-print-footer');
      const top = lines.length ? Math.min(...lines.map((r) => r.top)) : body.bottom;
      const bottom = lines.length ? Math.max(...lines.map((r) => r.bottom)) : body.top;
      return {
        text: page.querySelector('.studiply-print-body').innerText,
        first: blocks[0]?.innerText.trim().split('\\n')[0] ?? '',
        header: head ? [...head.children].map((s) => s.textContent) : null,
        footer: foot ? [...foot.children].map((s) => s.textContent) : null,
        clear: (!head || head.getBoundingClientRect().bottom <= top + 1) && (!foot || foot.getBoundingClientRect().top >= bottom - 1),
        // Where they are, for the failure's words: header bottom, first line, last line, footer top (px from the page's top).
        edges: [head ? head.getBoundingClientRect().bottom - box.top : null, top - box.top, bottom - box.top, foot ? foot.getBoundingClientRect().top - box.top : null].map((v) => (v === null ? null : Math.round(v))),
        formulas: page.querySelectorAll('.katex-html').length,
        whole: blocks.filter((w) => w.firstElementChild && w.firstElementChild.matches(WHOLE)).map((w) => ({ key: w.innerHTML.length + ':' + w.innerHTML.slice(0, 160), height: w.getBoundingClientRect().height })),
        chips: page.querySelectorAll('.ts-chip').length,
        answers: page.querySelectorAll('[data-callout="answer"]').length,
        pageHeight: page.getBoundingClientRect().height,
      };
    });
  })()`);
/** Blocks that should move whole but sit on two pages (one taller than a page's text may). */
const splitBlocks = (pages) => {
  const seen = new Map();
  pages.forEach((p, k) => p.whole.forEach((w) => seen.set(w.key, [...(seen.get(w.key) ?? []), { k, h: w.height }])));
  return [...seen.entries()].filter(([, at]) => new Set(at.map((x) => x.k)).size > 1 && at[0].h < pages[0].pageHeight * 0.8).map(([key, at]) => `${key.slice(0, 60)}… on pages ${at.map((x) => x.k + 1).join(', ')}`);
};
/** Chrome's own PDF of the print document (as export.mjs makes it): its pages, paper and fonts. */
const chromePdf = async (name) => {
  const html = await b.evaluate('window.studiplyPrint.html');
  await b.nav('about:blank');
  await b.sleep(300);
  // The app's address as the base, so its stylesheets and fonts load as in the print frame.
  await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html.replace('<head>', `<head><base href="${BASE}/">`))}); document.close(); void document.body.offsetHeight; await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; })))); await document.fonts.ready; return true; })()`);
  await b.sleep(800);
  const { data: pdf64 } = await b.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  writeFileSync(join(OUT, `${name}.pdf`), Buffer.from(pdf64, 'base64'));
  const pdf = Buffer.from(pdf64, 'base64').toString('latin1');
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return {
    pages: (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length,
    width: box ? Number(box[1]) : 0,
    height: box ? Number(box[2]) : 0,
    fonts: pdfFonts(pdf),
  };
};
/**
 * Every font in a PDF and how it is in it: `file` (its font file embedded: /FontFile, /FontFile2,
 * /FontFile3), `type3` (Chrome draws a font it won't embed as a file, e.g. macOS's San Francisco, as a
 * Type3 font: each glyph's outline inside the PDF, in /CharProcs, so it is embedded too), or `none`
 * (only named: the reader must have it). Read object by object: a Type3 font shares one descriptor
 * among several font dictionaries, so counting descriptors against font files says nothing.
 */
const pdfFonts = (pdf) => {
  const objects = new Map([...pdf.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)].map((m) => [m[1], m[2]]));
  const type3 = new Set();
  for (const body of objects.values()) {
    if (/\/Subtype\s*\/Type3/.test(body)) {
      const d = body.match(/\/FontDescriptor\s+(\d+)\s+0\s+R/);
      if (d) type3.add(d[1]);
    }
  }
  const fonts = [];
  for (const [num, body] of objects) {
    if (/\/Type\s*\/FontDescriptor/.test(body)) {
      const name = (body.match(/\/FontName\s*\/([^\s/<>[\]]+)/)?.[1] ?? '?').replace(/^[A-Z]{6}\+/, '');
      fonts.push({ name, kind: /\/FontFile[23]?\s/.test(body) ? 'file' : type3.has(num) ? 'type3' : 'none' });
    } else if (/\/Type\s*\/Font\b/.test(body) && /\/Subtype\s*\/(Type1|TrueType|MMType1)/.test(body) && !/\/FontDescriptor/.test(body)) {
      // A font with no descriptor at all: one of the standard 14, named only.
      fonts.push({ name: (body.match(/\/BaseFont\s*\/([^\s/<>[\]]+)/)?.[1] ?? '?').replace(/^[A-Z]{6}\+/, ''), kind: 'none' });
    }
  }
  return fonts;
};
/** The fonts by name and how they are in the PDF ("KaTeX_Main-Regular file, .SFNS-Regular type3"). */
const fontList = (fonts) => [...new Set(fonts.map((f) => `${f.name} ${f.kind}`))].sort().join(', ');
/** Every font embedded; KaTeX's own when the print has formulas. */
const expectFonts = (fonts, label) => {
  const missing = fonts.filter((f) => f.kind === 'none');
  expect(fonts.length > 0 && missing.length === 0, `${label}: fonts not embedded: ${fontList(missing)} (all: ${fontList(fonts)})`);
  expect(!printFormulas || fonts.some((f) => f.name.startsWith('KaTeX_')), `${label}: the print has ${printFormulas} formulas but no KaTeX font: ${fontList(fonts)}`);
};
/** `count` pages of the shown print from page `from` (0-based), each its own screenshot (the window tall enough for a whole page). */
const pageShots = async (prefix, count, from = 0) => {
  await b.resize(1000, 1250);
  for (let k = 0; k < count; k++) {
    const r = await b.evaluate(`(() => { const d = document.getElementById('print-check').contentDocument; const p = d.querySelectorAll('.studiply-print-page')[${from + k}]; p.scrollIntoView({ block: 'start' }); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    await b.sleep(250);
    const { data: png } = await b.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 0.6 } });
    writeFileSync(join(SHOTS, `${prefix}-${k + 1}.png`), Buffer.from(png, 'base64'));
    taken.add(`${prefix}-${k + 1}`);
  }
  await b.resize(1280, 900);
};

/** A board photo, drawn here, as JPEG bytes (the `photos` bucket takes JPEG only, as the app uploads). */
const boardJpeg = async () => {
  const url = await b.evaluate(`(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    g.fillStyle = '#23412f'; g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#e9e4d4'; g.font = '40px Georgia, serif'; g.fillText('Filogenia · Ontogenia', 40, 80);
    return c.toDataURL('image/jpeg', 0.85);
  })()`);
  return Buffer.from(url.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
};
const doneRow = async (fileId, result) => {
  const { error } = await admin.from('summaries').insert({
    user_id: user.id,
    file_id: fileId,
    mode: 'new',
    source_lecture_ids: [fileId],
    sliders: SLIDERS,
    status: 'done',
    result,
    applied_settings: { targetWords: 600, takeaways: 4, selfTestCount: result.selfTest.length, resources: { slides: false, photos: true, assistant: true, notes: true }, preview: '≈ 600 words' },
    model: 'claude-opus-5-5',
  });
  if (error) throw new Error(`the summary row: ${error.message}`);
};

let defaultPages = 0;
let printFormulas = 0;
let modulesId = null;
try {
  await b.nav('about:blank');
  const photoPath = `${user.id}/${lectureId}/board.jpg`;
  const up = await admin.storage.from('photos').upload(photoPath, await boardJpeg(), { contentType: 'image/jpeg' });
  if (up.error) throw new Error(`the photo: ${up.error.message}`);
  const { data: photo } = await admin.from('media').insert({ user_id: user.id, lecture_id: lectureId, kind: 'photo', storage_path: photoPath, mime_type: 'image/jpeg', t_ms: 12 * 60_000 + 40_000, caption: 'Pizarra' }).select('id').single();
  const { error: te } = await user.client.from('documents').insert({ file_id: lectureId, tab: 'transcript', content: TRANSCRIPT });
  if (te) throw new Error(`the transcript tab: ${te.message}`);
  const { data: second } = await admin.from('files').insert({ user_id: user.id, kind: 'lecture', title: 'Tema 3', course_id: data.course.id }).select().single();
  modulesId = second.id;
  await admin.from('lectures').insert({ id: modulesId, user_id: user.id, status: 'transcribing', duration_ms: 50 * 60_000 });
  await b.signIn(BASE, user.email, user.password);
  await doneRow(lectureId, JSON.parse(JSON.stringify(S30).replaceAll('"photo-board"', JSON.stringify(photo.id))));
  await doneRow(modulesId, MODULES);
  await view(true);

  await step('the options sheet on a Summary tab (Self-test on, Transcript appendix off, A4; no Page numbers; the file name); My notes keeps 4.8a’s dialog', async () => {
    await openTab(lectureId, 'summary', '[data-callout="notesCheck"]');
    await openDialog();
    await waitFor(() => has('[aria-label="Self-test"]'), 'the summary options');
    const state = { selfTest: await checked('Self-test'), appendix: await checked('Transcript appendix'), a4: await checked('A4'), letter: await checked('Letter'), numbers: await has('[aria-label="Page numbers"]') };
    expect(state.selfTest === 'true' && state.appendix === 'false' && state.a4 === 'true' && state.letter === 'false' && !state.numbers, `options: ${JSON.stringify(state)}`);
    await b.waitText(FILE_NAME, { timeout: 5000 });
    await shot('summary-pdf-dialog-1280');
    await dark(true);
    await shot('summary-pdf-dialog-1280-dark');
    await dark(false);
    await b.press('Escape');
    await b.sleep(400);
    await openTab(lectureId, 'notes', '.ProseMirror');
    await openDialog();
    const plain = { numbers: await has('[aria-label="Page numbers"]'), selfTest: await has('[aria-label="Self-test"]') };
    expect(plain.numbers && !plain.selfTest, `My notes' dialog: ${JSON.stringify(plain)}`);
    await b.press('Escape');
    await b.sleep(400);
  });

  await step('the default export: file name, title block, header from page 2, footer on every page, [m:ss], Answers last, no block on two pages', async () => {
    await openTab(lectureId, 'summary', '[data-callout="notesCheck"]');
    const made = await exportPdf();
    expect(made.fileName === FILE_NAME, `file name: ${made.fileName}`);
    defaultPages = made.pages;
    await showPrint();
    const pages = await readPrint();
    expect(pages.length === made.pages && pages.length >= 2, `pages: ${pages.length} (print ${made.pages})`);
    expect(pages[0].first === 'Lecture 1' && pages[0].text.includes(`Math · Lecture ·`), `page 1 opens with: ${JSON.stringify(pages[0].text.slice(0, 120))}`);
    expect(pages[0].header === null && pages.slice(1).every((p) => JSON.stringify(p.header) === JSON.stringify(['Math', 'Lecture 1'])), `headers: ${JSON.stringify(pages.map((p) => p.header))}`);
    pages.forEach((p, k) => expect(JSON.stringify(p.footer) === JSON.stringify(['Studiply', `Page ${k + 1} of ${pages.length}`]), `footer ${k + 1}: ${JSON.stringify(p.footer)}`));
    expect(pages.every((p) => p.clear), `header or footer over the text: ${pages.map((p, k) => (p.clear ? '' : `page ${k + 1} [header end, first line, last line, footer start] ${JSON.stringify(p.edges)}`)).filter(Boolean).join('; ')}`);
    printFormulas = pages.reduce((n, p) => n + p.formulas, 0);
    const all = pages.map((p) => p.text).join('\n');
    expect(pages.every((p) => p.chips === 0) && /\[\d+:\d{2}\]/.test(all), 'time chips left, or no [m:ss]');
    expect(!all.includes('tap to show') && all.includes('See them in My notes'), 'the "tap to show" label, or the notes line lost');
    // "Answers" starts a page of its own at the end (its answers may run onto one more page).
    const answersAt = pages.findIndex((p) => /(^|\n)Answers\n/.test(p.text));
    expect(answersAt >= pages.length - 2 && pages[answersAt]?.first === 'Answers' && pages.every((p) => p.answers === 0), `Answers on page ${answersAt + 1} of ${pages.length}; answer callouts: ${pages.map((p) => p.answers).join(',')}`);
    const numbered = (pages.slice(answersAt).map((p) => p.text).join('\n').split('Answers\n')[1] ?? '').split('\n').filter((l) => /^\d+\. /.test(l)).length;
    expect(numbered === QUESTIONS, `${numbered} answers, ${QUESTIONS} questions`);
    const split = splitBlocks(pages);
    expect(split.length === 0, `on two pages: ${split.join(' | ')}`);
    report.push(`RESULT | default: ${pages.length} pages, ${numbered} answers on the last page`);
    await pageShots('summary-pdf-page', Math.min(pages.length, 8));
    await hidePrint();
  });

  await step('Chrome’s own PDF of it: one PDF page per page, A4, every font embedded', async () => {
    const pdf = await chromePdf('summary-a4');
    expect(pdf.pages === defaultPages, `Chrome's PDF has ${pdf.pages} pages, the print ${defaultPages}`);
    expect(Math.abs(pdf.width - 595.28) < 1 && Math.abs(pdf.height - 841.89) < 1, `paper: ${pdf.width} × ${pdf.height} pt`);
    expectFonts(pdf.fonts, 'A4');
    report.push(`RESULT | Chrome's PDF: ${pdf.pages} pages A4; fonts: ${fontList(pdf.fonts)}`);
  });

  await step('options: self-test off (no Self-test, no Answers); the transcript appendix after the Answers; Letter', async () => {
    await openTab(lectureId, 'summary', '[data-callout="notesCheck"]');
    await exportPdf({ selfTest: false });
    await showPrint();
    let pages = await readPrint();
    let all = pages.map((p) => p.text).join('\n');
    expect(!/(^|\n)Answers\n/.test(all) && !/(^|\n)Self-test\n/.test(all), 'a Self-test or Answers left with the self-test off');
    await hidePrint();

    await openTab(lectureId, 'summary', '[data-callout="notesCheck"]');
    const withAppendix = await exportPdf({ appendix: true });
    await showPrint();
    pages = await readPrint();
    const t = pages.findIndex((p) => p.first === 'Transcript');
    const a = pages.findIndex((p) => /(^|\n)Answers\n/.test(p.text));
    expect(t > a && a >= 0 && withAppendix.pages >= defaultPages + 2, `Transcript from page ${t + 1}, Answers on ${a + 1}, ${withAppendix.pages} pages (default ${defaultPages})`);
    all = pages.slice(t).map((p) => p.text).join('\n');
    expect(all.includes('[0:05] La psicobiología') && all.includes('(80)') && pages.every((p) => p.chips === 0), 'the transcript appendix’s lines');
    expect(pages.slice(1).every((p) => p.header) && pages.every((p, k) => p.footer?.[1] === `Page ${k + 1} of ${pages.length}`), 'header or footer missing in the appendix');
    await pageShots('summary-pdf-appendix', 1, t);
    await hidePrint();

    await openTab(lectureId, 'summary', '[data-callout="notesCheck"]');
    await exportPdf({ letter: true });
    expect(await b.evaluate(`window.studiplyPrint.html.includes('@page { size: 21.59cm 27.94cm; margin: 0; }')`), 'the print is not Letter');
    await showPrint();
    await pageShots('summary-pdf-letter', 1);
    await hidePrint();
    const pdf = await chromePdf('summary-letter');
    expect(Math.abs(pdf.width - 612) < 1 && Math.abs(pdf.height - 792) < 1, `Letter PDF: ${pdf.width} × ${pdf.height} pt`);
    expectFonts(pdf.fonts, 'Letter');
    report.push(`RESULT | appendix: ${withAppendix.pages} pages; Letter: ${pdf.pages} pages`);
  });

  await step('short tables move whole in a summary: the modules fixture, in the page view and in its PDF', async () => {
    await openTab(modulesId, 'summary', '[data-module="vocabulary"]');
    await b.sleep(1500);
    const inView = await b.evaluate(`[...document.querySelectorAll('.ProseMirror table')].filter((t) => t.querySelector('tr.studiply-page-gap')).length`);
    expect(inView === 0, `${inView} tables split by a page gap in the page view`);
    await exportPdf();
    await showPrint();
    const pages = await readPrint();
    const split = splitBlocks(pages);
    expect(split.length === 0, `on two pages: ${split.join(' | ')}`);
    const answers = pages.at(-1).text;
    expect(/(^|\n)Answers\n/.test(answers) && pages.every((p) => p.header === null || p.header[1] === 'Tema 3'), 'the modules summary’s Answers or header');
    await pageShots('summary-pdf-modules', Math.min(pages.length, 4));
    await hidePrint();
    report.push(`RESULT | modules: ${pages.length} pages, no table or module on two pages`);
  });

  await step('the dialog at 390; no request to summarize, transcribe-chunk, Anthropic or OpenAI', async () => {
    await b.resize(390, 844);
    await view(false);
    await openTab(lectureId, 'summary', '[data-callout="notesCheck"]');
    await openDialog();
    await waitFor(() => has('[aria-label="Self-test"]'), 'the summary options at 390');
    const wide = await b.evaluate(`document.documentElement.scrollWidth`);
    expect(wide <= 391, `the page is ${wide} px wide`);
    await shot('summary-pdf-dialog-390');
    await b.press('Escape');
    await b.resize(1280, 900);
    await view(true);
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites: summary-pdf-compose (the pages in colour) and summary-pdf-compose-grey (black and white)', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const pageNames = [...taken].filter((n) => /^summary-pdf-(page|appendix|letter|modules)-\d+$/.test(n));
    const cells = [
      ...pageNames.map((n) => [n.replace('summary-pdf-', '').replace(/-(\d+)$/, ' · page $1'), png(join(SHOTS, `${n}.png`))]),
      ...['summary-pdf-dialog-1280', 'summary-pdf-dialog-1280-dark', 'summary-pdf-dialog-390'].map((n) => [n.replace('summary-pdf-', ''), taken.has(n) ? png(join(SHOTS, `${n}.png`)) : null]),
    ];
    await b.nav('about:blank');
    const compose = async (name, grey) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:480px"><figcaption style="font:600 14px -apple-system,sans-serif;margin:0 0 6px">${label}</figcaption>${
          src ? `<img src="${src}" style="max-width:480px;display:block;border:1px solid #bbb;${grey ? 'filter:grayscale(1)' : ''}">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:grid;grid-template-columns:repeat(4, 480px);gap:24px;align-items:start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose('summary-pdf-compose', false);
    await compose('summary-pdf-compose-grey', true);
    await b.resize(1280, 900);
    const missing = ['summary-pdf-page-1', 'summary-pdf-page-2', 'summary-pdf-appendix-1', 'summary-pdf-letter-1', 'summary-pdf-modules-1', 'summary-pdf-dialog-1280', 'summary-pdf-dialog-390'].filter((n) => !taken.has(n));
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
