// item-menus.mjs — Lea's step 3.2 feedback: the laptop sidebar's right-click
// menu is the same full menu as the grid's (Open, Rename…, Move to…,
// Favorites, Delete; lectures also Export PDF), and empty space in the
// course grid has a Finder-style menu (New folder, Upload document,
// Record, Sort by…), by right-click and, at 390 px, by
// long-press. Results checked in the database. Exit 1 on any FAIL.
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
    await b.shot(`fail-menus-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const SIDEBAR = '[data-testid=sidebar]';
const MAIN = { exclude: SIDEBAR };

/** The open menu's items, in order (their first line: a greyed-out item has its hint below). */
const menuItems = () =>
  b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].map((e) => e.innerText.trim().split('\\n')[0])`);
/** Clicks a menu item (buttons with the same text under the menu's overlay come first in the DOM). */
const clickItem = async (text) => {
  const p = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.trim() === ${JSON.stringify(text)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!p) throw new Error(`no menu item ${text}`);
  await b.clickAt(p.x, p.y);
};
const closeMenu = async () => {
  await b.press('Escape');
  await b.sleep(300);
};
/** Right-click (or hold) the sidebar row with this text. */
const sidebarRow = async (text, opts = {}) => {
  const p = await b.evaluate(`(() => {
    const el = [...document.querySelectorAll('${SIDEBAR} *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!p) throw new Error(`no sidebar row ${text}`);
  await b.clickAt(p.x, p.y, opts);
  await b.sleep(400);
};
/** A point of empty space in the course screen, below the tiles. */
const emptySpot = () =>
  b.evaluate(`(() => {
    const space = document.querySelector('[data-testid=library-space]').getBoundingClientRect();
    const grid = document.querySelector('[data-testid=library-grid]')?.getBoundingClientRect();
    const y = Math.min(space.bottom - 20, (grid ? grid.bottom : space.top) + 60);
    return { x: space.x + space.width / 2, y };
  })()`);
const spaceMenu = async (opts = { button: 'right' }) => {
  const p = await emptySpot();
  await b.clickAt(p.x, p.y, opts);
  await b.sleep(400);
  return menuItems();
};
const openCourse = async () => {
  await b.nav(`${BASE}/project/${data.course.id}`);
  await b.waitText('My library', { timeout: 20000 });
  await b.sleep(2500);
};
// Step 3.4: Cut / Copy, and the Summarize / Make exam pack placeholders (no Move out: these are at the top of the course).
const ITEM_MENU = {
  course: ['Open', 'Rename…', 'Add to Favorites', 'Make exam pack', 'Delete'],
  folder: ['Open', 'Rename…', 'Move to…', 'Cut', 'Copy', 'Add to Favorites', 'Make exam pack', 'Delete'],
  lecture: ['Open', 'Rename…', 'Move to…', 'Cut', 'Copy', 'Add to Favorites', 'Summarize', 'Export PDF', 'Delete'],
};

const user = await makeUser();
const data = await seed(user.client);
const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Sidebar: a course, a folder and a lecture show the full menu', async () => {
    await openCourse();
    await sidebarRow('Math', { button: 'right' });
    expect((await menuItems()).join('|') === ITEM_MENU.course.join('|'), `course: ${(await menuItems()).join('|')}`);
    await b.shot('sidebar-course-menu');
    await closeMenu();
    await sidebarRow('Funcions', { button: 'right' });
    expect((await menuItems()).join('|') === ITEM_MENU.folder.join('|'), `folder: ${(await menuItems()).join('|')}`);
    await closeMenu();
    await sidebarRow('Lecture 1', { button: 'right' });
    expect((await menuItems()).join('|') === ITEM_MENU.lecture.join('|'), `lecture: ${(await menuItems()).join('|')}`);
    await b.shot('sidebar-lecture-menu');
    await closeMenu();
  });

  await step('The grid shows the same menu (a folder renames in place there)', async () => {
    await b.click('Lecture 1', { button: 'right', ...MAIN });
    await b.sleep(400);
    expect((await menuItems()).join('|') === ITEM_MENU.lecture.join('|'), `grid lecture: ${(await menuItems()).join('|')}`);
    await closeMenu();
    await b.click('Funcions', { button: 'right', ...MAIN });
    await b.sleep(400);
    expect((await menuItems()).join('|') === ITEM_MENU.folder.join('|').replace('Rename…', 'Rename'), `grid folder: ${(await menuItems()).join('|')}`);
    await closeMenu();
  });

  await step('Sidebar: Rename… a folder through the prompt; the grid follows', async () => {
    await sidebarRow('Funcions', { button: 'right' });
    await b.click('Rename…', { exact: true });
    await b.waitText('Rename Folder', { timeout: 3000 });
    await b.fill('input[placeholder="Folder name"]', 'Funciones');
    await b.press('Enter');
    await b.waitText('Funciones', { exact: true, timeout: 5000, ...MAIN });
    const { data: f } = await admin.from('folders').select('name').eq('id', data.folder.id).single();
    expect(f.name === 'Funciones', f.name);
  });

  await step('Sidebar: Add to Favorites on a lecture', async () => {
    await sidebarRow('Lecture 1', { button: 'right' });
    await b.click('Add to Favorites', { exact: true });
    await b.sleep(1000);
    const { data: f } = await admin.from('files').select('starred_at').eq('id', data.lecture.id).single();
    expect(f.starred_at !== null, 'not starred');
    await sidebarRow('Lecture 1', { button: 'right' });
    expect((await menuItems()).includes('Remove from Favorites'), (await menuItems()).join('|'));
    await closeMenu();
  });

  await step('Sidebar: Delete a folder asks first, then trashes it; Undo restores', async () => {
    await sidebarRow('Funciones', { button: 'right' });
    await b.click('Delete', { exact: true });
    await b.waitText('Delete Folder', { timeout: 3000 });
    expect(await b.hasText('and all its contents will be moved to Recently Deleted', false), 'no confirmation text');
    await b.click('Delete', { exact: true });
    await b.sleep(1200);
    const { data: gone } = await admin.from('folders').select('deleted_at').eq('id', data.folder.id).single();
    expect(gone.deleted_at !== null, 'not trashed');
    expect(!(await b.hasText('Funciones', true)), 'still shown');
    await b.click('UNDO');
    await b.sleep(1500);
    const { data: back } = await admin.from('folders').select('deleted_at').eq('id', data.folder.id).single();
    expect(back.deleted_at === null, 'undo did not restore');
    await b.waitText('Funciones', { exact: true, timeout: 5000, ...MAIN });
  });

  await step('Empty space: right-click opens New folder · Upload · Record · Sort by…', async () => {
    const items = await spaceMenu();
    expect(items.join('|') === 'New folder|New document|Record|Upload document|Paste|Sort by…', items.join('|'));
    await b.shot('space-menu-1280');
    await closeMenu();
  });

  await step('Right-clicking a tile shows the tile menu, not the empty-space menu', async () => {
    await b.click('Lecture 1', { button: 'right', ...MAIN });
    await b.sleep(400);
    const items = await menuItems();
    expect(items[0] === 'Open' && !items.includes('Sort by…'), items.join('|'));
    await closeMenu();
  });

  await step('Empty space → New folder starts the name on a tile', async () => {
    await spaceMenu();
    await clickItem('New folder');
    await b.sleep(500);
    expect(await b.evaluate(`!!document.querySelector('[data-testid=inline-name]')`), 'no inline name');
    await b.type('Tema 2');
    await b.press('Enter');
    await b.waitText('Tema 2', { exact: true, timeout: 5000, ...MAIN });
    const { data: rows } = await admin.from('folders').select('id').eq('user_id', user.id).eq('name', 'Tema 2');
    expect(rows.length === 1, JSON.stringify(rows));
  });

  await step('Empty space → Sort by… → Name changes the order and the Sort button', async () => {
    await spaceMenu();
    await b.click('Sort by…', { exact: true });
    await b.sleep(400);
    expect((await menuItems()).includes('✓ Kind'), (await menuItems()).join('|'));
    await b.click('Name', { exact: true });
    await b.sleep(600);
    const label = await b.evaluate(`document.querySelector('[aria-label^="Sort by"]')?.getAttribute('aria-label')`);
    expect(label === 'Sort by Name', label);
    await spaceMenu();
    await b.click('Sort by…', { exact: true });
    await b.sleep(400);
    expect((await menuItems()).includes('✓ Name'), (await menuItems()).join('|'));
    await b.click('Kind', { exact: true });
    await b.sleep(400);
  });

  await step('Empty space → Record opens the recording setup for this course', async () => {
    await spaceMenu();
    await clickItem('Record');
    await b.sleep(1200);
    const at = await b.evaluate('location.pathname + location.search');
    expect(at.startsWith(`/record?projectId=${data.course.id}`), at);
  });

  await step('390: a long-press on empty space opens the same menu', async () => {
    await b.resize(390, 844);
    await openCourse();
    const items = await spaceMenu({ holdMs: 800 });
    expect(items.includes('New folder') && items.includes('Sort by…'), items.join('|'));
    await b.shot('space-menu-390');
    await closeMenu();
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
