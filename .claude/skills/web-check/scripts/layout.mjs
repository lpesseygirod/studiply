// layout.mjs — the app shell (step 2.1): the laptop layout per kind of screen
// (top bar, sidebar, assistant), collapsing remembered after a reload,
// resizing between laptop and iPhone layouts without losing the screen, and
// the iPhone tab bar with the red Record button in the middle. Screenshots
// go to $WEB_CHECK_OUT/shots (layout-*.png). Exit code 1 on any FAIL.
import { launch, SHOTS } from './cdp.mjs';
import { makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-layout-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const visible = (selector) =>
  b.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  })`);
const shell = async () => ({
  topBar: await visible('[data-testid=top-bar]'),
  sidebar: await visible('[data-testid=sidebar]'),
  assistant: await visible('[data-testid=assistant-panel]'),
});
const pathname = () => b.evaluate('location.pathname');
const open = async (path, text) => {
  await b.nav(`${BASE}${path}`);
  await b.waitText(text, { timeout: 20000 });
  await b.sleep(2500); // splash after the reload
};

const user = await makeUser();
const data = await seed(user.client);
const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in (laptop, 1280 px)', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Library: top bar with search and Record, sidebar, no assistant', async () => {
    await open('/library', 'COURSES');
    const s = await shell();
    expect(s.topBar && s.sidebar && !s.assistant, JSON.stringify(s));
    const bar = await b.evaluate(`document.querySelector('[data-testid=top-bar]').innerText`);
    expect(/\bRecord\b/.test(bar) && bar.includes('Search notes'), bar);
    const side = await b.evaluate(`document.querySelector('[data-testid=sidebar]').innerText`);
    for (const t of ['New', 'Recent', 'Favorites', 'Exam packs', 'Review today', 'Math', 'Science', 'Trash']) {
      expect(side.includes(t), `sidebar has no ${t}`);
    }
    expect(!(await visible('[aria-label="Review"]')), 'the tab bar shows on the laptop');
    await b.shot('layout-1280-library');
  });

  await step('Document: the assistant panel joins, Share in the top bar', async () => {
    await open(`/note/${data.lecture.id}`, 'Lecture 1');
    const s = await shell();
    expect(s.topBar && s.sidebar && s.assistant, JSON.stringify(s));
    const bar = await b.evaluate(`document.querySelector('[data-testid=top-bar]').innerText`);
    expect(bar.includes('Share') && !/\bRecord\b/.test(bar), bar);
    await b.shot('layout-1280-document');
  });

  await step('Settings: Back to library, no sidebar, no assistant', async () => {
    await open('/settings', 'Summaries');
    const s = await shell();
    expect(s.topBar && !s.sidebar && !s.assistant, JSON.stringify(s));
    expect(await b.hasText('‹ Back to library', true), 'no Back to library');
    await b.shot('layout-1280-settings');
    await b.click('‹ Back to library');
    await b.sleep(1000);
    expect((await pathname()) === '/library', `went to ${await pathname()}`);
  });

  await step('Collapsing the sidebar and the assistant is remembered after a reload', async () => {
    await open(`/note/${data.lecture.id}`, 'Lecture 1');
    await b.clickSelector('[aria-label="Hide sidebar"]');
    await b.clickSelector('[data-testid=assistant-panel] [aria-label="Hide study assistant"]');
    await b.sleep(500);
    let s = await shell();
    expect(!s.sidebar && !s.assistant, `after collapsing ${JSON.stringify(s)}`);
    const stored = await b.evaluate(`localStorage.getItem('studiply.layout')`);
    expect(stored && JSON.parse(stored).sidebarOpen === false && JSON.parse(stored).assistantOpen === false, `stored ${stored}`);
    await open(`/note/${data.lecture.id}`, 'Lecture 1');
    s = await shell();
    expect(!s.sidebar && !s.assistant, `after reload ${JSON.stringify(s)}`);
    await b.shot('layout-1280-collapsed');
    await b.clickSelector('[aria-label="Show sidebar"]');
    await b.clickSelector('[aria-label="Show study assistant"]');
    await b.sleep(500);
    s = await shell();
    expect(s.sidebar && s.assistant, `after reopening ${JSON.stringify(s)}`);
  });

  await step('Resizing to 1023 px switches to the iPhone layout on the same screen', async () => {
    await open(`/project/${data.course.id}`, 'Funcions');
    await b.resize(1023, 900);
    const s = await shell();
    expect(!s.topBar && !s.sidebar && !s.assistant, JSON.stringify(s));
    expect(await visible('[aria-label="Review"]'), 'no tab bar');
    expect((await pathname()) === `/project/${data.course.id}` && (await b.hasText('Funcions', true)), 'lost the screen');
    await b.shot('layout-1023-course');
  });

  await step('…and back to 1280 px brings the laptop layout back', async () => {
    await b.resize(1280, 900);
    const s = await shell();
    expect(s.topBar && s.sidebar, JSON.stringify(s));
    expect(!(await visible('[aria-label="Review"]')), 'the tab bar stayed');
    expect((await pathname()) === `/project/${data.course.id}` && (await b.hasText('Funcions', true)), 'lost the screen');
  });

  await step('iPhone (390 px): five tabs, Record raised in the exact middle', async () => {
    await b.resize(390, 844);
    await open('/library', 'COURSES');
    const tabs = await b.evaluate(`(() => {
      const labels = ['Library', 'Search', 'Record lecture', 'Review', 'Settings'];
      return labels.map((l) => {
        const el = [...document.querySelectorAll('[aria-label="' + l + '"]')].find((e) => e.getBoundingClientRect().width > 0);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { label: l, x: r.x + r.width / 2, top: r.top, bottom: r.bottom };
      });
    })()`);
    expect(tabs.every(Boolean), `missing tabs ${JSON.stringify(tabs)}`);
    const order = [...tabs].sort((a, c) => a.x - c.x).map((t) => t.label);
    expect(order.join(',') === 'Library,Search,Record lecture,Review,Settings', order.join(','));
    const record = tabs[2];
    expect(Math.abs(record.x - 390 / 2) <= 2, `Record center at ${record.x}`);
    const others = tabs.filter((t) => t.label !== 'Record lecture');
    expect(record.top < Math.min(...others.map((t) => t.top)) - 10, `Record not raised: ${record.top}`);
    const s = await shell();
    expect(!s.topBar && !s.sidebar, JSON.stringify(s));
    await b.shot('layout-390-library');
  });

  await step('iPhone: a document opens full screen, without the tab bar', async () => {
    await open(`/note/${data.lecture.id}`, 'Lecture 1');
    expect(!(await visible('[aria-label="Review"]')), 'tab bar on a document');
    await b.shot('layout-390-document');
    await open('/review', 'Quizzes and flashcards');
    await b.shot('layout-390-review');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
