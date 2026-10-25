// dnd-spike.mjs — the step 3.1 drag-and-drop spike (Settings → General →
// DEVELOPMENT → Drag-and-drop spike): Option A (gesture) with a real mouse
// drag, Option B (the browser's drag) through Chrome's drag interception,
// a file dropped "from Finder", the folder-into-itself rule, Undo, and that
// click and right-click still work. Screenshots mid-drag. Exit 1 on FAIL.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, SHOTS } from './cdp.mjs';
import { makeUser, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-dnd-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const center = (testId) =>
  b.evaluate(`(() => { const r = document.querySelector('[data-testid=${testId}]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const textOf = (testId) => b.evaluate(`document.querySelector('[data-testid=${testId}]')?.innerText ?? ''`);
const bgOf = (testId) => b.evaluate(`getComputedStyle(document.querySelector('[data-testid=${testId}]')).backgroundColor`);
const log = () => textOf('spike-log');
const ACCENT_LIGHT = 'rgb(234, 232, 247)'; // the hovered folder (light appearance)

const user = await makeUser();
const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in, open the spike from Settings → General → DEVELOPMENT', async () => {
    await b.signIn(BASE, user.email, user.password);
    await b.nav(`${BASE}/settings/general`);
    await b.waitText('Drag-and-drop spike', { timeout: 20000 });
    await b.sleep(2500);
    await b.click('Drag-and-drop spike', { exact: true });
    await b.waitText('Option A · gesture', { timeout: 10000 });
    await b.sleep(800);
  });

  await step('A: drag File 1 onto Folder B (dashed highlight while hovering)', async () => {
    let highlighted = false;
    await b.mouseDrag(await center('tile-f1'), await center('tile-B'), {
      midway: async (i) => {
        if (i === 12) {
          highlighted = (await bgOf('tile-B')) === ACCENT_LIGHT;
          await b.shot('dnd-A-hover');
        }
      },
    });
    expect(highlighted, 'Folder B was not highlighted under the pointer');
    expect((await log()).includes("Moved 'File 1' into 'Folder B'"), await log());
    expect((await textOf('tile-f1')).includes('in Folder B'), await textOf('tile-f1'));
  });

  await step('A: Undo puts File 1 back', async () => {
    await b.click('UNDO');
    await b.sleep(600);
    expect((await textOf('tile-f1')).includes('in top level'), await textOf('tile-f1'));
  });

  await step('A: a folder can’t go into its own subfolder (refused, nothing moves)', async () => {
    let refused = false;
    await b.mouseDrag(await center('tile-A'), await center('tile-C'), {
      midway: async (i) => {
        if (i === 12) refused = await b.hasText("Can't move a folder into one of its own folders");
      },
    });
    expect(refused, 'no refusal shown while hovering');
    expect((await textOf('tile-A')).includes('in top level'), await textOf('tile-A'));
  });

  await step('A: a click opens, a right-click shows the menu, nothing moves', async () => {
    const p = await center('tile-f2');
    await b.clickAt(p.x, p.y);
    expect((await log()).startsWith("Opened 'File 2'"), await log());
    await b.clickAt(p.x, p.y, { button: 'right' });
    await b.waitText('Open', { exact: true, timeout: 3000 });
    await b.press('Escape');
    expect((await textOf('tile-f2')).includes('in top level'), 'File 2 moved');
  });

  await step('A: drag File 5 onto Trash', async () => {
    await b.mouseDrag(await center('tile-f5'), await center('zone-trash'));
    expect((await log()).includes("Moved 'File 5' to Trash"), await log());
    expect(!(await b.evaluate(`!!document.querySelector('[data-testid=tile-f5]')`)), 'File 5 still shown');
  });

  await step('B: the browser drags File 2 into Folder A', async () => {
    await b.click('Option B · browser drag', { exact: true });
    await b.sleep(600);
    await b.htmlDrag(await center('tile-f2'), await center('tile-A'), {
      midway: async () => b.shot('dnd-B-hover'),
    });
    expect((await log()).includes("Moved 'File 2' into 'Folder A'"), await log());
    expect((await textOf('tile-f2')).includes('in Folder A'), await textOf('tile-f2'));
  });

  await step('B: a folder can’t go into its own subfolder', async () => {
    await b.htmlDrag(await center('tile-A'), await center('tile-C'));
    expect((await textOf('tile-A')).includes('in top level'), await textOf('tile-A'));
  });

  await step('B: a PDF dragged from the computer onto Folder B is received', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'studiply-dnd-'));
    const file = join(dir, 'Tema1.pdf');
    writeFileSync(file, '%PDF-1.4\n%%EOF\n');
    await b.htmlDrag(null, await center('tile-B'), { files: [file] });
    expect((await log()).includes("Dropped from the computer: Tema1.pdf into 'Folder B'"), await log());
  });

  await step('B: a click opens, a right-click shows the menu', async () => {
    const p = await center('tile-f3');
    await b.clickAt(p.x, p.y);
    expect((await log()).startsWith("Opened 'File 3'"), await log());
    await b.clickAt(p.x, p.y, { button: 'right' });
    await b.waitText('Open', { exact: true, timeout: 3000 });
    await b.press('Escape');
    await b.shot('dnd-B-done');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
