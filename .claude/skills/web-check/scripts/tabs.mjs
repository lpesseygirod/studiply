// tabs.mjs — tabs in every document (step 4.7b), on the laptop (1280) and
// at a phone's width (390, the app's iPhone layout in the browser):
//   - a plain document starts with one tab and only "+ Add tab"; + adds
//     "Tab 2" and asks its name; the new tab is open and has its own text;
//   - rename from the right-click menu and by double-clicking the open tab;
//   - drag a tab to the front;
//   - delete, then Undo;
//   - a lecture: My notes · Summary · Transcript first and fixed (no menu,
//     an added tab can't move before them);
//   - the tab row never selects text (a double-click or a drag);
//   - a reload keeps names and order (the rows in the database too);
//   - at 390: the row scrolls sideways and no tab sits under "+";
//     long-press → Move left, Delete + Undo;
//   - screenshots of the tab row at 1280 and 390, light and dark (tabs-*.png).
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps (several: separated by |).
import { launch } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

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
    await b.shot(`fail-tabs-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const EDITOR = 'window.studiplyEditor';

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
const data = await seed(user.client);
const lectureId = data.lecture.id;
const { data: plain } = await user.client.from('files').insert({ kind: 'document', title: 'Apuntes con pestañas' }).select().single();
await user.client.from('documents').insert({ file_id: plain.id, tab: 'notes', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Primera pestaña' }] }] } });
b = await launch();

/** The tab row as shown: each tab's name, and which one is open. */
const shownTabs = () => b.evaluate(`[...document.querySelectorAll('[role="tab"]')].filter((e) => e.offsetParent !== null).map((e) => e.getAttribute('aria-label'))`);
const openTab = () => b.evaluate(`[...document.querySelectorAll('[role="tab"]')].find((e) => e.getAttribute('aria-selected') === 'true')?.getAttribute('aria-label') ?? null`);
const tabPoint = (name) =>
  b.evaluate(`(() => { const e = [...document.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute('aria-label') === ${JSON.stringify(name)} && t.offsetParent !== null); if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left }; })()`);
/** Text the page has selected (the tab row must never select its names). */
const selectedText = () => b.evaluate(`window.getSelection()?.toString() ?? ''`);
/**
 * Selected text inside the tab row. Chrome's getSelection() also returns the
 * text selected in a focused field, such as the name prompt, which selects its
 * name on purpose; that one isn't the row's.
 */
const rowSelection = () =>
  b.evaluate(`(() => {
    const s = window.getSelection();
    const row = document.querySelector('[role="tablist"]');
    if (!s || !s.rangeCount || s.isCollapsed || !row) return '';
    return s.getRangeAt(0).intersectsNode(row) ? s.toString() : '';
  })()`);
const clickTab = async (name, options = {}) => {
  const at = await tabPoint(name);
  expect(at, `no tab "${name}"`);
  await b.clickAt(at.x, at.y, options);
  await b.sleep(300);
};
/**
 * Two quick clicks (a double-click), without the driver's pause between them.
 * Returns the text selected right after the second press: that is when a
 * browser selects the word, and before the rename prompt takes the focus.
 */
const doubleClickTab = async (name) => {
  const at = await tabPoint(name);
  expect(at, `no tab "${name}"`);
  let onSecondPress = '';
  for (let i = 0; i < 2; i++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: i + 1, buttons: 1 });
    if (i === 1) onSecondPress = await selectedText();
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: i + 1 });
    await b.sleep(80);
  }
  await b.sleep(400);
  return onSecondPress;
};
const PROMPT = 'input[placeholder="Tab name"]';
const answerPrompt = async (name) => {
  await waitFor(() => b.evaluate(`!!document.querySelector('${PROMPT}')`), 'the name prompt');
  if (name !== null) await b.fill(PROMPT, name);
  await b.click('Save', { exact: true });
  await b.sleep(600);
};
const rows = async (fileId) =>
  (await admin.from('documents').select('tab, title, position, deleted_at').eq('file_id', fileId)).data ?? [];
const openDoc = async (id) => {
  await b.nav(`${BASE}/doc/${id}`);
  await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom`), 'the editor', 30000);
  await b.sleep(2500);
};
const scheme = (value) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });

try {
  await b.signIn(BASE, user.email, user.password);

  await step('1280: a plain document has one tab and only "+ Add tab"; + adds "Tab 2", asks its name, opens it with its own text', async () => {
    await openDoc(plain.id);
    expect((await shownTabs()).length === 0, `tabs shown: ${await shownTabs()}`);
    expect(await b.evaluate(`!!document.querySelector('[aria-label="Add tab"]')`), 'no Add tab');
    await b.shot('tabs-one-1280');
    await b.clickSelector('[aria-label="Add tab"]');
    // The name is ready to type over; Save with "Semana 3".
    expect((await waitFor(() => b.evaluate(`document.querySelector('${PROMPT}')?.value`), 'prompt value')) === 'Tab 2', 'not "Tab 2"');
    await answerPrompt('Semana 3');
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['Tab 1', 'Semana 3']), JSON.stringify(await shownTabs()));
    expect((await openTab()) === 'Semana 3', `open: ${await openTab()}`);
    await waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom`), 'the new tab’s editor');
    await b.sleep(1500);
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    await b.type('Ejercicios de la semana');
    await waitFor(async () => {
      const r = (await admin.from('documents').select('tab, title, content').eq('file_id', plain.id)).data ?? [];
      const added = r.find((x) => x.title === 'Semana 3');
      return added && /^t-[0-9a-f-]{36}$/.test(added.tab) && JSON.stringify(added.content).includes('Ejercicios de la semana');
    }, 'the new tab saved with its text');
    // Tab 1 kept its own text.
    await clickTab('Tab 1');
    await waitFor(async () => (await b.evaluate(`document.querySelector('.ProseMirror')?.innerText ?? ''`)).includes('Primera pestaña'), 'Tab 1’s text');
  });

  await step('1280: rename from the right-click menu, and by double-clicking the open tab; no text gets selected', async () => {
    await clickTab('Semana 3', { button: 'right' });
    await b.click('Rename', { exact: true });
    await answerPrompt('Semana tres');
    await waitFor(async () => (await rows(plain.id)).some((r) => r.title === 'Semana tres'), 'renamed in the database');
    await clickTab('Semana tres');
    const onPress = await doubleClickTab('Semana tres');
    const asked = await b.evaluate(`!!document.querySelector('${PROMPT}')`);
    const inRow = await rowSelection();
    // Close the prompt before judging, so a failure here doesn't leave it over the next steps.
    if (asked) await b.click('Cancel', { exact: true });
    expect(onPress === '', `the double-click selected "${onPress}"`);
    expect(asked, 'a second click did not ask for a name');
    expect(inRow === '', `the double-click left "${inRow}" selected in the tab row`);
  });

  await step('1280: drag a tab to the front; only its own place changes; no text gets selected', async () => {
    await b.clickSelector('[aria-label="Add tab"]');
    await answerPrompt(null);
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['Tab 1', 'Semana tres', 'Tab 3']), JSON.stringify(await shownTabs()));
    const before = await rows(plain.id);
    const from = await tabPoint('Tab 3');
    const to = await tabPoint('Tab 1');
    await b.mouseDrag({ x: from.x, y: from.y }, { x: to.left + 4, y: to.y });
    await waitFor(async () => JSON.stringify(await shownTabs()) === JSON.stringify(['Tab 3', 'Tab 1', 'Semana tres']), `order after the drag: ${await shownTabs()}`);
    expect((await selectedText()) === '', `the drag selected "${await selectedText()}"`);
    const after = await rows(plain.id);
    const changed = after.filter((r) => before.find((x) => x.tab === r.tab)?.position !== r.position).map((r) => r.title);
    expect(JSON.stringify(changed) === JSON.stringify(['Tab 3']), `positions changed: ${changed}`);
  });

  await step('1280: delete, then Undo', async () => {
    await clickTab('Semana tres', { button: 'right' });
    await b.click('Delete', { exact: true });
    await waitFor(async () => !(await shownTabs()).includes('Semana tres'), 'the tab gone');
    expect((await rows(plain.id)).find((r) => r.title === 'Semana tres')?.deleted_at, 'not deleted in the database');
    await b.waitText('Deleted "Semana tres"');
    await b.shot('tabs-deleted-1280');
    await b.click('UNDO', { exact: true });
    await waitFor(async () => (await shownTabs()).includes('Semana tres'), 'the tab back');
    expect(!(await rows(plain.id)).find((r) => r.title === 'Semana tres')?.deleted_at, 'still deleted in the database');
  });

  await step('1280: a lecture: My notes · Summary · Transcript first and fixed; an added tab stays after them; no text gets selected', async () => {
    await openDoc(lectureId);
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['My notes', 'Summary', 'Transcript']), JSON.stringify(await shownTabs()));
    await clickTab('Summary', { button: 'right' });
    expect(!(await b.hasText('Rename', true)), 'a fixed tab has a menu');
    await b.press('Escape');
    await b.clickSelector('[aria-label="Add tab"]');
    await answerPrompt('Ejercicios');
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['My notes', 'Summary', 'Transcript', 'Ejercicios']), JSON.stringify(await shownTabs()));
    const from = await tabPoint('Ejercicios');
    const to = await tabPoint('My notes');
    await b.mouseDrag({ x: from.x, y: from.y }, { x: to.left + 4, y: to.y });
    await b.sleep(600);
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['My notes', 'Summary', 'Transcript', 'Ejercicios']), `after a drag to the front: ${await shownTabs()}`);
    expect((await selectedText()) === '', `the drag selected "${await selectedText()}"`);
    await b.shot('tabs-lecture-1280');
  });

  await step('a reload keeps the names and the order', async () => {
    await openDoc(plain.id);
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['Tab 3', 'Tab 1', 'Semana tres']), JSON.stringify(await shownTabs()));
    await openDoc(lectureId);
    expect(JSON.stringify(await shownTabs()) === JSON.stringify(['My notes', 'Summary', 'Transcript', 'Ejercicios']), JSON.stringify(await shownTabs()));
  });

  await step('screenshots of the tab row at 1280, light and dark', async () => {
    await openDoc(plain.id);
    await b.shot('tabs-1280-light');
    await scheme('dark');
    await b.sleep(800);
    await b.shot('tabs-1280-dark');
    await scheme('light');
  });

  await step('390: the row scrolls sideways and no tab sits under "+"; long-press → Move left; Delete and Undo', async () => {
    await b.resize(390, 844);
    await openDoc(plain.id);
    // Enough tabs to scroll.
    for (const name of ['Tema 4', 'Tema 5', 'Repaso final']) {
      await b.clickSelector('[aria-label="Add tab"]');
      await answerPrompt(name);
    }
    await openDoc(plain.id);
    const scrolls = await b.evaluate(`(() => { let e = document.querySelector('[role="tablist"]'); while (e && e !== document.body) { if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') return true; e = e.parentElement; } return false; })()`);
    expect(scrolls, 'the row does not scroll sideways');
    expect(await b.evaluate(`document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1`), 'the page scrolls sideways');
    // Scrolled to its end, the last tab ends before "+" (the scrolling part stops where "+" starts).
    const overlap = await b.evaluate(`(() => {
      let e = document.querySelector('[role="tablist"]');
      while (e && e !== document.body && !(e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible')) e = e.parentElement;
      if (e) e.scrollLeft = e.scrollWidth;
      const tabs = [...document.querySelectorAll('[role="tab"]')].filter((t) => t.offsetParent !== null);
      const last = tabs[tabs.length - 1].getBoundingClientRect();
      const add = document.querySelector('[aria-label="Add tab"]').getBoundingClientRect();
      const scroller = e ? e.getBoundingClientRect() : null;
      return { lastRight: last.right, addLeft: add.left, scrollerRight: scroller?.right ?? null };
    })()`);
    expect(overlap.lastRight <= overlap.addLeft + 1 && (overlap.scrollerRight === null || overlap.scrollerRight <= overlap.addLeft + 1), `a tab sits under "+": ${JSON.stringify(overlap)}`);
    await b.shot('tabs-390-light');
    await scheme('dark');
    await b.sleep(800);
    await b.shot('tabs-390-dark');
    await scheme('light');
    await b.sleep(400);
    await clickTab('Tab 1', { holdMs: 700 });
    await b.waitText('Move left', { exact: true });
    expect(await b.hasText('Move right', true), 'no Move right');
    await b.shot('tabs-390-sheet');
    await b.click('Move left', { exact: true });
    await waitFor(async () => (await shownTabs()).slice(0, 2).join() === 'Tab 1,Tab 3', `after Move left: ${await shownTabs()}`);
    await clickTab('Repaso final', { holdMs: 700 });
    await b.click('Delete', { exact: true });
    await waitFor(async () => !(await shownTabs()).includes('Repaso final'), 'deleted at 390');
    await b.click('UNDO', { exact: true });
    await waitFor(async () => (await shownTabs()).includes('Repaso final'), 'back at 390');
    await b.resize(1280, 900);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
