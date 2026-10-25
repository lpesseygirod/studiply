// new-menu.mjs — the "+ New" menu and the New course dialog (Lea's step 3.2
// feedback): a small menu next to the button (not a full-width sheet) with
// New course, New folder (greyed out outside a course), Upload, Record
// lecture and New document (coming soon); New course as a small dialog with
// name and colour; "Course" instead of "Project" everywhere; at 1280 and
// 390 px. Results checked in the database. Exit 1 on any FAIL.
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
    await b.shot(`fail-new-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };
const rect = (selector) =>
  b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const menuItem = (text) =>
  b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.includes(${JSON.stringify(text)})); return el ? { disabled: el.getAttribute('aria-disabled') === 'true', text: el.innerText } : null; })()`);
/** Clicks a New menu item (other buttons with the same text sit under the menu's overlay). */
const clickItem = async (text) => {
  const r = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.includes(${JSON.stringify(text)})); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!r) throw new Error(`no menu item ${text}`);
  await b.clickAt(r.x, r.y);
};
const open = async (path, text) => {
  await b.nav(`${BASE}${path}`);
  await b.waitText(text, { timeout: 20000 });
  await b.sleep(2500);
};

const user = await makeUser();
const data = await seed(user.client);
const b = await launch({ width: 1280, height: 900 });

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
    for (const t of ['New course', 'New folder', 'Upload photo or PDF', 'Record lecture', 'New document']) {
      expect(await menuItem(t), `no ${t}`);
    }
    await b.shot('new-menu-1280');
  });

  await step('Outside a course, New folder and Upload are greyed out with a hint; New document is "Coming soon"', async () => {
    const folder = await menuItem('New folder');
    expect(folder.disabled && folder.text.includes('Open a course or folder first'), JSON.stringify(folder));
    const upload = await menuItem('Upload photo or PDF');
    expect(upload.disabled, JSON.stringify(upload));
    const doc = await menuItem('New document');
    expect(doc.disabled && doc.text.includes('Coming soon'), JSON.stringify(doc));
    await b.click('New folder', { exact: true });
    await b.sleep(300);
    expect(await b.evaluate(`!!document.querySelector('[role=menu]')`), 'a greyed-out item closed the menu');
    await b.press('Escape');
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

  await step('In a course, New folder is available and starts the inline name', async () => {
    await open(`/project/${data.course.id}`, 'New folder');
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    const folder = await menuItem('New folder');
    expect(folder && !folder.disabled, JSON.stringify(folder));
    await clickItem('New folder');
    await b.sleep(500);
    expect(await b.evaluate(`!!document.querySelector('[data-testid=inline-name]')`), 'no inline name');
    await b.press('Escape');
  });

  await step('Record lecture opens the recording setup with the course chosen', async () => {
    await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
    await clickItem('Record lecture');
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
    expect(await menuItem('Record lecture'), 'no Record lecture');
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
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
