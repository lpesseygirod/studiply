// export.mjs — the PDF export (step 4.8a), on the laptop (1280), at a
// phone's width (390) and in the iPhone's editor bundle:
//   - the document menu's Page group has Export PDF… (a sheet tab's menu
//     too); the dialog: This tab / All tabs (the document has three tabs),
//     Page numbers on by default, Export;
//   - This tab, with the laptop at 100 % (⌘0; the page view measured and
//     drawn at the PDF's scale; at Fit the browser draws text and table rows
//     a little differently, which is the zoomed screen, not the pages): the
//     print document (caught as window.studiplyPrint instead
//     of printing) has as many pages as the page view shows; laid out in a
//     frame, every page is the paper's size and every line of text on it
//     is inside its text area (none cut by a page's edge); the text after
//     the page break starts a page; every block starts on the same page and
//     at the same top as in the open editor's page view (within 1 px); no
//     two blocks overlap, in the PDF or in the page view; the numbers are
//     1…n; the callout, the formula (KaTeX), the graph (its SVG) and the
//     photo are there;
//   - All tabs: each tab starts a new page with its name as a heading, the
//     first block on it, at the top margin plus a Heading 1's own space
//     before (the page view keeps a document's first block's space before,
//     as Word and Google Docs do; after a page break it is dropped); the
//     numbers go on through the whole file; every tab's name looks the
//     same (font, size, weight, height, as any Heading 1); no overlaps;
//     the sheet tab is a table of its values (PMT's 898.0893756);
//   - Page numbers off: no numbers;
//   - Letter landscape (the document's page setup): the print's pages turn,
//     the lines stay in the landscape text area, the page count matches,
//     block by block as in the page view, no overlaps;
//   - from the sheet tab: Export PDF… gives its table, one page, no heading;
//   - the dialog at 390 and in dark mode (screenshots);
//   - the iPhone's editor bundle (the export bridge's page builder) makes
//     the same number of pages, in points at 3/4 (expo-print's way);
//   - last: Chrome's own PDF of the A4 print: one PDF page per page, A4.
//   - screenshots export-dialog-1280 / -1280-dark / -390, export-pages-1280,
//     export-pages-all-1280, export-pages-landscape-1280, export-pages-sheet-1280.
// Needs the iPhone bundle rebuilt (npm run editor:build) for its step.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps (several: separated by |).
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node export.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The driver beside this file (installed), or in WEB_CHECK_SCRIPTS (a copy run from elsewhere).
const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, OUT } = await import(new URL('cdp.mjs', scripts).href);
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
    await b.shot(`fail-export-${results.length}`).catch(() => {});
    // A dialog or menu left open must not spoil the next step.
    await b.evaluate(`document.getElementById('export-check')?.remove()`).catch(() => {});
    await b.press('Escape').catch(() => {});
    await b.press('Escape').catch(() => {});
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

// The iPhone's editor bundle, as a page (as blocks.mjs and pages.mjs load it).
const scriptsDir = fileURLToPath(scripts);
const repo = join(scriptsDir, '../../../../');
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor-export.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

// A study document of about three A4 pages: headings, long paragraphs, a callout, a display
// formula, a graph, a photo, a page break, a table.
const S = 'La psicobiología estudia las bases biológicas de la conducta humana y animal, desde las neuronas y los neurotransmisores hasta los sistemas que regulan el sueño, la memoria y las emociones.';
const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const h = (level, t) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: t }] });
const PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#4F43B0"/><text x="24" y="118" font-size="44" font-family="sans-serif" fill="white">Foto</text></svg>')}`;
const AFTER_BREAK = 'Después del salto de página empieza esta parte.';
const CONTENT = {
  type: 'doc',
  content: [
    { type: 'title', content: [{ type: 'text', text: 'Exportar' }] },
    h(1, '1. Neuronas'),
    ...Array.from({ length: 6 }, (_, i) => p(Array.from({ length: 2 + (i % 3) }, () => S).join(' '))),
    { type: 'callout', attrs: { kind: 'exam' }, content: [p('Esto entra en el examen: la sinapsis química.')] },
    { type: 'blockMath', attrs: { latex: '\\sum_{i=1}^{n} x_i^2 = \\frac{a}{b}' } },
    { type: 'graph', attrs: { kind: 'bar', title: 'Ventas' } },
    { type: 'image', attrs: { src: PHOTO } },
    { type: 'pageBreak' },
    p(AFTER_BREAK),
    ...Array.from({ length: 4 }, () => p(`${S} ${S}`)),
    { type: 'table', content: Array.from({ length: 14 }, (_, r) => ({ type: 'tableRow', content: [0, 1, 2].map((c) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(`Fila ${r + 1}, col ${c + 1}`)] })) })) },
    h(2, '2. Final'),
    ...Array.from({ length: 5 }, () => p(`${S} ${S}`)),
  ],
};
const WEEK = { type: 'doc', content: [p('Texto de la semana 2.'), p(S)] };
const sheetCell = (address, input) => ({ type: 'sheetCell', attrs: { blockId: address, input, bold: false } });
const SHEET = { type: 'doc', content: [sheetCell('A1', 'Amount'), sheetCell('B1', '200000'), sheetCell('A2', 'Payment'), sheetCell('B2', '=PMT(3.5%/12, 360, -B1)')] };
const A4 = { size: 'a4', orientation: 'portrait', margins: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 }, numbers: 'bottom-center', gap: 24 };
const LETTER_LANDSCAPE = { ...A4, size: 'letter', orientation: 'landscape' };

const user = await makeUser();
const { data: file } = await user.client.from('files').insert({ kind: 'document', title: 'Exportar' }).select().single();
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
b = await launch();

const scheme = (v) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });
const openDoc = async (tab) => {
  await b.nav(`${BASE}/doc/${file.id}${tab ? `?tab=${tab}` : ''}`);
  if (tab === sheetTab) await waitFor(() => b.evaluate(`!!document.querySelector('[data-sheet="grid"] [data-cell="A1"]')`), 'the grid', 30000);
  else {
    await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom`), 'the editor', 30000);
    // The page view has drawn the pages.
    await waitFor(livePages, 'the page view', 20000);
  }
  await b.sleep(1500);
};
/** The pages the page view shows in the open editor. */
const livePages = () => b.evaluate(`(() => { const e = ${EDITOR}; const p = e?.state.plugins.find((x) => x.key.startsWith('studiplyPageView')); return p?.getState(e.state)?.layout?.pages ?? 0; })()`);
/** The open editor's zoom (1 is 100 %). */
const liveZoom = () => b.evaluate(`(() => { const e = ${EDITOR}; const st = e.state.plugins.find((p) => p.key.startsWith('studiplyPageView')).getState(e.state); return st.zoom * (st.fit && st.pages ? st.factor : 1); })()`);
/**
 * The laptop at 100 % (⌘0, remembered), and the document opened again so its page view is
 * measured and drawn at 100 %: the PDF's scale. (At Fit, 78 % here, the browser draws text and
 * table rows a little differently, e.g. 7 px over a split table in Letter landscape: that is the
 * zoomed screen, not the pages.)
 */
const at100 = async () => {
  await b.evaluate(`${EDITOR}.commands.blur()`);
  await b.chord({ key: '0', code: 'Digit0', meta: true, keyCode: 48 });
  await b.sleep(500);
  await openDoc(null);
  const z = await liveZoom();
  expect(z === 1, `the page view is at ${Math.round(z * 100)} %, not 100 %`);
};
const openMenu = async () => {
  await b.clickSelector('[aria-label="Document menu"]');
  await b.waitText('Version history', { exact: true, timeout: 5000 });
};
const checked = (label) => b.evaluate(`document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-checked') === 'true'`);
const openDialog = async () => {
  await openMenu();
  await b.click('Export PDF…', { exact: true });
  await waitFor(() => b.evaluate(`!!document.querySelector('[aria-label="Export"]')`), 'the export dialog');
};
/** Export from the dialog; the print document as the laptop made it. */
const exportPdf = async ({ all = false, numbers = true } = {}) => {
  await b.evaluate('window.studiplyPrint = undefined');
  await openDialog();
  if (all) await b.clickSelector('[aria-label="All tabs"]');
  if (!numbers) await b.clickSelector('[aria-label="Page numbers"]');
  await b.clickSelector('[aria-label="Export"]');
  const made = await waitFor(() => b.evaluate('window.studiplyPrint ? { pages: window.studiplyPrint.pages, title: window.studiplyPrint.title } : null'), 'the print document', 90000);
  await waitFor(async () => !(await b.evaluate(`!!document.querySelector('[aria-label="Export"]')`)), 'the dialog closed', 15000);
  return made;
};
/** The print document in a frame over the app, to measure it (and see it). */
const showPrint = () =>
  b.evaluate(`(async () => {
    document.getElementById('export-check')?.remove();
    const f = document.createElement('iframe');
    f.id = 'export-check';
    Object.assign(f.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', border: '0', zIndex: '99999', background: '#e5e5e5' });
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(window.studiplyPrint.html);
    d.close();
    await Promise.all([...d.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    await d.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));
    return true;
  })()`);
/**
 * Every page of the shown print: its height, and each line of text on it
 * (the part of a block shown on that page) inside its text area. `paper`:
 * the page's height and margins in cm.
 */
const measurePrint = (paper) =>
  b.evaluate(`(() => {
    const d = document.getElementById('export-check').contentDocument;
    const px = (cm) => cm * 96 / 2.54;
    const H = px(${paper.height}), top = px(${paper.top}), bottom = px(${paper.bottom});
    const sections = [...d.querySelectorAll('.studiply-print-page')];
    const bad = [];
    let lines = 0;
    sections.forEach((s, k) => {
      const r = s.getBoundingClientRect();
      if (Math.abs(r.height - H) > 1) bad.push('page ' + (k + 1) + ' is ' + Math.round(r.height) + ' px tall');
      const body = s.querySelector('.studiply-print-body');
      const w = d.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const range = d.createRange();
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.textContent.trim()) continue;
        if (d.defaultView.getComputedStyle(t.parentElement).visibility === 'hidden') continue;
        range.selectNodeContents(t);
        for (const q of range.getClientRects()) {
          if (!q.width || !q.height) continue;
          // On another page (the part of the block shown there).
          if (q.bottom <= r.top + 0.5 || q.top >= r.bottom - 0.5) continue;
          lines++;
          if (q.top < r.top + top - 2 || q.bottom > r.bottom - bottom + 2) bad.push('p' + (k + 1) + ' "' + t.textContent.slice(0, 24) + '" at ' + Math.round(q.top - r.top));
        }
      }
    });
    return {
      pages: sections.length,
      lines,
      bad: bad.slice(0, 8),
      numbers: [...d.querySelectorAll('.studiply-print-number')].map((n) => n.textContent),
    };
  })()`);
/** Where the first line with `text` sits: its page and its top from the page's top (px). */
const lineAt = (text) =>
  b.evaluate(`(() => {
    const d = document.getElementById('export-check').contentDocument;
    const sections = [...d.querySelectorAll('.studiply-print-page')];
    for (let k = 0; k < sections.length; k++) {
      const r = sections[k].getBoundingClientRect();
      const w = d.createTreeWalker(sections[k], NodeFilter.SHOW_TEXT);
      const range = d.createRange();
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.textContent.includes(${JSON.stringify(text)})) continue;
        range.selectNodeContents(t);
        const q = [...range.getClientRects()].find((x) => x.width && x.bottom > r.top && x.top < r.bottom);
        if (q) return { page: k + 1, top: q.top - r.top };
      }
    }
    return null;
  })()`);
/**
 * A heading in the shown print: its page, its block's top from the page's top (px), whether it is
 * the first block with text on that page, and the space a Heading 1 keeps above it at the top of a
 * document (its CSS margin, read from the editor's look in the print: the page view keeps the
 * first block's space before, as Word and Google Docs do; after a page break it is dropped).
 */
const headingAt = (text) =>
  b.evaluate(`(() => {
    const d = document.getElementById('export-check').contentDocument;
    const probeHost = d.createElement('div');
    probeHost.className = 'studiply-export';
    probeHost.innerHTML = '<div class="ProseMirror"><h1>x</h1></div>';
    d.body.appendChild(probeHost);
    const spaceBefore = parseFloat(d.defaultView.getComputedStyle(probeHost.querySelector('h1')).marginTop);
    probeHost.remove();
    const sections = [...d.querySelectorAll('.studiply-print-page')];
    for (let k = 0; k < sections.length; k++) {
      const h = [...sections[k].querySelectorAll('h1')].find((e) => e.textContent.trim() === ${JSON.stringify(text)});
      if (!h) continue;
      const block = h.closest('.studiply-print-block');
      const top = parseFloat(block.style.top);
      const above = [...sections[k].querySelectorAll('.studiply-print-block')].filter((x) => x !== block && x.textContent.trim() && parseFloat(x.style.top) < top);
      return { page: k + 1, top, first: above.length === 0, spaceBefore };
    }
    return null;
  })()`);
/**
 * The open editor's page view, block by block (the top-level blocks, not the gaps): its page,
 * its top from that page's top, and its box (CSS px, the zoom taken out). `overlaps`: blocks
 * whose boxes cross each other.
 */
const liveBlocks = () =>
  b.evaluate(`(() => {
    const e = ${EDITOR}, dom = e.view.dom;
    const st = e.state.plugins.find((p) => p.key.startsWith('studiplyPageView')).getState(e.state), g = st.sheet;
    // The zoom the page view set, exactly (offsetWidth is whole pixels: 794 for an A4 sheet of 793.7).
    const scale = st.zoom * (st.fit && st.pages ? st.factor : 1);
    const box = dom.getBoundingClientRect(), pitch = g.height + g.gap;
    const blocks = [...dom.children]
      .filter((x) => !x.classList.contains('studiply-page-gap') && !x.classList.contains('studiply-page-layer'))
      .map((x) => {
        const r = x.getBoundingClientRect();
        const top = (r.top - box.top) / scale, k = Math.floor((top + 0.5) / pitch);
        return { name: x.tagName + ' ' + x.textContent.trim().slice(0, 16), page: k + 1, top: top - k * pitch, y1: top, y2: (r.bottom - box.top) / scale, x1: (r.left - box.left) / scale, x2: (r.right - box.left) / scale };
      })
      .filter((x) => x.x2 - x.x1 > 0);
    const overlaps = [];
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], c = blocks[j];
        const v = Math.min(a.y2, c.y2) - Math.max(a.y1, c.y1), h = Math.min(a.x2, c.x2) - Math.max(a.x1, c.x1);
        if (v > 0.5 && h > 0.5) overlaps.push(a.name + ' / ' + c.name + ' (' + Math.round(v) + ' px)');
      }
    return { blocks, overlaps };
  })()`);
/**
 * The shown print, block by block: each block where it starts (its page and its top from the
 * page's top; the rest of a block begun on an earlier page is left out), and, page by page,
 * blocks whose own boxes (as drawn on that page) cross each other.
 */
const printBlocks = () =>
  b.evaluate(`(() => {
    const d = document.getElementById('export-check').contentDocument;
    const blocks = [], overlaps = [];
    [...d.querySelectorAll('.studiply-print-page')].forEach((s, k) => {
      const page = s.getBoundingClientRect();
      const boxes = [...s.querySelectorAll('.studiply-print-block')].map((w) => {
        const el = w.firstElementChild, r = el.getBoundingClientRect();
        const name = el.tagName + ' ' + el.textContent.trim().slice(0, 16);
        if (r.top >= page.top - 0.5) blocks.push({ name, page: k + 1, top: r.top - page.top });
        return { name, y1: Math.max(r.top, page.top), y2: Math.min(r.bottom, page.bottom), x1: r.left, x2: r.right };
      }).filter((x) => x.y2 - x.y1 > 0.5);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          const v = Math.min(a.y2, c.y2) - Math.max(a.y1, c.y1), h = Math.min(a.x2, c.x2) - Math.max(a.x1, c.x1);
          if (v > 0.5 && h > 0.5) overlaps.push('page ' + (k + 1) + ': ' + a.name + ' / ' + c.name + ' (' + Math.round(v) + ' px)');
        }
    });
    return { blocks, overlaps };
  })()`);
/** The print's blocks start on the same pages, at the same tops, as the page view's (within 1 px). */
const expectSameAsPageView = (live, printed) => {
  expect(printed.blocks.length === live.blocks.length, `blocks: page view ${live.blocks.length}, print ${printed.blocks.length}`);
  const off = live.blocks
    .map((l, i) => [l, printed.blocks[i]])
    .filter(([l, p]) => l.page !== p.page || Math.abs(l.top - p.top) > 1)
    .map(([l, p]) => `${l.name}: page view p${l.page} ${l.top.toFixed(1)}, print p${p.page} ${p.top.toFixed(1)}`);
  expect(off.length === 0, `not where the page view puts them: ${JSON.stringify(off.slice(0, 5))}`);
};
/** How each named Heading 1 is drawn in the shown print: its font and its box's height. */
const headingLooks = (names) =>
  b.evaluate(`(() => {
    const d = document.getElementById('export-check').contentDocument;
    return ${JSON.stringify(names)}.map((name) => {
      const h = [...d.querySelectorAll('.studiply-print-body h1')].find((e) => e.textContent.trim() === name);
      if (!h) return { name, missing: true };
      const cs = d.defaultView.getComputedStyle(h);
      return { name, font: [cs.fontSize, cs.fontWeight, cs.fontFamily, cs.lineHeight, cs.color].join(' | '), height: Math.round(h.getBoundingClientRect().height * 10) / 10 };
    });
  })()`);
/** What the shown print has in it. */
const printHas = () =>
  b.evaluate(`(() => {
    const d = document.getElementById('export-check').contentDocument;
    const img = d.querySelector('.studiply-print-body img');
    return {
      callout: !!d.querySelector('.studiply-print-body [class*="callout"]'),
      katex: !!d.querySelector('.studiply-print-body .katex'),
      graph: !!d.querySelector('.studiply-print-body svg'),
      photo: !!img && img.naturalWidth > 0,
      table: !!d.querySelector('.studiply-print-body table'),
      text: d.body.innerText,
      pageCss: [...d.querySelectorAll('style')].map((s) => s.textContent).join('').match(/@page \\{ size: ([^;]+);/)?.[1] ?? null,
    };
  })()`);
/**
 * The print's pages side by side, for a screenshot: laid out at full size and only drawn smaller
 * (a transform), so the picture is the print's own layout. (CSS zoom lays the text out again at
 * a tiny size, with other line and row heights: an earlier overview showed a table over a
 * heading that the print didn't have.)
 */
const overview = (name) =>
  b
    .evaluate(`(() => {
      const d = document.getElementById('export-check').contentDocument;
      const s = d.createElement('style');
      const k = 0.36;
      s.textContent = 'html { background: #e5e5e5 !important; } body { transform: scale(' + k + '); transform-origin: 0 0; width: ' + Math.floor(d.defaultView.innerWidth / k) + 'px; display: flex; flex-wrap: wrap; gap: 66px; padding: 66px; box-sizing: border-box; background: #e5e5e5 !important; } .studiply-print-page { box-shadow: 0 4px 30px rgba(0,0,0,.25); background: #fff; }';
      d.head.appendChild(s);
    })()`)
    .then(() => b.sleep(500))
    .then(() => b.shot(name));
const closePrint = () => b.evaluate(`document.getElementById('export-check')?.remove()`);
const setPageSetup = async (setup) => {
  const { error } = await admin.from('documents').update({ page_setup: setup }).eq('file_id', file.id);
  if (error) throw new Error(error.message);
};

const A4_PAPER = { height: 29.7, top: 2.54, bottom: 2.54 };
const LANDSCAPE_PAPER = { height: 21.59, top: 2.54, bottom: 2.54 };
let thisTab = null;
let thisTabHtml = null;

try {
  await b.signIn(BASE, user.email, user.password);

  await step('1280: the menu’s Page group has Export PDF…; the dialog: This tab / All tabs, Page numbers on', async () => {
    await openDoc(null);
    await openMenu();
    expect(await b.hasText('PAGE', true), 'no PAGE heading in the menu');
    expect(await b.hasText('Export PDF…', true), 'no Export PDF… in the menu');
    await b.press('Escape');
    await b.sleep(300);
    await openDialog();
    expect(await b.hasText('Export PDF', true), 'no dialog title');
    expect(await checked('This tab'), 'This tab is not chosen');
    expect(!(await checked('All tabs')), 'All tabs is chosen');
    expect(await checked('Page numbers'), 'Page numbers is not on');
    await b.shot('export-dialog-1280');
    await scheme('dark');
    await b.sleep(500);
    await b.shot('export-dialog-1280-dark');
    await scheme('light');
    await b.click('Cancel', { exact: true });
    await waitFor(async () => !(await b.evaluate(`!!document.querySelector('[aria-label="Export"]')`)), 'the dialog closed');
  });

  await step('This tab (at 100 %): the page view’s pages, block by block; every page A4, every line inside its text area; the page break starts a page; numbers 1…n', async () => {
    await at100();
    const shown = await livePages();
    expect(shown >= 3, `the page view shows ${shown} pages (the document should make 3 or more)`);
    thisTab = await exportPdf();
    expect(thisTab.pages === shown, `the PDF has ${thisTab.pages} pages, the page view ${shown}`);
    expect(thisTab.title === 'Exportar', `title: ${thisTab.title}`);
    thisTabHtml = await b.evaluate('window.studiplyPrint.html');
    await showPrint();
    const m = await measurePrint(A4_PAPER);
    expect(m.pages === shown, `print pages: ${m.pages}`);
    expect(m.lines > 100, `only ${m.lines} lines of text in the print`);
    expect(m.bad.length === 0, `lines outside their page's text area: ${JSON.stringify(m.bad)}`);
    expect(JSON.stringify(m.numbers) === JSON.stringify(Array.from({ length: shown }, (_, i) => String(i + 1))), `numbers: ${JSON.stringify(m.numbers)}`);
    const after = await lineAt(AFTER_BREAK);
    const top = (2.54 * 96) / 2.54;
    expect(after && after.page >= 2 && after.top >= top - 2 && after.top <= top + 10, `after the page break: ${JSON.stringify(after)}`);
    // Block by block as in the page view (same page, same top), and no two blocks crossing, in either.
    const live = await liveBlocks();
    expect(live.overlaps.length === 0, `blocks overlap in the page view: ${JSON.stringify(live.overlaps)}`);
    const printed = await printBlocks();
    expect(printed.overlaps.length === 0, `blocks overlap in the PDF: ${JSON.stringify(printed.overlaps)}`);
    expectSameAsPageView(live, printed);
    const has = await printHas();
    expect(has.callout && has.katex && has.graph && has.photo && has.table, `missing: ${JSON.stringify({ ...has, text: undefined })}`);
    expect(has.pageCss === '21cm 29.7cm', `@page size: ${has.pageCss}`);
    await overview('export-pages-1280');
    await closePrint();
  });

  await step('All tabs: each tab from a new page with its name as a heading on top; numbers through the whole file; the sheet as values', async () => {
    const all = await exportPdf({ all: true });
    expect(all.pages >= thisTab.pages + 2, `All tabs: ${all.pages} pages (This tab: ${thisTab.pages})`);
    await showPrint();
    const m = await measurePrint(A4_PAPER);
    expect(m.bad.length === 0, `lines outside their page's text area: ${JSON.stringify(m.bad)}`);
    expect(JSON.stringify(m.numbers) === JSON.stringify(Array.from({ length: all.pages }, (_, i) => String(i + 1))), `numbers: ${JSON.stringify(m.numbers)}`);
    // Each tab's name: the first block on a new page, at the top margin plus a Heading 1's own space
    // before (the page view keeps a document's first block's space before; Word and Google Docs too).
    const top = (2.54 * 96) / 2.54;
    let page = 0;
    for (const name of ['Tab 1', 'Semana 2', 'Sheet 1']) {
      const at = await headingAt(name);
      expect(at && at.first, `"${name}" heading is not the first block on its page: ${JSON.stringify(at)}`);
      expect(Math.abs(at.top - (top + at.spaceBefore)) <= 1, `"${name}" heading at ${at.top} px, not ${top} + its ${at.spaceBefore} px space before`);
      expect(at.page > page, `"${name}" is not on a later page than the tab before (${at.page})`);
      page = at.page;
    }
    const has = await printHas();
    expect(has.text.includes('Amount') && has.text.includes('898.0893756'), 'the sheet tab’s values are not in the print');
    const printed = await printBlocks();
    expect(printed.overlaps.length === 0, `blocks overlap in the PDF: ${JSON.stringify(printed.overlaps)}`);
    // Every tab's name looks the same (and as any Heading 1 of the document).
    const looks = await headingLooks(['Tab 1', 'Semana 2', 'Sheet 1', '1. Neuronas']);
    expect(looks.every((l) => !l.missing && l.font === looks[0].font && l.height === looks[0].height), `the tab headings differ: ${JSON.stringify(looks)}`);
    await overview('export-pages-all-1280');
    await closePrint();
  });

  await step('Page numbers off: no numbers', async () => {
    await exportPdf({ numbers: false });
    await showPrint();
    const m = await measurePrint(A4_PAPER);
    expect(m.numbers.length === 0, `numbers: ${JSON.stringify(m.numbers)}`);
    await closePrint();
  });

  await step('Letter landscape (the page setup): the pages turn, the lines stay inside, the page count matches the page view', async () => {
    try {
      await setPageSetup(LETTER_LANDSCAPE);
      await openDoc(null);
      await waitFor(async () => (await b.evaluate(`(() => { const e = ${EDITOR}; const p = e.state.plugins.find((x) => x.key.startsWith('studiplyPageView')); return p.getState(e.state).sheet.width; })()`)) > 1000, 'the landscape page in the page view', 15000);
      await b.sleep(1500);
      // Still at 100 % (remembered from the This tab step), the PDF's scale.
      const z = await liveZoom();
      expect(z === 1, `the page view is at ${Math.round(z * 100)} %, not 100 %`);
      const shown = await livePages();
      const made = await exportPdf();
      expect(made.pages === shown, `the PDF has ${made.pages} pages, the page view ${shown}`);
      await showPrint();
      const has = await printHas();
      expect(has.pageCss === '27.94cm 21.59cm', `@page size: ${has.pageCss}`);
      const m = await measurePrint(LANDSCAPE_PAPER);
      expect(m.bad.length === 0, `lines outside their page's text area: ${JSON.stringify(m.bad)}`);
      const live = await liveBlocks();
      expect(live.overlaps.length === 0, `blocks overlap in the page view: ${JSON.stringify(live.overlaps)}`);
      const printed = await printBlocks();
      expect(printed.overlaps.length === 0, `blocks overlap in the PDF: ${JSON.stringify(printed.overlaps)}`);
      expectSameAsPageView(live, printed);
      await overview('export-pages-landscape-1280');
      await closePrint();
    } finally {
      await setPageSetup(A4);
    }
  });

  await step('from the sheet tab: Export PDF… gives its table of values, one page, no heading', async () => {
    await openDoc(sheetTab);
    const made = await exportPdf();
    expect(made.pages === 1, `pages: ${made.pages}`);
    await showPrint();
    const has = await printHas();
    expect(has.table && has.text.includes('Payment') && has.text.includes('898.0893756'), `the table: ${has.text.slice(0, 120)}`);
    expect(!has.text.includes('Sheet 1'), 'a heading on This tab');
    const printed = await printBlocks();
    expect(printed.overlaps.length === 0, `blocks overlap in the PDF: ${JSON.stringify(printed.overlaps)}`);
    await overview('export-pages-sheet-1280');
    await closePrint();
  });

  await step('390: the dialog fits the window', async () => {
    try {
      await b.resize(390, 844);
      await openDoc(null);
      await openDialog();
      const r = await b.evaluate(`(() => { const e = document.querySelector('[aria-label="Export PDF"]').getBoundingClientRect(); return { left: e.left, right: e.right, top: e.top, bottom: e.bottom, w: innerWidth, h: innerHeight }; })()`);
      expect(r.left >= 0 && r.right <= r.w + 0.5 && r.top >= 0 && r.bottom <= r.h + 0.5, `the dialog: ${JSON.stringify(r)}`);
      await b.shot('export-dialog-390');
      await b.click('Cancel', { exact: true });
    } finally {
      await b.resize(1280, 900);
    }
  });

  await step('the iPhone’s editor bundle makes the same pages, in points at 3/4', async () => {
    try {
      await b.resize(390, 844);
      await b.nav(IPHONE);
      await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom && typeof window.studiplyBuildPrint === 'function'`), 'the bundle and its page builder (rebuild it: npm run editor:build)', 30000);
      await b.sleep(1000);
      const r = await b.evaluate(`window.studiplyBuildPrint([{ title: 'Tab 1', content: ${JSON.stringify(CONTENT)} }], { setup: ${JSON.stringify(A4)}, numbers: true, tabHeadings: false, target: 'ios' }, 'Exportar').then((x) => ({ pages: x.pages, width: x.width, height: x.height, scaled: x.html.includes('transform: scale(0.75)'), box: x.html.includes('width: 595.28px; height: 841.89px') }))`);
      expect(r.pages === thisTab.pages, `the bundle made ${r.pages} pages, the laptop ${thisTab.pages}`);
      expect(r.width === 595.28 && r.height === 841.89 && r.scaled && r.box, JSON.stringify(r));
    } finally {
      await b.resize(1280, 900);
    }
  });

  await step('Chrome’s own PDF of the A4 print: one PDF page per page, A4 size', async () => {
    expect(thisTabHtml, 'no print from the This tab step');
    await b.nav('about:blank');
    await b.sleep(300);
    // The app's address as the base, so its stylesheets and fonts load as in the print frame.
    const html = thisTabHtml.replace('<head>', `<head><base href="${BASE}/">`);
    await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; })))); await document.fonts.ready; return true; })()`);
    await b.sleep(800);
    const { data } = await b.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    const pdf = Buffer.from(data, 'base64').toString('latin1');
    writeFileSync(join(OUT, 'export-a4.pdf'), Buffer.from(data, 'base64'));
    const pages = (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    expect(pages === thisTab.pages, `Chrome's PDF has ${pages} pages, the print ${thisTab.pages}`);
    const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(box && Math.abs(Number(box[1]) - 595.28) < 1 && Math.abs(Number(box[2]) - 841.89) < 1, `page size: ${box ? `${box[1]} × ${box[2]} pt` : 'not found'}`);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
