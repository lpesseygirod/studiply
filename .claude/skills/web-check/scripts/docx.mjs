// docx.mjs — Word export and import (step 4.8b), on the laptop (1280), at a
// phone's width (390) and in the iPhone's editor bundle:
//   - the spike first: the formulas in the exported .docx are pictures that
//     match the editor's own drawing (KaTeX): each picture's dark pixels
//     against a screenshot of the live formula's own box (KaTeX's pieces,
//     1 px around, as the export crops; never cut at its edges) taken at
//     device scale 2, the picture's own resolution (same size within 8 %;
//     ≥ 0.7 of all dark pixels have ink in the other within 1 px, both
//     aligned by their ink, never scaled), the picture the size of
//     that box within a pixel, drawn at twice its placed size (sharp), and
//     the inline formula lowered in Word by the live formula's depth below
//     its baseline (within 2 half points); the pictures and the screenshots
//     are saved to look at (spike-*.png) and shown side by side
//     (shots/docx-spike-formulas);
//   - the document menu has Export PDF… and Export Word…; Export Word… opens
//     the export dialog with Word chosen (This tab / All tabs, Page numbers on);
//   - This tab: the file downloads as "<title>.docx"; inside (unzipped here):
//     Title and Heading 1/2 styles, lists (Word numbering), the checklist,
//     the table with its cell colour, the page break, A4 with its margins,
//     the footer's page field, the callout's label, four pictures (two
//     formulas, the graph, the photo), none missing;
//   - All tabs: a section per tab with its name as a Heading 1, the sheet tab
//     as a table of values (PMT's 898.0893756);
//   - import: a .docx made here with the docx library (Title, headings,
//     bold, italic, underline, a colour, a highlight, both lists, a 3 × 3
//     table with a coloured cell, a picture, a page break, a comment, a
//     header) through Upload (the file picker) into a folder and dropped from
//     the Finder on a sidebar course: a document named after the file, in
//     that place, its content as in the file, the picture a photo of the
//     document (media row and Storage object); the note says what wasn't
//     kept (header, the comment, the colours);
//   - an old .doc is refused with its message;
//   - round trip: the exported file imported again has the same title,
//     headings, lists and table;
//   - a transparent logo (transparent black around a red square) imported:
//     the stored JPEG is white around the red square, not black;
//   - the same logo as a PNG put straight into a document (Insert → Image)
//     and uploaded to the library (+ New → Upload document): white too;
//   - 390: the dialog with Word and the import note fit the window;
//   - the iPhone's editor bundle (the export bridge's): draws the formulas
//     and the graph, the formula matching its own KaTeX at the page's text
//     size (this page runs the bundle without the app's stylesheet, so its
//     text is the browser's 16 px, not the app's 15), draws the logo on
//     white, and reads a Word page (mammoth's HTML, made here) into a document.
// Screenshots are taken of the window as it is (captureBeyondViewport would
// make the window as tall as the page and the app would lay itself out again).
//   - screenshots: docx-dialog-word-1280 / -1280-dark / -390 / -390-dark,
//     docx-import-note-1280 / -1280-dark / -390 / -390-dark,
//     docx-imported-1280, docx-spike-formulas.
// Needs the iPhone bundle rebuilt (npm run editor:build) for its step.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps (several: separated by |).
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node docx.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

// The driver beside this file (installed), or in WEB_CHECK_SCRIPTS (a copy run from elsewhere).
const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, OUT, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const scriptsDir = fileURLToPath(scripts);
const repo = join(scriptsDir, '../../../../');
// The app's own libraries (docx to make the Word fixture, JSZip to read the export, mammoth for the bundle's step).
const need = createRequire(join(repo, 'package.json'));
const docx = need('docx');
const JSZip = need('jszip');
const mammoth = need('mammoth');

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
    await b.shot(`fail-docx-${results.length}`).catch(() => {});
    await b.evaluate(`document.getElementById('docx-check')?.remove()`).catch(() => {});
    // A dialog or menu left open must not spoil the next step.
    await b.click('OK', { exact: true }).catch(() => {});
    await b.press('Escape').catch(() => {});
    await b.press('Escape').catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const note = (text) => console.error(`  · ${text}`);
const EDITOR = 'window.studiplyEditor';
const MAIN = { exclude: '[data-testid=sidebar]' };

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

// ── Files on disk ─────────────────────────────────────────────────────
const DISK = join(OUT, 'docx-files');
mkdirSync(DISK, { recursive: true });
const disk = (name, data) => {
  const path = join(DISK, name);
  writeFileSync(path, data);
  return path;
};

/** A PNG of one colour (no library: the bytes written here). */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const x of buf) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function png(width, height, [r, g, bl]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) [row[1 + x * 3], row[2 + x * 3], row[3 + x * 3]] = [r, g, bl];
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** A PNG with transparency (RGBA): `pixel(x, y)` gives [r, g, b, a]. */
function pngRgba(width, height, pixel) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x++) pixel(x, y).forEach((v, i) => (row[1 + x * 4 + i] = v));
    rows.push(row);
  }
  const plain = png(width, height, [0, 0, 0]);
  // The same chunks with colour type 6 (RGBA) and these rows.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([plain.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
/** A PNG's own width and height (its IHDR). */
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
const PHOTO_PNG = png(200, 100, [79, 67, 176]);
/** A logo: a red square on a fully transparent background (transparent black, the case that turns black in a JPEG). */
const LOGO_PNG = pngRgba(60, 40, (x, y) => (x >= 20 && x < 40 && y >= 10 && y < 30 ? [220, 30, 30, 255] : [0, 0, 0, 0]));

// ── The Word file to import (made with the docx library, so it is always the same) ──
const FIXTURE_TITLE = 'Tema 3 — Word';
async function wordFixture() {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, Table, TableRow, TableCell, ShadingType, ImageRun, PageBreak, UnderlineType, Header, CommentRangeStart, CommentRangeEnd, CommentReference } = docx;
  const file = new Document({
    comments: { children: [{ id: 0, author: 'Ana', date: new Date('2026-10-30T10:00:00Z'), children: [new Paragraph('Revisar esta parte')] }] },
    numbering: { config: [{ reference: 'pasos', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.' }] }] },
    sections: [
      {
        headers: { default: new Header({ children: [new Paragraph('Universidad de Barcelona')] }) },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(FIXTURE_TITLE)] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Capítulo 1')] }),
          new Paragraph({
            children: [
              new TextRun({ text: 'negrita', bold: true }),
              new TextRun({ text: ' cursiva', italics: true }),
              new TextRun({ text: ' subrayado', underline: { type: UnderlineType.SINGLE } }),
              new TextRun({ text: ' rojo', color: 'DC2626' }),
              new TextRun({ text: ' resaltado', highlight: 'yellow' }),
            ],
          }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Sección')] }),
          new Paragraph({ bullet: { level: 0 }, children: [new TextRun('punto uno')] }),
          new Paragraph({ bullet: { level: 0 }, children: [new TextRun('punto dos')] }),
          new Paragraph({ numbering: { reference: 'pasos', level: 0 }, children: [new TextRun('paso uno')] }),
          new Paragraph({ numbering: { reference: 'pasos', level: 0 }, children: [new TextRun('paso dos')] }),
          new Table({
            rows: [0, 1, 2].map(
              (r) =>
                new TableRow({
                  children: [0, 1, 2].map((c) => new TableCell({ children: [new Paragraph(`c${r}${c}`)], ...(r === 0 && c === 0 ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D3F5DB' } } : {}) })),
                }),
            ),
          }),
          new Paragraph({ children: [new ImageRun({ type: 'png', data: PHOTO_PNG, transformation: { width: 200, height: 100 } })] }),
          new Paragraph({ children: [new CommentRangeStart(0), new TextRun('Texto comentado'), new CommentRangeEnd(0), new TextRun({ children: [new CommentReference(0)] })] }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph('después del salto'),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(file));
}

/** A Word file with only a transparent logo in it. */
async function logoFixture() {
  const { Document, Packer, Paragraph, ImageRun } = docx;
  const file = new Document({
    sections: [{ children: [new Paragraph('Logo de la universidad'), new Paragraph({ children: [new ImageRun({ type: 'png', data: LOGO_PNG, transformation: { width: 120, height: 80 } })] })] }],
  });
  return Buffer.from(await Packer.toBuffer(file));
}

// ── The document to export ───────────────────────────────────────────
const S = 'La oferta y la demanda fijan el precio de equilibrio de un mercado competitivo.';
const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content) => ({ type: 'paragraph', content: content.map((c) => (typeof c === 'string' ? t(c) : c)) });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const li = (text) => ({ type: 'listItem', content: [p(text)] });
const INLINE = '\\frac{a}{b} + x^2';
const DISPLAY = '\\sum_{i=1}^{n} x_i^2 = \\int_0^1 f(x)\\,dx';
const AFTER_BREAK = 'Después del salto de página.';
const CONTENT = {
  type: 'doc',
  content: [
    { type: 'title', content: [t('Tema 3')] },
    h(1, '1. Mercados'),
    p(t('Precio', [{ type: 'bold' }]), t(' y '), t('cantidad', [{ type: 'italic' }]), t(' en rojo', [{ type: 'textStyle', attrs: { color: '#DC2626' } }])),
    { type: 'bulletList', content: [li('oferta'), li('demanda')] },
    { type: 'orderedList', attrs: { start: 1 }, content: [li('paso 1'), li('paso 2')] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('hecho')] }] },
    { type: 'callout', attrs: { kind: 'exam' }, content: [p('Esto entra en el examen.')] },
    p('Área: ', { type: 'inlineMath', attrs: { latex: INLINE } }),
    { type: 'blockMath', attrs: { latex: DISPLAY } },
    { type: 'graph', attrs: { kind: 'bar', title: 'Ventas', xLabel: '', yLabel: '', series: ['2025'], rows: [['Q1', '3'], ['Q2', '5'], ['Q3', '2']], blockId: 'gr1' } },
    { type: 'image', attrs: { src: `data:image/png;base64,${PHOTO_PNG.toString('base64')}`, width: 40 } },
    { type: 'pageBreak' },
    p(AFTER_BREAK),
    { type: 'table', content: [0, 1, 2].map((r) => ({ type: 'tableRow', content: [0, 1, 2].map((c) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, backgroundColor: r === 0 && c === 0 ? '#D3F5DB' : null }, content: [p(`f${r}c${c}`)] })) })) },
    h(2, '2. Final'),
    p(S),
  ],
};
const WEEK = { type: 'doc', content: [p('Texto de la semana 2.')] };
const sheetCell = (address, input) => ({ type: 'sheetCell', attrs: { blockId: address, input, bold: false } });
const SHEET = { type: 'doc', content: [sheetCell('A1', 'Amount'), sheetCell('B1', '200000'), sheetCell('A2', 'Payment'), sheetCell('B2', '=PMT(3.5%/12, 360, -B1)')] };
const A4 = { size: 'a4', orientation: 'portrait', margins: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 }, numbers: 'bottom-center', gap: 24 };

// ── Seed: Math (with folder Tema A) holds the document; Science takes a drop ──
const user = await makeUser();
const data = await seed(user.client);
const { data: folderA } = await admin.from('folders').insert({ user_id: user.id, course_id: data.course.id, parent_id: null, name: 'Tema A' }).select().single();
const DOC_TITLE = 'Exportar Word';
const { data: file } = await user.client.from('files').insert({ kind: 'document', title: DOC_TITLE, course_id: data.course.id }).select().single();
const weekTab = `t-${randomUUID()}`;
const sheetTab = `t-${randomUUID()}`;
for (const row of [
  { file_id: file.id, tab: 'notes', content: CONTENT, page_setup: A4 },
  { file_id: file.id, tab: weekTab, title: 'Semana 2', position: 1, content: WEEK, page_setup: A4 },
  { file_id: file.id, tab: sheetTab, title: 'Sheet 1', kind: 'sheet', position: 2, content: SHEET, page_setup: A4 },
]) {
  const { error } = await user.client.from('documents').insert(row);
  if (error) throw new Error(`the ${row.tab} tab: ${error.message}`);
}
const fixture = await wordFixture();
const fixturePath = disk(`${FIXTURE_TITLE}.docx`, fixture);
const dropPath = disk('Apuntes dropped.docx', fixture);
const oldWordPath = disk('viejo.doc', Buffer.from('not a docx'));
const logoPath = disk('Logo.docx', await logoFixture());
const logoPngPath = disk('logo-transparente.png', LOGO_PNG);

// The iPhone's editor bundle, as a page (as export.mjs loads it).
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor-docx.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

b = await launch();
// Downloads go to OUT/downloads; their names are caught (the Browser domain's events, or the older Page domain's).
const downloads = [];
b.onEvent('Browser.downloadWillBegin', (e) => downloads.push(e.suggestedFilename));
b.onEvent('Page.downloadWillBegin', (e) => downloads.push(e.suggestedFilename));
const downloadPath = join(OUT, 'downloads');
await b
  .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true })
  .catch(() => b.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath }));

// ── Screen helpers ───────────────────────────────────────────────────
const scheme = (v) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });
const livePages = () => b.evaluate(`(() => { const e = ${EDITOR}; const p = e?.state.plugins.find((x) => x.key.startsWith('studiplyPageView')); return p?.getState(e.state)?.layout?.pages ?? 0; })()`);
const liveZoom = () => b.evaluate(`(() => { const e = ${EDITOR}; const st = e.state.plugins.find((p) => p.key.startsWith('studiplyPageView')).getState(e.state); return st.zoom * (st.fit && st.pages ? st.factor : 1); })()`);
const openDoc = async (id = file.id) => {
  await b.nav(`${BASE}/doc/${id}`);
  await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom`), 'the editor', 30000);
  await waitFor(livePages, 'the page view', 20000);
  await b.sleep(1500);
};
/** The laptop at 100 % (⌘0, remembered), the document opened again: the formulas at the size the export draws them. */
const at100 = async () => {
  await b.evaluate(`${EDITOR}.commands.blur()`);
  await b.chord({ key: '0', code: 'Digit0', meta: true, keyCode: 48 });
  await b.sleep(500);
  await openDoc();
  const z = await liveZoom();
  expect(z === 1, `the page view is at ${Math.round(z * 100)} %, not 100 %`);
};
const openMenu = async () => {
  await b.clickSelector('[aria-label="Document menu"]');
  await b.waitText('Version history', { exact: true, timeout: 5000 });
};
const checked = (label) => b.evaluate(`document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-checked') === 'true'`);
const dialogOpen = () => b.evaluate(`!!document.querySelector('[aria-label="Export"]')`);
const openWordDialog = async () => {
  await openMenu();
  await b.click('Export Word…', { exact: true });
  await waitFor(dialogOpen, 'the export dialog');
};
/** Export Word from the dialog; the file's bytes (the laptop's last file, window.studiplyDocx) and what it says. */
const exportWord = async ({ all = false } = {}) => {
  await b.evaluate('window.studiplyDocx = undefined');
  const before = downloads.length;
  await openWordDialog();
  expect(await checked('Word'), 'Word is not chosen in the dialog');
  if (all) await b.clickSelector('[aria-label="All tabs"]');
  await b.clickSelector('[aria-label="Export"]');
  await waitFor(() => b.evaluate('!!window.studiplyDocx'), 'the Word file', 90000);
  await waitFor(async () => !(await dialogOpen()), 'the dialog closed', 15000);
  const made = await b.evaluate(`(async () => {
    const d = window.studiplyDocx;
    const buf = new Uint8Array(await d.blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { fileName: d.fileName, missing: d.missing, reasons: d.reasons ?? [], type: d.blob.type, base64: btoa(s) };
  })()`);
  // The file's download is checked in its own step (the spike only needs the file).
  const downloaded = () => waitFor(() => downloads.length > before && downloads.at(-1), 'the download', 10000);
  return { ...made, bytes: Buffer.from(made.base64, 'base64'), downloaded };
};
/** The .docx's parts, and its pictures in the order they are in the text. */
async function readDocx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const part = async (name) => (await zip.file(name)?.async('string')) ?? '';
  const xml = await part('word/document.xml');
  const rels = await part('word/_rels/document.xml.rels');
  const target = (id) => new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)?.[1];
  const drawings = [];
  for (const m of xml.matchAll(/<w:drawing>[\s\S]*?<wp:extent cx="(\d+)" cy="(\d+)"[\s\S]*?r:embed="([^"]+)"[\s\S]*?<\/w:drawing>/g)) {
    const path = `word/${target(m[3])}`;
    const data = await zip.file(path)?.async('nodebuffer');
    drawings.push({ width: Number(m[1]) / 9525, height: Number(m[2]) / 9525, path, data });
  }
  return { zip, xml, part, drawings };
}
const count = (xml, re) => xml.match(new RegExp(re.source, 'g'))?.length ?? 0;

/**
 * Two pictures (base64 PNGs, both at 2×) compared by their dark pixels, each from the top left of
 * its own ink, never scaled; `overlap` is the share of all dark pixels that the other picture also
 * has within 1 px (1: the same drawing). The sizes are compared separately (matches()).
 */
const inkCompare = (picture, live) =>
  b.evaluate(`(async () => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('not an image')); i.src = src; });
    const [a, c] = await Promise.all([load('data:image/png;base64,${picture}'), load('data:image/png;base64,${live}')]);
    // The image at its own pixels (never resampled), from (x, y) on: w × h of it, white where it has none.
    const pixels = (img, w = img.naturalWidth, h = img.naturalHeight, x = 0, y = 0) => {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.drawImage(img, -x, -y);
      const d = g.getImageData(0, 0, w, h).data;
      const ink = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) ink[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) < 150 ? 1 : 0;
      return { w, h, ink };
    };
    const box = ({ w, h, ink }) => {
      let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n };
    };
    const ba = box(pixels(a)), bc = box(pixels(c));
    if (!ba.n || !bc.n) return { inkA: ba.n, inkB: bc.n, overlap: 0 };
    // Both at the same 2× resolution, each from the top left of its own ink: nothing is scaled.
    const W = Math.max(ba.w, bc.w), H = Math.max(ba.h, bc.h);
    const A = pixels(a, W, H, ba.x, ba.y), C = pixels(c, W, H, bc.x, bc.y);
    // A dark pixel matches when the other picture has ink within 1 px (anti-aliasing moves an edge
    // by a pixel; on a formula ~95 × 40 px that alone changed a strict overlap a lot).
    const near = (ink) => {
      const out = new Uint8Array(W * H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!ink[y * W + x]) continue;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy >= 0 && yy < H && xx >= 0 && xx < W) out[yy * W + xx] = 1;
            }
        }
      return out;
    };
    const nearA = near(A.ink), nearC = near(C.ink);
    let inkA = 0, inkC = 0, matchedA = 0, matchedC = 0;
    for (let i = 0; i < W * H; i++) {
      if (A.ink[i]) { inkA++; if (nearC[i]) matchedA++; }
      if (C.ink[i]) { inkC++; if (nearA[i]) matchedC++; }
    }
    return {
      inkA: ba.n,
      inkB: bc.n,
      picture: { x: ba.x, y: ba.y, w: ba.w, h: ba.h, W: a.naturalWidth, H: a.naturalHeight },
      live: { x: bc.x, y: bc.y, w: bc.w, h: bc.h, W: c.naturalWidth, H: c.naturalHeight },
      // The share of both pictures' dark pixels that the other has within 1 px (1: the same drawing).
      overlap: inkA + inkC ? (matchedA + matchedC) / (inkA + inkC) : 0,
    };
  })()`);
/**
 * A screenshot at 2× (the pictures' scale) of the live formula's own box, the same box the export
 * keeps: KaTeX's pieces (.katex-base, each as tall as its strut: height above the baseline and depth
 * below) together, with 1 px around. Not the .katex element: inline, it is only the font's line,
 * and a fraction reaches beyond it (the screenshot then cut the formula's top and bottom off).
 * Also the formula's baseline (from a strut: its bottom less its depth) and the box's bottom.
 */
const formulaShot = async (selector) => {
  await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
  await b.sleep(400);
  // The screen at device scale 2 (as a Retina screen draws it): the formula rendered at the picture's
  // 2×, not a 1× screenshot enlarged. The layout in CSS px doesn't change; measured after the switch.
  const size = await b.evaluate(`({ w: innerWidth, h: innerHeight })`);
  await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 2, mobile: false });
  await b.sleep(600);
  try {
    return await formulaShotAt2x(selector);
  } finally {
    await b.resize(size.w, size.h);
  }
};
const formulaShotAt2x = async (selector) => {
  const r = await b.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const parts = [...el.querySelectorAll('.katex-html > :not(.katex-newline)')].map((p) => p.getBoundingClientRect()).filter((q) => q.width && q.height);
    const left = Math.floor(Math.min(...parts.map((q) => q.left))) - 1, top = Math.floor(Math.min(...parts.map((q) => q.top))) - 1;
    const right = Math.ceil(Math.max(...parts.map((q) => q.right))) + 1, bottom = Math.ceil(Math.max(...parts.map((q) => q.bottom))) + 1;
    const strut = el.querySelector('.katex-strut');
    const s = strut.getBoundingClientRect();
    // A strut with depth is lowered by it (vertical-align in px); one without has "baseline".
    const baseline = s.bottom + (parseFloat(getComputedStyle(strut).verticalAlign) || 0);
    return { x: left + scrollX, y: top + scrollY, width: right - left, height: bottom - top, depth: bottom - baseline };
  })()`);
  // Not captureBeyondViewport: Chrome then makes the window as tall as the page for the shot, the app
  // lays itself out again, and the element is no longer where it was measured.
  // At device scale 2 the shot has 2 pixels per CSS px with clip scale 1.
  const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 } });
  return { data, depth: r.depth };
};
/** The live screenshot holds the whole formula: its dark pixels touch none of its edges. */
const notCut = (cmp, what) => {
  const l = cmp.live;
  // A blank screenshot is said by matches().
  if (!l) return;
  expect(l.x >= 1 && l.y >= 1 && l.x + l.w <= l.W - 1 && l.y + l.h <= l.H - 1, `${what}: the live formula is cut by its screenshot (${JSON.stringify(l)})`);
};
const matches = (cmp, what) => {
  note(`${what}: picture ink ${cmp.picture?.w}×${cmp.picture?.h}, live ${cmp.live?.w}×${cmp.live?.h}, overlap ${cmp.overlap?.toFixed(3)}`);
  expect(cmp.inkA > 50, `${what}: the picture is blank (${cmp.inkA} dark pixels)`);
  expect(cmp.inkB > 50, `${what}: the screenshot of the live formula is blank (${cmp.inkB} dark pixels)`);
  const dw = Math.abs(cmp.picture.w - cmp.live.w) / cmp.live.w, dh = Math.abs(cmp.picture.h - cmp.live.h) / cmp.live.h;
  expect(dw <= 0.08 && dh <= 0.08, `${what}: not the live formula's size (${JSON.stringify(cmp)})`);
  expect(cmp.overlap >= 0.7, `${what}: not the live formula's shapes (overlap ${cmp.overlap.toFixed(3)})`);
};

const fileRows = async (title) => (await admin.from('files').select('id, kind, title, course_id, folder_id, deleted_at').eq('user_id', user.id).eq('title', title).is('deleted_at', null)).data ?? [];
const contentOf = async (fileId) => (await admin.from('documents').select('content').eq('file_id', fileId).eq('tab', 'notes').single()).data?.content;
const flat = (n) => [n, ...(n.content ?? []).flatMap(flat)];
const textOf = (n) => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
/** A document's shape: block types with their heading level and text (a table: its cells). */
const shape = (doc) =>
  (doc.content ?? [])
    .filter((x) => !(x.type === 'paragraph' && !textOf(x)) && x.type !== 'image' && x.type !== 'inlineImage')
    .map((x) => [x.type, x.attrs?.level ?? null, x.type === 'table' ? x.content.map((r) => r.content.map(textOf)) : (x.content ?? []).map(textOf).join('|')]);
/** Clicks a menu line (as library-menus.mjs does). */
const clickItem = async (text) => {
  const pt = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.split('\\n').some((l) => l.trim().startsWith(${JSON.stringify(text)}))); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!pt) throw new Error(`no menu item ${text}`);
  await b.clickAt(pt.x, pt.y);
  await b.sleep(600);
};
const openPlace = async (courseId, folderId, waitText) => {
  await b.nav(`${BASE}/project/${courseId}${folderId ? `?folder=${folderId}` : ''}`);
  await b.waitText(waitText, { timeout: 20000 });
  await b.sleep(2000);
};
/** The import note's box (the dialog with "Imported from Word"), in the window. */
const noteBox = () =>
  b.evaluate(`(() => {
    const t = [...document.querySelectorAll('body *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'Imported from Word');
    if (!t) return null;
    let box = t;
    while (box.parentElement && !(box.innerText ?? '').includes('Not kept')) box = box.parentElement;
    const r = box.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, text: box.innerText };
  })()`);
const fits = (r) => r && r.left >= 0 && r.right <= r.w + 0.5 && r.top >= 0 && r.bottom <= r.h + 0.5;
/** A picture's (a data URI) corner and centre pixels, read on a canvas in the page: [r, g, b, a]. */
const cornerAndCentre = (dataUrl) =>
  b.evaluate(`(async () => {
    const i = new Image();
    i.src = ${JSON.stringify(dataUrl)};
    await i.decode();
    const c = document.createElement('canvas');
    c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(i, 0, 0);
    const at = (x, y) => [...g.getImageData(x, y, 1, 1).data];
    return { width: c.width, height: c.height, corner: at(2, 2), centre: at(Math.floor(c.width / 2), Math.floor(c.height / 2)) };
  })()`);
const white = ([r, g, bl, a]) => r >= 235 && g >= 235 && bl >= 235 && a === 255;
const red = ([r, g, bl]) => r >= 180 && g <= 80 && bl <= 80;

let thisTab = null;

try {
  await b.signIn(BASE, user.email, user.password);

  await step('spike: the formulas in the .docx are pictures of the editor’s own drawing, sharp (2×) and the same shapes', async () => {
    await openDoc();
    await at100();
    thisTab = await exportWord();
    expect(thisTab.missing === 0, `${thisTab.missing} pictures could not be made: ${thisTab.reasons.join('; ')}`);
    const { drawings, xml } = await readDocx(thisTab.bytes);
    thisTab.xml = xml;
    expect(drawings.length === 4, `${drawings.length} pictures in the file (two formulas, the graph, the photo)`);
    const pairs = [
      ['inline', drawings[0], '.ProseMirror [data-type="inline-math"] .katex'],
      ['display', drawings[1], '.ProseMirror [data-type="block-math"] .katex'],
    ];
    const shots = [];
    for (const [what, d, selector] of pairs) {
      const size = pngSize(d.data);
      note(`${what} formula: PNG ${size.width}×${size.height} for ${d.width.toFixed(1)}×${d.height.toFixed(1)} px in the text`);
      expect(Math.abs(size.width - 2 * d.width) <= 2 && Math.abs(size.height - 2 * d.height) <= 2, `${what}: not drawn at twice its size (${size.width}×${size.height} for ${d.width}×${d.height})`);
      const { data: live, depth } = await formulaShot(selector);
      writeFileSync(join(SHOTS, `spike-${what}-picture.png`), d.data);
      writeFileSync(join(SHOTS, `spike-${what}-live.png`), Buffer.from(live, 'base64'));
      const cmp = await inkCompare(d.data.toString('base64'), live);
      notCut(cmp, `${what} formula`);
      matches(cmp, `${what} formula`);
      // Tight: no blank band beside or under the formula (a display formula once had a line's height under it).
      expect(cmp.picture.h >= 0.8 * size.height && cmp.picture.w >= 0.8 * size.width, `${what}: the formula fills ${cmp.picture.w}×${cmp.picture.h} of its ${size.width}×${size.height} picture`);
      // The same box as the live formula's (KaTeX's own, 1 px around), within a pixel each way.
      expect(Math.abs(d.width - cmp.live.W / 2) <= 1 && Math.abs(d.height - cmp.live.H / 2) <= 1, `${what}: the picture is ${d.width}×${d.height} px, the formula's own box ${cmp.live.W / 2}×${cmp.live.H / 2}`);
      if (what === 'inline') {
        // On the line as in the editor: Word sets a picture on the baseline, and the run is lowered by how far
        // the formula's box reaches below it (half points; 1 px = 1.5).
        const lowered = Number(/<w:position w:val="(-?\d+)"\/><\/w:rPr><w:drawing>/.exec(thisTab.xml)?.[1]);
        note(`inline formula: lowered ${-lowered} half points in Word; the live formula's box reaches ${depth.toFixed(2)} px below its baseline (${(depth * 1.5).toFixed(1)} half points)`);
        expect(Number.isFinite(lowered) && Math.abs(-lowered - depth * 1.5) <= 2, `the inline formula is lowered ${-lowered} half points, its depth is ${(depth * 1.5).toFixed(1)}`);
      }
      shots.push([what, d.data.toString('base64'), live]);
    }
    // The pictures beside the live formulas, at 2×, to look at.
    await b.evaluate(`(() => {
      const box = document.createElement('div');
      box.id = 'docx-check';
      Object.assign(box.style, { position: 'fixed', inset: '0', zIndex: 99999, background: '#fff', padding: '24px', font: '14px -apple-system, sans-serif', overflow: 'auto' });
      box.innerHTML = ${JSON.stringify(shots)}.map(([w, pic, live]) => '<p>' + w + ' — picture in the .docx (left), the editor (right), both at 2×</p><div style="display:flex;gap:32px;align-items:flex-start"><img style="border:1px solid #ccc" src="data:image/png;base64,' + pic + '"><img style="border:1px solid #ccc" src="data:image/png;base64,' + live + '"></div>').join('');
      document.body.appendChild(box);
    })()`);
    await b.sleep(500);
    await b.shot('docx-spike-formulas');
    await b.evaluate(`document.getElementById('docx-check')?.remove()`);
  });

  await step('1280: the menu has Export PDF… and Export Word…; Export Word… opens the dialog with Word chosen (This tab, Page numbers on)', async () => {
    await openDoc();
    await openMenu();
    expect(await b.hasText('Export PDF…', true), 'no Export PDF… in the menu');
    expect(await b.hasText('Export Word…', true), 'no Export Word… in the menu');
    await b.press('Escape');
    await b.sleep(300);
    await openWordDialog();
    expect(await b.hasText('Export Word', true), 'no dialog title');
    expect(await checked('Word') && !(await checked('PDF')), 'Word is not the chosen format');
    expect(await checked('This tab') && !(await checked('All tabs')), 'This tab is not chosen');
    expect(await checked('Page numbers'), 'Page numbers is not on');
    await b.shot('docx-dialog-word-1280');
    await scheme('dark');
    await b.sleep(500);
    await b.shot('docx-dialog-word-1280-dark');
    await scheme('light');
    // PDF from the same dialog: its title follows.
    await b.clickSelector('[aria-label="PDF"]');
    expect(await b.hasText('Export PDF', true), 'choosing PDF does not make it the PDF export');
    await b.click('Cancel', { exact: true });
    await waitFor(async () => !(await dialogOpen()), 'the dialog closed');
  });

  await step('This tab: "<title>.docx" downloads; Title / headings, lists, checklist, table colour, page break, A4, footer page field, callout label, 4 pictures', async () => {
    expect(thisTab, 'no export from the spike step');
    const name = await thisTab.downloaded();
    expect(name === `${DOC_TITLE}.docx` && thisTab.fileName === `${DOC_TITLE}.docx`, `downloaded as ${name}`);
    expect(thisTab.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `type ${thisTab.type}`);
    writeFileSync(join(OUT, `${DOC_TITLE}.docx`), thisTab.bytes);
    const { xml, part, drawings } = await readDocx(thisTab.bytes);
    for (const style of ['Title', 'Heading1', 'Heading2']) expect(xml.includes(`<w:pStyle w:val="${style}"/>`), `no ${style} paragraph`);
    expect(count(xml, /<w:numPr>/) === 4, `${count(xml, /<w:numPr>/)} list lines (4: two bullets, two numbers)`);
    expect(xml.includes('☑ '), 'no checklist box');
    expect(count(xml, /<w:tbl>/) === 1 && /<w:tcPr>.*?w:fill="D3F5DB"/.test(xml), 'no table with its cell colour');
    expect(xml.includes('<w:br w:type="page"/>'), 'no page break');
    expect(/<w:pgSz w:w="11906" w:h="16838"/.test(xml) && /<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/.test(xml), 'not A4 with 2.54 cm margins');
    expect(xml.includes('<w:footerReference'), 'no footer');
    const footer = await part('word/footer1.xml');
    expect(/PAGE/.test(footer) && footer.includes('<w:jc w:val="center"/>'), 'no centred page field in the footer');
    expect(/<w:caps\/>.*?Exam signal/.test(xml), 'no callout label');
    expect(/w:color w:val="DC2626"/.test(xml), 'the red text lost its colour');
    expect(drawings.length === 4 && drawings.every((d) => d.data?.length > 100), `pictures: ${drawings.map((d) => d.data?.length)}`);
    // The graph sharp too (2×), as wide as the text at most.
    const graph = drawings[2];
    const gs = pngSize(graph.data);
    expect(Math.abs(gs.width - 2 * graph.width) <= 2 && graph.width <= 602, `the graph: PNG ${gs.width} px for ${graph.width} px`);
    // The photo at its 40 % of the text's width.
    expect(Math.abs(drawings[3].width - 0.4 * 601.7) <= 1.5, `the photo is ${drawings[3].width} px wide`);
  });

  await step('All tabs: a section per tab with its name as a Heading 1; the sheet as a table of values', async () => {
    const all = await exportWord({ all: true });
    expect(all.missing === 0, `${all.missing} pictures missing: ${all.reasons.join('; ')}`);
    const { xml } = await readDocx(all.bytes);
    expect(count(xml, /<w:sectPr/) === 3, `${count(xml, /<w:sectPr/)} sections`);
    expect(/Heading1"\/>.*?Tab 1<.*?Heading1"\/>.*?Semana 2<.*?Heading1"\/>.*?Sheet 1</.test(xml), 'the tab names are not Heading 1s in order');
    expect(/<w:tbl>.*?Payment.*?898\.0893756.*?<\/w:tbl>/.test(xml), 'the sheet tab is not a table of its values');
    expect(!xml.includes('w:start='), 'a section starts its page numbers again');
  });

  await step('import by Upload (the file picker) into Tema A: a document named after the file, its content, the picture a photo; the note says what wasn’t kept', async () => {
    await openPlace(data.course.id, folderA.id, 'Tema A');
    await b.chooseFiles([fixturePath], async () => {
      await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
      await b.sleep(400);
      await clickItem('Upload document');
    });
    await waitFor(async () => (await fileRows(FIXTURE_TITLE)).length === 1, 'no document', 30000);
    const [row] = await fileRows(FIXTURE_TITLE);
    expect(row.kind === 'document' && row.course_id === data.course.id && row.folder_id === folderA.id, JSON.stringify(row));
    await b.waitText('Imported from Word', { exact: true, timeout: 15000 });
    const box = await noteBox();
    for (const words of ['headers and footers', '1 comment', 'text colours']) expect(box?.text.includes(words), `the note doesn't say "${words}": ${box?.text}`);
    await b.shot('docx-import-note-1280');
    await scheme('dark');
    await b.sleep(500);
    await b.shot('docx-import-note-1280-dark');
    await scheme('light');
    await b.click('OK', { exact: true });
    // The content, from the database.
    const isPicture = (n) => (n.type === 'image' || n.type === 'inlineImage') && String(n.attrs?.src).startsWith('media:');
    const doc = await waitFor(async () => {
      const c = await contentOf(row.id);
      return flat(c ?? {}).some(isPicture) ? c : null;
    }, 'the picture is not in the document', 20000);
    const blocks = doc.content;
    expect(blocks[0].type === 'title' && textOf(blocks[0]) === FIXTURE_TITLE, `first block: ${JSON.stringify(blocks[0]).slice(0, 120)}`);
    expect(blocks.some((x) => x.type === 'heading' && x.attrs.level === 1 && textOf(x) === 'Capítulo 1'), 'no Heading 1');
    expect(blocks.some((x) => x.type === 'heading' && x.attrs.level === 2 && textOf(x) === 'Sección'), 'no Heading 2');
    const runs = flat(doc).filter((n) => n.type === 'text');
    const marksOf = (w) => runs.find((r) => r.text.includes(w))?.marks?.map((m) => m.type) ?? [];
    expect(marksOf('negrita').includes('bold') && marksOf('cursiva').includes('italic') && marksOf('subrayado').includes('underline') && marksOf('resaltado').includes('highlight'), `marks: ${JSON.stringify(runs.map((r) => [r.text, r.marks?.map((m) => m.type)]))}`);
    expect(blocks.find((x) => x.type === 'bulletList')?.content.map(textOf).join('|') === 'punto uno|punto dos', 'the bulleted list');
    expect(blocks.find((x) => x.type === 'orderedList')?.content.map(textOf).join('|') === 'paso uno|paso dos', 'the numbered list');
    const table = blocks.find((x) => x.type === 'table');
    expect(table?.content.length === 3 && table.content[2].content.map(textOf).join('|') === 'c20|c21|c22', 'the table');
    const breakAt = blocks.findIndex((x) => x.type === 'pageBreak');
    expect(breakAt > 0 && textOf(blocks[breakAt + 1]) === 'después del salto', 'the page break');
    expect(blocks.every((x) => x.attrs?.origin === 'student' && x.attrs?.blockId), 'blocks without the student’s origin or an id');
    const mediaId = flat(doc).find(isPicture).attrs.src.slice('media:'.length);
    const { data: media } = await admin.from('media').select('file_id, kind, storage_path').eq('id', mediaId).single();
    expect(media.file_id === row.id && media.kind === 'photo', JSON.stringify(media));
    const listed = (await admin.storage.from('photos').list(`${user.id}/${row.id}`)).data ?? [];
    expect(listed.length === 1, `photos in Storage: ${listed.length}`);
    // How it looks.
    await openDoc(row.id);
    await waitFor(() => b.evaluate(`[...document.querySelectorAll('.ProseMirror img')].some((i) => i.naturalWidth > 0)`), 'the photo shown', 15000);
    await b.shot('docx-imported-1280');
  });

  await step('import by dropping a .docx from the Finder on a sidebar course: in its top level', async () => {
    await openPlace(data.course.id, null, 'Tema A');
    const to = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[data-testid=sidebar] *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'Science'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await b.htmlDrag(null, to, { files: [dropPath] });
    await waitFor(async () => {
      const rows = await fileRows('Apuntes dropped');
      return rows.length === 1 && rows[0].kind === 'document' && rows[0].course_id === data.science.id && rows[0].folder_id === null;
    }, 'the dropped file is not a document in Science', 30000);
    await b.waitText('Imported from Word', { exact: true, timeout: 15000 });
    await b.click('OK', { exact: true });
  });

  await step('an old .doc is refused, with its message', async () => {
    const space = await b.evaluate(`(() => { const s = document.querySelector('[data-testid=library-space]').getBoundingClientRect(); return { x: s.x + s.width / 2, y: s.y + 40 }; })()`);
    await b.htmlDrag(null, space, { files: [oldWordPath] });
    await b.waitText('Old Word files (.doc)', { exact: false, timeout: 10000 });
    await b.click('OK', { exact: true });
    expect((await fileRows('viejo')).length === 0 && (await fileRows('viejo.doc')).length === 0, 'the .doc was added');
  });

  await step('round trip: the exported .docx imported again has the same title, headings, lists and table', async () => {
    expect(thisTab, 'no export from the spike step');
    const back = disk('Vuelta.docx', thisTab.bytes);
    await openPlace(data.course.id, folderA.id, FIXTURE_TITLE);
    const space = await b.evaluate(`(() => { const s = document.querySelector('[data-testid=library-grid]')?.getBoundingClientRect() ?? document.querySelector('[data-testid=library-space]').getBoundingClientRect(); return { x: s.x + s.width / 2, y: s.bottom + 30 }; })()`);
    await b.htmlDrag(null, space, { files: [back] });
    await waitFor(async () => (await fileRows('Vuelta')).length === 1, 'not imported', 30000);
    await b.waitText('Imported from Word', { exact: true, timeout: 15000 }).catch(() => {});
    await b.click('OK', { exact: true }).catch(() => {});
    const [row] = await fileRows('Vuelta');
    const doc = await waitFor(() => contentOf(row.id), 'no content', 15000);
    // The text blocks as exported (formulas, the graph and the photo come back as pictures; the callout as its lines; the checklist as text).
    const keep = (s) => s.filter(([type]) => ['title', 'heading', 'bulletList', 'orderedList', 'table'].includes(type));
    const want = keep(shape(CONTENT));
    const got = keep(shape(doc));
    expect(JSON.stringify(got) === JSON.stringify(want), `round trip:\n got  ${JSON.stringify(got)}\n want ${JSON.stringify(want)}`);
  });

  await step('a transparent logo in a Word file comes in on white, not in a black box', async () => {
    await openPlace(data.course.id, folderA.id, FIXTURE_TITLE);
    const space = await b.evaluate(`(() => { const s = document.querySelector('[data-testid=library-grid]')?.getBoundingClientRect() ?? document.querySelector('[data-testid=library-space]').getBoundingClientRect(); return { x: s.x + s.width / 2, y: Math.min(innerHeight - 40, s.bottom + 30) }; })()`);
    await b.htmlDrag(null, space, { files: [logoPath] });
    await waitFor(async () => (await fileRows('Logo')).length === 1, 'not imported', 30000);
    const [row] = await fileRows('Logo');
    const doc = await waitFor(async () => {
      const c = await contentOf(row.id);
      return flat(c ?? {}).some((n) => (n.type === 'image' || n.type === 'inlineImage') && String(n.attrs?.src).startsWith('media:')) ? c : null;
    }, 'the logo is not in the document', 20000);
    const mediaId = flat(doc).find((n) => (n.type === 'image' || n.type === 'inlineImage') && String(n.attrs?.src).startsWith('media:')).attrs.src.slice('media:'.length);
    const { data: media } = await admin.from('media').select('storage_path, mime_type').eq('id', mediaId).single();
    const { data: blob, error } = await admin.storage.from('photos').download(media.storage_path);
    expect(!error && blob, `the photo in Storage: ${error?.message}`);
    const jpeg = Buffer.from(await blob.arrayBuffer());
    const px = await cornerAndCentre(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    note(`the logo as stored: ${px.width}×${px.height}, corner ${px.corner.join(',')}, centre ${px.centre.join(',')}`);
    expect(white(px.corner), `the transparent background is not white: ${px.corner.join(',')}`);
    expect(red(px.centre), `the logo's red square is not there: ${px.centre.join(',')}`);
    await b.click('OK', { exact: true }).catch(() => {});
  });

  await step('a transparent PNG put straight into a document (Insert → Image) and uploaded to the library is stored on white', async () => {
    /** A photo's stored JPEG, read back: its corner and centre pixels. */
    const stored = async (storagePath) => {
      const { data: blob, error } = await admin.storage.from('photos').download(storagePath);
      expect(!error && blob, `the photo in Storage: ${error?.message}`);
      return cornerAndCentre(`data:image/jpeg;base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`);
    };
    // Into a document, from the toolbar's Insert menu.
    const { data: doc } = await user.client.from('files').insert({ kind: 'document', title: 'Fotos', course_id: data.course.id }).select().single();
    await user.client.from('documents').insert({ file_id: doc.id, tab: 'notes', content: { type: 'doc', content: [p('Una foto:')] }, page_setup: A4 });
    await openDoc(doc.id);
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    await waitFor(() => b.evaluate(`${EDITOR}.view.hasFocus()`), 'the editor focused');
    await b.chooseFiles([logoPngPath], async () => {
      if (!(await b.evaluate(`!!document.querySelector('[aria-label="Insert"]')`))) await b.clickSelector('[aria-label="More tools"]');
      await b.clickSelector('[aria-label="Insert"]');
      await b.sleep(300);
      await b.clickSelector('[aria-label="Insert image"]');
    });
    const inDoc = await waitFor(async () => (await admin.from('media').select('storage_path').eq('file_id', doc.id)).data?.[0], 'no media row for the inserted picture', 20000);
    const px = await stored(inDoc.storage_path);
    note(`inserted in a document: corner ${px.corner.join(',')}, centre ${px.centre.join(',')}`);
    expect(white(px.corner) && red(px.centre), `the inserted picture: corner ${px.corner.join(',')}, centre ${px.centre.join(',')}`);
    // Into the library (+ New → Upload document): a photo file.
    await openPlace(data.course.id, folderA.id, FIXTURE_TITLE);
    await b.chooseFiles([logoPngPath], async () => {
      await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
      await b.sleep(400);
      await clickItem('Upload document');
    });
    const [photoFile] = await waitFor(async () => {
      const rows = await fileRows('logo-transparente.jpg');
      return rows.length ? rows : null;
    }, 'no photo file in the library', 20000);
    const { data: media } = await admin.from('media').select('storage_path').eq('file_id', photoFile.id).single();
    const lib = await stored(media.storage_path);
    note(`uploaded to the library: corner ${lib.corner.join(',')}, centre ${lib.centre.join(',')}`);
    expect(white(lib.corner) && red(lib.centre), `the uploaded picture: corner ${lib.corner.join(',')}, centre ${lib.centre.join(',')}`);
  });

  await step('390: the dialog with Word fits the window (light and dark)', async () => {
    try {
      await b.resize(390, 844);
      await openDoc();
      await openWordDialog();
      const r = await b.evaluate(`(() => { const e = document.querySelector('[aria-label="Export Word"]').getBoundingClientRect(); return { left: e.left, right: e.right, top: e.top, bottom: e.bottom, w: innerWidth, h: innerHeight }; })()`);
      expect(fits(r), `the dialog: ${JSON.stringify(r)}`);
      await b.shot('docx-dialog-word-390');
      await scheme('dark');
      await b.sleep(500);
      await b.shot('docx-dialog-word-390-dark');
      await scheme('light');
      await b.click('Cancel', { exact: true });
    } finally {
      await scheme('light');
      await b.resize(1280, 900);
    }
  });

  await step('390: the import note fits the window (light and dark)', async () => {
    try {
      await b.resize(390, 844);
      await openPlace(data.science.id, null, 'Apuntes dropped');
      const space = await b.evaluate(`(() => { const s = document.querySelector('[data-testid=library-grid]')?.getBoundingClientRect() ?? document.querySelector('[data-testid=library-space]').getBoundingClientRect(); return { x: s.x + s.width / 2, y: Math.min(innerHeight - 40, s.bottom + 30) }; })()`);
      await b.htmlDrag(null, space, { files: [disk('Semana 390.docx', fixture)] });
      await b.waitText('Imported from Word', { exact: true, timeout: 30000 });
      const box = await noteBox();
      expect(fits(box), `the note: ${JSON.stringify({ ...box, text: undefined })}`);
      await b.shot('docx-import-note-390');
      await scheme('dark');
      await b.sleep(500);
      await b.shot('docx-import-note-390-dark');
      await scheme('light');
      await b.click('OK', { exact: true });
    } finally {
      await scheme('light');
      await b.resize(1280, 900);
    }
  });

  await step('the iPhone’s editor bundle draws the formulas and the graph (its own KaTeX’s shapes) and reads a Word page into a document', async () => {
    try {
      await b.resize(390, 844);
      await b.nav(IPHONE);
      await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom && typeof window.studiplyDrawPictures === 'function' && typeof window.studiplyImportHtml === 'function'`), 'the bundle and its Word export (rebuild it: npm run editor:build)', 30000);
      await b.evaluate(`${EDITOR}.commands.setContent({ type: 'doc', content: [{ type: 'blockMath', attrs: { latex: ${JSON.stringify(DISPLAY)} } }, { type: 'paragraph' }] })`);
      await b.sleep(1500);
      // The app gives the bundle its stylesheet (15 px text, editorCss); this page runs the bundle
      // alone, at the browser's own size. The picture is drawn at the size the live formula has here.
      const fontPx = await b.evaluate(`parseFloat(getComputedStyle(document.querySelector('.ProseMirror')).fontSize)`);
      note(`the bundle page's text size: ${fontPx} px`);
      const drawn = await b.evaluate(`window.studiplyDrawPictures([
        { id: 'f', kind: 'formula', latex: ${JSON.stringify(DISPLAY)}, display: true, fontPx: ${fontPx} },
        { id: 'g', kind: 'graph', graph: ${JSON.stringify(CONTENT.content[9].attrs)}, width: 601.7, blockId: 'gr1', language: 'es' },
      ]).then((r) => ({ failed: r.failed, reasons: r.reasons, pictures: r.pictures.map((p) => ({ id: p.id, width: p.width, height: p.height, data: p.data })) }))`);
      expect(drawn.failed.length === 0 && drawn.pictures.length === 2, `drawn: ${JSON.stringify({ reasons: drawn.reasons, n: drawn.pictures.length })}`);
      const formula = drawn.pictures.find((x) => x.id === 'f');
      writeFileSync(join(SHOTS, 'spike-iphone-display-picture.png'), Buffer.from(formula.data, 'base64'));
      const { data: live } = await formulaShot('.ProseMirror [data-type="block-math"] .katex');
      writeFileSync(join(SHOTS, 'spike-iphone-display-live.png'), Buffer.from(live, 'base64'));
      const cmp = await inkCompare(formula.data, live);
      notCut(cmp, 'the bundle’s display formula');
      matches(cmp, 'the bundle’s display formula');
      expect(Math.abs(formula.width - cmp.live.W / 2) <= 1 && Math.abs(formula.height - cmp.live.H / 2) <= 1, `the bundle's picture is ${formula.width}×${formula.height} px, the formula's own box ${cmp.live.W / 2}×${cmp.live.H / 2}`);
      const fs = pngSize(Buffer.from(formula.data, 'base64'));
      expect(cmp.picture.h >= 0.8 * fs.height, `the bundle's display formula fills ${cmp.picture.h} of its ${fs.height} px height`);
      const graph = drawn.pictures.find((x) => x.id === 'g');
      expect(pngSize(Buffer.from(graph.data, 'base64')).width === Math.ceil(graph.width * 2), 'the bundle’s graph is not at 2×');
      // A transparent logo drawn on white by the bundle (the iPhone's import does it there).
      expect(await b.evaluate(`typeof window.studiplyFlatten === 'function'`), 'no window.studiplyFlatten (rebuild the bundle: npm run editor:build)');
      const flat = await b.evaluate(`window.studiplyFlatten('data:image/png;base64,${LOGO_PNG.toString('base64')}')`);
      const px = await cornerAndCentre(flat);
      expect(white(px.corner) && red(px.centre), `the bundle's flattened logo: corner ${px.corner.join(',')}, centre ${px.centre.join(',')}`);
      // A Word page, read by mammoth here as the app does, into a document by the bundle.
      const { value: html } = await mammoth.convertToHtml({ buffer: fixture }, { styleMap: ["p[style-name='Title'] => p.title:fresh", 'u => u', "br[type='page'] => hr.studiply-page-break", "highlight[color='yellow'] => mark.hl-yellow"] });
      const doc = await b.evaluate(`window.studiplyImportHtml(${JSON.stringify(html)})`);
      const types = doc.content.map((x) => x.type);
      expect(types[0] === 'title' && types.includes('heading') && types.includes('bulletList') && types.includes('orderedList') && types.includes('table') && types.includes('pageBreak'), `the bundle's document: ${types.join(', ')}`);
    } finally {
      await b.resize(1280, 900);
    }
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  console.log('console errors:', JSON.stringify(errors));
  console.log('shots:', SHOTS);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
