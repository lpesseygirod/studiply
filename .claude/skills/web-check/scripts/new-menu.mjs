// new-menu.mjs — the "+ New" menu and the New course dialog (Lea's step 3.2
// feedback): a small menu next to the button (not a full-width sheet) with
// New course, New folder, Upload (greyed out outside a course), Record
// lecture and New document (step 4.3); New course as a small dialog with
// name and colour; "Course" instead of "Project" everywhere; at 1280 and
// 390 px. Results checked in the database. Exit 1 on any FAIL.
//
// Lea, 10 Nov: New folder works outside a course too. There it opens "New folder in…" (Move to…'s
// list of courses and folders, Create here); the place chosen opens with its New folder started
// ("Untitled folder", selected; Enter saves, Esc creates nothing); ⌥⇧N does the same; with no course
// yet, "Make a course first" and New course (the new course then opens with its New folder started).
import { launch, SHOTS } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
let current = null;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await (current ?? b).shot(`fail-new-${results.length}`).catch(() => {});
    await (current ?? b).press('Escape').catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };
const rect = (selector, br = b) =>
  br.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const menuItem = (text) =>
  b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.includes(${JSON.stringify(text)})); return el ? { disabled: el.getAttribute('aria-disabled') === 'true', text: el.innerText } : null; })()`);
/** Clicks a New menu item (other buttons with the same text sit under the menu's overlay). */
const clickItem = async (text, br = b) => {
  const r = await br.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.includes(${JSON.stringify(text)})); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!r) throw new Error(`no menu item ${text}`);
  await br.clickAt(r.x, r.y);
};
/** Clicks the topmost (last in the page) visible text: the picker's rows and buttons sit over the library's. */
const clickTop = async (text, br = b) => {
  const r = await br.evaluate(`(() => {
    const els = [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)} && e.getBoundingClientRect().width > 0);
    const el = els.at(-1);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!r) throw new Error(`no ${text}`);
  await br.clickAt(r.x, r.y);
  await br.sleep(400);
};
const open = async (path, text, br = b) => {
  await br.nav(`${BASE}${path}`);
  await br.waitText(text, { timeout: 20000 });
  await br.sleep(2500);
};
/** The field naming a new folder: focused, its text and what is selected. */
const inlineName = (br = b) =>
  br.evaluate(`(() => {
    const el = document.querySelector('[data-testid=inline-name]');
    const input = el && (el.tagName === 'INPUT' ? el : el.querySelector('input'));
    if (!input) return null;
    return { value: input.value, focused: document.activeElement === input, selected: input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0) };
  })()`);
const waitFor = async (fn, what, timeout = 10000, br = b) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await br.sleep(200);
  }
};
const folderRows = async (userId) => (await admin.from('folders').select('id, name, course_id, parent_id').eq('user_id', userId)).data ?? [];
const dark = async (on, br = b) => {
  await br.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await br.sleep(600);
};
/** Every button in the picker (on top) has a name. */
const pickerNames = (br = b) =>
  br.evaluate(`(() => {
    const title = [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === 'New folder in…').at(-1);
    let root = title;
    for (let i = 0; i < 6 && root?.parentElement; i++) root = root.parentElement;
    const buttons = [...(root?.querySelectorAll('[role=button]') ?? [])];
    return buttons.filter((e) => !(e.getAttribute('aria-label') || e.innerText.trim())).length;
  })()`);

const user = await makeUser();
const data = await seed(user.client);
// A second account with no course yet ("Make a course first").
const empty = await makeUser();
const b = await launch({ width: 1280, height: 900 });
let b2 = null;

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('1280: "+ New" opens a small menu right under the button', async () => {
    await open('/library', 'COURSES');
    const button = await rect('[data-testid=sidebar] [aria-label="New"]');
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    await b.waitText('New course', { exact: true, timeout: 3000 });
    const menu = await rect('[role=menu]');
    expect(menu && menu.w <= 300, `menu width ${menu?.w}`);
    expect(Math.abs(menu.x - button.x) <= 40 && menu.y >= button.y + button.h - 4 && menu.y <= button.y + button.h + 40, `menu at ${JSON.stringify(menu)} for button ${JSON.stringify(button)}`);
    for (const t of ['New course', 'New folder', 'Upload document', 'Record', 'New document']) {
      expect(await menuItem(t), `no ${t}`);
    }
    await b.shot('new-menu-1280');
  });

  await step('Outside a course (Lea, 10 Nov): New folder works and asks where ("New folder in…": the courses); only Upload is greyed out; New document works', async () => {
    const folder = await menuItem('New folder');
    expect(folder && !folder.disabled && !folder.text.includes('Open a course or folder first'), JSON.stringify(folder));
    const upload = await menuItem('Upload document');
    expect(upload.disabled && upload.text.includes('Open a course or folder first'), JSON.stringify(upload));
    const doc = await menuItem('New document');
    expect(!doc.disabled, JSON.stringify(doc));
    await clickItem('New folder');
    await b.waitText('New folder in…', { exact: true, timeout: 5000 });
    for (const t of ['Math', 'Science']) expect(await b.hasText(t, true), `no ${t} in the picker`);
    // At the top nothing can be chosen yet: the bottom button says why.
    expect(await b.hasText('Choose a course or folder', true), 'the bottom button at the top');
    expect((await pickerNames()) === 0, 'an unnamed button in the picker');
    await b.shot('new-folder-in-1280');
    await dark(true);
    await b.shot('new-folder-in-1280-dark');
    await dark(false);
  });

  await step('New folder in… Math › Funcions → Create here: that folder opens with "Untitled folder" selected; Esc creates nothing', async () => {
    await clickTop('Math');
    await clickTop('Funcions');
    await waitFor(async () => (await b.evaluate(`[...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === 'Create here').length`)) === 2, 'both buttons say Create here');
    await clickTop('Create here');
    await waitFor(async () => (await b.evaluate('location.pathname + location.search')).startsWith(`/project/${data.course.id}`), 'the course opened', 10000);
    const field = await waitFor(async () => {
      const f = await inlineName();
      return f?.focused ? f : null;
    }, 'the new folder’s name, focused', 10000);
    expect(field.value === 'Untitled folder' && field.selected === 'Untitled folder', JSON.stringify(field));
    const at = await b.evaluate('location.pathname + location.search');
    expect(at.includes(`folder=${data.folder.id}`) && !at.includes('newFolder'), `at ${at}`);
    await b.shot('new-folder-in-started-1280');
    await b.press('Escape');
    await b.sleep(800);
    expect(!(await inlineName()), 'the field is still open');
    expect((await folderRows(user.id)).filter((f) => f.parent_id === data.folder.id).length === 0, 'Esc created a folder');
  });

  await step('⌥⇧N outside a course opens the same picker; Math → Create here, a name, Enter: the folder is made in Math', async () => {
    await open('/library', 'COURSES');
    await b.chord({ code: 'KeyN', key: 'ˆ', alt: true, shift: true });
    await b.waitText('New folder in…', { exact: true, timeout: 5000 });
    await clickTop('Math');
    await clickTop('Create here');
    await waitFor(async () => (await inlineName())?.focused, 'the new folder’s name, focused', 10000);
    await b.type('Tema 9');
    await b.press('Enter');
    const made = await waitFor(async () => (await folderRows(user.id)).find((f) => f.name === 'Tema 9'), 'the folder in the database', 10000);
    expect(made.course_id === data.course.id && made.parent_id === null, JSON.stringify(made));
    await b.waitText('Tema 9', { exact: true, timeout: 5000, ...MAIN });
  });

  await step('Cancel closes the picker; nothing is made', async () => {
    await open('/library', 'COURSES');
    const before = (await folderRows(user.id)).length;
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    await clickItem('New folder');
    await b.waitText('New folder in…', { exact: true, timeout: 5000 });
    await clickTop('Cancel');
    await b.sleep(500);
    expect(!(await b.hasText('New folder in…', true)), 'the picker is still open');
    expect((await folderRows(user.id)).length === before, 'a folder was made');
  });

  await step('New course: a small dialog next to the button; name + colour → created, opened', async () => {
    const button = await rect('[data-testid=sidebar] [aria-label="New"]');
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    await b.click('New course', { exact: true });
    await b.waitText('Course name', { timeout: 3000 }).catch(() => {});
    const dialog = await rect('[data-testid=new-course-dialog]');
    expect(dialog && dialog.w <= 360, `dialog width ${dialog?.w}`);
    expect(Math.abs(dialog.x - button.x) <= 40, `dialog at x ${dialog.x}, button at ${button.x}`);
    await b.shot('new-course-1280');
    await b.fill('input[placeholder="Course name"]', 'Psicobiología');
    await b.clickSelector('[data-testid=course-color-1]');
    await b.click('Create', { exact: true });
    await b.sleep(1500);
    const { data: rows } = await admin.from('courses').select('id, color').eq('user_id', user.id).eq('name', 'Psicobiología');
    expect(rows?.length === 1 && rows[0].color === '#D8D5F0', JSON.stringify(rows));
    expect((await b.evaluate('location.pathname')) === `/project/${rows[0].id}`, await b.evaluate('location.pathname'));
  });

  await step('Esc closes the New course dialog without creating anything', async () => {
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    await b.click('New course', { exact: true });
    await b.sleep(400);
    await b.type('Nothing');
    await b.press('Escape');
    await b.sleep(400);
    expect(!(await rect('[data-testid=new-course-dialog]')), 'dialog still open');
    const { data: rows } = await admin.from('courses').select('id').eq('user_id', user.id).eq('name', 'Nothing');
    expect(rows.length === 0, 'a course was created');
  });

  await step('In a course, New folder is available and starts the inline name (no picker)', async () => {
    await open(`/project/${data.course.id}`, 'Lecture 1');
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    const folder = await menuItem('New folder');
    expect(folder && !folder.disabled, JSON.stringify(folder));
    await clickItem('New folder');
    await b.sleep(500);
    expect(await b.evaluate(`!!document.querySelector('[data-testid=inline-name]')`), 'no inline name');
    expect(!(await b.hasText('New folder in…', true)), 'the picker opened inside a course');
    await b.press('Escape');
  });

  await step('Record opens the recording setup with the course chosen', async () => {
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    await clickItem('Record');
    await b.sleep(1000);
    expect((await b.evaluate('location.pathname + location.search')).startsWith(`/record?projectId=${data.course.id}`), await b.evaluate('location.search'));
  });

  await step('"Course", never "Project", on the screens and menus', async () => {
    await b.waitText('IN WHAT COURSE', { timeout: 10000 });
    const pages = [];
    pages.push(await b.evaluate('document.body.innerText'));
    await open('/library', 'COURSES');
    await b.click('Math', { button: 'right', ...MAIN });
    await b.waitText('Rename…', { exact: true, timeout: 3000 });
    pages.push(await b.evaluate('document.body.innerText'));
    await b.press('Escape');
    await open('/search', 'Cancel');
    pages.push(await b.evaluate('document.body.innerText'));
    const hits = pages.flatMap((t) => t.match(/\bprojects?\b/gi) ?? []);
    expect(hits.length === 0, `still says: ${hits.join(', ')}`);
  });

  await step('390: the Library + opens the same menu; New course is a small dialog that fits the screen', async () => {
    await b.resize(390, 844);
    await open('/library', 'COURSES');
    await b.clickSelector('[aria-label="New"]');
    await b.waitText('New course', { exact: true, timeout: 3000 });
    expect(await menuItem('Record'), 'no Record');
    await b.shot('new-menu-390');
    await b.click('New course', { exact: true });
    await b.sleep(500);
    const dialog = await rect('[data-testid=new-course-dialog]');
    expect(dialog && dialog.w <= 358 && dialog.x >= 15 && dialog.x + dialog.w <= 375, JSON.stringify(dialog));
    await b.shot('new-course-390');
    await b.click('Cancel', { exact: true });
    await b.sleep(400);
    expect(!(await rect('[data-testid=new-course-dialog]')), 'Cancel did not close');
  });

  await step('390: the Library + → New folder opens "New folder in…" full screen; Cancel', async () => {
    await b.clickSelector('[aria-label="New"]');
    await b.waitText('New course', { exact: true, timeout: 3000 });
    const folder = await menuItem('New folder');
    expect(folder && !folder.disabled, JSON.stringify(folder));
    await clickItem('New folder');
    await b.waitText('New folder in…', { exact: true, timeout: 5000 });
    expect((await b.evaluate('document.documentElement.scrollWidth')) <= 390, 'wider than the screen');
    await b.shot('new-folder-in-390');
    await dark(true);
    await b.shot('new-folder-in-390-dark');
    await dark(false);
    await clickTop('Cancel');
    await b.resize(1280, 900);
  });

  await step('No course yet (390): "Make a course first" and New course; the new course opens with its New folder started', async () => {
    b2 = await launch({ port: 9334, width: 390, height: 844 });
    current = b2;
    await b2.signIn(BASE, empty.email, empty.password);
    await open('/library', 'COURSES', b2).catch(() => open('/library', 'Library', b2));
    await b2.clickSelector('[aria-label="New"]');
    await b2.waitText('New folder', { exact: true, timeout: 3000 });
    await clickItem('New folder', b2);
    await b2.waitText('Make a course first', { exact: true, timeout: 5000 });
    expect(!(await b2.hasText('No courses yet.', true)), 'it still says No courses yet.');
    await b2.shot('new-folder-in-no-course-390');
    await clickTop('New course', b2);
    await waitFor(() => rect('[data-testid=new-course-dialog]', b2), 'the New course dialog', 5000, b2);
    await b2.fill('input[placeholder="Course name"]', 'Biología');
    await clickTop('Create', b2);
    const { data: rows } = await waitFor(async () => {
      const r = await admin.from('courses').select('id').eq('user_id', empty.id).eq('name', 'Biología');
      return r.data?.length ? r : null;
    }, 'the course in the database', 10000, b2);
    await waitFor(async () => (await b2.evaluate('location.pathname')) === `/project/${rows[0].id}`, 'the new course opened', 10000, b2);
    const field = await waitFor(async () => {
      const f = await inlineName(b2);
      return f?.focused ? f : null;
    }, 'its new folder’s name, focused', 10000, b2);
    expect(field.value === 'Untitled folder', JSON.stringify(field));
    await b2.press('Escape');
    await b2.sleep(600);
    expect((await folderRows(empty.id)).length === 0, 'Esc created a folder');
    current = null;
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify([...b.errors(), ...(b2 ? b2.errors() : [])].slice(0, 10), null, 1));
  await b.close();
  if (b2) await b2.close();
  await dropUser(user.id);
  await dropUser(empty.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
