// library-grid.mjs — step 3.2, the Finder-style course screen: New folder
// named in place (Enter saves, Esc cancels, clicking elsewhere saves), a
// click selects and a double-click or Enter opens, nested folders and the
// breadcrumb, Rename in place from the right-click menu, Sort, and at 390 px
// the grid/list toggle remembered after a reload and the long-press menu.
// Results are checked in the database. Exit 1 on any FAIL.
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
    await b.shot(`fail-grid-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };

const search = () => b.evaluate('location.search');
const folderNamed = async (name) =>
  (await admin.from('folders').select('id, parent_id, name').eq('user_id', user.id).eq('name', name).is('deleted_at', null)).data;
const inlineField = () =>
  b.evaluate(`(() => {
    const el = document.querySelector('[data-testid=inline-name]');
    if (!el) return null;
    return { value: el.value, focused: document.activeElement === el, start: el.selectionStart, end: el.selectionEnd };
  })()`);
/** The tiles' names in the order shown (a tile's label is "name, meta"). */
const order = () =>
  b.evaluate(`[...document.querySelectorAll('[data-testid^=entry-]')].map((e) => { const l = e.getAttribute('aria-label') ?? ''; return l.slice(0, l.lastIndexOf(', ')); })`);
/** New folder from the empty-space menu (step 3.4 removed the course toolbar). */
const newFolder = async () => {
  const p = await b.evaluate(`(() => {
    const g = document.querySelector('[data-testid=library-grid]')?.getBoundingClientRect();
    if (g) return { x: g.x + g.width / 2, y: g.bottom + 30 };
    const s = document.querySelector('[data-testid=library-space]').getBoundingClientRect();
    return { x: s.x + s.width / 2, y: s.y + 40 };
  })()`);
  await b.clickAt(p.x, p.y, { button: 'right' });
  await b.sleep(400);
  const item = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.trim().split('\\n')[0] === 'New folder'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!item) throw new Error('no New folder in the empty-space menu');
  await b.clickAt(item.x, item.y);
};
const openCourse = async () => {
  await b.nav(`${BASE}/project/${data.course.id}`);
  await b.waitText('My library', { timeout: 20000 });
  await b.sleep(2500);
};

const user = await makeUser();
const data = await seed(user.client);
// A PDF last edited long ago, so Kind, Name and Date edited all give different orders.
await admin.from('files').insert({
  user_id: user.id, kind: 'pdf', title: 'A notes.pdf', course_id: data.course.id,
  created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z',
});
const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('New folder starts as "Untitled folder", focused and selected; typing + Enter creates it', async () => {
    await openCourse();
    await newFolder();
    await b.sleep(400);
    const field = await inlineField();
    expect(field && field.value === 'Untitled folder' && field.focused, JSON.stringify(field));
    expect(field.start === 0 && field.end === 'Untitled folder'.length, `selection ${field.start}-${field.end}`);
    await b.type('Tema 1');
    await b.press('Enter');
    await b.waitText('Tema 1', { exact: true, ...MAIN, timeout: 5000 });
    const rows = await folderNamed('Tema 1');
    expect(rows?.length === 1 && rows[0].parent_id === null, JSON.stringify(rows));
    await b.shot('grid-created');
  });

  await step('Esc cancels a new folder: nothing is created', async () => {
    await newFolder();
    await b.sleep(300);
    await b.type('Nope');
    await b.press('Escape');
    await b.sleep(600);
    expect(!(await inlineField()), 'the field is still open');
    expect(!(await b.hasText('Nope', true)), 'a tile was left');
    expect((await folderNamed('Nope'))?.length === 0 && (await folderNamed('Untitled folder'))?.length === 0, 'a folder was created');
  });

  await step('Clicking elsewhere saves the name (as in Finder)', async () => {
    await newFolder();
    await b.sleep(300);
    await b.type('Resums');
    await b.clickAt(700, 700); // the empty gradient below the grid
    await b.waitText('Resums', { exact: true, ...MAIN, timeout: 5000 });
    expect((await folderNamed('Resums'))?.length === 1, 'not saved');
  });

  await step('Sort: Kind, Name and Date edited each change the order on screen (folders first)', async () => {
    const choose = async (label) => {
      await b.click('Sort', { exact: false, ...MAIN });
      await b.click(label, { exact: true });
      await b.sleep(600);
      return (await order()).join('|');
    };
    const byName = await choose('Name');
    expect(byName === 'Funcions|Resums|Tema 1|A notes.pdf|Lecture 1', `name: ${byName}`);
    const byDate = await choose('Date edited');
    expect(byDate === 'Resums|Tema 1|Funcions|Lecture 1|A notes.pdf', `date: ${byDate}`);
    const byKind = await choose('Kind');
    expect(byKind === 'Funcions|Resums|Tema 1|Lecture 1|A notes.pdf', `kind: ${byKind}`);
    expect(new Set([byName, byDate, byKind]).size === 3, 'two sorts gave the same order');
    expect((await b.evaluate(`document.body.innerText`)).includes('Sort\nKind') || (await b.hasText('Kind', true)), 'the Sort button does not show the choice');
  });

  await step('A click selects without opening; a double-click opens the folder', async () => {
    await b.click('Tema 1', { exact: true, ...MAIN });
    await b.sleep(400);
    expect(!(await search()).includes('folder='), `opened on a single click: ${await search()}`);
    const selected = await b.evaluate(`document.querySelector('[data-testid^=entry-selected-]')?.innerText ?? ''`);
    expect(selected.includes('Tema 1'), `selected: ${selected}`);
    await b.doubleClick('Tema 1', { exact: true, ...MAIN });
    await b.sleep(1200);
    const tema = (await folderNamed('Tema 1'))[0];
    expect((await search()).includes(`folder=${tema.id}`), await search());
    expect((await b.evaluate(`document.querySelector('[data-testid=crumb-current]')?.innerText`)) === 'Tema 1', 'breadcrumb');
  });

  await step('A nested folder inside it; the breadcrumb goes back to the course', async () => {
    await newFolder();
    await b.sleep(300);
    await b.type('Apuntes');
    await b.press('Enter');
    await b.waitText('Apuntes', { exact: true, ...MAIN, timeout: 5000 });
    const tema = (await folderNamed('Tema 1'))[0];
    const apuntes = await folderNamed('Apuntes');
    expect(apuntes?.length === 1 && apuntes[0].parent_id === tema.id, JSON.stringify(apuntes));
    await b.shot('grid-nested');
    await b.click('Math', { exact: true, ...MAIN });
    await b.sleep(1200);
    expect(!(await search()).includes('folder='), await search());
    await b.waitText('Resums', { exact: true, ...MAIN });
  });

  await step('Enter opens the selected tile', async () => {
    await b.click('Resums', { exact: true, ...MAIN });
    await b.press('Enter');
    await b.sleep(1200);
    const resums = (await folderNamed('Resums'))[0];
    expect((await search()).includes(`folder=${resums.id}`), await search());
    await b.click('Math', { exact: true, ...MAIN });
    await b.sleep(1000);
  });

  await step('Rename from the right-click menu edits the name in place', async () => {
    await b.click('Funcions', { button: 'right', ...MAIN });
    await b.click('Rename', { exact: true });
    await b.sleep(400);
    const field = await inlineField();
    expect(field && field.value === 'Funcions' && field.focused, JSON.stringify(field));
    await b.type('Funciones');
    await b.press('Enter');
    await b.waitText('Funciones', { exact: true, ...MAIN, timeout: 5000 });
    const { data: f } = await admin.from('folders').select('name').eq('id', data.folder.id).single();
    expect(f.name === 'Funciones', f.name);
    await b.shot('grid-1280');
  });

  await step('iPhone width: the list view is remembered after a reload; a long press shows the menu', async () => {
    await b.resize(390, 844);
    await openCourse();
    await b.clickSelector('[aria-label="Show as list"]');
    await b.sleep(500);
    await openCourse();
    expect(await b.evaluate(`!!document.querySelector('[aria-label="Show as grid"]')`), 'list view not remembered');
    await b.shot('grid-390-list');
    await b.click('Resums', { holdMs: 800, ...MAIN });
    await b.waitText('Rename', { exact: true, timeout: 3000 });
    await b.press('Escape');
    await b.clickSelector('[aria-label="Show as grid"]');
    await b.sleep(400);
    await b.shot('grid-390-grid');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
