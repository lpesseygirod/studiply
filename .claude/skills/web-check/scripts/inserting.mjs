// inserting.mjs — step 4.5, checkpoint A, on the laptop:
//   - the colour picker: the grid (10 colours × 6), a shade, More colours…
//     with a hex, None; picked colours in Recent colours and in the account's
//     preferences, and a colour picked on "another device" (service role)
//     showing in Recent after a reload;
//   - links: ⌘K, an address completed (uned.es → https://), the bubble
//     (Open · Edit · Remove), an unsafe address refused;
//   - tables (after test A, all with real clicks): the size grid and typed
//     sizes; the floating table bar (rows, columns, colour, header, ⋯ →
//     Table size…, 60 lowered to 50); right-click in a cell (delete row,
//     column, table; merge and split after dragging across cells); the hover
//     handles ("+" between rows, a column grip then delete); typing after a
//     table on the last line (click below, ↓) and above one at the top
//     (Enter, ↑); two copies open: a table deleted on one is gone on the
//     other; the iPhone bundle reads the same table and draws the bar;
//   - the toolbar: one row with ⌄, the second row remembered after a reload,
//     tools moving into it when the window is narrow;
//   - screenshots (ins-*.png) at 1280 and 390, light and dark.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OUT, SHOTS } from './cdp.mjs';
import { admin, makeUser, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-ins-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const EDITOR = 'window.studiplyEditor';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

const json = () => b.evaluate(`${EDITOR}.getJSON()`);
const click = (label) => b.clickSelector(`[aria-label="${label}"]`);
const has = (label) => b.evaluate(`!!document.querySelector('[aria-label="${label}"]')`);
const marks = async () => ((await json()).content[0].content ?? []).flatMap((t) => t.marks ?? []);
const table = async () => (await json()).content.find((n) => n.type === 'table');
const tableSize = async () => {
  const t = await table();
  return t ? [t.content.length, t.content[0].content.length] : null;
};
const waitEditor = async () => {
  for (let i = 0; i < 80; i++) {
    if (await b.evaluate(`!!${EDITOR}?.view?.dom`)) return;
    await b.sleep(250);
  }
  throw new Error('the editor did not start');
};
const fresh = async (text = 'Ver la web de la UNED') => {
  await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ${JSON.stringify(text)} }] }] }); e.commands.focus(); e.commands.selectAll(); })()`);
  await b.sleep(200);
};
const prefs = async (id) => (await admin.from('profiles').select('preferences').eq('id', id).single()).data.preferences;

const user = await makeUser();
const { data: file } = await user.client.from('files').insert({ kind: 'document', title: 'Insertar' }).select().single();
await user.client.from('documents').insert({ file_id: file.id, tab: 'notes', content: { type: 'doc', content: [{ type: 'paragraph' }] } });
b = await launch();
const openDoc = async () => {
  await b.nav(`${BASE}/doc/${file.id}`);
  await waitEditor();
  await b.sleep(2500);
  await b.clickSelector('.studiply-editor .ProseMirror');
};

try {
  await b.signIn(BASE, user.email, user.password);
  await openDoc();

  await step('colour picker: the grid, a shade, More colours… with a hex, Automatic', async () => {
    await fresh();
    await click('Text colour');
    const swatches = await b.evaluate(`document.querySelectorAll('[aria-label^="Text colour "][aria-label*=" "]').length`);
    expect(swatches >= 60, `only ${swatches} swatches`);
    await b.shot('ins-grid-1280');
    await click('Text colour Green darker 25 %');
    const shade = (await marks()).find((m) => m.type === 'textStyle')?.attrs.color;
    expect(/^#[0-9A-F]{6}$/.test(shade ?? ''), `shade ${shade}`);
    await b.evaluate(`${EDITOR}.commands.selectAll()`);
    await click('Text colour');
    await click('Text colour: more colours');
    await b.sleep(300);
    await b.shot('ins-spectrum-1280');
    await b.fill('input[aria-label="Hex colour"]', '#1a7f5a');
    await b.press('Enter');
    expect((await marks()).some((m) => m.type === 'textStyle' && m.attrs.color === '#1A7F5A'), 'hex not applied');
    await b.evaluate(`${EDITOR}.commands.selectAll()`);
    await click('Text colour');
    await click('Text colour Automatic');
    expect(!(await marks()).some((m) => m.attrs?.color), 'colour not removed');
  });

  await step('Recent colours: kept on the account, and another device\'s pick shows after a reload', async () => {
    await b.sleep(1200);
    const recent = (await prefs(user.id)).recentColours?.map((r) => r.colour) ?? [];
    expect(recent[0] === '#1A7F5A' && recent.length === 2, JSON.stringify(recent));
    // "The iPhone" picks pink.
    await admin.from('profiles').update({ preferences: { recentColours: [{ colour: '#DB2777', at: Date.now() + 1000 }, ...(await prefs(user.id)).recentColours] } }).eq('id', user.id);
    await openDoc();
    if (!(await has('Highlight'))) await click('More tools');
    await click('Highlight');
    expect(await has('Highlight recent #DB2777'), 'the other device\'s colour is not in Recent');
    expect(await has('Highlight recent #1A7F5A'), 'this device\'s colour is not in Recent');
    await b.press('Escape');
  });

  await step('links: ⌘K, an address completed, the bubble, an unsafe address refused', async () => {
    await fresh('Ver la web de la UNED');
    await b.evaluate(`${EDITOR}.commands.setTextSelection({ from: 18, to: 22 })`);
    await b.chord({ code: 'KeyK', key: 'k', meta: true, keyCode: 75 });
    await b.sleep(300);
    await b.fill('input[aria-label="Link address"]', 'javascript:alert(1)');
    expect(await b.hasText("That isn't an address a link can open.", false), 'unsafe address not refused');
    await b.fill('input[aria-label="Link address"]', 'uned.es');
    await b.click('Apply', { exact: true });
    expect((await marks()).some((m) => m.type === 'link' && m.attrs.href === 'https://uned.es'), JSON.stringify(await marks()));
    await b.evaluate(`${EDITOR}.commands.setTextSelection(20)`);
    await b.sleep(400);
    expect(await has('Open link') && await has('Edit link'), 'no link bubble');
    await b.shot('ins-link-bubble-1280');
    await click('Remove link');
    expect(!(await marks()).some((m) => m.type === 'link'), 'link not removed');
  });

  await step('the toolbar: one row with ⌄; the second row remembered after a reload', async () => {
    if (await has('Fewer tools')) await click('Fewer tools');
    expect(!(await has('Align centre (⌘⇧E)')), 'the second row is open');
    await click('More tools');
    expect(await has('Align centre (⌘⇧E)'), 'the second row did not open');
    await openDoc();
    expect(await has('Fewer tools') && await has('Align centre (⌘⇧E)'), 'not remembered after a reload');
  });

  // Tables, with real clicks (test A: "Delete table doesn't work").
  const cellPoint = (i, dx = 12) => b.evaluate(`(() => { const r = document.querySelectorAll('.ProseMirror td, .ProseMirror th')[${i}].getBoundingClientRect(); return { x: r.left + ${dx}, y: r.top + r.height / 2 }; })()`);
  const clickCell = async (i, button = 'left') => {
    const p = await cellPoint(i);
    await b.clickAt(p.x, p.y, { button });
    await b.sleep(350);
  };
  const types = async () => (await json()).content.map((n) => n.type).join(',');
  const toolbarTool = async (label) => {
    if (!(await has(label))) await click('More tools');
    await click(label);
    await b.sleep(300);
  };
  const lastLine = async () => {
    await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tabla:' }] }] }); })()`);
    await b.sleep(200);
    await b.clickAt(...Object.values(await b.evaluate(`(() => { const r = document.querySelector('.ProseMirror p').getBoundingClientRect(); return { x: r.right - 2, y: r.top + r.height / 2 }; })()`)));
    await b.press('Enter');
  };

  await step('tables: inserted on the last line, typed size 6 × 4, and a line to type in after it', async () => {
    await lastLine();
    await toolbarTool('Insert table');
    await b.fill('input[aria-label="Rows"]', '6');
    await b.fill('input[aria-label="Columns"]', '4');
    await b.click('Insert', { exact: true });
    await b.sleep(400);
    expect(JSON.stringify(await tableSize()) === '[6,4]', `size ${await tableSize()}`);
    expect((await types()) === 'paragraph,table,paragraph', await types());
    // A click below the table, then type.
    const below = await b.evaluate(`(() => { const r = document.querySelector('.ProseMirror table').getBoundingClientRect(); return { x: r.left + 20, y: r.bottom + 14 }; })()`);
    await b.clickAt(below.x, below.y);
    await b.type('Después');
    const last = (await json()).content.at(-1);
    expect(last.type === 'paragraph' && last.content?.[0]?.text === 'Después', JSON.stringify(last));
  });

  await step('the floating bar: rows, columns, colour, header row, ⋯ → Table size… (60 lowered to 50)', async () => {
    await lastLine();
    await toolbarTool('Insert table');
    await click('Table 3 by 3');
    await b.sleep(400);
    expect(await b.evaluate(`getComputedStyle(document.querySelector('.studiply-table-bar')).display === 'flex'`), 'no bar');
    await b.shot('ins-table-bar-1280');
    await click('Table rows');
    await b.click('Insert row below');
    await click('Table columns');
    await b.click('Insert column right');
    expect(JSON.stringify(await tableSize()) === '[4,4]', `size ${await tableSize()}`);
    await click('Header row');
    expect((await table()).content[0].content.every((c) => c.type === 'tableHeader'), 'no header row');
    await click('Cell colour');
    await click('Cell colour Blue lighter 80 %');
    expect((await table()).content.flatMap((r) => r.content).some((c) => /^#[0-9A-F]{6}$/.test(c.attrs.backgroundColor ?? '')), 'no cell colour');
    await click('More table options');
    await b.click('Table size…');
    await b.fill('input[aria-label="Rows"]', '60');
    expect(await b.hasText('Up to 50 rows and 20 columns', false), 'no note about the limit');
    await b.click('Apply', { exact: true });
    await b.sleep(400);
    expect(JSON.stringify(await tableSize()) === '[50,4]', `size ${await tableSize()}`);
    await click('More table options');
    await b.click('Table size…');
    await b.fill('input[aria-label="Rows"]', '3');
    await b.click('Apply', { exact: true });
    await b.sleep(400);
    expect(JSON.stringify(await tableSize()) === '[3,4]', `size ${await tableSize()}`);
    await b.sleep(400);
    await b.shot('ins-table-1280');
  });

  await step('right-click in a cell: delete row, delete column; drag across cells, merge and split', async () => {
    await clickCell(5, 'right');
    await b.shot('ins-table-menu-1280');
    await b.click('Delete row');
    expect(JSON.stringify(await tableSize()) === '[2,4]', `size ${await tableSize()}`);
    await clickCell(5, 'right');
    await b.click('Delete column');
    expect(JSON.stringify(await tableSize()) === '[2,3]', `size ${await tableSize()}`);
    const from = await cellPoint(3);
    const to = await cellPoint(4);
    await b.mouseDrag(from, to);
    await b.sleep(300);
    await clickCell(4, 'right');
    await b.click('Merge cells');
    expect((await table()).content[1].content[0].attrs.colspan === 2, 'cells not merged');
    await clickCell(3, 'right');
    await b.click('Split cell');
    expect((await table()).content[1].content.length === 3, 'cell not split');
  });

  await step('hover handles: "+" between rows, a column grip then delete column', async () => {
    const r = await b.evaluate(`(() => { const t = document.querySelector('.ProseMirror table').getBoundingClientRect(); const rows = [...document.querySelectorAll('.ProseMirror tr')].map((tr) => tr.getBoundingClientRect().bottom); return { left: t.left, top: t.top, rows }; })()`);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.left + 30, y: r.rows[0] + 2 });
    await b.sleep(300);
    await b.shot('ins-table-handles-1280');
    await click('Insert row 2');
    expect(JSON.stringify(await tableSize()) === '[3,3]', `size ${await tableSize()}`);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.left + 30, y: r.top + 10 });
    await b.sleep(200);
    await click('Select column 2');
    const selected = await b.evaluate(`document.querySelectorAll('.ProseMirror .selectedCell').length`);
    expect(selected === 3, `${selected} cells selected`);
    const p = await b.evaluate(`(() => { const r = document.querySelector('.ProseMirror .selectedCell').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 10 }; })()`);
    await b.clickAt(p.x, p.y, { button: 'right' });
    await b.sleep(300);
    await b.click('Delete column');
    expect(JSON.stringify(await tableSize()) === '[3,2]', `size ${await tableSize()}`);
  });

  await step('a table at the very top: Enter in its first cell, or ↑, makes a line above', async () => {
    await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a1' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }] }] }] }); })()`);
    await b.sleep(300);
    await clickCell(0, 'left');
    await b.chord({ code: 'Home', key: 'Home', keyCode: 36 });
    await b.press('Enter');
    await b.type('Título');
    expect((await json()).content[0].content?.[0]?.text === 'Título', await types());
    // And with the gap cursor: delete that line, then ↑ from the first cell.
    await b.evaluate(`(() => { const e = ${EDITOR}; const j = e.getJSON(); j.content.shift(); e.commands.setContent(j); })()`);
    await b.sleep(300);
    await clickCell(0, 'left');
    await b.chord({ code: 'Home', key: 'Home', keyCode: 36 });
    await b.chord({ code: 'ArrowUp', key: 'ArrowUp', keyCode: 38 });
    await b.type('Arriba');
    expect((await json()).content[0].type === 'paragraph' && JSON.stringify((await json()).content[0]).includes('Arriba'), await types());
  });

  await step('two copies open: a table deleted on one is gone on the other, and stays gone', async () => {
    await lastLine();
    await toolbarTool('Insert table');
    await click('Table 2 by 2');
    await b.type('x');
    await b.sleep(4000);
    const other = await launch({ port: 9334 });
    try {
      await other.signIn(BASE, user.email, user.password);
      await other.nav(`${BASE}/doc/${file.id}`);
      for (let i = 0; i < 80 && !(await other.evaluate(`!!${EDITOR}?.view?.dom`)); i++) await other.sleep(250);
      await other.sleep(2500);
      const otherHas = () => other.evaluate(`${EDITOR}.getJSON().content.some((n) => n.type === 'table')`);
      expect(await otherHas(), 'the other copy has no table to start with');
      await clickCell(0, 'right');
      await b.click('Delete table');
      expect(!(await table()), 'not deleted here');
      let gone = false;
      for (let i = 0; i < 24 && !gone; i++) {
        await b.sleep(500);
        gone = !(await otherHas());
      }
      expect(gone, 'the other copy still shows the table');
      // The other copy types something; the table must not come back.
      await other.clickSelector('.studiply-editor .ProseMirror');
      await other.type(' y');
      await b.sleep(7000);
      expect(!(await table()) && !(await otherHas()), 'the table came back');
      const { data: rows } = await admin.from('documents').select('content').eq('file_id', file.id);
      expect(rows.every((r) => !r.content.content.some((n) => n.type === 'table')), 'the saved document has the table');
    } finally {
      await other.close();
    }
  });

  await step('the iPhone bundle reads the same table unchanged, and draws the bar', async () => {
    await lastLine();
    await toolbarTool('Insert table');
    await click('Table 3 by 3');
    await click('Header row');
    await click('Cell colour');
    await click('Cell colour Blue lighter 80 %');
    const doc = await json();
    // The app injects the editor's styles into the iPhone's WebView: the same rules, from the laptop page.
    const css = await b.evaluate(`[...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => t.includes('.studiply-editor .ProseMirror'))`);
    await b.nav(IPHONE);
    await waitEditor();
    await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); document.body.classList.add('studiply-editor'); })()`);
    const strip = (d) => JSON.parse(JSON.stringify(d, (k, v) => (k === 'blockId' || k === 'editedAt' ? undefined : v)));
    const back = await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent(${JSON.stringify(doc)}); return e.getJSON(); })()`);
    expect(JSON.stringify(strip(back)) === JSON.stringify(strip(doc)), 'the iPhone bundle changed the table');
    await clickCell(4);
    expect(await b.evaluate(`getComputedStyle(document.querySelector('.studiply-table-bar')).display === 'flex'`), 'no bar in the iPhone bundle');
    await b.resize(390, 844);
    await b.sleep(300);
    await clickCell(4);
    await b.shot('ins-table-bar-390');
    await click('Header row');
    expect(!(await table()).content[0].content.every((c) => c.type === 'tableHeader'), 'the bar\'s Header did nothing');
    await b.resize(1280, 900);
    await openDoc();
  });

  await step('narrow window: tools that don\'t fit move into the second row; 390 and dark screenshots', async () => {
    await b.resize(1040, 860);
    await b.sleep(1200);
    // The first row ends with ⌄; Insert table now sits in the second row (below it).
    const ys = await b.evaluate(`(() => {
      const y = (l) => document.querySelector('[aria-label="' + l + '"]')?.getBoundingClientRect().top ?? null;
      return { bold: y('Bold'), table: y('Insert table'), toggle: y('Fewer tools') };
    })()`);
    expect(ys.table !== null && ys.table > ys.bold + 10, JSON.stringify(ys));
    await b.shot('ins-toolbar-1040');
    await b.resize(390, 844);
    await b.sleep(1500);
    await b.shot('ins-390');
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await b.resize(1280, 900);
    await b.sleep(1200);
    await click('Text colour');
    await b.sleep(400);
    await b.shot('ins-grid-1280-dark');
    await b.press('Escape');
    await b.send('Emulation.setEmulatedMedia', { features: [] });
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
