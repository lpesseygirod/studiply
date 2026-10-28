// inserting.mjs — step 4.5, checkpoint A, on the laptop:
//   - the colour picker: the grid (10 colours × 6), a shade, More colours…
//     with a hex, None; picked colours in Recent colours and in the account's
//     preferences, and a colour picked on "another device" (service role)
//     showing in Recent after a reload;
//   - links: ⌘K, an address completed (uned.es → https://), the bubble
//     (Open · Edit · Remove), an unsafe address refused;
//   - tables: the size grid, the Table menu (rows, columns, header row, cell
//     colour, delete); the iPhone bundle reads the same table unchanged;
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
    await b.click('Apply');
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

  await step('tables: the size grid, rows, columns, header row, cell colour, delete', async () => {
    await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tabla:' }] }] }); e.commands.focus('end'); })()`);
    await click('Insert table');
    await click('Table 3 by 3');
    expect(JSON.stringify(await tableSize()) === '[3,3]', `size ${await tableSize()}`);
    await click('Table menu');
    await b.click('Insert row below');
    await click('Table menu');
    await b.click('Insert column right');
    expect(JSON.stringify(await tableSize()) === '[4,4]', `size ${await tableSize()}`);
    await click('Table menu');
    await b.click('Header row');
    expect((await table()).content[0].content.every((c) => c.type === 'tableHeader'), 'no header row');
    await click('Table menu');
    await b.click('Cell colour…');
    await click('Cell colour Blue lighter 80 %');
    const cells = (await table()).content.flatMap((r) => r.content);
    expect(cells.some((c) => /^#[0-9A-F]{6}$/.test(c.attrs.backgroundColor ?? '')), 'no cell colour');
    await b.sleep(400);
    await b.shot('ins-table-1280');
  });

  await step('the iPhone bundle reads the same table unchanged', async () => {
    const doc = await json();
    await b.nav(IPHONE);
    await waitEditor();
    const strip = (d) => JSON.parse(JSON.stringify(d, (k, v) => (k === 'blockId' || k === 'editedAt' ? undefined : v)));
    const back = await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent(${JSON.stringify(doc)}); return e.getJSON(); })()`);
    expect(JSON.stringify(strip(back)) === JSON.stringify(strip(doc)), 'the iPhone bundle changed the table');
    await openDoc();
    await click('Table menu');
    await b.click('Delete table');
    expect(!(await table()), 'table not deleted');
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
