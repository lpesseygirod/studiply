// shell-data.mjs — real data in the shell (step 2.2): sidebar counts, the
// Review today badge, the Recent / Starred / Exam packs sections, the open
// course expanding, the top bar's breadcrumb, title and "Saved · time",
// links to a folder, Record lecture preselecting the course, Star / Unstar
// with Undo, and the iPhone chips. Stars, an exam pack, a note and a due
// review are inserted with the service role (nothing in the app can make
// exam packs or reviews yet). Screenshots: shell-*.png. Exit 1 on any FAIL.
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
    await b.shot(`fail-shell-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };
const SIDEBAR = '[data-testid=sidebar]';

const textOf = (selector) => b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`);
const pathname = () => b.evaluate('location.pathname');
const search = () => b.evaluate('location.search');
const open = async (path, text) => {
  await b.nav(`${BASE}${path}`);
  await b.waitText(text, { timeout: 20000 });
  await b.sleep(2500); // splash after the reload
};
/** Clicks an item of the laptop sidebar by its text. */
const sidebarClick = (text) =>
  b.evaluate(`(() => {
    const el = [...document.querySelectorAll('${SIDEBAR} *')].find((e) => e.childElementCount === 0 && e.innerText?.trim() === ${JSON.stringify(text)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
const starredAt = async (table, id) => (await admin.from(table).select('starred_at').eq('id', id).single()).data.starred_at;

const user = await makeUser();
const data = await seed(user.client);

// Lecture 1 starred now, Science a minute ago (so Lecture 1 is first in Starred).
const now = new Date();
await admin.from('files').update({ starred_at: now.toISOString() }).eq('id', data.lecture.id);
await admin.from('courses').update({ starred_at: new Date(now - 60_000).toISOString() }).eq('id', data.science.id);
// A finished lecture with a note, so the top bar can say when it was saved.
await admin.from('lectures').update({ status: 'ready' }).eq('id', data.lecture.id);
await admin.from('summaries').insert({
  user_id: user.id, file_id: data.lecture.id, mode: 'new', sliders: {},
  result: { format: 'legacy-note-v1', title: 'Lecture 1', summary: 'A short note.', isConfirmed: true },
});
const { data: pack } = await admin
  .from('files')
  .insert({ user_id: user.id, kind: 'exam_pack', title: 'Math exam pack', course_id: data.course.id })
  .select()
  .single();
await admin.from('review_schedule').insert({ user_id: user.id, file_id: data.lecture.id, due_at: now.toISOString() });

const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in (laptop, 1280 px)', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Sidebar: courses with item counts, Review today badge', async () => {
    await open('/library', 'COURSES');
    const side = await textOf(SIDEBAR);
    expect(/Math\s*2/.test(side), `Math count: ${side}`);
    expect(/Science\s*0/.test(side), `Science count: ${side}`);
    expect(await b.evaluate(`!!document.querySelector('${SIDEBAR} [aria-label="1 due"]')`), 'no Review today badge');
    await b.shot('shell-1280-library');
  });

  await step('Starred lists Lecture 1 then Science', async () => {
    expect(await sidebarClick('Starred'), 'no Starred in the sidebar');
    await b.waitText('Lecture 1', { exact: true, ...MAIN });
    const list = await textOf('[data-testid=section-list]');
    expect(list.indexOf('Lecture 1') >= 0 && list.indexOf('Lecture 1') < list.indexOf('Science'), list);
    expect((await search()).includes('section=starred'), await search());
    await b.shot('shell-1280-starred');
  });

  await step('Exam packs lists the pack', async () => {
    await sidebarClick('Exam packs');
    await b.waitText('Math exam pack', { exact: true, ...MAIN });
    expect(!(await textOf('[data-testid=section-list]')).includes('Lecture 1'), 'a lecture in Exam packs');
  });

  await step('Recent lists every kind, newest first', async () => {
    await sidebarClick('Recent');
    await b.sleep(1200);
    const list = await textOf('[data-testid=section-list]');
    expect(list.includes('Math exam pack') && list.includes('Lecture 1'), list);
    expect(list.indexOf('Math exam pack') < list.indexOf('Lecture 1'), `order: ${list}`);
  });

  await step('A note: top bar shows Math › title and the save time; its course expands', async () => {
    await open(`/note/${data.lecture.id}`, 'Lecture 1');
    const header = await textOf('[data-testid=document-header]');
    expect(header.includes('Math') && header.includes('Lecture 1'), header);
    expect(/Saved · \d\d:\d\d/.test(header), `no save time: ${header}`);
    const side = await textOf(SIDEBAR);
    expect(side.includes('Funcions') && side.includes('Lecture 1') && side.includes('Math exam pack'), side);
    const highlighted = await textOf(`${SIDEBAR} [data-testid=sidebar-current]`);
    expect(highlighted.includes('Lecture 1'), `highlighted: ${highlighted}`);
    await b.shot('shell-1280-note');
  });

  await step('The Math crumb opens the course', async () => {
    await b.evaluate(`[...document.querySelectorAll('[data-testid=document-header] *')].find((e) => e.childElementCount === 0 && e.innerText.trim() === 'Math')?.click()`);
    await b.sleep(1500);
    expect((await pathname()) === `/project/${data.course.id}`, await pathname());
  });

  await step('Funcions in the sidebar opens the course at that folder', async () => {
    expect(await sidebarClick('Funcions'), 'no Funcions in the sidebar');
    await b.sleep(1500);
    expect((await search()).includes(`folder=${data.folder.id}`), await search());
    await b.waitText('Empty folder', { timeout: 5000 });
  });

  await step('Record lecture preselects the course', async () => {
    await b.click('Record lecture', { exact: true });
    await b.waitText('IN WHAT PROJECT', { timeout: 10000 });
    await b.sleep(800);
    const q = await search();
    expect(q.includes(`projectId=${data.course.id}`) && q.includes(`folderId=${data.folder.id}`), q);
    const header = await textOf('[data-testid=document-header]');
    expect(header.includes('Math') && header.includes('New recording'), header);
  });

  await step('Star a course from Library (right-click) → Starred; Undo clears it', async () => {
    await open('/library', 'COURSES');
    await b.click('Math', { button: 'right', ...MAIN });
    await b.click('Star', { exact: true });
    await b.waitText('Starred "Math"', { timeout: 5000 });
    expect((await starredAt('courses', data.course.id)) !== null, 'not starred in the database');
    await b.click('UNDO');
    await b.sleep(1500);
    expect((await starredAt('courses', data.course.id)) === null, 'Undo did not clear the star');
  });

  await step('Star a folder from the course screen → it appears in Starred', async () => {
    await open(`/project/${data.course.id}`, 'Funcions');
    await b.click('Funcions', { button: 'right', ...MAIN });
    await b.click('Star', { exact: true });
    await b.sleep(1200);
    expect((await starredAt('folders', data.folder.id)) !== null, 'folder not starred');
    await open('/library?section=starred', 'Funcions');
  });

  await step('Starred menu says Unstar; unstarring Lecture 1 removes it', async () => {
    await b.click('Lecture 1', { button: 'right', ...MAIN });
    await b.waitText('Unstar', { exact: true, timeout: 5000 });
    await b.click('Unstar', { exact: true });
    await b.sleep(1500);
    expect((await starredAt('files', data.lecture.id)) === null, 'lecture still starred');
    expect(!(await textOf('[data-testid=section-list]')).includes('Lecture 1'), 'Lecture 1 still listed');
  });

  await step('iPhone (390 px): chips switch sections and back; Review today count', async () => {
    await b.resize(390, 844);
    await open('/library', 'COURSES');
    expect(await b.hasText('Review today · 1', true), 'no count on the Review today chip');
    await b.click('Exam packs', { exact: true });
    await b.waitText('Math exam pack', { exact: true });
    expect((await search()).includes('section=exam-packs'), await search());
    await b.click('Starred', { exact: true });
    await b.waitText('Funcions', { exact: true });
    await b.shot('shell-390-starred');
    await b.click('Starred', { exact: true });
    await b.waitText('COURSES', { exact: true });
    expect(!(await search()).includes('section'), await search());
  });

  await step('iPhone: a long press (mouse hold) on a course offers Star', async () => {
    await b.click('Science', { holdMs: 800 });
    await b.waitText('Unstar', { exact: true, timeout: 3000 });
    await b.press('Escape');
    await b.click('Math', { holdMs: 800 });
    await b.waitText('Star', { exact: true, timeout: 3000 });
    await b.press('Escape');
    await b.shot('shell-390-library');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
  void pack;
}
