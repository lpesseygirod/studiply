// sheets.mjs — the spreadsheet tab (step 4.7e), checkpoint 1, on the laptop
// (1280) and at a phone's width (390, the grid only; the iPhone's formula bar
// above the keyboard is checkpoint 3):
//   - "+ Add tab" → Spreadsheet adds "Sheet 1" (kind sheet, no cells) with
//     columns A–Z and rows from 1, only the rows on screen drawn;
//   - a loan table typed in the cells and in the formula bar: PMT, NPV and
//     IRR give Excel's results; the cells are saved as blocks with what
//     was typed;
//   - errors as in Excel (#DIV/0!, #NAME?, a circle → #REF!) and the line
//     under the formula bar;
//   - keys: arrows, Tab, Enter, Shift+arrow, a double-click edits what is
//     there, Esc drops what was typed, Delete empties;
//   - bold with ⌘B and with B on a dragged range, saved, kept after a reload;
//   - another device's cell appears while this one types in another: both kept;
//   - leaving keeps a version; version history shows the grid; Restore;
//   - numbers are rounded to fit their cell (Excel's General), never cut
//     with "…", also bold and at 390;
//   - checkpoint 2a: "=" then clicks add references (a second click
//     replaces), a drag adds a range; autocomplete (Tab / ↓ Enter take a
//     function, Esc closes) and the help line with the current argument in
//     bold; the fill handle down and across, references moving, $ fixed;
//   - checkpoint 2b: Undo / Redo (⌘Z / ⌘⇧Z and the toolbar), one step per
//     action (a typed cell, a fill, bold, an insert or delete, a paste);
//     insert / delete rows and columns from a right-click on the row number
//     or column letter, references moving as in Excel ($ too, #REF! for a
//     deleted cell); copy / cut / paste (the browser's events, as ⌘C / ⌘X /
//     ⌘V send them): references move like the fill, values go out as
//     tab-separated text, tab-separated text comes in;
//   - at 390 the grid scrolls inside the tab, never the page sideways;
//   - checkpoint 3, at 390 with touch emulated (the iPhone layout in a
//     browser): the formula bar under the grid; a tap selects, a second
//     types in the bar; taps add references while the bar keeps its focus,
//     and the dot on the reference drags it into a range; the function list
//     just above the bar, a tap takes one, the help line; the fill handle by
//     finger; Undo in the bar; long-press on a row number (Insert / Delete)
//     and on cells (Copy, then Paste elsewhere, references moved);
//   - screenshots sheets-1280-light / -dark, sheets-390-light / -dark,
//     sheets-pointing / -autocomplete / -help / -fill-1280,
//     sheets-insert-row / -lines-menu / -copy-1280,
//     sheets-iphone-pointing / -hints / -fill / -lines-menu / -cell-menu.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps (several: separated by |).
import { launch } from './cdp.mjs';
import { admin, makeUser, dropUser } from './testuser.mjs';

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
    await b.shot(`fail-sheets-${results.length}`).catch(() => {});
    // A cell left in editing or a dialog left open must not spoil the next step.
    await b.press('Escape').catch(() => {});
    await b.press('Escape').catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
/** A number equal to Excel's result as Excel shows it, rounded to `places` decimals (898.0893756 is Excel's 898.09). */
const asExcel = (n, excel, places = 2) => n !== null && n !== '' && Number.isFinite(Number(n)) && Math.abs(Number(n) - excel) < 0.5 * 10 ** -places;
const SHEET = 'window.studiplySheet';

async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${what}`);
    await b.sleep(250);
  }
}

const user = await makeUser();
const { data: plain } = await user.client.from('files').insert({ kind: 'document', title: 'Préstamo' }).select().single();
await user.client.from('documents').insert({ file_id: plain.id, tab: 'notes', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notas del préstamo' }] }] } });
b = await launch();
let sheetTab = null;

const openTab = () => b.evaluate(`[...document.querySelectorAll('[role="tab"]')].find((e) => e.getAttribute('aria-selected') === 'true')?.getAttribute('aria-label') ?? null`);
const openDoc = async (tab) => {
  await b.nav(`${BASE}/doc/${plain.id}${tab ? `?tab=${tab}` : ''}`);
  if (tab) await waitFor(() => b.evaluate(`!!document.querySelector('[data-sheet="grid"] [data-cell="A1"]') && !!${SHEET}`), 'the grid', 30000);
  else await waitFor(() => b.evaluate(`!!window.studiplyEditor?.view?.dom`), 'the editor', 30000);
  await b.sleep(2000);
};
/**
 * A cell on screen: its centre, its text and its weight (`last`: the version
 * preview's, drawn after the tab's). Scrolled into view first, as a student
 * scrolls to a cell before clicking it (the grid may be scrolled sideways,
 * e.g. after the check looked for column Z).
 */
const cellBox = (address, last = false) =>
  b.evaluate(`(() => {
    const all = [...document.querySelectorAll('[data-cell="${address}"]')];
    const e = ${last ? 'all[all.length - 1]' : 'all[0]'};
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const text = e.firstElementChild;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.right, bottom: r.bottom, text: e.innerText.trim(), weight: text ? getComputedStyle(text).fontWeight : null };
  })()`);
/**
 * Number cells (right-aligned) whose text is cut: an ellipsis, or text wider
 * than the cell. A cut number reads as another value (898.08… for 898.0894);
 * General rounds to what fits instead.
 */
const cutNumbers = () =>
  b.evaluate(`[...document.querySelectorAll('[data-sheet="grid"] [data-cell]')]
    .map((cell) => [cell.dataset.cell, cell.firstElementChild])
    .filter(([, t]) => t && t.tagName !== 'INPUT' && t.innerText.trim() !== '' && getComputedStyle(t).textAlign === 'right')
    .filter(([, t]) => t.innerText.includes('…') || t.scrollWidth > t.clientWidth + 0.5)
    .map(([a, t]) => a + ' ' + t.innerText)`);
/** The last cell of a row that is fully visible in the grid (the right edge of what is on screen). */
const lastVisibleCell = (row) =>
  b.evaluate(`(() => {
    const g = document.querySelector('[data-sheet="grid"]').getBoundingClientRect();
    const cells = [...document.querySelectorAll('[data-sheet="grid"] [data-cell]')].filter((e) => e.dataset.cell.replace(/^[A-Z]+/, '') === '${row}');
    const shown = cells.filter((e) => { const r = e.getBoundingClientRect(); return r.left >= g.left - 0.5 && r.right <= g.right + 0.5; });
    return shown.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).at(-1)?.dataset.cell ?? null;
  })()`);
/**
 * While the function list is open: nothing around the grid is scrolled
 * sideways (the card above all), the document title is whole on the card,
 * and the list is inside the grid's visible area.
 */
const listStaysInside = () =>
  b.evaluate(`(() => {
    const grid = document.querySelector('[data-sheet="grid"]');
    const scrolled = [];
    for (let e = grid.parentElement; e && e !== document.documentElement; e = e.parentElement) if (e.scrollLeft !== 0) scrolled.push(e.tagName + ' ' + e.scrollLeft);
    if (document.scrollingElement.scrollLeft !== 0) scrolled.push('page ' + document.scrollingElement.scrollLeft);
    let card = grid;
    while (card && !(getComputedStyle(card).overflow === 'hidden' && parseFloat(getComputedStyle(card).borderTopLeftRadius) > 0)) card = card.parentElement;
    const c = card.getBoundingClientRect();
    const title = [...card.querySelectorAll('*')].find((e) => e.children.length === 0 && ((e.value ?? e.innerText) || '').trim() === 'Préstamo');
    const t = title?.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const l = document.querySelector('[data-hints="list"]')?.getBoundingClientRect();
    return {
      scrolled,
      titleWhole: !!t && t.left >= c.left - 0.5 && t.right <= c.right + 0.5,
      list: !!l,
      listInside: !!l && l.left >= g.left - 0.5 && l.right <= g.right + 0.5 && l.top >= g.top - 0.5 && l.bottom <= g.bottom + 0.5,
    };
  })()`);
const expectListInside = async (where) => {
  const r = await listStaysInside();
  expect(r.list, `${where}: no function list`);
  expect(r.scrolled.length === 0, `${where}: scrolled sideways: ${r.scrolled}`);
  expect(r.titleWhole, `${where}: the title isn't whole on the card`);
  expect(r.listInside, `${where}: the list goes past the grid`);
};
/** A row number ("2") or column letter ("B") on screen: its centre. */
const headBox = (attr, label) =>
  b.evaluate(`(() => {
    const e = document.querySelector('[data-${attr}="${label}"]');
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
/** Right-click on a row number or column letter, then the menu item. */
const linesMenu = async (attr, label, item) => {
  const at = await headBox(attr, label);
  expect(at, `no ${attr} ${label}`);
  await b.clickAt(at.x, at.y, { button: 'right' });
  await b.waitText(item, { exact: true, timeout: 3000 });
  await b.click(item, { exact: true });
  await b.sleep(400);
};
/**
 * The browser's copy / cut / paste event on the focused grid, as ⌘C / ⌘X /
 * ⌘V send them, with a clipboard of its own: returns the text the sheet put
 * on it (copy, cut), or gives it `text` (paste).
 */
const clipboardEvent = (type, text = null) =>
  b.evaluate(`(() => {
    const dt = new DataTransfer();
    if (${JSON.stringify(text)} !== null) dt.setData('text/plain', ${JSON.stringify(text)});
    const e = new ClipboardEvent('${type}', { clipboardData: dt, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(e);
    return { text: dt.getData('text/plain'), taken: e.defaultPrevented };
  })()`);
// A finger (touch emulated, as pages.mjs does for the iPhone layout).
const touchEvent = (type, x, y) => b.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (x, y) => {
  await touchEvent('touchStart', x, y);
  await b.sleep(60);
  await touchEvent('touchEnd');
  await b.sleep(400);
};
const longPress = async (x, y) => {
  await touchEvent('touchStart', x, y);
  await b.sleep(750);
  await touchEvent('touchEnd');
  await b.sleep(400);
};
const fingerDrag = async (from, to, steps = 10) => {
  await touchEvent('touchStart', from.x, from.y);
  await b.sleep(80);
  for (let i = 1; i <= steps; i++) {
    await touchEvent('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await b.sleep(40);
  }
  await touchEvent('touchEnd');
  await b.sleep(400);
};
const tapCell = async (address) => {
  const box = await cellBox(address);
  expect(box, `no cell ${address} on screen`);
  await tap(box.x, box.y);
};
const tapSelector = async (selector) => {
  const at = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  expect(at, `nothing to tap: ${selector}`);
  await tap(at.x, at.y);
};
const rectOf = (selector) => b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null; })()`);
/**
 * Phone, while a cell is typed: the cell is whole on screen, under the
 * column letters and above what covers the grid's bottom (the function list
 * or help line, else the bar), as Numbers keeps it. Measured as it is (not
 * scrolled into view first).
 */
const editedCellVisible = (address) =>
  b.evaluate(`(() => {
    const cell = document.querySelector('[data-sheet="grid"] [data-cell="${address}"]')?.getBoundingClientRect();
    const grid = document.querySelector('[data-sheet="grid"]').getBoundingClientRect();
    const head = document.querySelector('[data-col-head="A"]').getBoundingClientRect();
    const hints = document.querySelector('[data-hints]')?.getBoundingClientRect();
    const barTop = document.querySelector('[aria-label="Formula bar"]').getBoundingClientRect().top;
    const floor = Math.min(hints ? hints.top : Infinity, barTop, grid.bottom);
    if (!cell) return { ok: false, why: 'not drawn' };
    return { ok: cell.top >= head.bottom - 1 && cell.bottom <= floor + 1, cell: { top: cell.top, bottom: cell.bottom }, head: head.bottom, floor };
  })()`);
const barFocused = () => b.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Formula bar'`);
const undoKey = () => b.chord({ key: 'z', code: 'KeyZ', meta: true, keyCode: 90 });
const redoKey = () => b.chord({ key: 'z', code: 'KeyZ', meta: true, shift: true, keyCode: 90 });
/** The formula bar's text (the draft while a cell is edited). */
const bar = () => b.evaluate(`document.querySelector('[aria-label="Formula bar"]').value`);
const clickCell = async (address) => {
  const box = await cellBox(address);
  expect(box, `no cell ${address} on screen`);
  await b.clickAt(box.x, box.y);
  // Past the double-click time, so the next click on it is a click of its own.
  await b.sleep(150);
};
/** A character as the keyboard types it (the grid starts editing on a key press). */
const keyText = async (ch) => {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  await b.sleep(250);
};
const key = (name, keyCode, extra = {}) => b.chord({ key: name, code: name, keyCode, ...extra });
/** Click the cell, type over it (in the cell), Enter. */
const typeCell = async (address, text) => {
  await clickCell(address);
  await keyText(text[0]);
  if (text.length > 1) await b.type(text.slice(1));
  await b.press('Enter');
  await b.sleep(150);
};
/** Click the cell, then type in the formula bar, Enter. */
const typeBar = async (address, text) => {
  await clickCell(address);
  await b.clickSelector('[aria-label="Formula bar"]');
  await b.sleep(200);
  await b.type(text);
  await b.press('Enter');
  await b.sleep(150);
};
const value = (a) => b.evaluate(`${SHEET}.value(${JSON.stringify(a)})`);
const input = (a) => b.evaluate(`${SHEET}.input(${JSON.stringify(a)})`);
const selection = () => b.evaluate(`${SHEET}.selection()`);
/** The sheet tab's row and its cells by address (as the database has them). */
const sheetRow = async () => (await admin.from('documents').select('*').eq('file_id', plain.id).eq('kind', 'sheet').maybeSingle()).data;
const cellsInRow = (row) => Object.fromEntries((row?.content?.content ?? []).filter((c) => c.type === 'sheetCell').map((c) => [c.attrs.blockId, c.attrs]));
const scheme = (v) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });

try {
  await b.signIn(BASE, user.email, user.password);

  await step('1280: "+ Add tab" → Spreadsheet adds "Sheet 1" with columns A–Z and numbered rows, only those on screen drawn', async () => {
    await openDoc(null);
    await b.clickSelector('[aria-label="Add tab"]');
    await b.waitText('Spreadsheet', { exact: true, timeout: 5000 });
    await b.shot('sheets-add-menu-1280');
    await b.click('Spreadsheet', { exact: true });
    await waitFor(() => b.evaluate(`document.querySelector('input[placeholder="Tab name"]')?.value === 'Sheet 1'`), 'the name prompt with "Sheet 1"');
    await b.click('Save', { exact: true });
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-sheet="grid"] [data-cell="A1"]') && !!${SHEET}`), 'the grid');
    expect((await openTab()) === 'Sheet 1', `open: ${await openTab()}`);
    expect(await cellBox('Z1'), 'no column Z');
    expect(!(await cellBox('AA1')), 'a column after Z');
    const rows = await b.evaluate(`new Set([...document.querySelectorAll('[data-cell]')].map((e) => e.dataset.cell.replace(/^[A-Z]+/, ''))).size`);
    // Virtualised: about three screens of rows, never all 1,000.
    expect(rows > 10 && rows < 200, `rows drawn: ${rows}`);
    expect(await b.hasText('Z', true), 'no letter Z on top');
    const row = await sheetRow();
    expect(row && /^t-[0-9a-f-]{36}$/.test(row.tab) && row.title === 'Sheet 1', JSON.stringify(row && { tab: row.tab, title: row.title }));
    expect(JSON.stringify(row.content) === JSON.stringify({ type: 'doc', content: [] }), `content: ${JSON.stringify(row.content)}`);
    sheetTab = row.tab;
    // The formula bar names the selected cell.
    expect(await b.hasText('A1', true), 'the formula bar does not say A1');
  });

  await step('1280: a loan table typed in the cells and the formula bar; PMT, NPV and IRR give Excel’s results; saved as cells', async () => {
    for (const [a, t] of [['A1', 'Amount'], ['A2', 'Rate'], ['A3', 'Months'], ['A4', 'Payment'], ['A6', 'NPV'], ['A7', 'IRR']]) await typeCell(a, t);
    await typeCell('B1', '200000');
    await typeCell('B2', '3.5%');
    await typeCell('B3', '360');
    await typeCell('B4', '=PMT(B2/12, B3, -B1)');
    await typeCell('B6', '=NPV(10%, -10000, 3000, 4200, 6800)');
    // The IRR's cash flows through the formula bar.
    const flows = ['-70000', '12000', '15000', '18000', '21000', '26000'];
    for (let i = 0; i < flows.length; i++) await typeBar(`C${i + 1}`, flows[i]);
    await typeCell('B7', '=IRR(C1:C6)');

    // Excel: PMT(3.5%/12, 360, -200000) = 898.09; NPV(10%, -10000, 3000, 4200, 6800) = 1,188.44; IRR(-70000 … 26000) = 8.66%.
    expect(asExcel(await value('B4'), 898.09), `PMT: ${await value('B4')}`);
    expect(asExcel(await value('B6'), 1188.44), `NPV: ${await value('B6')}`);
    expect(asExcel(Number(await value('B7')) * 100, 8.66), `IRR: ${await value('B7')}`);
    // What the cell shows is that number (General display: the digits that fit, no number formats in v1).
    expect(asExcel((await cellBox('B4')).text, 898.09), `B4 shows ${(await cellBox('B4')).text}`);
    // Rounded to fit, never cut with "…" (Excel's General).
    expect((await cutNumbers()).length === 0, `numbers cut: ${await cutNumbers()}`);
    expect(/^1188\.44\d*$/.test((await cellBox('B6')).text) && /^0\.0866\d*$/.test((await cellBox('B7')).text), `NPV / IRR shown as ${(await cellBox('B6')).text} / ${(await cellBox('B7')).text}`);
    expect((await cellBox('A1')).text === 'Amount', `A1 shows ${(await cellBox('A1')).text}`);
    // The formula bar shows the formula, not the result.
    await clickCell('B4');
    expect((await b.evaluate(`document.querySelector('[aria-label="Formula bar"]').value`)) === '=PMT(B2/12, B3, -B1)', 'the formula bar does not show the formula');

    await waitFor(async () => cellsInRow(await sheetRow()).B7?.input === '=IRR(C1:C6)', 'the cells saved', 10000);
    const cells = cellsInRow(await sheetRow());
    expect(cells.B4.input === '=PMT(B2/12, B3, -B1)' && cells.B4.origin === 'student' && typeof cells.B4.editedAt === 'number', JSON.stringify(cells.B4));
    expect(cells.C1.input === '-70000' && cells.B2.input === '3.5%', JSON.stringify([cells.C1, cells.B2]));
    // Only what was typed: no values in the row.
    expect(!JSON.stringify(cells).includes('898.09'), 'a calculated value was saved');
    await b.shot('sheets-loan-1280');
  });

  await step('1280: errors as in Excel (#DIV/0!, #NAME?, a circle → #REF!), and the line under the formula bar', async () => {
    await typeCell('A9', '=1/0');
    await typeCell('A10', '=FOO(1)');
    await typeCell('A11', '=B11');
    await typeCell('B11', '=A11');
    expect((await cellBox('A9')).text === '#DIV/0!', `A9 shows ${(await cellBox('A9')).text}`);
    expect((await cellBox('A10')).text === '#NAME?', `A10 shows ${(await cellBox('A10')).text}`);
    expect((await cellBox('A11')).text === '#REF!' && (await cellBox('B11')).text === '#REF!', 'the circle is not #REF!');
    await clickCell('A9');
    await b.waitText('#DIV/0!: A number is divided by zero (or by an empty cell).', { exact: true, timeout: 3000 });
    await b.shot('sheets-error-1280');
    await clickCell('A11');
    await b.waitText('#REF!: Circular reference.', { exact: true, timeout: 3000 });
    // Breaking the circle brings the values back.
    await typeCell('B11', '5');
    expect(Number(await value('A11')) === 5, `A11: ${await value('A11')}`);
    await clickCell('A1');
    expect(!(await b.hasText('Circular reference', false)), 'the error line stays on a cell without an error');
  });

  await step('1280: keys: arrows, Tab, Enter, Shift+arrow; a double-click edits what is there; Esc drops; Delete empties', async () => {
    await clickCell('B3');
    await key('ArrowDown', 40);
    expect((await selection()) === 'B4', `after ↓: ${await selection()}`);
    await b.press('Tab');
    expect((await selection()) === 'C4', `after Tab: ${await selection()}`);
    await b.press('Enter');
    expect((await selection()) === 'C5', `after Enter: ${await selection()}`);
    await key('ArrowDown', 40, { shift: true });
    expect((await selection()) === 'C5:C6', `after ⇧↓: ${await selection()}`);
    await key('ArrowLeft', 37);
    expect((await selection()) === 'B5', `after ←: ${await selection()}`);

    // A double-click edits what is there; Esc leaves it as it was.
    const at = await cellBox('B3');
    for (let i = 1; i <= 2; i++) {
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: i });
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: i });
      await b.sleep(60);
    }
    await waitFor(() => b.evaluate(`document.querySelector('[aria-label="Edit B3"]')?.value === '360'`), 'B3 open with 360');
    await b.type('0');
    await b.press('Escape');
    expect(!(await b.evaluate(`!!document.querySelector('[aria-label="Edit B3"]')`)), 'still editing after Esc');
    expect((await input('B3')) === '360', `B3 after Esc: ${await input('B3')}`);

    // Typing over a cell and Esc: nothing changes.
    await clickCell('B1');
    await keyText('9');
    await b.type('99');
    await b.press('Escape');
    expect((await input('B1')) === '200000', `B1 after Esc: ${await input('B1')}`);

    await typeCell('D1', 'borrar');
    await clickCell('D1');
    await key('Delete', 46);
    expect((await input('D1')) === '', `D1 after Delete: ${await input('D1')}`);
    await waitFor(async () => !cellsInRow(await sheetRow()).D1, 'D1 gone from the row');
  });

  await step('1280: bold with ⌘B and with B on a dragged range; saved; kept after a reload', async () => {
    await clickCell('B4');
    await b.chord({ key: 'b', code: 'KeyB', meta: true, keyCode: 66 });
    expect(await b.evaluate(`${SHEET}.bold('B4')`), 'B4 not bold after ⌘B');
    expect((await cellBox('B4')).weight === '700', `B4 weight ${(await cellBox('B4')).weight}`);
    const from = await cellBox('A1');
    const to = await cellBox('A4');
    await b.mouseDrag({ x: from.x, y: from.y }, { x: to.x, y: to.y });
    expect((await selection()) === 'A1:A4', `dragged: ${await selection()}`);
    await b.clickSelector('[aria-label="Bold"]');
    for (const a of ['A1', 'A2', 'A3', 'A4']) expect(await b.evaluate(`${SHEET}.bold('${a}')`), `${a} not bold`);
    expect(await b.evaluate(`document.querySelector('[aria-label="Bold"]').getAttribute('aria-pressed') === 'true'`), 'B is not shown pressed');
    await waitFor(async () => {
      const cells = cellsInRow(await sheetRow());
      return ['A1', 'A2', 'A3', 'A4', 'B4'].every((a) => cells[a]?.bold === true);
    }, 'bold saved');
    await openDoc(sheetTab);
    expect(await b.evaluate(`${SHEET}.bold('A2')`) && (await cellBox('B4')).weight === '700', 'bold lost after a reload');
    expect(asExcel(await value('B4'), 898.09), `B4 after a reload: ${await value('B4')}`);
    // Bold is wider: still rounded to fit, not cut.
    expect((await cutNumbers()).length === 0, `numbers cut (bold): ${await cutNumbers()}`);
    expect(asExcel((await cellBox('B4')).text, 898.09), `bold B4 shows ${(await cellBox('B4')).text}`);
  });

  await step('1280: another device’s cell appears while this one types in another; both are kept', async () => {
    const row = await sheetRow();
    const content = { ...row.content, content: [...row.content.content, { type: 'sheetCell', attrs: { blockId: 'D2', input: 'desde el iPhone', editedAt: Date.now(), origin: 'student' } }] };
    const { error } = await admin.from('documents').update({ content }).eq('id', row.id);
    expect(!error, error?.message);
    await typeCell('D3', 'desde el portátil');
    await waitFor(async () => (await cellBox('D2'))?.text === 'desde el iPhone', 'the other device’s cell on screen', 12000);
    await waitFor(async () => {
      const cells = cellsInRow(await sheetRow());
      return cells.D2?.input === 'desde el iPhone' && cells.D3?.input === 'desde el portátil';
    }, 'both cells in the row', 10000);
    expect((await cellBox('D3')).text === 'desde el portátil', 'this device’s cell is gone');
  });

  await step('1280: leaving keeps a version; version history shows the grid; Restore brings an older value back', async () => {
    await b.click('Recent');
    await b.sleep(2000);
    const row = await sheetRow();
    const { data: versions } = await admin.from('document_versions').select('reason, content').eq('document_id', row.id);
    expect(versions?.some((v) => v.reason === 'session_end' && cellsInRow(v).B1?.input === '200000'), JSON.stringify(versions?.map((v) => v.reason)));

    await openDoc(sheetTab);
    await typeCell('B1', '300000');
    await waitFor(async () => cellsInRow(await sheetRow()).B1?.input === '300000', 'B1 = 300000 saved');
    // Excel: PMT(3.5%/12, 360, -300000) = 1,347.13.
    expect(asExcel(await value('B4'), 1347.13), `B4 with 300000: ${await value('B4')}`);

    await b.clickSelector('[aria-label="Document menu"]');
    await b.click('Version history');
    await b.waitText('Edited', { timeout: 10000 });
    await b.click('Edited');
    await b.waitText('Restore this version', { timeout: 10000 });
    await waitFor(async () => (await cellBox('B1', true))?.text === '200000', 'the preview grid with 200000');
    await b.shot('sheets-history-1280');
    await b.click('Restore this version');
    await b.waitText('Restore this version?');
    await b.click('Restore', { exact: true });
    await waitFor(async () => (await input('B1')) === '200000', 'B1 back on screen', 8000);
    await waitFor(async () => cellsInRow(await sheetRow()).B1?.input === '200000', 'B1 back in the row', 8000);
    expect(asExcel(await value('B4'), 898.09), `B4 after Restore: ${await value('B4')}`);
    const { data: before } = await admin.from('document_versions').select('content').eq('document_id', row.id).eq('reason', 'restore');
    expect(before?.some((v) => cellsInRow(v).B1?.input === '300000'), 'no "Before restore" version with 300000');
  });

  await step('1280 (2a): "=" then clicks add references (a second click replaces the last one); a drag adds a range; the input keeps the focus', async () => {
    await clickCell('D5');
    await keyText('=');
    await clickCell('B1');
    expect((await bar()) === '=B1', `after a click on B1: ${await bar()}`);
    expect(await b.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Edit D5'`), 'the cell lost the focus while pointing');
    await b.type('*');
    await clickCell('B2');
    expect((await bar()) === '=B1*B2', `after B2: ${await bar()}`);
    // A click straight after replaces the reference just added, as in Excel; it is outlined.
    await clickCell('B3');
    expect((await bar()) === '=B1*B3', `after B3: ${await bar()}`);
    expect(await b.evaluate(`!!document.querySelector('[data-mark="B3"]')`), 'B3 not outlined');
    await b.press('Enter');
    expect((await input('D5')) === '=B1*B3' && Number(await value('D5')) === 72000000, `D5: ${await input('D5')} = ${await value('D5')}`);
    expect((await selection()) === 'D6', `after Enter: ${await selection()}`);

    // A range by dragging, inside a function.
    await keyText('=');
    await b.type('SUM(');
    const from = await cellBox('C1');
    const to = await cellBox('C6');
    await b.mouseDrag({ x: from.x, y: from.y }, { x: to.x, y: to.y }, {
      midway: async (i) => {
        if (i === 6) await b.shot('sheets-pointing-1280');
      },
    });
    expect((await bar()) === '=SUM(C1:C6', `after the drag: ${await bar()}`);
    for (const a of ['C1', 'C3', 'C6']) expect(await b.evaluate(`!!document.querySelector('[data-mark="${a}"]')`), `${a} not outlined`);
    await b.type(')');
    await b.press('Enter');
    expect((await input('D6')) === '=SUM(C1:C6)' && Number(await value('D6')) === 22000, `D6: ${await input('D6')} = ${await value('D6')}`);
  });

  await step('1280 (2a): autocomplete offers the functions (Tab takes one); the help line shows the current argument in bold', async () => {
    await clickCell('D7');
    await keyText('=');
    await b.type('PM');
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-hints="list"] [data-fn="PMT"]')`), 'PMT offered', 3000);
    expect(await b.hasText('Finance', true), 'no group on the offer');
    await b.shot('sheets-autocomplete-1280');
    await b.press('Tab');
    expect((await bar()) === '=PMT(', `after Tab: ${await bar()}`);
    const current = () => b.evaluate(`(() => { const e = document.querySelector('[data-hints="help"] [data-current="1"]'); return e ? { text: e.innerText, weight: getComputedStyle(e).fontWeight } : null; })()`);
    await waitFor(async () => (await current())?.text === 'rate', 'rate in bold', 3000);
    expect((await current()).weight === '700', `rate weight ${(await current()).weight}`);
    expect(await b.hasText('PMT(rate, nper, pv, [fv], [type])', false), 'no help line');
    await b.shot('sheets-help-1280');
    await b.type('B2/12, ');
    await waitFor(async () => (await current())?.text === 'nper', `nper in bold (now ${(await current())?.text})`, 3000);
    await b.type('B3, -B1)');
    await b.press('Enter');
    expect((await input('D7')) === '=PMT(B2/12, B3, -B1)' && asExcel(await value('D7'), 898.09), `D7: ${await input('D7')} = ${await value('D7')}`);

    // ↑ ↓ choose, Enter takes (it doesn't end the formula while the list is open); Esc closes the list, then drops the edit.
    await clickCell('D8');
    await keyText('=');
    await b.type('N');
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-fn="NPV"]')`), 'NPER and NPV offered', 3000);
    await key('ArrowDown', 40);
    expect(await b.evaluate(`document.querySelector('[data-fn="NPV"]').dataset.on === '1'`), 'NPV not chosen with ↓');
    await b.press('Enter');
    expect((await bar()) === '=NPV(', `after Enter on NPV: ${await bar()}`);
    await b.press('Escape');
    expect((await input('D8')) === '', `D8 after Esc: ${await input('D8')}`);

    // The list opened on the last visible column: nothing scrolls or widens; it stays inside the grid.
    const edge = await lastVisibleCell(12);
    expect(edge, 'no visible cell on row 12');
    await clickCell(edge);
    await keyText('=');
    await b.type('PM');
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-hints="list"]')`), `the list on ${edge}`, 3000);
    await b.sleep(300);
    await expectListInside(`1280, ${edge}`);
    await b.shot('sheets-autocomplete-edge-1280');
    await b.press('Escape');
    await b.press('Escape');
    expect((await input(edge)) === '', `${edge} after Esc: ${await input(edge)}`);
  });

  await step('1280 (2a): the fill handle copies a formula down and across, references moving and $ fixed', async () => {
    for (let i = 1; i <= 5; i++) await typeCell(`E${i}`, String(i));
    await typeCell('F1', '=E1*$B$3');
    await typeCell('G1', '=F1+1');
    await clickCell('F1');
    expect(await b.evaluate(`!!document.querySelector('[data-fill-handle="F1"]')`), 'no fill handle on F1');
    const f1 = await cellBox('F1');
    const f5 = await cellBox('F5');
    await b.mouseDrag({ x: f1.right - 2, y: f1.bottom - 2 }, { x: f5.x, y: f5.y }, {
      midway: async (i) => {
        if (i === 8) await b.shot('sheets-fill-1280');
      },
    });
    expect((await input('F5')) === '=E5*$B$3' && Number(await value('F5')) === 1800, `F5: ${await input('F5')} = ${await value('F5')}`);
    expect((await input('F3')) === '=E3*$B$3', `F3: ${await input('F3')}`);
    expect((await selection()) === 'F1:F5', `after the fill: ${await selection()}`);
    // Across. The target is measured first: bringing I1 into view scrolls the grid, which moves G1's handle.
    await clickCell('G1');
    const i1 = await cellBox('I1');
    const g1 = await cellBox('G1');
    const i1Again = await cellBox('I1');
    expect(i1Again.x === i1.x && i1Again.y === i1.y, 'the grid scrolled between the measures');
    await b.mouseDrag({ x: g1.right - 2, y: g1.bottom - 2 }, { x: i1.x, y: i1.y });
    expect((await input('I1')) === '=H1+1' && Number(await value('I1')) === 363, `I1: ${await input('I1')} = ${await value('I1')}`);
    await waitFor(async () => {
      const cells = cellsInRow(await sheetRow());
      return cells.F5?.input === '=E5*$B$3' && cells.I1?.input === '=H1+1';
    }, 'the filled cells saved');
  });

  await step('1280 (2b): Undo / Redo with ⌘Z / ⌘⇧Z and the toolbar; one step per action (a typed cell, a fill, bold)', async () => {
    await typeCell('J1', 'uno');
    await clickCell('J1');
    await undoKey();
    expect((await input('J1')) === '', `J1 after ⌘Z: ${await input('J1')}`);
    await redoKey();
    expect((await input('J1')) === 'uno', `J1 after ⌘⇧Z: ${await input('J1')}`);
    await b.clickSelector('[aria-label="Undo"]');
    expect((await input('J1')) === '', `J1 after the toolbar's Undo: ${await input('J1')}`);
    await b.clickSelector('[aria-label="Redo"]');
    expect((await input('J1')) === 'uno', `J1 after the toolbar's Redo: ${await input('J1')}`);
    // A fill is one step.
    await clickCell('J1');
    const j1 = await cellBox('J1');
    const j3 = await cellBox('J3');
    await b.mouseDrag({ x: j1.right - 2, y: j1.bottom - 2 }, { x: j3.x, y: j3.y });
    expect((await input('J3')) === 'uno', `J3 after the fill: ${await input('J3')}`);
    await undoKey();
    expect((await input('J2')) === '' && (await input('J3')) === '' && (await input('J1')) === 'uno', `after ⌘Z of the fill: ${await input('J2')} ${await input('J3')} ${await input('J1')}`);
    // Bold is one step.
    await clickCell('J1');
    await b.chord({ key: 'b', code: 'KeyB', meta: true, keyCode: 66 });
    expect(await b.evaluate(`${SHEET}.bold('J1')`), 'J1 not bold');
    await undoKey();
    expect(!(await b.evaluate(`${SHEET}.bold('J1')`)), 'J1 still bold after ⌘Z');
    await waitFor(async () => {
      const cells = cellsInRow(await sheetRow());
      return cells.J1?.input === 'uno' && !cells.J1.bold && !cells.J2 && !cells.J3;
    }, 'the undone cells saved');
  });

  await step('1280 (2b): insert and delete rows and columns from the row number / column letter; references move as in Excel; one Undo each', async () => {
    // A row above the payment: the cells below move, and the formulas follow them.
    await linesMenu('row-head', '2', 'Insert row above');
    expect((await selection()) === 'A2:Z2', `after the insert: ${await selection()}`);
    expect((await input('B5')) === '=PMT(B3/12, B4, -B1)' && asExcel(await value('B5'), 898.09), `B5: ${await input('B5')} = ${await value('B5')}`);
    expect((await input('B2')) === '' && (await input('B3')) === '3.5%', `B2 / B3: ${await input('B2')} / ${await input('B3')}`);
    expect((await input('D6')) === '=B1*B4', `D6 (was D5 =B1*B3): ${await input('D6')}`);
    await b.shot('sheets-insert-row-1280');
    await waitFor(async () => cellsInRow(await sheetRow()).B5?.input === '=PMT(B3/12, B4, -B1)', 'the moved cells saved');
    await undoKey();
    expect((await input('B4')) === '=PMT(B2/12, B3, -B1)' && (await input('B5')) === '', `after ⌘Z: B4 ${await input('B4')}, B5 ${await input('B5')}`);

    // Deleting a row that a formula reads: #REF!.
    await linesMenu('row-head', '3', 'Delete row');
    expect((await input('B3')) === '=PMT(B2/12, #REF!, -B1)' && (await value('B3')) === '#REF!', `B3 after the delete: ${await input('B3')} = ${await value('B3')}`);
    await undoKey();
    expect((await input('B3')) === '360' && asExcel(await value('B4'), 898.09), `after ⌘Z: B3 ${await input('B3')}, B4 ${await value('B4')}`);

    // A column left of B, $ references too.
    await linesMenu('col-head', 'B', 'Insert column left');
    expect((await input('C4')) === '=PMT(C2/12, C3, -C1)' && asExcel(await value('C4'), 898.09), `C4: ${await input('C4')}`);
    expect((await input('G1')) === '=F1*$C$3', `G1 (was F1 =E1*$B$3): ${await input('G1')}`);
    await undoKey();
    expect((await input('B4')) === '=PMT(B2/12, B3, -B1)' && (await input('F1')) === '=E1*$B$3', 'the column insert not undone');

    // Several rows selected along the numbers: the menu counts them.
    const r2 = await headBox('row-head', '2');
    const r3 = await headBox('row-head', '3');
    await b.mouseDrag({ x: r2.x, y: r2.y }, { x: r3.x, y: r3.y }, { steps: 4 });
    expect((await selection()) === 'A2:Z3', `rows dragged: ${await selection()}`);
    await b.clickAt(r3.x, r3.y, { button: 'right' });
    await b.waitText('Insert 2 rows above', { exact: true, timeout: 3000 });
    expect(await b.hasText('Delete 2 rows', true), 'no "Delete 2 rows"');
    await b.shot('sheets-lines-menu-1280');
    await b.press('Escape');
  });

  await step('1280 (2b): copy, cut and paste: references move like the fill; values go out as tab-separated text; tab-separated text comes in', async () => {
    // Copy two formulas: the clipboard has their values as text; the paste moves their references ($ fixed).
    const f1 = await cellBox('F1');
    const f2 = await cellBox('F2');
    await b.mouseDrag({ x: f1.x, y: f1.y }, { x: f2.x, y: f2.y }, { steps: 4 });
    const copy = await clipboardEvent('copy');
    expect(copy.taken && copy.text === '360\n720', `copied text: ${JSON.stringify(copy.text)}`);
    expect(await b.evaluate(`!!document.querySelector('[data-mark="F1"]') && !!document.querySelector('[data-mark="F2"]')`), 'the copy isn’t marked');
    await clickCell('H5');
    await clipboardEvent('paste', copy.text);
    expect((await input('H5')) === '=G5*$B$3' && (await input('H6')) === '=G6*$B$3', `pasted: ${await input('H5')} / ${await input('H6')}`);
    expect((await selection()) === 'H5:H6', `after the paste: ${await selection()}`);
    await undoKey();
    expect((await input('H5')) === '' && (await input('H6')) === '', 'the paste not undone in one step');

    // Cut: the formula moves as it is; the cut cell is emptied.
    await clickCell('D5');
    const cut = await clipboardEvent('cut');
    expect(cut.text === '72000000', `cut text: ${cut.text}`);
    await clickCell('D12');
    await clipboardEvent('paste', cut.text);
    expect((await input('D12')) === '=B1*B3' && Number(await value('D12')) === 72000000 && (await input('D5')) === '', `after the cut and paste: D12 ${await input('D12')}, D5 ${await input('D5')}`);

    // Text from another app (Excel, Google Sheets): tab-separated, into the cells from the selected one.
    await clickCell('J10');
    await clipboardEvent('paste', 'Mes\tPago\n1\t=B4*2\n');
    expect((await input('J10')) === 'Mes' && (await input('K10')) === 'Pago' && (await input('J11')) === '1' && (await input('K11')) === '=B4*2', 'the text not pasted into J10:K11');
    expect(asExcel(await value('K11'), 1796.18), `K11: ${await value('K11')}`);

    // The real ⌘C marks the copy; Esc takes the marks away.
    await clickCell('A1');
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', modifiers: 4, windowsVirtualKeyCode: 67, commands: ['copy'] });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', modifiers: 4, windowsVirtualKeyCode: 67 });
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-mark="A1"]')`), '⌘C marked A1', 3000);
    await b.shot('sheets-copy-1280');
    await b.press('Escape');
    expect(!(await b.evaluate(`!!document.querySelector('[data-mark]')`)), 'the copy marks stay after Esc');

    await waitFor(async () => {
      const cells = cellsInRow(await sheetRow());
      return cells.D12?.input === '=B1*B3' && !cells.D5 && cells.K11?.input === '=B4*2';
    }, 'the pasted cells saved');
  });

  await step('screenshots of the sheet at 1280, light and dark', async () => {
    await openDoc(sheetTab);
    const from = await cellBox('A1');
    const to = await cellBox('B4');
    // A selected range shows in the picture.
    await b.mouseDrag({ x: from.x, y: from.y }, { x: to.x, y: to.y });
    await b.shot('sheets-1280-light');
    await scheme('dark');
    await b.sleep(800);
    await b.shot('sheets-1280-dark');
    await scheme('light');
  });

  await step('390: the grid scrolls sideways inside the tab, never the page', async () => {
    await b.resize(390, 844);
    await openDoc(sheetTab);
    const scroller = await b.evaluate(`(() => {
      let e = document.querySelector('[data-cell="A1"]');
      while (e && e !== document.body) { if (e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX)) break; e = e.parentElement; }
      if (!e || e === document.body) return null;
      e.scrollLeft = e.scrollWidth;
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right };
    })()`);
    expect(scroller && scroller.right <= 391, `no scrolling area inside the tab: ${JSON.stringify(scroller)}`);
    await b.sleep(400);
    const z = await cellBox('Z1');
    expect(z && z.right <= 391, `Z1 not reachable: ${JSON.stringify(z)}`);
    expect(await b.evaluate(`document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1`), 'the page scrolls sideways');
    // Back to A and a tap on a cell selects it.
    await b.evaluate(`(() => { let e = document.querySelector('[data-cell="A1"]'); while (e && !(e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX))) e = e.parentElement; if (e) e.scrollLeft = 0; })()`);
    await b.sleep(300);
    await clickCell('B4');
    expect((await selection()) === 'B4', `tap: ${await selection()}`);
    // Narrower cells: numbers rounded further, never cut.
    expect((await cutNumbers()).length === 0, `numbers cut at 390: ${await cutNumbers()}`);
    expect(asExcel((await cellBox('B4')).text, 898.09), `B4 at 390 shows ${(await cellBox('B4')).text}`);
    // The function list at a phone's width, on the last visible column: inside the grid, nothing scrolled.
    const edge = await lastVisibleCell(12);
    expect(edge, 'no visible cell on row 12 at 390');
    await clickCell(edge);
    await b.clickSelector('[aria-label="Formula bar"]');
    await b.sleep(200);
    await b.type('=PM');
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-hints="list"]')`), `the list on ${edge} at 390`, 3000);
    await b.sleep(300);
    await expectListInside(`390, ${edge}`);
    await b.shot('sheets-autocomplete-390');
    await b.press('Escape');
    await b.press('Escape');
    expect((await input(edge)) === '', `${edge} at 390 after Esc: ${await input(edge)}`);
    await clickCell('B4');
    await b.shot('sheets-390-light');
    await scheme('dark');
    await b.sleep(800);
    await b.shot('sheets-390-dark');
    await scheme('light');
    await b.resize(1280, 900);
  });

  await step('390, touch (3): the bar under the grid; taps add references and the dot widens one into a range; the list above the bar; the fill handle and Undo by finger; long-press menus (rows, Copy / Paste)', async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    try {
      await openDoc(sheetTab);
      // The formula bar sits under the grid (on the iPhone, on the keyboard).
      const grid = await rectOf('[data-sheet="grid"]');
      const barBox = await rectOf('[aria-label="Formula bar"]');
      expect(grid && barBox && barBox.top >= grid.bottom - 1, `bar ${JSON.stringify(barBox)} not under the grid ${JSON.stringify(grid)}`);

      // A tap selects; a second tap types in the bar.
      await tapCell('C14');
      expect((await selection()) === 'C14', `tap: ${await selection()}`);
      await tapCell('C14');
      await waitFor(barFocused, 'typing in the bar after a second tap', 3000);

      // =SUM( then a tap on B1 adds it, the bar keeps its focus; the dot on B1 dragged to B3 makes B1:B3.
      await b.type('=SUM(');
      // The help line opened at the bottom: C14 is moved up, whole above it.
      await waitFor(() => b.evaluate(`!!document.querySelector('[data-hints="help"]')`), 'the help line', 3000);
      await b.sleep(300);
      const shown14 = await editedCellVisible('C14');
      expect(shown14.ok, `C14 hidden while typing: ${JSON.stringify(shown14)}`);
      await tapCell('B1');
      expect((await bar()) === '=SUM(B1', `after a tap on B1: ${await bar()}`);
      expect(await barFocused(), 'the bar lost its focus after the tap');
      const b1 = await cellBox('B1');
      expect(await b.evaluate(`!!document.querySelector('[data-ref-handle="B1"]')`), 'no dot on B1');
      const b3 = await cellBox('B3');
      await fingerDrag({ x: b1.right - 3, y: b1.bottom - 3 }, { x: b3.x, y: b3.y });
      expect((await bar()) === '=SUM(B1:B3', `after dragging the dot: ${await bar()}`);
      await b.shot('sheets-iphone-pointing');
      await b.type(')');
      await tapSelector('[aria-label="Done"]');
      expect((await input('C14')) === '=SUM(B1:B3)' && asExcel(await value('C14'), 200360.035, 3), `C14: ${await input('C14')} = ${await value('C14')}`);

      // The list sits just above the bar; a tap on PMT takes it; the help line's bold part.
      await tapCell('C15');
      await tapCell('C15');
      await waitFor(barFocused, 'typing in C15', 3000);
      await b.type('=PM');
      await waitFor(() => b.evaluate(`!!document.querySelector('[data-hints="list"] [data-fn="PMT"]')`), 'PMT offered', 3000);
      const list = await rectOf('[data-hints="list"]');
      const barNow = await rectOf('[aria-label="Formula bar"]');
      expect(list.bottom <= barNow.top + 1 && list.left >= 0 && list.right <= 391, `the list ${JSON.stringify(list)} isn't above the bar ${JSON.stringify(barNow)}`);
      await b.sleep(300);
      const shown15 = await editedCellVisible('C15');
      expect(shown15.ok, `C15 hidden behind the list: ${JSON.stringify(shown15)}`);
      await b.shot('sheets-iphone-hints');
      await tapSelector('[data-fn="PMT"]');
      expect((await bar()) === '=PMT(', `after tapping PMT: ${await bar()}`);
      await waitFor(async () => (await b.evaluate(`document.querySelector('[data-hints="help"] [data-current="1"]')?.innerText`)) === 'rate', 'rate in bold', 3000);
      await b.type('B2/12, B3, -B1)');
      await tapSelector('[aria-label="Done"]');
      expect(asExcel(await value('C15'), 898.09), `C15: ${await value('C15')}`);

      // The fill handle by finger (a bigger reach), then Undo in the bar. C15 is still selected after Done.
      expect((await selection()) === 'C15', `after Done: ${await selection()}`);
      expect(await b.evaluate(`!!document.querySelector('[data-fill-handle="C15"]')`), 'no fill handle on C15');
      // The target first: bringing C17 into view scrolls the grid, which moves C15's handle.
      const c17 = await cellBox('C17');
      const c15 = await cellBox('C15');
      const c17Again = await cellBox('C17');
      expect(c17Again.x === c17.x && c17Again.y === c17.y, 'the grid scrolled between the measures');
      await fingerDrag({ x: c15.right - 4, y: c15.bottom - 4 }, { x: c17.x, y: c17.y });
      expect((await input('C17')) === '=PMT(B4/12, B5, -B3)', `C17 after the fill: ${await input('C17')}`);
      await b.shot('sheets-iphone-fill');
      await tapSelector('[aria-label="Undo"]');
      expect((await input('C16')) === '' && (await input('C17')) === '', 'the fill not undone');

      // A long-press on a row number: Insert / Delete.
      const r20 = await headBox('row-head', '20');
      await longPress(r20.x, r20.y);
      await b.waitText('Insert row above', { exact: true, timeout: 3000 });
      expect(await b.hasText('Delete row', true), 'no Delete row');
      await b.shot('sheets-iphone-lines-menu');
      await b.click('Insert row above', { exact: true });
      await b.sleep(400);
      expect((await selection()) === 'A20:Z20', `after the insert: ${await selection()}`);
      await tapSelector('[aria-label="Undo"]');

      // A long-press on a cell: Copy, then a long-press elsewhere: Paste (references move like the fill).
      const c14 = await cellBox('C14');
      await longPress(c14.x, c14.y);
      await b.waitText('Copy', { exact: true, timeout: 3000 });
      expect(await b.hasText('Paste', true) && (await b.hasText('Cut', true)), 'no Cut / Paste');
      await b.shot('sheets-iphone-cell-menu');
      await b.click('Copy', { exact: true });
      await b.sleep(300);
      expect(await b.evaluate(`!!document.querySelector('[data-mark="C14"]')`), 'the copy isn’t marked');
      const c22 = await cellBox('C22');
      await longPress(c22.x, c22.y);
      await b.waitText('Paste', { exact: true, timeout: 3000 });
      await b.click('Paste', { exact: true });
      await waitFor(async () => (await input('C22')) === '=SUM(B9:B11)', `C22 after Paste: ${await input('C22')}`, 3000);
      expect((await cutNumbers()).length === 0, `numbers cut: ${await cutNumbers()}`);
      await waitFor(async () => cellsInRow(await sheetRow()).C22?.input === '=SUM(B9:B11)', 'the pasted cell saved');
    } finally {
      await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await b.send('Emulation.clearDeviceMetricsOverride');
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
