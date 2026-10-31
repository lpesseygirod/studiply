// modules.mjs — step 8.1, the summary's twelve text modules as editor blocks, in Chrome against local
// Supabase. NO paid call: the summary is a finished `summaries` row the check puts in (the hand-made
// fixture with all twelve, src/test-utils/summary-modules.json); nothing calls summarize, Anthropic or
// OpenAI (checked at the end).
//
// Steps:
//   1. 1280 (Pages): the lecture's Summary tab gets the summary written in: twelve `studyModule` blocks in
//      the documents row (origin ai, one id each), on the page in their sections' order, each with its
//      drawn label ("FRAMEWORK · DAFO", "CODE · PYTHON") and its group name for screen readers.
//   2. The look, as the module library says: the timeline's line and dots; cause → effect three stacked
//      boxes with arrows (Causes / Event / Effects); tables with horizontal rules only and a semibold
//      header; process stages numbered; the framework a 2-column grid; the argument's claim boxed; code
//      monospace, its indentation kept; the worked example's answer boxed. Each module whole on a page.
//   3. Typing inside a module makes it hers (origin student, an edit time) in the saved row; the others stay ai.
//   4. 390 (pageless, as the iPhone starts): every module there, nothing wider than the screen; no word
//      split in the middle of a table cell (each word's rendered boxes on one line; cells' overflow-wrap
//      and word-break normal); a table wider than its module scrolls sideways inside it.
//   (Step 1 also: with no notes and no marks, the first line is "No notes or marks were taken in class",
//   no notes box. Step 2's lengths allow for the page view's zoom.)
//   5. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//   6. Composites (no mockup exists: for the advisor's eye against the module library): each module
//      cropped at 1280 and at 390, and the page in light and dark at both widths:
//      shots/modules-compose-1280.png, shots/modules-compose-390.png.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start`, and `npm run editor:build` done:
//   node .claude/skills/web-check/scripts/modules.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node modules.mjs
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
    await b.shot(`fail-modules-${results.length}`).catch(() => {});
    // A menu or dialog left open would answer every later step.
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

const FIXTURE = JSON.parse(readFileSync(join(repo, 'src/test-utils/summary-modules.json'), 'utf8'));
const SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };
/** The modules in their sections' order (the fixture). */
const ORDER = ['timeline', 'causeEffect', 'keyFigures', 'comparison', 'process', 'framework', 'theoryCard', 'caseCard', 'argument', 'workedExample', 'code', 'vocabulary'];
const LABELS = {
  timeline: 'Timeline',
  causeEffect: 'Cause → effect',
  keyFigures: 'Key figures',
  comparison: 'Comparison',
  process: 'Process',
  framework: 'Framework · DAFO',
  theoryCard: 'Theory',
  caseCard: 'Case',
  argument: 'Argument',
  workedExample: 'Worked example',
  code: 'Code · Python',
  vocabulary: 'Vocabulary',
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
  await waitSplash();
  await b.sleep(500);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(700);
};
/** One module, cropped from the page (scrolled into view first). */
const crop = async (kind, name) => {
  const found = await b.evaluate(`(() => { const e = document.querySelector('[data-module="${kind}"]'); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  expect(found, `no ${kind} module to crop`);
  await b.sleep(400);
  const r = await b.evaluate(`(() => { const e = document.querySelector('[data-module="${kind}"]'); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }; })()`);
  const { data: png } = await b.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'));
  taken.add(name);
};
const summaryTab = async () => (await admin.from('documents').select('content, updated_at').eq('file_id', lectureId).eq('tab', 'summary').maybeSingle()).data;
const blockText = (n) => (n.text ?? '') + (n.content ?? []).map(blockText).join('');
const openSummary = async () => {
  await b.nav(`${BASE}/doc/${lectureId}?tab=summary&at=${Date.now()}`);
  await waitFor(() => has('[data-module="vocabulary"]'), 'the modules written in', 25000);
  await waitSplash();
};
const view = (pages) => b.evaluate(`localStorage.setItem('studiply.view', JSON.stringify({ laptop: { pages: ${pages}, zoom: ${pages ? "'fit'" : 1} } }))`);

try {
  await b.signIn(BASE, user.email, user.password);
  const { error } = await admin.from('summaries').insert({
    user_id: user.id,
    file_id: lectureId,
    mode: 'new',
    source_lecture_ids: [lectureId],
    sliders: SLIDERS,
    status: 'done',
    result: FIXTURE,
    applied_settings: { targetWords: 900, takeaways: 3, selfTestCount: 3, resources: { slides: false, photos: false, assistant: false, notes: true }, preview: '≈ 900 words' },
    model: 'claude-opus-5-5',
  });
  if (error) throw new Error(`the summary row: ${error.message}`);

  await step('1280 (Pages): twelve module blocks written in (ai, one id each), on the page in order, each with its label and group name', async () => {
    await view(true);
    await openSummary();
    const doc = await waitFor(async () => {
      const row = await summaryTab();
      return row?.content?.content?.some((x) => x.type === 'studyModule') ? row.content : null;
    }, 'the documents row', 15000);
    const blocks = doc.content.filter((x) => x.type === 'studyModule');
    expect(blocks.length === 12 && blocks.every((x) => x.attrs?.origin === 'ai' && /^sm[0-9a-z]{8}-s\d+-b\d+$/.test(x.attrs?.blockId ?? '')), `blocks: ${JSON.stringify(blocks.map((x) => [x.attrs?.kind, x.attrs?.blockId, x.attrs?.origin]))}`);
    const onPage = await b.evaluate(`[...document.querySelectorAll('.ProseMirror [data-module]')].map((e) => ({ kind: e.getAttribute('data-module'), label: e.querySelector('.studiply-module-label')?.textContent, role: e.getAttribute('role'), aria: e.getAttribute('aria-label') }))`);
    expect(JSON.stringify(onPage.map((m) => m.kind)) === JSON.stringify(ORDER), `order: ${onPage.map((m) => m.kind).join(', ')}`);
    for (const m of onPage) expect(m.label === LABELS[m.kind] && m.role === 'group' && m.aria, `${m.kind}: ${JSON.stringify(m)}`);
    // No notes and no marks in class: one plain line first (no "All your notes… · 0 of 0", no link).
    expect(doc.content[0].type === 'paragraph' && blockText(doc.content[0]) === 'No notes or marks were taken in class', `the first block: ${JSON.stringify(doc.content[0]).slice(0, 200)}`);
    const first = await b.evaluate(`({ line: document.querySelector('.ProseMirror p')?.textContent, box: !!document.querySelector('[data-callout="notesCheck"]') })`);
    expect(first.line === 'No notes or marks were taken in class' && !first.box, `on the page: ${JSON.stringify(first)}`);
    report.push(`RESULT | ${blocks.length} modules, ${doc.content.length} blocks in all`);
  });

  await step('the look (module library): timeline line and dots, cause → effect boxes and arrows, tables, stages, grid, claim, code, answer; each whole on a page; no scroll box overflowing', async () => {
    const look = await b.evaluate(`(() => {
      const q = (k) => document.querySelector('[data-module="' + k + '"] .studiply-module-body');
      const pseudo = (el, which) => el ? getComputedStyle(el, which) : null;
      const tl = q('timeline');
      const line = pseudo(tl.querySelector(':scope > ul'), '::before');
      const dot = pseudo(tl.querySelector(':scope > ul > li'), '::before');
      const ce = [...q('causeEffect').children].map((c) => { const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: Math.round(r.left), arrow: getComputedStyle(c, '::after').content, label: getComputedStyle(c, '::before').content }; });
      const td = q('keyFigures').querySelector('td');
      const th = q('keyFigures').querySelector('th');
      const step = pseudo(q('process').querySelector('ol > li'), '::before');
      const gridRow = q('framework').querySelector('tr');
      const claim = q('argument').querySelector(':scope > p');
      const code = [...q('code').querySelectorAll('p')];
      const answer = q('workedExample').querySelector(':scope > p:last-child');
      return {
        // Page view zooms the page to fit (CSS zoom): computed lengths come scaled by it.
        zoom: parseFloat(getComputedStyle(document.querySelector('.ProseMirror')).zoom) || 1,
        line: line && line.content !== 'none' && line.width, dot: dot && dot.borderTopStyle,
        ce,
        td: td && { left: getComputedStyle(td).borderLeftWidth, bottom: getComputedStyle(td).borderBottomWidth }, th: th && getComputedStyle(th).fontWeight,
        step: step && step.content,
        gridCells: gridRow && gridRow.children.length,
        claim: claim && getComputedStyle(claim).borderTopWidth,
        codeFont: code[0] && getComputedStyle(code[0]).fontFamily, indent: code.find((p) => p.textContent.startsWith('    V +=')) ? true : false,
        answer: answer && getComputedStyle(answer).borderTopWidth,
        split: [...document.querySelectorAll('[data-module]')].filter((m) => m.querySelector('.studiply-page-gap')).map((m) => m.getAttribute('data-module')),
        // A scroll box (a table's, the code panel) scrolls only when its content is really wider.
        overflow: [...document.querySelectorAll('[data-module] .tableWrapper, [data-module="code"] .studiply-module-body')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.closest('[data-module]').getAttribute('data-module') + ' ' + el.scrollWidth + '>' + el.clientWidth),
      };
    })()`);
    /**
     * A CSS length of `n` px on the page: as written, or scaled by the page zoom (± 0.2 px). Borders
     * snap to whole device pixels under the zoom, so a 1 px border can also read back as 1 ÷ zoom.
     */
    const near = (value, n) =>
      [n, n * look.zoom, Math.max(1, Math.floor(n * look.zoom)) / look.zoom, Math.max(1, Math.round(n * look.zoom)) / look.zoom].some((want) => Math.abs(parseFloat(value) - want) <= 0.2);
    expect(near(look.line, 2) && look.dot === 'solid', `timeline: ${JSON.stringify([look.line, look.dot, look.zoom])}`);
    expect(look.ce.length === 3 && look.ce[0].bottom < look.ce[1].top && look.ce[1].bottom < look.ce[2].top && look.ce[0].left === look.ce[2].left, `cause → effect stacked: ${JSON.stringify(look.ce)}`);
    expect(look.ce[1].arrow.includes('↓') && look.ce[2].arrow.includes('↓') && look.ce[0].label.includes('Causes') && look.ce[1].label.includes('Event') && look.ce[2].label.includes('Effects'), `arrows and labels: ${JSON.stringify(look.ce)}`);
    expect(parseFloat(look.td?.left) === 0 && near(look.td?.bottom, 1) && Number(look.th) >= 600, `tables: ${JSON.stringify([look.td, look.th, look.zoom])}`);
    // Chrome reports a counter's content as written ("counter(studiply-step)").
    expect(String(look.step).includes('counter(studiply-step)'), `process stage number: ${look.step}`);
    expect(look.gridCells === 2, `framework grid: ${look.gridCells} cells a row`);
    expect(near(look.claim, 1), `argument claim boxed: ${look.claim}`);
    expect(/Menlo|SF Mono|monospace/.test(look.codeFont ?? '') && look.indent, `code: ${look.codeFont}, indent ${look.indent}`);
    expect(near(look.answer, 2), `worked example answer boxed: ${look.answer}`);
    expect(look.split.length === 0, `split across pages: ${look.split.join(', ')}`);
    expect(look.overflow.length === 0, `a scroll box wider than its content needs at 1280: ${look.overflow.join(', ')}`);
    await shot('modules-page-1280');
    for (const kind of ORDER) await crop(kind, `module-${kind}-1280`);
    await dark(true);
    await b.evaluate(`document.querySelector('[data-module="timeline"]').scrollIntoView({ block: 'start' })`);
    await shot('modules-page-1280-dark');
    await dark(false);
  });

  await step('typing inside a module makes it hers (origin student, an edit time); the others stay ai', async () => {
    const before = (await summaryTab()).updated_at;
    const placed = await b.evaluate(`(() => {
      const cell = [...document.querySelectorAll('[data-module="framework"] td p')].find((p) => p.textContent === 'Fortalezas');
      if (!cell) return false;
      cell.scrollIntoView({ block: 'center' });
      cell.closest('.ProseMirror').focus();
      const r = document.createRange(); r.selectNodeContents(cell); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return true;
    })()`);
    expect(placed, 'the cell "Fortalezas"');
    await b.sleep(200);
    await b.type(' (clave)');
    const doc = await waitFor(async () => {
      const row = await summaryTab();
      return row && row.updated_at !== before && blockText(row.content).includes('Fortalezas (clave)') ? row.content : null;
    }, 'the edit saved', 15000);
    const mods = doc.content.filter((x) => x.type === 'studyModule');
    const framework = mods.find((x) => x.attrs?.kind === 'framework');
    expect(framework.attrs.origin === 'student' && typeof framework.attrs.editedAt === 'number', `framework: ${JSON.stringify(framework.attrs)}`);
    expect(mods.filter((x) => x.attrs?.kind !== 'framework').every((x) => x.attrs?.origin === 'ai'), 'another module became hers');
  });

  await step('390 (pageless): every module, nothing wider than the screen but the tables, which scroll in their box', async () => {
    await b.resize(390, 844);
    await view(false);
    await openSummary();
    const fit = await b.evaluate(`(() => {
      const kinds = [...document.querySelectorAll('.ProseMirror [data-module]')].map((e) => e.getAttribute('data-module'));
      const page = document.documentElement.scrollWidth;
      const wide = [...document.querySelectorAll('[data-module]')].filter((m) => m.getBoundingClientRect().right > innerWidth + 1).map((m) => m.getAttribute('data-module'));
      return { kinds, page, wide };
    })()`);
    expect(JSON.stringify(fit.kinds) === JSON.stringify(ORDER), `order at 390: ${fit.kinds.join(', ')}`);
    expect(fit.page <= 391 && fit.wide.length === 0, `wider than the screen: ${JSON.stringify(fit)}`);
    // Never a word split in the middle of a table cell: each word's rendered boxes all on one line.
    const words = await b.evaluate(`(() => {
      const broken = [];
      const cells = [...document.querySelectorAll('[data-module] td, [data-module] th')];
      for (const cell of cells) {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (const m of n.data.matchAll(/\\S+/g)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
            const lines = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
            if (lines.size > 1) broken.push(m[0]);
          }
        }
      }
      const wrap = cells.map((c) => getComputedStyle(c).overflowWrap + '/' + getComputedStyle(c).wordBreak);
      // A table wider than its module scrolls inside it (its wrapper), never the page.
      const tables = [...document.querySelectorAll('[data-module] .tableWrapper')].map((w) => ({ kind: w.closest('[data-module]').getAttribute('data-module'), overflow: getComputedStyle(w).overflowX, scrolls: w.scrollWidth > w.clientWidth + 1 }));
      return { cells: cells.length, broken, wrap: [...new Set(wrap)], tables };
    })()`);
    expect(words.cells > 20 && words.broken.length === 0, `words split inside a cell: ${JSON.stringify(words.broken)}`);
    expect(JSON.stringify(words.wrap) === JSON.stringify(['normal/normal']), `cells’ wrapping: ${JSON.stringify(words.wrap)}`);
    expect(words.tables.length >= 4 && words.tables.every((t) => t.overflow === 'auto'), `table boxes: ${JSON.stringify(words.tables)}`);
    report.push(`RESULT | 390: ${words.cells} table cells, no word split; scrolling sideways: ${words.tables.filter((t) => t.scrolls).map((t) => t.kind).join(', ') || 'none'}`);
    await shot('modules-page-390');
    await dark(true);
    await shot('modules-page-390-dark');
    await dark(false);
    // Crops: a taller window so a long module (a table) fits whole.
    await b.resize(390, 1600);
    for (const kind of ORDER) await crop(kind, `module-${kind}-390`);
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites: modules-compose-1280, modules-compose-390 (each module, and the page light and dark)', async () => {
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
    await compose(
      'modules-compose-1280',
      [...ORDER.map((k) => [LABELS[k], shotOf(`module-${k}-1280`)]), ['The page · light', shotOf('modules-page-1280')], ['The page · dark', shotOf('modules-page-1280-dark')]],
      700,
      2,
    );
    await compose(
      'modules-compose-390',
      [...ORDER.map((k) => [LABELS[k], shotOf(`module-${k}-390`)]), ['The page · light', shotOf('modules-page-390')], ['The page · dark', shotOf('modules-page-390-dark')]],
      390,
      4,
    );
    await b.resize(1280, 900);
    const wanted = [...ORDER.flatMap((k) => [`module-${k}-1280`, `module-${k}-390`]), 'modules-page-1280', 'modules-page-1280-dark', 'modules-page-390', 'modules-page-390-dark'];
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
