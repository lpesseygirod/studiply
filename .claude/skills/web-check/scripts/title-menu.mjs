// title-menu.mjs — Lea's step 3.3 feedback: the title at the top of a
// course or folder (with ⌄) opens the menu of the course or folder you're
// in: Rename…, Move to… (folders), Add to / Remove from Favorites, Delete.
// A click (or a tap at 390 px) or a right-click opens it; after Delete the
// screen goes up one level. Results checked in the database. Exit 1 on any FAIL.
//
// Step 7.9: the menu also has Merge lectures… and Make exam pack… (the lecture picker). A failed step
// closes any menu it left open, so it can't fail the next ones.
import { launch, SHOTS } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-title-${results.length}`).catch(() => {});
    // A menu, dialog or picker left open would answer every later step.
    await b.press('Escape').catch(() => {});
    await b.press('Escape').catch(() => {});
    await b.sleep(300);
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const COURSE_MENU = 'Rename…|Add to Favorites|Merge lectures…|Make exam pack…|Delete';
const FOLDER_MENU = 'Rename…|Move to…|Add to Favorites|Merge lectures…|Make exam pack…|Delete';

const menuItems = () => b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].map((e) => e.innerText.trim().split('\\n')[0])`);
const sheetHas = (text) => b.hasText(text, true);
const title = () => b.evaluate(`document.querySelector('[data-testid=crumb-current]')?.innerText ?? ''`);
const at = () => b.evaluate('location.pathname + location.search');
const open = async (folderId, name) => {
  await b.nav(`${BASE}/project/${data.course.id}${folderId ? `?folder=${folderId}` : ''}`);
  await b.waitText(name, { timeout: 20000 });
  await b.sleep(2500);
};
const clickTitle = async (opts = {}) => {
  await b.clickSelector('[data-testid=crumb-title]').catch(() => {});
  if (opts.button === 'right') {
    const p = await b.evaluate(`(() => { const r = document.querySelector('[data-testid=crumb-title]').getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
    await b.press('Escape');
    await b.clickAt(p.x, p.y, { button: 'right' });
  }
  await b.sleep(600);
};
const until = async (fn, msg, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await fn()) === true) return;
    await b.sleep(250);
  }
  throw new Error(msg);
};
const folderRow = async (id) => (await admin.from('folders').select('name, course_id, parent_id, deleted_at').eq('id', id).single()).data;

const user = await makeUser();
const data = await seed(user.client);
const sub = (await admin.from('folders').insert({ user_id: user.id, course_id: data.course.id, parent_id: data.folder.id, name: 'Apuntes' }).select().single()).data;
const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('A course title has ⌄ and opens its menu: Rename…, Favorites, Merge lectures…, Make exam pack…, Delete (no Open, no Move to…)', async () => {
    await open(null, 'Funcions');
    expect(await b.evaluate(`!!document.querySelector('[data-testid=crumb-title] [data-testid=crumb-current]')`), 'no title button');
    expect((await b.evaluate(`document.querySelector('[data-testid=crumb-title]').getAttribute('aria-label')`)) === 'Math, course menu', 'label');
    await clickTitle();
    const items = await menuItems();
    expect(items.join('|') === COURSE_MENU, items.join('|'));
    await b.shot('title-menu-course');
    await b.press('Escape');
  });

  await step('Make exam pack… from the title: the lecture picker for the course (7.9)', async () => {
    await clickTitle();
    await b.click('Make exam pack…', { exact: true });
    await until(() => b.evaluate(`!!document.querySelector('[data-picker="panel"][data-mode="exam_pack"]')`), 'no lecture picker');
    // Lecture 1 has no summary: listed, not chosen, and Continue waits.
    expect((await b.evaluate(`[...document.querySelectorAll('[data-picker="lecture"]')].map((e) => e.getAttribute('data-checked'))`)).join() === 'false', 'Lecture 1 chosen without a summary');
    await b.clickSelector('[data-picker="cancel"]');
    await until(() => b.evaluate(`!document.querySelector('[data-picker="panel"]')`), 'the picker did not close');
  });

  await step('A folder title: Rename…, Move to…, Favorites, Merge lectures…, Make exam pack…, Delete; a right-click opens it too', async () => {
    await open(data.folder.id, 'Apuntes');
    await clickTitle();
    expect((await menuItems()).join('|') === FOLDER_MENU, (await menuItems()).join('|'));
    await b.press('Escape');
    await clickTitle({ button: 'right' });
    expect((await menuItems()).join('|') === FOLDER_MENU, `right-click: ${(await menuItems()).join('|')}`);
    await b.shot('title-menu-folder');
    await b.press('Escape');
  });

  await step('Rename… the folder you are in: a dialog, and the title follows', async () => {
    await clickTitle();
    await b.click('Rename…', { exact: true });
    await b.waitText('Rename Folder', { timeout: 3000 });
    await b.fill('input[placeholder="Folder name"]', 'Funciones');
    await b.press('Enter');
    await until(async () => (await folderRow(data.folder.id)).name === 'Funciones', 'not renamed in the database');
    await until(async () => (await title()) === 'Funciones', `the title still says ${await title()}`);
  });

  await step('Add to Favorites from the title', async () => {
    await clickTitle();
    await b.click('Add to Favorites', { exact: true });
    await until(async () => !!(await admin.from('folders').select('starred_at').eq('id', data.folder.id).single()).data.starred_at, 'not starred');
    await clickTitle();
    expect((await menuItems()).includes('Remove from Favorites'), (await menuItems()).join('|'));
    await b.press('Escape');
  });

  await step('Delete the folder you are in: it goes to the trash and the screen goes up one level; Undo', async () => {
    await open(sub.id, 'Apuntes');
    await clickTitle();
    await b.click('Delete', { exact: true });
    await b.waitText('Delete Folder', { timeout: 3000 });
    await b.click('Delete', { exact: true });
    await until(async () => !!(await folderRow(sub.id)).deleted_at, 'not trashed');
    await until(async () => (await at()) === `/project/${data.course.id}?folder=${data.folder.id}`, `not one level up: ${await at()}`);
    expect((await title()) === 'Funciones', `title ${await title()}`);
    await b.click('UNDO');
    await until(async () => !(await folderRow(sub.id)).deleted_at, 'Undo did not restore it');
  });

  await step('Move to… the folder you are in (another course): the screen follows it', async () => {
    await open(data.folder.id, 'Apuntes');
    await clickTitle();
    await b.click('Move to…', { exact: true });
    await b.waitText('Move ‘Funciones’ to…', { timeout: 3000 });
    await b.click('Science', { exact: true, exclude: '[data-testid=sidebar]' });
    await b.sleep(800);
    await b.click('Move to Science', { exact: true });
    await until(async () => (await folderRow(data.folder.id)).course_id === data.science.id, 'not moved');
    await until(async () => (await at()) === `/project/${data.science.id}?folder=${data.folder.id}`, `did not follow: ${await at()}`);
    await b.waitText('Science', { exact: true, timeout: 5000 });
  });

  await step('Delete the course you are in: back to the Library; Undo', async () => {
    await b.nav(`${BASE}/project/${data.course.id}`);
    await b.waitText('Lecture 1', { timeout: 20000 });
    await b.sleep(2000);
    await clickTitle();
    await b.click('Delete', { exact: true });
    await b.waitText('Delete Course', { timeout: 3000 });
    await b.click('Delete', { exact: true });
    await until(async () => (await at()).startsWith('/library'), `not back in the Library: ${await at()}`);
    await until(async () => !!(await admin.from('courses').select('deleted_at').eq('id', data.course.id).single()).data.deleted_at, 'course not trashed');
    await b.click('UNDO');
    await until(async () => !(await admin.from('courses').select('deleted_at').eq('id', data.course.id).single()).data.deleted_at, 'Undo did not restore it');
  });

  await step('390: tapping the title opens the same menu', async () => {
    await b.resize(390, 844);
    await b.nav(`${BASE}/project/${data.science.id}?folder=${data.folder.id}`);
    await b.waitText('Apuntes', { timeout: 20000 });
    await b.sleep(2500);
    await clickTitle();
    for (const item of ['Rename…', 'Move to…', 'Remove from Favorites', 'Merge lectures…', 'Make exam pack…', 'Delete']) expect(await sheetHas(item), `no ${item}`);
    await b.shot('title-menu-390');
    await b.press('Escape');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
