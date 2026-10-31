// visuals.mjs — step 8.2, formulas and graphs from a summary, in Chrome against local Supabase. NO paid
// call: each summary is a finished `summaries` row the check puts in (the hand-made fixtures
// src/test-utils/summary-calculus.json and summary-finance.json, their board photos uploaded first);
// nothing calls summarize, Anthropic or OpenAI (checked at the end).
//
// The charts module doesn't draw function plots or model graphs yet (docs/charts-work-order-8.2.md):
// until it does, each shows its line of text in its place ("… · drawn in a later update"), never an
// empty or broken chart. Data charts of the existing kinds (line, bar) are drawn.
//
// Steps:
//   1. 1280 (Pages), Calculus: the Summary tab gets three `graph` blocks of kind function (origin ai, the
//      expression, range and marks in the documents row); on the page each shows its line (no SVG, no
//      empty figure); a click on one selects it and opens no graph form; the formula card with its legend.
//   2. Calculus' two board photos, loaded, each in the section whose time holds its own.
//   3. 1280 (Pages), Finance: three formula cards (the formula typeset, each legend symbol a formula with
//      its meaning, "When to use: …"); the line and the bar chart drawn (SVG with the takeaway as its
//      title and a description); the supply-and-demand graph its line, the professor's "Demanda" as D;
//      the photo in its section. Each card and graph whole on a page.
//   4. 390 (pageless, as the iPhone starts): both summaries, nothing wider than the screen; the charts
//      scale down to the width; the lines wrap.
//   5. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//   6. Composites (no mockup exists: for the advisor's eye): the formula cards, the graphs and the
//      photos cropped at 1280 and at 390, and both pages light and dark at both widths:
//      shots/visuals-compose-1280.png, shots/visuals-compose-390.png.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start`, and `npm run editor:build` done:
//   node .claude/skills/web-check/scripts/visuals.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node visuals.mjs
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
    await b.shot(`fail-visuals-${results.length}`).catch(() => {});
    // A menu, form or dialog left open would answer every later step.
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
const fixture = (name) => readFileSync(join(repo, `src/test-utils/${name}`), 'utf8');
const SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 6, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };
const LATER = 'drawn in a later update';
/** What the page shows in each function plot's and model graph's place (the fixtures' titles and data). */
const CALC_LINES = [
  `La parábola corta el eje x en −2 y 2: y = x^2 - 4 on [-5, 5] · ${LATER}`,
  `El seno se anula en 0, π y 2π: y = sin(x) on [0, 6.2832] · ${LATER}`,
  `1/x no está definida en x = 0: y = 1/x on [-5, 5] · ${LATER}`,
];
const FIN_MODEL_LINE = `Si sube la demanda de préstamos, sube el tipo de interés (D → right) · ${LATER}`;
const FIN_CHARTS = ['Al 5 % anual, 1.000 € se convierten en 1.276 € en cinco años', 'Solo los proyectos B y D tienen un VAN positivo'];

const user = await makeUser();
const data = await seed(user.client);
const calcId = data.lecture.id;
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const waitSplash = () => waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
const taken = new Set();
const shot = async (name) => {
  await waitSplash();
  await b.sleep(500);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(700);
};
/** The `index`th element matching `css` in the editor, cropped from the page (scrolled into view first). */
const crop = async (css, index, name) => {
  const sel = JSON.stringify(`.ProseMirror ${css}`);
  const found = await b.evaluate(`(() => { const e = document.querySelectorAll(${sel})[${index}]; if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  expect(found, `nothing to crop: ${css} #${index}`);
  await b.sleep(400);
  const r = await b.evaluate(`(() => { const e = document.querySelectorAll(${sel})[${index}]; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: Math.min(innerWidth, r.width + 16), height: r.height + 16 }; })()`);
  const { data: png } = await b.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'));
  taken.add(name);
};
const summaryTab = async (id) => (await admin.from('documents').select('content').eq('file_id', id).eq('tab', 'summary').maybeSingle()).data;
const blockText = (n) => (n.text ?? '') + (n.content ?? []).map(blockText).join('');
const openSummary = async (id, until) => {
  await b.nav(`${BASE}/doc/${id}?tab=summary&at=${Date.now()}`);
  await waitFor(() => has(until), `the summary written in (${until})`, 25000);
  await waitSplash();
};
const view = (pages) => b.evaluate(`localStorage.setItem('studiply.view', JSON.stringify({ laptop: { pages: ${pages}, zoom: ${pages ? "'fit'" : 1} } }))`);
/** Every graph on the page: drawn (an SVG with its title and description) or its line; never empty. */
const graphsShown = () =>
  b.evaluate(`[...document.querySelectorAll('.ProseMirror .studiply-graph')].map((f) => ({
    svg: !!f.querySelector('svg'),
    title: f.querySelector('svg title')?.textContent ?? null,
    desc: f.querySelector('svg desc')?.textContent ?? null,
    line: f.querySelector('.studiply-graph-later')?.textContent ?? null,
    height: Math.round(f.getBoundingClientRect().height),
  }))`);
/**
 * Each photo block (.studiply-photo) with the section heading above it ("3 · Asíntotas" and its time
 * chip), and whether its picture loaded. Not every <img>: ProseMirror puts an empty
 * img.ProseMirror-separator after an inline node ending a line (a heading's time chip, a formula).
 */
const photosShown = () =>
  b.evaluate(`(() => {
    const heads = [...document.querySelectorAll('.ProseMirror h2')].filter((h) => /^\\d+ · /.test(h.textContent));
    return [...document.querySelectorAll('.ProseMirror .studiply-photo')].map((photo) => {
      const img = photo.querySelector('img');
      const above = heads.filter((h) => h.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
      return { section: above ? above.textContent : null, loaded: !!img && img.complete && img.naturalWidth > 0 };
    });
  })()`);
/** JSON with every object's keys in order: the documents row is jsonb, which doesn't keep the order they were written in. */
const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b2]) => (a < b2 ? -1 : 1))) : x));
const same = (a, b2) => canonical(a) === canonical(b2);
const inSections = (photos, headings) => photos.length === headings.length && photos.every((p, i) => (p.section ?? '').startsWith(headings[i]));
/** Formula cards: the display formula typeset, the legend's symbols typeset, the "When to use" line. */
const cardsShown = () =>
  b.evaluate(`[...document.querySelectorAll('.ProseMirror .studiply-formula-card')].map((c) => {
    const ps = [...c.querySelectorAll('.studiply-formula-card-body > p')];
    return {
      title: c.querySelector('.studiply-formula-card-title')?.textContent ?? null,
      formula: !!c.querySelector('.katex-display, [data-type="block-math"] .katex'),
      legendSymbols: ps[0] ? ps[0].querySelectorAll('.katex').length : 0,
      legend: ps[0]?.textContent.replace(/\\s+/g, ' ').trim() ?? '',
      whenToUse: ps.find((p) => p.textContent.startsWith('When to use: '))?.textContent ?? null,
    };
  })`);
/** Graphs, cards and photos split across two pages (Pages view). */
const splitAcrossPages = () =>
  b.evaluate(`[...document.querySelectorAll('.ProseMirror .studiply-graph, .ProseMirror .studiply-formula-card')].filter((e) => e.querySelector('.studiply-page-gap')).length`);

/** A board photo, drawn here (a chalkboard with the lecture's formula), as JPEG bytes (the `photos` bucket takes JPEG only, as the app uploads). */
const boardJpeg = async (text) => {
  const url = await b.evaluate(`(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    g.fillStyle = '#23412f'; g.fillRect(0, 0, 640, 360);
    g.strokeStyle = '#e9e4d4'; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 300); g.lineTo(600, 300); g.moveTo(320, 330); g.lineTo(320, 30); g.stroke();
    g.beginPath(); for (let x = -4; x <= 4; x += 0.05) { const px = 320 + x * 60, py = 300 - (x * x) * 15; x === -4 ? g.moveTo(px, py) : g.lineTo(px, py); } g.stroke();
    g.fillStyle = '#e9e4d4'; g.font = '36px Georgia, serif'; g.fillText(${JSON.stringify(text)}, 40, 60);
    return c.toDataURL('image/jpeg', 0.85);
  })()`);
  expect(url.startsWith('data:image/jpeg;base64,'), `the board photo isn't a JPEG: ${url.slice(0, 30)}`);
  return Buffer.from(url.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
};
const addPhoto = async (lectureId, name, tMs, text) => {
  const path = `${user.id}/${lectureId}/${name}.jpg`;
  const { error } = await admin.storage.from('photos').upload(path, await boardJpeg(text), { contentType: 'image/jpeg' });
  if (error) throw new Error(`the photo: ${error.message}`);
  const { data: row, error: e2 } = await admin.from('media').insert({ user_id: user.id, lecture_id: lectureId, kind: 'photo', storage_path: path, mime_type: 'image/jpeg', t_ms: tMs, caption: 'Pizarra' }).select('id').single();
  if (e2) throw new Error(`the photo row: ${e2.message}`);
  return row.id;
};
const doneRow = async (lectureId, result) => {
  const { error } = await admin.from('summaries').insert({
    user_id: user.id,
    file_id: lectureId,
    mode: 'new',
    source_lecture_ids: [lectureId],
    sliders: SLIDERS,
    status: 'done',
    result,
    applied_settings: { targetWords: result.appliedSettings.targetWords, takeaways: 3, selfTestCount: 2, resources: { slides: false, photos: true, assistant: false, notes: true }, preview: `≈ ${result.appliedSettings.targetWords} words` },
    model: 'claude-opus-5-5',
  });
  if (error) throw new Error(`the summary row: ${error.message}`);
};

let finId = null;
try {
  // The Finance lecture beside Lecture 1 (Calculus), in the same course.
  const { data: file, error: fe } = await admin.from('files').insert({ user_id: user.id, kind: 'lecture', title: 'Tema 2 · Finanzas', course_id: data.course.id }).select().single();
  if (fe) throw new Error(`the Finance lecture: ${fe.message}`);
  finId = file.id;
  await admin.from('lectures').insert({ id: finId, user_id: user.id, status: 'transcribing', duration_ms: 45 * MIN });
  await b.nav('about:blank');
  const c1 = await addPhoto(calcId, 'board-1', 6 * MIN + 30_000, 'y = x² − 4');
  const c2 = await addPhoto(calcId, 'board-2', 26 * MIN + 10_000, 'y = 1/x');
  const f1 = await addPhoto(finId, 'board-1', 10 * MIN + 20_000, 'VF = VA·(1 + r)ⁿ');
  const CALC = JSON.parse(fixture('summary-calculus.json').replaceAll('"photo-board-1"', JSON.stringify(c1)).replaceAll('"photo-board-2"', JSON.stringify(c2)));
  const FIN = JSON.parse(fixture('summary-finance.json').replaceAll('"photo-board-1"', JSON.stringify(f1)));

  await b.signIn(BASE, user.email, user.password);
  await doneRow(calcId, CALC);
  await doneRow(finId, FIN);

  await step('1280 (Pages), Calculus: three function plots (graph blocks, ai, their data); each its line on the page, never empty; no form on a click', async () => {
    await view(true);
    await openSummary(calcId, '.studiply-graph-later');
    const doc = await waitFor(async () => {
      const row = await summaryTab(calcId);
      return row?.content?.content?.filter((x) => x.type === 'graph').length === 3 ? row.content : null;
    }, 'the documents row', 15000);
    const graphs = doc.content.filter((x) => x.type === 'graph');
    expect(graphs.every((g) => g.attrs.kind === 'function' && g.attrs.origin === 'ai' && /^sm[0-9a-z]{8}-s\d+-b\d+$/.test(g.attrs.blockId ?? '')), `blocks: ${JSON.stringify(graphs.map((g) => [g.attrs.kind, g.attrs.origin, g.attrs.blockId]))}`);
    expect(same(graphs.map((g) => g.attrs.func), [
      { expression: 'x^2 - 4', xRange: [-5, 5], marks: ['roots', 'vertex'] },
      { expression: 'sin(x)', xRange: [0, 6.2832], marks: ['roots', 'extrema'] },
      { expression: '1/x', xRange: [-5, 5], marks: [] },
    ]), `func: ${JSON.stringify(graphs.map((g) => g.attrs.func))}`);
    const shown = await graphsShown();
    expect(JSON.stringify(shown.map((g) => g.line)) === JSON.stringify(CALC_LINES), `lines: ${JSON.stringify(shown.map((g) => g.line))}`);
    expect(shown.every((g) => !g.svg && g.height >= 18), `an empty or drawn figure: ${JSON.stringify(shown)}`);
    // A click selects it and opens no graph form (8.2: regenerate-only).
    await b.clickSelector('.ProseMirror .studiply-graph');
    await b.sleep(600);
    const after = await b.evaluate(`({ form: !!document.querySelector('[aria-label="Graph type: Bar"]'), selected: !!document.querySelector('.ProseMirror .studiply-graph.ProseMirror-selectednode') })`);
    expect(!after.form && after.selected, `after a click: ${JSON.stringify(after)}`);
    await b.press('Escape');
    const cards = await cardsShown();
    expect(cards.length === 1 && cards[0].formula && cards[0].legendSymbols === 2 && cards[0].whenToUse === 'When to use: Para encontrar el vértice de una parábola sin dibujarla.', `the formula card: ${JSON.stringify(cards)}`);
    expect((await splitAcrossPages()) === 0, 'a graph or card split across pages');
    report.push(`RESULT | Calculus: ${graphs.length} function plots, each its line (the charts module doesn't draw functions yet)`);
    await b.evaluate(`document.querySelector('.ProseMirror h2')?.scrollIntoView({ block: 'start' })`);
    await shot('visuals-calculus-1280');
    await crop('.studiply-graph', 0, 'visuals-function-1280');
    await crop('.studiply-formula-card', 0, 'visuals-calc-card-1280');
    await dark(true);
    await b.evaluate(`document.querySelector('.ProseMirror h2')?.scrollIntoView({ block: 'start' })`);
    await shot('visuals-calculus-1280-dark');
    await dark(false);
  });

  await step('Calculus: the two board photos loaded, each in the section that holds its time (6:30 → 1, 26:10 → 3)', async () => {
    const photos = await waitFor(async () => {
      const p = await photosShown();
      return p.length === 2 && p.every((x) => x.loaded) ? p : null;
    }, async () => `photos: ${JSON.stringify(await photosShown())}`, 20000);
    expect(inSections(photos, ['1 · Funciones cuadráticas', '3 · Asíntotas']), `sections: ${JSON.stringify(photos)}`);
    const doc = (await summaryTab(calcId)).content;
    const imgs = doc.content.filter((x) => x.type === 'image');
    expect(imgs.length === 2 && imgs.every((x) => x.attrs.origin === 'media' && String(x.attrs.src).startsWith('media:')), `image blocks: ${JSON.stringify(imgs.map((x) => x.attrs))}`);
    await crop('.studiply-photo', 0, 'visuals-photo-1280');
  });

  await step('1280 (Pages), Finance: three formula cards with legends and "When to use"; the line and bar charts drawn; the model graph its line (D → right); the photo in its section', async () => {
    await openSummary(finId, '.studiply-graph svg');
    const cards = await cardsShown();
    expect(cards.length === 3 && cards.every((c) => c.title === 'Formula' && c.formula), `cards: ${JSON.stringify(cards)}`);
    expect(JSON.stringify(cards.map((c) => c.legendSymbols)) === JSON.stringify([4, 4, 4]), `legend symbols: ${JSON.stringify(cards.map((c) => c.legendSymbols))}`);
    expect(cards[0].legend.includes('valor futuro') && cards[2].legend.includes('inversión inicial'), `legends: ${JSON.stringify(cards.map((c) => c.legend))}`);
    expect(cards.every((c) => c.whenToUse), `"When to use": ${JSON.stringify(cards.map((c) => c.whenToUse))}`);
    const shown = await graphsShown();
    expect(shown.length === 3, `graphs: ${JSON.stringify(shown)}`);
    expect(shown[0].svg && shown[0].title === FIN_CHARTS[0] && /^Line chart/.test(shown[0].desc ?? ''), `the line chart: ${JSON.stringify(shown[0])}`);
    expect(shown[1].svg && shown[1].title === FIN_CHARTS[1] && /^Bar chart/.test(shown[1].desc ?? ''), `the bar chart: ${JSON.stringify(shown[1])}`);
    expect(!shown[2].svg && shown[2].line === FIN_MODEL_LINE, `the model graph: ${JSON.stringify(shown[2])}`);
    const doc = (await summaryTab(finId)).content;
    const model = doc.content.find((x) => x.type === 'graph' && x.attrs.kind === 'model');
    expect(same(model?.attrs?.model, { template: 'supplyDemand', shifts: [{ curve: 'D', direction: 'right' }] }), `model: ${JSON.stringify(model?.attrs)}`);
    const photos = await waitFor(async () => {
      const p = await photosShown();
      return p.length === 1 && p[0].loaded ? p : null;
    }, async () => `photos: ${JSON.stringify(await photosShown())}`, 20000);
    expect(inSections(photos, ['1 · Valor futuro y valor actual']), `photo: ${JSON.stringify(photos)}`);
    expect((await splitAcrossPages()) === 0, 'a graph or card split across pages');
    report.push(`RESULT | Finance: ${cards.length} formula cards (${cards.map((c) => c.legendSymbols).join('/')} legend symbols), 2 charts drawn, the model graph its line`);
    await b.evaluate(`document.querySelector('.ProseMirror h2')?.scrollIntoView({ block: 'start' })`);
    await shot('visuals-finance-1280');
    for (let i = 0; i < 3; i++) await crop('.studiply-formula-card', i, `visuals-fin-card-${i + 1}-1280`);
    await crop('.studiply-graph', 0, 'visuals-line-1280');
    await crop('.studiply-graph', 1, 'visuals-bar-1280');
    await crop('.studiply-graph', 2, 'visuals-model-1280');
    await dark(true);
    await b.evaluate(`document.querySelector('.ProseMirror .studiply-graph svg')?.scrollIntoView({ block: 'center' })`);
    await shot('visuals-finance-1280-dark');
    await dark(false);
  });

  await step('390 (pageless): both summaries fit the screen; the charts scale down, the lines wrap', async () => {
    await b.resize(390, 844);
    await view(false);
    const fits = {};
    for (const [name, id, until] of [['calculus', calcId, '.studiply-graph-later'], ['finance', finId, '.studiply-graph svg']]) {
      await openSummary(id, until);
      const fit = await b.evaluate(`(() => {
        const page = document.documentElement.scrollWidth;
        const wide = [...document.querySelectorAll('.ProseMirror .studiply-graph, .ProseMirror .studiply-formula-card, .ProseMirror .studiply-photo img, .ProseMirror .studiply-graph svg')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className.baseVal ?? e.className);
        const lines = [...document.querySelectorAll('.studiply-graph-later')].map((p) => Math.round(p.getBoundingClientRect().height / (parseFloat(getComputedStyle(p).lineHeight) || 20)));
        return { page, wide, lines, graphs: document.querySelectorAll('.ProseMirror .studiply-graph').length };
      })()`);
      expect(fit.page <= 391 && fit.wide.length === 0, `${name} wider than the screen: ${JSON.stringify(fit)}`);
      fits[name] = fit;
      if (name === 'calculus') {
        expect(fit.lines.length === 3 && fit.lines.some((n) => n >= 2), `the lines don't wrap: ${JSON.stringify(fit.lines)}`);
        await shot('visuals-calculus-390');
        await crop('.studiply-graph', 0, 'visuals-function-390');
        await dark(true);
        await shot('visuals-calculus-390-dark');
        await dark(false);
      } else {
        await shot('visuals-finance-390');
        await crop('.studiply-formula-card', 2, 'visuals-fin-card-3-390');
        await crop('.studiply-graph', 0, 'visuals-line-390');
        await crop('.studiply-graph', 1, 'visuals-bar-390');
        await crop('.studiply-graph', 2, 'visuals-model-390');
        await crop('.studiply-photo', 0, 'visuals-photo-390');
        await dark(true);
        await shot('visuals-finance-390-dark');
        await dark(false);
      }
    }
    report.push(`RESULT | 390: ${fits.calculus.graphs} + ${fits.finance.graphs} graphs, none wider than the screen`);
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites: visuals-compose-1280, visuals-compose-390 (cards, graphs, photos; the pages light and dark)', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    await b.nav('about:blank');
    const compose = async (name, cells, w, columns) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 15px -apple-system,sans-serif;margin:0 0 6px">${label}</figcaption>${
          src ? `<img src="${src}" style="max-width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:grid;grid-template-columns:repeat(${columns}, ${w}px);gap:24px;align-items:start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    const wide = [
      ['Calculus · formula card', 'visuals-calc-card-1280'],
      ['Calculus · function plot (its line until drawn)', 'visuals-function-1280'],
      ['Calculus · board photo in its section', 'visuals-photo-1280'],
      ['Finance · FV', 'visuals-fin-card-1-1280'],
      ['Finance · PV', 'visuals-fin-card-2-1280'],
      ['Finance · NPV', 'visuals-fin-card-3-1280'],
      ['Finance · line chart', 'visuals-line-1280'],
      ['Finance · bar chart', 'visuals-bar-1280'],
      ['Finance · model graph (its line until drawn)', 'visuals-model-1280'],
      ['Calculus · page light', 'visuals-calculus-1280'],
      ['Calculus · page dark', 'visuals-calculus-1280-dark'],
      ['Finance · page light', 'visuals-finance-1280'],
      ['Finance · page dark', 'visuals-finance-1280-dark'],
    ];
    const narrow = [
      ['Function plot', 'visuals-function-390'],
      ['NPV card', 'visuals-fin-card-3-390'],
      ['Line chart', 'visuals-line-390'],
      ['Bar chart', 'visuals-bar-390'],
      ['Model graph', 'visuals-model-390'],
      ['Photo', 'visuals-photo-390'],
      ['Calculus · light', 'visuals-calculus-390'],
      ['Calculus · dark', 'visuals-calculus-390-dark'],
      ['Finance · light', 'visuals-finance-390'],
      ['Finance · dark', 'visuals-finance-390-dark'],
    ];
    await compose('visuals-compose-1280', wide.map(([l, n]) => [l, shotOf(n)]), 700, 2);
    await compose('visuals-compose-390', narrow.map(([l, n]) => [l, shotOf(n)]), 390, 4);
    await b.resize(1280, 900);
    const missing = [...wide, ...narrow].map(([, n]) => n).filter((n) => !taken.has(n));
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
