// pages.mjs — step 4.5b, the page view and zoom:
//   - a 10-page document on the laptop: the page count, every line of text
//     inside its page's text area (no line under a gap or in a margin), a
//     long paragraph split across a gap, a page break starting a page, the
//     "Page n of m" label;
//   - Pages ↔ Pageless from the toolbar, remembered after a reload;
//   - ⌘+ up to 150 % (remembered after a reload), ⌘0 back to 100 %, the
//     zoom menu's Fit; at 150 % a real click lands on the letter under it
//     and typing goes there; still every line inside its page;
//   - the table's hover handles on a later page sit on the table;
//   - the iPhone bundle (390 px, touch): Print layout fits the screen's
//     width, the label shows while scrolling, a pinch zooms.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OUT } from './cdp.mjs';
import { makeUser, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const ONLY = process.env.WEB_CHECK_ONLY;
const results = [];
let b;
const step = async (name, fn) => {
  if (ONLY && !name.includes(ONLY)) return;
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-pages-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const EDITOR = 'window.studiplyEditor';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

// A long study document: headings, paragraphs of 1–4 long sentences, lists, a 28-row table, a formula, a page break.
const S = 'La psicobiología estudia las bases biológicas de la conducta humana y animal, desde las neuronas y los neurotransmisores hasta los sistemas que regulan el sueño, la memoria y las emociones.';
const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const h = (level, t) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: t }] });
const content = [{ type: 'title', content: [{ type: 'text', text: 'Tema 3: el sistema nervioso' }] }];
for (let s = 1; s <= 6; s++) {
  content.push(h(1, `${s}. Sección ${s}`));
  for (let i = 0; i < 4; i++) content.push(p(Array.from({ length: 1 + ((i + s) % 4) }, () => S).join(' ')));
  content.push(h(2, `${s}.1 Ideas clave`));
  content.push({ type: 'bulletList', content: Array.from({ length: 5 }, (_, k) => ({ type: 'listItem', content: [p(`Punto ${k + 1}: ${S.slice(0, 60 + k * 25)}`)] })) });
  if (s === 3) content.push({ type: 'table', content: Array.from({ length: 28 }, (_, r) => ({ type: 'tableRow', content: [0, 1, 2].map((c) => ({ type: 'tableCell', content: [p(`Fila ${r + 1}, col ${c + 1}${c === 2 && r % 5 === 0 ? ' — ' + S.slice(0, 90) : ''}`)] })) })) });
  if (s === 4) content.push({ type: 'blockMath', attrs: { latex: '\\sum_{i=1}^{n} x_i^2 = \\frac{a}{b}' } });
  if (s === 2) content.push({ type: 'pageBreak' });
}

/** Every line of text (not the gaps' page numbers) inside its page's text area. */
const linesInPages = () => b.evaluate(`(() => {
  const dom = ${EDITOR}.view.dom;
  const box = dom.getBoundingClientRect(), scale = box.width / dom.offsetWidth;
  const top0 = box.top + 96 * scale, pitch = (1123 + 24) * scale, text = (1123 - 192) * scale;
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest('.studiply-page-gap, .katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const r = document.createRange(), bad = [];
  let lines = 0;
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    r.selectNodeContents(t);
    for (const rect of r.getClientRects()) {
      if (!rect.height || !rect.width) continue;
      lines++;
      const k = Math.floor((rect.top - top0 + 2) / pitch), pt = top0 + k * pitch;
      if (rect.top < pt - 2 || rect.bottom > pt + text + 2) bad.push(t.textContent.slice(0, 24) + ' p' + (k + 1));
    }
  }
  return { scale: Math.round(scale * 100) / 100, pages: dom.querySelectorAll('.studiply-page-gap').length, lines, bad };
})()`);
const pageCount = () => b.evaluate(`${EDITOR}.view.dom.querySelectorAll('.studiply-page-gap').length`);
const zoomNow = () => b.evaluate(`(() => { const d = ${EDITOR}.view.dom; return Math.round(d.getBoundingClientRect().width / d.offsetWidth * 100) / 100; })()`);
const waitPages = async (want = (n) => n > 1) => {
  for (let i = 0; i < 40; i++) {
    if (want(await pageCount())) return;
    await b.sleep(250);
  }
  throw new Error(`pages: ${await pageCount()}`);
};
/** A toolbar button, opening the second row (⌄) when a narrow window put it there. */
const tool = async (label) => {
  if (!(await b.evaluate(`!!document.querySelector('[aria-label="${label}"]')`))) await b.clickSelector('[aria-label="More tools"]');
  await b.clickSelector(`[aria-label="${label}"]`);
};
const cmd = (key, code, keyCode) => b.chord({ code, key, meta: true, keyCode });

const user = await makeUser();
const { data: file } = await user.client.from('files').insert({ kind: 'document', title: 'Páginas' }).select().single();
await user.client.from('documents').insert({ file_id: file.id, tab: 'notes', content: { type: 'doc', content } });
b = await launch();
const openDoc = async () => {
  await b.nav(`${BASE}/doc/${file.id}`);
  for (let i = 0; i < 80 && !(await b.evaluate(`!!${EDITOR}?.view?.dom`)); i++) await b.sleep(250);
  await b.sleep(1500);
};

try {
  await b.signIn(BASE, user.email, user.password);
  await openDoc();

  await step('Pages by default: 10 pages, every line inside its page, no sideways scroll at Fit', async () => {
    await waitPages();
    const r = await linesInPages();
    expect(r.pages === 10, `pages: ${r.pages}`);
    expect(r.lines > 300 && r.bad.length === 0, `${r.bad.length} lines outside their page: ${r.bad.slice(0, 4).join('; ')}`);
    // No sideways scrolling at Fit (nothing wider than the column).
    const wide = await b.evaluate(`[...document.querySelectorAll('div')].filter((d) => d.contains(${EDITOR}.view.dom) && /auto|scroll/.test(getComputedStyle(d).overflowX) && d.scrollWidth > d.clientWidth + 1).length`);
    expect(wide === 0, 'the page scrolls sideways at Fit');
    await b.shot('pages-top');
  });

  await step('a long paragraph splits across a gap; the page break starts a page', async () => {
    const r = await b.evaluate(`(() => {
      const dom = ${EDITOR}.view.dom;
      const inline = [...dom.querySelectorAll('p > .studiply-page-gap')].length;
      const box = dom.getBoundingClientRect(), scale = box.width / dom.offsetWidth;
      const h = [...dom.querySelectorAll('h1')].find((e) => e.textContent.startsWith('3.'));
      const y = (h.getBoundingClientRect().top - box.top) / scale;
      const r = (y - 96) % (1123 + 24);
      return { inline, offset: Math.round(Math.min(r, 1123 + 24 - r)) };
    })()`);
    expect(r.inline >= 1, 'no paragraph split across a gap');
    expect(Math.abs(r.offset) <= 2, `the heading after the page break is ${r.offset} px from its page's text top`);
    await b.evaluate(`document.querySelector('p > .studiply-page-gap').scrollIntoView({ block: 'center' })`);
    await b.sleep(400);
    await b.shot('pages-split');
    const shown = await b.evaluate(`(() => { const t = [...document.querySelectorAll('div')].filter((d) => /^Page \\d+ of 10$/.test(d.textContent)).pop(); return t ? { text: t.textContent, opacity: getComputedStyle(t.parentElement).opacity * getComputedStyle(t).opacity } : null; })()`);
    expect(shown && shown.text !== 'Page 1 of 10' && shown.opacity > 0.5, `the label while scrolling: ${JSON.stringify(shown)}`);
  });

  await step('Pageless and back from the toolbar, remembered after a reload', async () => {
    await tool('Pages (switch to Pageless)');
    await waitPages((n) => n === 0);
    await openDoc();
    await b.sleep(800);
    expect((await pageCount()) === 0, 'Pageless not remembered');
    await tool('Pageless (switch to Pages)');
    await waitPages();
  });

  await step('⌘+ up to 150 %, remembered after a reload; ⌘0 is 100 %; the zoom menu has Fit', async () => {
    await b.clickSelector('.studiply-editor .ProseMirror');
    for (let i = 0; i < 8 && (await zoomNow()) < 1.5; i++) await cmd('=', 'Equal', 187);
    expect((await zoomNow()) === 1.5, `zoom ${await zoomNow()}`);
    expect(!(await b.evaluate('document.body.style.zoom')), "the browser's zoom changed");
    await openDoc();
    await waitPages();
    expect((await zoomNow()) === 1.5, `after a reload: ${await zoomNow()}`);
    const r = await linesInPages();
    expect(r.pages === 10 && r.bad.length === 0, `at 150 %: ${r.pages} pages, ${r.bad.length} lines outside`);
    await b.shot('pages-150');
    await b.clickSelector('.studiply-editor .ProseMirror');
    await cmd('0', 'Digit0', 48);
    expect((await zoomNow()) === 1, `⌘0 gave ${await zoomNow()}`);
    await tool('Zoom');
    await b.waitText('Fit (', { exact: false });
    await b.click('Fit (', { exact: false });
    await b.sleep(300);
    expect((await zoomNow()) < 1, `Fit gave ${await zoomNow()} in a column narrower than the page`);
  });

  await step('at 150 %: a real click lands on the letter under it, and typing goes there', async () => {
    await b.clickSelector('.studiply-editor .ProseMirror');
    for (let i = 0; i < 8 && (await zoomNow()) < 1.5; i++) await cmd('=', 'Equal', 187);
    const at = await b.evaluate(`(() => {
      const e = ${EDITOR}; let pos = null;
      e.state.doc.descendants((n, p) => { if (pos === null && n.isText && n.text.startsWith('5. Sección')) pos = p + 6; });
      [...document.querySelectorAll('h1')].find((h) => h.textContent.startsWith('5.')).scrollIntoView({ block: 'center' });
      return pos;
    })()`);
    await b.sleep(400);
    const pt = await b.evaluate(`(() => {
      const e = ${EDITOR}; const c = e.view.coordsAtPos(${at}), d = e.view.coordsAtPos(${at} + 1);
      return { x: (c.left + d.left) / 2 + 1, y: (c.top + c.bottom) / 2 };
    })()`);
    await b.clickAt(pt.x, pt.y);
    await b.sleep(250);
    const sel = await b.evaluate(`${EDITOR}.state.selection.from`);
    expect(Math.abs(sel - (at + 1)) <= 1, `clicked by the letter after ${at}, the cursor went to ${sel}`);
    await b.type('X');
    const text = await b.evaluate(`[...document.querySelectorAll('h1')].find((h) => h.textContent.startsWith('5.')).textContent`);
    expect(text.includes('X') && text.replace('X', '') === '5. Sección 5', `typed into: ${text}`);
    await b.press('Escape');
    await b.evaluate(`${EDITOR}.commands.undo()`);
    // Back to Fit, so the whole sheet is in the column for the next step.
    await tool('Zoom');
    await b.click('Fit (', { exact: false });
    await b.sleep(300);
  });

  await step('the table on a later page: its hover handles sit on the table', async () => {
    const cell = await b.evaluate(`(() => {
      const td = [...document.querySelectorAll('.studiply-editor td')].find((c) => c.textContent.startsWith('Fila 20, col 2'));
      td.scrollIntoView({ block: 'center' });
      return true;
    })()`);
    expect(cell, 'no table');
    await b.sleep(400);
    const r1 = await b.evaluate(`(() => { const r = [...document.querySelectorAll('.studiply-editor td')].find((c) => c.textContent.startsWith('Fila 20, col 2')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await b.mouseMove({ x: r1.x, y: r1.y - 40 }, r1);
    await b.sleep(400);
    const r = await b.evaluate(`(() => {
      const t = [...document.querySelectorAll('.studiply-editor table')].pop().getBoundingClientRect();
      const grips = [...document.querySelectorAll('.studiply-table-handles button')].map((g) => g.getBoundingClientRect()).filter((g) => g.width);
      return { grips: grips.length, near: grips.filter((g) => g.bottom > t.top - 40 && g.top < t.bottom + 40 && g.right > t.left - 40 && g.left < t.right + 40).length };
    })()`);
    expect(r.grips > 0 && r.near === r.grips, JSON.stringify(r));
    await b.shot('pages-table');
  });

  await step('iPhone (390 px, touch): Print layout fits the width, the label while scrolling, a pinch zooms', async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    try {
      const css = await b.evaluate(`[...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => t.includes('.studiply-editor .ProseMirror'))`);
      await b.nav(IPHONE);
      for (let i = 0; i < 80 && !(await b.evaluate(`!!${EDITOR}?.view?.dom`)); i++) await b.sleep(250);
      await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); document.body.classList.add('studiply-editor'); })()`);
      await b.evaluate(`${EDITOR}.commands.setContent(${JSON.stringify({ type: 'doc', content })})`);
      await b.evaluate(`${EDITOR}.chain().setPageFit(true).setPageView(true).setPageZoom(1).run()`);
      await waitPages();
      const fit = await b.evaluate(`(() => { const r = ${EDITOR}.view.dom.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; })()`);
      expect(fit.left >= 0 && fit.right <= fit.width + 1 && fit.right - fit.left > fit.width - 40, `the sheet: ${JSON.stringify(fit)}`);
      const r = await linesInPages();
      expect(r.pages === 10 && r.bad.length === 0, `on the iPhone: ${r.pages} pages, ${r.bad.length} lines outside: ${r.bad.slice(0, 3).join('; ')}`);
      // Whatever scrolls the editor there: the page, or a box around it.
      await b.evaluate(`(() => {
        let el = ${EDITOR}.view.dom.parentElement;
        while (el && el !== document.body && !(el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        if (el && el !== document.body) el.scrollTop = 3000; else window.scrollTo(0, 3000);
      })()`);
      await b.sleep(300);
      const label = await b.evaluate(`document.querySelector('.studiply-page-label')?.textContent ?? null`);
      expect(/^Page \d+ of 10$/.test(label ?? ''), `label: ${label}`);
      await b.shot('pages-iphone');
      // A pinch, as WebKit reports it (gesturestart / gesturechange with a scale).
      await b.evaluate(`(() => {
        const ev = (type, scale) => { const e = new Event(type, { cancelable: true }); e.scale = scale; document.dispatchEvent(e); };
        ev('gesturestart', 1); ev('gesturechange', 1.3); ev('gesturechange', 1.6); ev('gestureend', 1.6);
      })()`);
      await b.sleep(300);
      const z = await b.evaluate(`${EDITOR}.state.plugins.find((p) => p.key.startsWith('studiplyPageView')).getState(${EDITOR}.state).zoom`);
      expect(z === 1.6, `pinch gave zoom ${z}`);
      await b.shot('pages-iphone-pinched');
    } finally {
      await b.send('Emulation.clearDeviceMetricsOverride');
      await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
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
