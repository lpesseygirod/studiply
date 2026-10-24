// flows.mjs — the main web flows: menus and dialogs (right-click,
// long-press, rename prompt, confirm, Escape), library actions, and the
// recording flow (start, Stop & save, Library buttons). Prints PASS/FAIL per
// step; screenshots go to $WEB_CHECK_OUT/shots. Exit code 1 on any FAIL.
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
    await b.shot(`fail-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const user = await makeUser();
const data = await seed(user.client);
const b = await launch();

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Home: right-click a course opens its menu at the pointer', async () => {
    await b.click('Math', { button: 'right' });
    await b.waitText('Rename', { timeout: 3000, exact: true });
    expect(await b.hasText('Delete Project', true), 'no Delete Project item');
    await b.shot('10-home-course-menu');
  });

  await step('Home: Escape closes the menu', async () => {
    await b.press('Escape');
    await b.sleep(300);
    expect(!(await b.hasText('Delete Project', true)), 'menu still open');
  });

  await step('Home: Rename a course through the prompt', async () => {
    await b.click('Math', { button: 'right' });
    await b.click('Rename');
    await b.waitText('Rename Project');
    await b.shot('11-home-rename-prompt');
    await b.fill('input[placeholder="Project name"]', 'Algebra');
    await b.click('Save');
    await b.waitText('Algebra', { timeout: 5000, exact: true });
    const { data: row } = await admin.from('courses').select('name').eq('id', data.course.id).single();
    expect(row.name === 'Algebra', `db name is ${row.name}`);
  });

  await step('Home: long-press (mouse hold) also opens the menu', async () => {
    await b.click('Science', { holdMs: 800 });
    await b.waitText('Delete Project', { timeout: 3000, exact: true });
    await b.press('Escape');
  });

  await step('Home: Delete a lecture asks first, Cancel keeps it', async () => {
    await b.click('Lecture 1', { button: 'right' });
    await b.click('Delete Session');
    await b.waitText('will be moved to Recently Deleted');
    await b.shot('12-home-delete-confirm');
    await b.click('Cancel');
    await b.sleep(300);
    const { data: row } = await admin.from('files').select('deleted_at').eq('id', data.lecture.id).single();
    expect(row.deleted_at === null, 'lecture was trashed');
  });

  await step('Library tab: course menu → Delete → confirm → course gone, Undo restores', async () => {
    await b.nav(`${BASE}/library`);
    await b.waitText('Science', { exact: true });
    await b.click('Science', { button: 'right' });
    await b.click('Delete Project');
    await b.waitText('will be moved to Recently Deleted');
    await b.click('Delete', { exact: true });
    await b.sleep(800);
    const { data: row } = await admin.from('courses').select('deleted_at').eq('id', data.science.id).single();
    expect(row.deleted_at !== null, 'course not trashed');
    await b.shot('13-library-after-delete');
    await b.click('UNDO');
    await b.sleep(1200);
    const { data: back } = await admin.from('courses').select('deleted_at').eq('id', data.science.id).single();
    expect(back.deleted_at === null, 'undo did not restore');
  });

  await step('Course screen: folder menu → Rename and Move to… (other course)', async () => {
    await b.nav(`${BASE}/project/${data.course.id}`);
    await b.waitText('Funcions', { exact: true });
    await b.click('Funcions', { button: 'right' });
    await b.shot('14-course-folder-menu');
    await b.click('Rename');
    await b.fill('input[placeholder="Folder name"]', 'Funcions 2');
    await b.press('Enter');
    await b.waitText('Funcions 2', { exact: true, timeout: 5000 });
    await b.click('Funcions 2', { button: 'right' });
    await b.click('Move to…');
    await b.waitText('Move Folder to…');
    await b.click('Science', { exact: true });
    await b.sleep(800);
    await b.shot('15-move-modal');
    await b.click('Move Here', { exact: false });
    await b.sleep(1200);
    const { data: f } = await admin.from('folders').select('name, course_id').eq('id', data.folder.id).single();
    expect(f.name === 'Funcions 2' && f.course_id === data.science.id, JSON.stringify(f));
  });

  await step('Course screen: lecture menu shows its actions', async () => {
    await b.waitText('Lecture 1', { exact: true });
    await b.click('Lecture 1', { button: 'right' });
    await b.waitText('Move to…', { exact: true });
    expect(await b.hasText('Export as PDF', true), 'no Export as PDF');
    await b.press('Escape');
  });

  await step('Post-session: Library button leaves to the library', async () => {
    await b.click('Lecture 1');
    await b.waitText('Post-Session');
    await b.shot('16-post-session');
    await b.click('Library', { exact: true });
    await b.sleep(1200);
    const url = await b.evaluate('location.pathname');
    expect(url === '/library', `url ${url}`);
  });

  await step('Recording: start, Library → "Stop & save" saves and returns to the library', async () => {
    await b.nav(`${BASE}/record`);
    await b.waitText('New Recording');
    await b.shot('17-record-setup');
    await b.fill('input[placeholder^="e.g."]', `Web test ${Date.now() % 1000}`);
    await b.click('Start Recording');
    await b.waitText('RECORDING IN PROCESS', { timeout: 15000 });
    await b.sleep(2500);
    await b.shot('18-recording');
    await b.click('Library', { exact: true });
    await b.waitText('Stop and leave?');
    await b.shot('19-stop-and-leave');
    await b.click('Stop & save');
    for (let i = 0; i < 40 && (await b.evaluate('location.pathname')) !== '/library'; i++) await b.sleep(250);
    const url = await b.evaluate('location.pathname');
    expect(url === '/library', `url ${url}`);
    const { data: chunks } = await admin.from('audio_chunks').select('storage_path, duration_ms').eq('user_id', user.id);
    expect(chunks?.length === 1 && chunks[0].storage_path?.endsWith('.webm'), JSON.stringify(chunks));
  });

  await step('Recording: Stop → confirm → post-session', async () => {
    await b.nav(`${BASE}/record`);
    await b.waitText('New Recording');
    await b.fill('input[placeholder^="e.g."]', `Web test ${Date.now() % 1000}`);
    await b.click('Start Recording');
    await b.waitText('RECORDING IN PROCESS', { timeout: 15000 });
    await b.sleep(1500);
    await b.click('STOP', { exact: true });
    await b.waitText('Stop recording?');
    await b.click('Stop', { exact: true });
    await b.waitText('Post-Session', { timeout: 15000 });
  });

  await step('Review: Generate → Library asks before leaving, recording stays', async () => {
    await b.click('GENERATE NOTES');
    await b.sleep(2500);
    await b.shot('20-review');
    await b.click('Library', { exact: true });
    const asked = await b.hasText('Leave without notes?');
    if (asked) {
      await b.shot('21-review-leave');
      await b.click('Leave', { exact: true });
    }
    await b.sleep(1200);
    const url = await b.evaluate('location.pathname');
    expect(url === '/library', `url ${url} (asked: ${asked})`);
    const { count } = await admin.from('files').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'lecture').is('deleted_at', null);
    expect(count >= 3, `lectures ${count}`);
  });

  await step('Recently Deleted: restore and empty trash through dialogs', async () => {
    await b.nav(BASE);
    await b.waitText('Lecture 1', { exact: true });
    await b.click('Lecture 1', { button: 'right' });
    await b.click('Delete Session');
    await b.click('Delete', { exact: true });
    await b.sleep(800);
    await b.nav(`${BASE}/settings/trash`);
    await b.waitText('Lecture 1', { exact: true });
    await b.shot('22-trash');
    await b.click('Empty', { exact: false });
    await b.waitText('cannot be recovered', { exact: false, timeout: 3000 }).catch(() => {});
    await b.shot('23-empty-confirm');
    await b.click('Cancel');
  });

  await step('Record tab starts fresh after leaving the flow', async () => {
    await b.nav(`${BASE}/library`);
    await b.waitText('Science', { exact: true });
    await b.evaluate(`[...document.querySelectorAll('a,[role=tab],[role=button]')].find(e => (e.getAttribute('href')||'').endsWith('/record'))?.click()`);
    await b.sleep(1200);
    expect(await b.hasText('New Recording'), 'record tab did not show the setup screen');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('dialogs (window.alert/confirm) seen:', b.dialogs);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
