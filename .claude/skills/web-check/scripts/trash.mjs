// trash.mjs — Recently Deleted (step 3.5): each row says what it is and
// where it was ("PDF · from Math › Funcions"), with "Deleted today · 30 days
// left"; what was deleted with its folder is listed once, under the folder;
// Restore puts it back with a toast whose Undo deletes it again, and the
// library shows it at once (sidebar count, course grid); restoring a folder brings back what was in
// it; Delete forever removes the row and its Storage file; Empty empties.
// Trash is set with the service role (as the app does: same deleted_at for
// a folder and its contents). Screenshots: trash-*.png. Exit 1 on any FAIL.
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
    await b.shot(`fail-trash-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const until = async (fn, msg, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await b.sleep(250); }
  throw new Error(msg);
};

const user = await makeUser();
const data = await seed(user.client); // Math (Funcions, Lecture 1), Science

const ins = async (table, rows) => {
  const { data: out, error } = await admin.from(table).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return out;
};
// A PDF in Math › Funcions with a real Storage file.
const [pdf] = await ins('files', { user_id: user.id, kind: 'pdf', title: 'Apunts.pdf', course_id: data.course.id, folder_id: data.folder.id });
const pdfPath = `${user.id}/${pdf.id}/apunts.pdf`;
await admin.storage.from('slides').upload(pdfPath, Buffer.from('%PDF-1.4 test'), { contentType: 'application/pdf' });
await ins('media', { user_id: user.id, file_id: pdf.id, kind: 'slides', storage_path: pdfPath });
// A folder in Science with a lecture in it, deleted together.
const [old] = await ins('folders', { user_id: user.id, course_id: data.science.id, name: 'Tema vell' });
const [inside] = await ins('files', { user_id: user.id, kind: 'lecture', title: 'Dins del tema', course_id: data.science.id, folder_id: old.id });
await ins('lectures', { user_id: user.id, id: inside.id, status: 'ready' });

const now = new Date().toISOString();
await admin.from('files').update({ deleted_at: now }).in('id', [data.lecture.id, pdf.id]);
await admin.from('folders').update({ deleted_at: now }).eq('id', old.id);
await admin.from('files').update({ deleted_at: now }).eq('id', inside.id);

const deletedAt = async (table, id) => (await admin.from(table).select('deleted_at').eq('id', id).maybeSingle()).data?.deleted_at;
const rowText = (id) => b.evaluate(`document.querySelector('[data-testid="trash-${id}"]')?.innerText ?? ''`);
const mathCount = () =>
  b.evaluate(`(() => {
    const m = (document.querySelector('[data-testid=sidebar]')?.innerText ?? '').match(/\\bMath\\s*\\n\\s*(\\d+)/);
    return m ? Number(m[1]) : null;
  })()`);

const b = await launch({ width: 1280, height: 900 });
try {
  await b.signIn(BASE, user.email, user.password);

  await step('rows say what each item is, where it was, and how long it stays', async () => {
    await b.nav(`${BASE}/settings/trash`);
    await b.waitText('Apunts.pdf', { exact: true, timeout: 20000 });
    await b.sleep(2500); // splash after the reload
    const lecture = await rowText(data.lecture.id);
    expect(lecture.includes('Lecture · from Math'), `lecture row: ${lecture}`);
    expect(lecture.includes('Deleted today · 30 days left'), `lecture row: ${lecture}`);
    expect((await rowText(pdf.id)).includes('PDF · from Math › Funcions'), `pdf row: ${await rowText(pdf.id)}`);
    expect((await rowText(old.id)).includes('Folder · from Science'), `folder row: ${await rowText(old.id)}`);
    expect((await rowText(inside.id)) === '', 'the lecture deleted with its folder has a line of its own');
    await b.shot('trash-list');
  });

  await step('Restore: back in place with a toast whose Undo deletes it again', async () => {
    await b.clickSelector('[aria-label="Restore Lecture 1"]');
    await b.waitText("Restored 'Lecture 1' to Math", { timeout: 5000 });
    expect((await deletedAt('files', data.lecture.id)) === null, 'not restored in the database');
    await b.shot('trash-restored');
    await b.click('UNDO');
    await until(async () => (await deletedAt('files', data.lecture.id)) !== null, 'Undo did not delete it again');
    await until(async () => (await rowText(data.lecture.id)) !== '', 'the row did not come back');
  });

  await step('after a restore the library shows it at once (sidebar count, course grid)', async () => {
    await b.clickSelector('[aria-label="Restore Lecture 1"]');
    await until(async () => (await deletedAt('files', data.lecture.id)) === null, 'not restored');
    await b.click('‹ Back to library', { exact: false });
    await until(async () => (await mathCount()) === 1, `Math count in the sidebar: ${await mathCount()}`);
    await b.click('Math', { exact: true, exclude: '[data-testid=sidebar]' });
    await b.waitText('Lecture 1', { exact: true, timeout: 8000, exclude: '[data-testid=sidebar]' });
    await b.nav(`${BASE}/settings/trash`);
    await b.waitText('Apunts.pdf', { exact: true, timeout: 20000 });
    await b.sleep(2500);
  });

  await step('restoring a folder brings back what was deleted with it', async () => {
    await b.clickSelector('[aria-label="Restore Tema vell"]');
    await until(async () => (await deletedAt('folders', old.id)) === null, 'folder not restored');
    await until(async () => (await deletedAt('files', inside.id)) === null, 'its lecture not restored');
  });

  await step('Delete forever removes the row and its Storage file', async () => {
    await b.clickSelector(`[data-testid="trash-${pdf.id}"] [aria-label="Delete permanently"]`);
    await b.waitText('cannot be recovered', { timeout: 3000 });
    await b.click('Delete', { exact: true });
    await until(async () => (await admin.from('files').select('id').eq('id', pdf.id)).data.length === 0, 'row still there');
    const { data: objects } = await admin.storage.from('slides').list(`${user.id}/${pdf.id}`);
    expect((objects ?? []).length === 0, 'Storage file still there');
  });

  await step('Empty removes everything left', async () => {
    await admin.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', data.lecture.id);
    await b.nav(`${BASE}/settings/trash`);
    await b.waitText('Lecture 1', { exact: true, timeout: 20000 });
    await b.sleep(2500);
    await b.click('Empty', { exact: true });
    await b.waitText('All items will be permanently deleted', { timeout: 3000 });
    await b.click('Delete All', { exact: true });
    await b.waitText('No deleted items', { timeout: 8000 });
    const { count } = await admin.from('files').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('deleted_at', 'is', null);
    expect(count === 0, `${count} trashed files left`);
    expect((await admin.from('files').select('id').eq('id', data.lecture.id)).data.length === 0, 'Lecture 1 still there');
    await b.shot('trash-empty');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
