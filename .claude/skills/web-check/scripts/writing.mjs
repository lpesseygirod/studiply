// writing.mjs — the writing tools (step 4.7), on the laptop (1280), in a
// narrower window (900) and at a phone's width (390):
//   - ⌘F opens the find bar under the toolbar: "1 of 5" as typed, all the
//     matches marked and the current one ringed; Enter / ⇧Enter and the
//     arrows go round; Aa (Match case) and Whole words narrow the count;
//     words selected before ⌘F are the search; Esc closes it, the marks go
//     and the cursor is back in the text;
//   - ⌘⇧H opens it with Replace: Replace changes one match and goes on,
//     Replace all changes the rest and is saved; one ⌘Z brings back all
//     that Replace all changed (and only that), a second ⌘Z the single one;
//   - Esc closes the bar wherever its focus is (after Replace all, on that
//     button); ⌘F or the menu with the bar open puts the focus back in the
//     search box;
//   - the word count in the status line under the page, at the right: the
//     document's words and characters, following as I type, "3 of N words ·
//     17 of M characters" for a selection; a click gives the details;
//   - the status line ("Page 2 of 2", the word count) is outside the page
//     and covers no line of text: at 1280, 900 and 390, light and dark, and
//     in Pageless at 1280 (the text scrolled half-way, words selected);
//   - at 1280 with the assistant open, beside the outline the page would go
//     under 50 %: the outline lies over it, and the page never scrolls
//     sideways;
//   - ⌘⌥A (at 1440) shows the outline beside the page (left of it): the title and
//     headings by level; a click jumps to a heading (the cursor in it, on
//     screen); the section the cursor is in is marked and follows the
//     cursor; a heading I write appears in it;
//   - the Document menu's Tools: Find and replace (with the Replace line),
//     Outline, Word count;
//   - at 900 the outline lies over the page and closes after a jump;
//   - at 390 the find bar wraps inside the window, the outline fits, the
//     page never scrolls sideways;
//   - a sheet tab has none of them: no find bar, no word count line, no
//     outline; its menu is Version history only;
//   - screenshots writing-find-1280, writing-replace-1280,
//     writing-count-1280, writing-outline-1440, writing-outline-1280, writing-menu-1280,
//     writing-1280-dark, writing-outline-900, writing-find-390,
//     writing-outline-390, writing-status-1280-light / -dark,
//     writing-status-900-light / -dark, writing-status-390-light / -dark,
//     writing-status-1280-pageless, writing-sheet-tab-1280.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node writing.mjs
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps (several: separated by |).
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
    await b.shot(`fail-writing-${results.length}`).catch(() => {});
    // A bar, menu or dialog left open must not spoil the next step.
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

// A study document: the title, three levels of headings, "tasa" five times
// (once as TASA, once inside "tasación"), "VAN" three times (and "van" once),
// and enough text that the last heading is off screen.
const F = 'Los flujos de caja futuros se descuentan a hoy para compararlos con la inversión inicial del proyecto.';
const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const h = (level, t) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: t }] });
const filler = (n) => Array.from({ length: n }, () => p(F));
const content = [
  { type: 'title', content: [{ type: 'text', text: 'Finanzas' }] },
  h(1, 'Tema 1'),
  p('La tasa de interés sube cuando la TASA de inflación sube.'),
  p('El valor actual neto (VAN) suma los flujos descontados.'),
  ...filler(6),
  h(2, 'El VAN'),
  p('Una tasación no es una tasa. El VAN es positivo; el van de mudanzas no.'),
  ...filler(6),
  h(3, 'Ejemplo'),
  ...filler(6),
  h(1, 'Tema 2'),
  p('Otra tasa más.'),
  ...filler(8),
];
const HEADINGS = ['Finanzas', 'Tema 1', 'El VAN', 'Ejemplo', 'Tema 2'];

const user = await makeUser();
const { data: file } = await user.client.from('files').insert({ kind: 'document', title: 'Finanzas' }).select().single();
await user.client.from('documents').insert({ file_id: file.id, tab: 'notes', content: { type: 'doc', content } });
// A spreadsheet tab beside it (as "+ Add tab" → Spreadsheet makes it).
const sheetTab = `t-${randomUUID()}`;
{
  const { error } = await user.client.from('documents').insert({ file_id: file.id, tab: sheetTab, kind: 'sheet', title: 'Sheet 1', content: { type: 'doc', content: [] } });
  if (error) throw new Error(`the sheet tab: ${error.message}`);
}
b = await launch();

const scheme = (v) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });
const cmd = (key, code, keyCode, { shift = false, alt = false } = {}) => b.chord({ key, code, keyCode, meta: true, shift, alt });
const openDoc = async (tab) => {
  await b.nav(`${BASE}/doc/${file.id}${tab ? `?tab=${tab}` : ''}`);
  if (tab) await waitFor(() => b.evaluate(`!!document.querySelector('[data-sheet="grid"] [data-cell="A1"]')`), 'the grid', 30000);
  else await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom`), 'the editor', 30000);
  await b.sleep(1500);
};
/** The document position where `needle` starts (in the first text that has it). */
const posOf = (needle) =>
  b.evaluate(`(() => { let at = null; ${EDITOR}.state.doc.descendants((n, pos) => { if (at === null && n.isText && n.text.includes(${JSON.stringify(needle)})) at = pos + n.text.indexOf(${JSON.stringify(needle)}); }); return at; })()`);
/** The cursor (or a selection) there, scrolled to, as a click in the text would. */
const select = (from, to = from) => b.evaluate(`${EDITOR}.chain().focus().setTextSelection({ from: ${from}, to: ${to} }).scrollIntoView().run()`);
const selectedText = () => b.evaluate(`(() => { const { from, to } = ${EDITOR}.state.selection; return ${EDITOR}.state.doc.textBetween(from, to, ' '); })()`);
const docText = () => b.evaluate(`${EDITOR}.getText()`);
const savedText = async () => JSON.stringify((await admin.from('documents').select('content').eq('file_id', file.id).eq('tab', 'notes').single()).data.content);

const bar = () => b.evaluate(`!!document.querySelector('[data-find="bar"]')`);
const count = () => b.evaluate(`document.querySelector('[data-find="count"]')?.innerText.trim() ?? null`);
const waitCount = (want) => waitFor(async () => (await count()) === want, async () => `the count "${want}" (it says "${await count()}")`, 5000);
const findInput = 'input[aria-label="Find in document"]';
const replaceInput = 'input[aria-label="Replace with"]';
const marks = () => b.evaluate(`({ all: document.querySelectorAll('.studiply-find').length, current: document.querySelectorAll('.studiply-find-current').length })`);
const toggleOn = (label) => b.evaluate(`document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-checked') === 'true'`);

const countLine = () => b.evaluate(`document.querySelector('[data-word-count="line"]')?.innerText.trim() ?? null`);
const num = (s) => Number(s.replace(/,/g, ''));
/** "1,234 words · 6,789 characters", or "3 of 1,234 words · 17 of 6,789 characters". */
const parseLine = (line) => {
  const m = /^(?:([\d,]+) of )?([\d,]+) words? · (?:([\d,]+) of )?([\d,]+) characters?$/.exec(line ?? '');
  return m && { selWords: m[1] ? num(m[1]) : null, words: num(m[2]), selChars: m[3] ? num(m[3]) : null, chars: num(m[4]) };
};

const panel = () =>
  b.evaluate(`(() => {
    const e = document.querySelector('[data-outline="panel"]');
    if (!e) return null;
    const r = e.getBoundingClientRect(), page = ${EDITOR}.view.dom.getBoundingClientRect();
    const items = [...e.querySelectorAll('[data-heading]')];
    return {
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      position: getComputedStyle(e).position,
      pageLeft: page.left,
      headings: items.map((i) => i.innerText.trim()),
      current: items.findIndex((i) => i.dataset.current === '1'),
    };
  })()`);
const waitCurrent = (want) => waitFor(async () => (await panel())?.current === want, async () => `outline current ${want} (it is ${(await panel())?.current})`, 5000);
/** The heading's line in the text: on screen? */
const headingOnScreen = (text) =>
  b.evaluate(`(() => {
    const e = [...${EDITOR}.view.dom.querySelectorAll('h1, h2, h3, h4')].find((x) => x.textContent.trim() === ${JSON.stringify(text)});
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  })()`);
const cursorIn = () => b.evaluate(`${EDITOR}.state.selection.$from.parent.textContent`);
const openMenu = async () => {
  await b.clickSelector('[aria-label="Document menu"]');
  await b.waitText('Version history', { exact: true, timeout: 5000 });
};
/** The pane the page scrolls in has nothing to scroll sideways. */
const pageFits = () =>
  b.evaluate(`(() => {
    let s = ${EDITOR}.view.dom.parentElement;
    while (s && !['auto', 'scroll'].includes(getComputedStyle(s).overflowY)) s = s.parentElement;
    return s.scrollWidth <= s.clientWidth + 1;
  })()`);
const noSideScroll = () => b.evaluate(`document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1`);
/**
 * The status line ("Page 2 of 2", the word count) against the page: its
 * pills against every line of text the student can see (each line's box cut
 * to the scrolling area), against the page (the white card in Pageless, the
 * pane the pages scroll in, in Pages) and the window.
 */
const statusCheck = () =>
  b.evaluate(`(() => {
    const status = document.querySelector('[data-status="line"]');
    if (!status) return { error: 'no status line' };
    const pills = [...status.children].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const dom = ${EDITOR}.view.dom;
    let scroller = dom.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const view = scroller.getBoundingClientRect(), page = scroller.parentElement.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
    const range = document.createRange(), covered = [];
    let lines = 0;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      range.selectNodeContents(t);
      for (const q of range.getClientRects()) {
        const v = { left: Math.max(q.left, view.left), right: Math.min(q.right, view.right), top: Math.max(q.top, view.top), bottom: Math.min(q.bottom, view.bottom) };
        if (v.left >= v.right || v.top >= v.bottom) continue;
        lines++;
        if (pills.some((p) => hit(p, v))) covered.push(t.textContent.slice(0, 30));
      }
    }
    return {
      text: status.innerText.replace(/\\s+/g, ' ').trim(),
      pills: pills.length,
      lines,
      covered,
      onPage: pills.some((p) => hit(p, page)),
      inWindow: pills.every((p) => p.left >= -0.5 && p.right <= innerWidth + 0.5 && p.top >= 0 && p.bottom <= innerHeight + 0.5),
    };
  })()`);
/** The text scrolled half-way (so lines run under the page's bottom edge) and words selected (the long line). */
const scrollHalfAndSelect = async () => {
  await b.evaluate(`(() => {
    let s = ${EDITOR}.view.dom.parentElement;
    while (s && !['auto', 'scroll'].includes(getComputedStyle(s).overflowY)) s = s.parentElement;
    s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
  })()`);
  await b.sleep(400);
  const at = await posOf('valor actual neto');
  // Select without scrolling back to the words.
  await b.evaluate(`${EDITOR}.commands.setTextSelection({ from: ${at}, to: ${at + 'valor actual neto'.length} })`);
  await b.sleep(400);
};
const expectStatusClear = async (where, { pages = true } = {}) => {
  const s = await statusCheck();
  expect(!s.error, `${where}: ${s.error}`);
  expect(s.lines > 5, `${where}: only ${s.lines} lines of text on screen`);
  expect(s.covered.length === 0, `${where}: the status line covers ${JSON.stringify(s.covered)}`);
  expect(!s.onPage, `${where}: the status line is on the page`);
  expect(s.inWindow, `${where}: the status line goes past the window`);
  expect(/^(?:Page \d+ of \d+ )?3 of [\d,]+ words · 17 of [\d,]+ characters$/.test(s.text), `${where}: the line says "${s.text}"`);
  expect(!pages || /^Page \d+ of \d+ /.test(s.text), `${where}: no "Page n of m" in Pages: "${s.text}"`);
};

try {
  await b.signIn(BASE, user.email, user.password);

  await step('1280: ⌘F opens the find bar; "1 of 5" as typed, every match marked, the current one ringed and selected', async () => {
    await openDoc(null);
    await select(1);
    await cmd('f', 'KeyF', 70);
    await waitFor(bar, 'the find bar');
    expect(await b.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Find in document'`), 'the search box has no focus');
    await b.type('tasa');
    await waitCount('1 of 5');
    const m = await marks();
    expect(m.all === 5 && m.current === 1, `marks: ${JSON.stringify(m)}`);
    expect((await selectedText()) === 'tasa', `selected: "${await selectedText()}"`);
    await b.shot('writing-find-1280');
  });

  await step('1280: Enter, ⇧Enter and the arrows go round the matches', async () => {
    await b.press('Enter');
    await waitCount('2 of 5');
    expect((await selectedText()) === 'TASA', `selected: "${await selectedText()}"`);
    await b.chord({ key: 'Enter', code: 'Enter', shift: true, keyCode: 13 });
    await waitCount('1 of 5');
    await b.clickSelector('[aria-label="Previous match"]');
    await waitCount('5 of 5');
    await b.clickSelector('[aria-label="Next match"]');
    await waitCount('1 of 5');
    // The match is in view.
    expect(await b.evaluate(`(() => { const r = document.querySelector('.studiply-find-current')?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= window.innerHeight; })()`), 'the current match is off screen');
  });

  await step('1280: Match case and Whole words narrow the count (TASA, tasación left out)', async () => {
    await b.clickSelector('[aria-label="Match case"]');
    await waitCount('1 of 4');
    expect(await toggleOn('Match case'), 'Match case is not shown on');
    await b.clickSelector('[aria-label="Whole words"]');
    await waitCount('1 of 3');
    await b.clickSelector('[aria-label="Match case"]');
    await waitCount('1 of 4');
    await b.clickSelector('[aria-label="Whole words"]');
    await waitCount('1 of 5');
    await b.fill(findInput, 'nada de esto');
    await waitCount('No results');
    expect((await marks()).all === 0, 'marks left with no results');
  });

  await step('1280: Esc closes the bar: the marks go, the cursor is back in the text', async () => {
    await b.press('Escape');
    await waitFor(async () => !(await bar()), 'the bar closed');
    expect((await marks()).all === 0, 'marks left after closing');
    expect(await b.evaluate(`${EDITOR}.view.hasFocus()`), 'the text has no focus');
  });

  await step('1280: words selected before ⌘F are the search', async () => {
    const at = await posOf('valor actual');
    await select(at, at + 'valor actual'.length);
    await cmd('f', 'KeyF', 70);
    await waitFor(bar, 'the find bar');
    expect((await b.evaluate(`document.querySelector('${findInput}').value`)) === 'valor actual', 'the search is not the selected words');
    await waitCount('1 of 1');
    await b.press('Escape');
    await waitFor(async () => !(await bar()), 'the bar closed');
  });

  // The text before Replace, to compare after the two ⌘Z.
  let before = null;
  await step('1280: ⌘⇧H opens it with Replace; Replace changes one match and goes on', async () => {
    before = await docText();
    await select(1);
    await cmd('H', 'KeyH', 72, { shift: true });
    await waitFor(bar, 'the find bar');
    await waitFor(() => b.evaluate(`!!document.querySelector('${replaceInput}')`), 'the replace line');
    expect(await toggleOn('Replace'), 'Replace is not shown on');
    await b.fill(findInput, 'VAN');
    await waitCount('1 of 4');
    await b.clickSelector('[aria-label="Match case"]');
    await waitCount('1 of 3');
    await b.fill(replaceInput, 'VPN');
    await b.clickSelector('[aria-label="Replace this match"]');
    await waitCount('1 of 2');
    const text = await docText();
    expect(text.includes('(VPN)') && text.includes('El VAN es positivo'), 'Replace changed the wrong text');
    expect((await selectedText()) === 'VAN', `the next match is not selected: "${await selectedText()}"`);
    await b.shot('writing-replace-1280');
  });

  await step('1280: Replace all changes the rest and is saved; one ⌘Z brings it all back, a second the single Replace', async () => {
    await b.sleep(700);
    await b.clickSelector('[aria-label="Replace all"]');
    await waitCount('No results');
    const text = await docText();
    expect(!/\bVAN\b/.test(text), 'a VAN is left');
    expect(text.includes('el van de mudanzas'), 'Match case was not kept: "van" changed');
    await waitFor(async () => { const s = await savedText(); return s.includes('El VPN es positivo') && !s.includes('"El VAN"'); }, 'Replace all saved', 15000);
    // No match left: Replace all turned off, and the focus went to the search box (not lost on the page).
    expect(await b.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Find in document'`), `the focus is on ${await b.evaluate(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`)}, not the search box`);
    await b.press('Escape');
    await waitFor(async () => !(await bar()), 'the bar closed');
    await cmd('z', 'KeyZ', 90);
    const once = await docText();
    expect(once.includes('El VAN es positivo') && once.includes('\nEl VAN\n') && once.includes('(VPN)'), 'one ⌘Z did not bring back exactly what Replace all changed');
    await cmd('z', 'KeyZ', 90);
    expect((await docText()) === before, 'two ⌘Z: the text is not as before');
    await waitFor(async () => (await savedText()).includes('(VAN)'), 'the undone text saved', 15000);
  });

  await step('1280: the word count line follows the typing and shows a selection', async () => {
    // The undone Replace leaves its words selected (as Undo does): first a plain cursor.
    await select(1);
    await b.sleep(300);
    const start = parseLine(await countLine());
    expect(start && start.selWords === null && start.words > 100, `the line: "${await countLine()}"`);
    const end = await b.evaluate(`${EDITOR}.state.doc.content.size - 1`);
    await select(end);
    await b.type(' dos palabras');
    await waitFor(async () => parseLine(await countLine())?.words === start.words + 2, async () => `+2 words (the line: "${await countLine()}")`, 5000);
    expect(parseLine(await countLine()).chars === start.chars + 13, `characters: "${await countLine()}"`);
    const at = await posOf('valor actual neto');
    await select(at, at + 'valor actual neto'.length);
    await waitFor(async () => { const l = parseLine(await countLine()); return l?.selWords === 3 && l.selChars === 17; }, async () => `"3 of … words · 17 of … characters" (the line: "${await countLine()}")`, 5000);
    // The line sits at the bottom right of the page, inside the window.
    const r = await b.evaluate(`(() => { const e = document.querySelector('[data-word-count="line"]').getBoundingClientRect(); return { right: e.right, bottom: e.bottom, w: innerWidth, h: innerHeight }; })()`);
    expect(r.right <= r.w && r.bottom <= r.h && r.right > r.w / 2, `the line is not at the bottom right: ${JSON.stringify(r)}`);
  });

  await step('1280: a click on the line gives the details (Word count)', async () => {
    await b.clickSelector('[data-word-count="line"]');
    await b.waitText('Word count', { exact: true, timeout: 5000 });
    for (const t of ['Words: ', 'Characters: ', 'Characters without spaces: ', 'Selected: 3 words, 17 characters']) expect(await b.hasText(t), `no "${t}"`);
    await b.shot('writing-count-1280');
    await b.click('OK', { exact: true });
    await b.sleep(400);
    expect(!(await b.hasText('Characters without spaces: ')), 'the details did not close');
  });

  await step('1440: ⌘⌥A shows the outline left of the page: the title and the headings in order', async () => {
    // Wide enough for the page beside the outline and the assistant (at 1280 the page would go under 50 %: see the 1280 outline step after these).
    await b.resize(1440, 900);
    await select(1);
    await cmd('å', 'KeyA', 65, { alt: true });
    const o = await waitFor(panel, 'the outline');
    expect(JSON.stringify(o.headings) === JSON.stringify(HEADINGS), `headings: ${JSON.stringify(o.headings)}`);
    expect(o.position !== 'absolute' && o.right <= o.pageLeft, `not beside the page: ${JSON.stringify(o)}`);
    expect(await pageFits(), 'the page scrolls sideways beside the outline');
    expect(o.current === 0, `current: ${o.current}`);
    // Indented by level.
    const lefts = await b.evaluate(`[...document.querySelectorAll('[data-outline="panel"] [data-heading]')].map((e) => Math.round((e.firstElementChild ?? e).getBoundingClientRect().left))`);
    expect(lefts[2] > lefts[1] && lefts[3] > lefts[2] && lefts[4] === lefts[1], `indents: ${lefts}`);
  });

  await step('1440: a click jumps to a heading (cursor in it, on screen); the mark follows the cursor', async () => {
    expect(!(await headingOnScreen('Tema 2')), 'Tema 2 is on screen already: the jump would prove nothing');
    await b.clickSelector('[data-heading="4"]');
    await waitFor(async () => (await cursorIn()) === 'Tema 2', async () => `the cursor in Tema 2 (it is in "${await cursorIn()}")`, 5000);
    await waitFor(() => headingOnScreen('Tema 2'), 'Tema 2 on screen', 5000);
    await waitCurrent(4);
    // The cursor moved into the Ejemplo section: the mark goes there.
    const at = await posOf('Ejemplo');
    await select(at + 'Ejemplo'.length + 3);
    await waitCurrent(3);
  });

  await step('1440: a heading I write appears in the outline and is marked', async () => {
    const end = await b.evaluate(`${EDITOR}.state.doc.content.size - 1`);
    await select(end);
    await b.press('Enter');
    await cmd('™', 'Digit2', 50, { alt: true });
    await b.type('Conclusión');
    await waitFor(async () => (await panel())?.headings.at(-1) === 'Conclusión', async () => `"Conclusión" in the outline (${JSON.stringify((await panel())?.headings)})`, 5000);
    await waitCurrent(5);
    await b.shot('writing-outline-1440');
  });

  await step('1280: the outline over the page when beside it the page would go under 50 %; the page never scrolls sideways', async () => {
    await b.resize(1280, 900);
    const o = await waitFor(panel, 'the outline (left open)');
    expect(await pageFits(), 'the page scrolls sideways with the outline open');
    // Whichever place: it is inside the window and the page is still there beside or under it.
    expect(o.left >= 0 && o.right <= 1280, `the outline: ${JSON.stringify(o)}`);
    await b.shot('writing-outline-1280');
  });

  await step('1280: the Document menu has Tools: Find and replace (with Replace), Outline, Word count', async () => {
    await openMenu();
    for (const t of ['TOOLS', 'Find and replace', 'Outline', 'Word count']) expect(await b.hasText(t, true), `no "${t}" in the menu`);
    await b.shot('writing-menu-1280');
    await b.click('Outline', { exact: true });
    await waitFor(async () => !(await panel()), 'Outline closed the outline');
    await openMenu();
    await b.click('Outline', { exact: true });
    await waitFor(panel, 'Outline opened the outline');
    await openMenu();
    await b.click('Find and replace', { exact: true });
    await waitFor(() => b.evaluate(`!!document.querySelector('${replaceInput}')`), 'the bar with its Replace line');
    // The search box has the focus (not the menu button the menu hands it back to).
    await waitFor(() => b.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Find in document'`), async () => `the focus in the search box (it is on ${await b.evaluate(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`)})`, 3000);
    // ⌘F with the bar open, from the text: back to the search box.
    await b.evaluate(`${EDITOR}.commands.focus()`);
    await cmd('f', 'KeyF', 70);
    await waitFor(() => b.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Find in document'`), 'the focus back in the search box after ⌘F', 3000);
    await b.press('Escape');
    await waitFor(async () => !(await bar()), 'the bar closed');
    await openMenu();
    await b.click('Word count', { exact: true });
    await b.waitText('Characters without spaces: ', { timeout: 5000 });
    await b.click('OK', { exact: true });
    await b.sleep(400);
  });

  await step('screenshot at 1280 in dark: the find bar, the marks, the outline, the line', async () => {
    await select(1);
    await cmd('f', 'KeyF', 70);
    await waitFor(bar, 'the find bar');
    await b.fill(findInput, 'tasa');
    await waitCount('1 of 5');
    await scheme('dark');
    await b.sleep(800);
    await b.shot('writing-1280-dark');
    await scheme('light');
    await b.press('Escape');
    await waitFor(async () => !(await bar()), 'the bar closed');
  });

  await step('900: the outline lies over the page and closes after a jump', async () => {
    await b.resize(900, 900);
    const o = await waitFor(panel, 'the outline (left open)');
    expect(o.position === 'absolute', `position: ${o.position}`);
    expect(await noSideScroll(), 'the page scrolls sideways');
    await b.shot('writing-outline-900');
    await b.clickSelector('[data-heading="1"]');
    await waitFor(async () => (await cursorIn()) === 'Tema 1', async () => `the cursor in Tema 1 (it is in "${await cursorIn()}")`, 5000);
    await waitFor(async () => !(await panel()), 'the outline closed after the jump', 5000);
    // ⌘⌥A opens it again; its ✕ closes it.
    await cmd('å', 'KeyA', 65, { alt: true });
    await waitFor(panel, 'the outline');
    await b.clickSelector('[aria-label="Close outline"]');
    await waitFor(async () => !(await panel()), 'the outline closed');
  });

  await step('390: the find bar wraps inside the window; the outline fits; no sideways scroll', async () => {
    await b.resize(390, 844);
    await b.sleep(600);
    await openMenu();
    await b.click('Find and replace', { exact: true });
    await waitFor(bar, 'the find bar');
    await b.fill(findInput, 'tasa');
    await waitCount('1 of 5');
    const r = await b.evaluate(`(() => {
      const e = document.querySelector('[data-find="bar"]'), r = e.getBoundingClientRect();
      const out = [...e.querySelectorAll('*')].filter((x) => { const q = x.getBoundingClientRect(); return q.width && (q.left < -0.5 || q.right > innerWidth + 0.5); }).length;
      return { left: r.left, right: r.right, out };
    })()`);
    expect(r.left >= 0 && r.right <= 390 && r.out === 0, `the bar goes past the window: ${JSON.stringify(r)}`);
    expect(await b.evaluate(`!!document.querySelector('[aria-label="Replace all"]')`), 'no Replace all');
    expect(await noSideScroll(), 'the page scrolls sideways');
    await b.shot('writing-find-390');
    await b.press('Escape');
    await waitFor(async () => !(await bar()), 'the bar closed');
    await openMenu();
    await b.click('Outline', { exact: true });
    const o = await waitFor(panel, 'the outline');
    expect(o.left >= 0 && o.right <= 390, `the outline goes past the window: ${JSON.stringify(o)}`);
    expect(await noSideScroll(), 'the page scrolls sideways');
    await b.shot('writing-outline-390');
    await b.clickSelector('[data-heading="2"]');
    await waitFor(async () => (await cursorIn()) === 'El VAN', async () => `the cursor in El VAN (it is in "${await cursorIn()}")`, 5000);
    await waitFor(async () => !(await panel()), 'the outline closed after the jump', 5000);
    await b.resize(1280, 900);
  });

  await step('the status line sits under the page and covers no text: 1280, 900, 390, light and dark; Pageless at 1280', async () => {
    try {
      for (const [w, h] of [[1280, 900], [900, 900], [390, 844]]) {
        await b.resize(w, h);
        await b.sleep(600);
        await scrollHalfAndSelect();
        for (const mode of ['light', 'dark']) {
          await scheme(mode);
          await b.sleep(500);
          await expectStatusClear(`${w} ${mode}`);
          await b.shot(`writing-status-${w}-${mode}`);
        }
        await scheme('light');
      }
      await b.resize(1280, 900);
      await b.sleep(600);
      if (!(await b.evaluate(`!!document.querySelector('[aria-label="View"]')`))) await b.clickSelector('[aria-label="More tools"]');
      await b.clickSelector('[aria-label="View"]');
      await b.click('Pageless', { exact: true });
      await waitFor(() => b.evaluate(`${EDITOR}.view.dom.querySelectorAll('.studiply-page-gap').length === 0`), 'Pageless');
      await b.sleep(600);
      await scrollHalfAndSelect();
      await expectStatusClear('1280 Pageless', { pages: false });
      await b.shot('writing-status-1280-pageless');
    } finally {
      await scheme('light');
      await b.resize(1280, 900);
    }
  });

  await step('1280: a sheet tab has none of the tools: no bar, no line, no outline; its menu is Version history only', async () => {
    await b.resize(1280, 900);
    await openDoc(sheetTab);
    expect(!(await b.evaluate(`!!document.querySelector('[data-word-count="line"]')`)), 'a word count line on the sheet tab');
    expect(!(await b.evaluate(`!!document.querySelector('[data-outline="panel"]')`)), 'an outline on the sheet tab');
    await b.clickSelector('[data-cell="B2"]');
    await cmd('f', 'KeyF', 70);
    await b.sleep(500);
    expect(!(await bar()), 'the find bar on the sheet tab');
    await openMenu();
    for (const t of ['Find and replace', 'Outline', 'Word count']) expect(!(await b.hasText(t, true)), `"${t}" in the sheet tab's menu`);
    await b.shot('writing-sheet-tab-1280');
    await b.press('Escape');
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
