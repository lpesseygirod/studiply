// library-dnd.mjs — step 3.3, drag and drop in the real library (laptop,
// the browser's own drag): a file down three levels of folders and back up
// through the breadcrumb, Undo after the moves (toast and ⌘Z), a folder
// refused on itself and on its own subfolder, drops on a sidebar course, a
// sidebar folder and Trash, a lecture photo dropped on a folder (it becomes
// a library file), a PDF "from Finder" ("Coming soon"), a lecture photo's
// combined Move to… (a folder or a lecture), and click / right-click still
// working. Every result is checked in the database.
// Exit 1 on any FAIL.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    await b.shot(`fail-dnd-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ── Where things are on screen ───────────────────────────────────────
const centerOf = (js) =>
  b.evaluate(`(() => { const el = ${js}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const TILE = (id) => `document.querySelector('[data-testid="entry-${id}"], [data-testid="entry-selected-${id}"]')`;
/** The innermost element showing exactly this text, outside (main) or inside the sidebar. */
const TEXT = (text, where) =>
  `[...document.querySelectorAll('${where === 'sidebar' ? '[data-testid=sidebar] *' : 'body *'}')].find((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)} && ${where === 'sidebar' ? 'true' : "!e.closest('[data-testid=sidebar]')"})`;
/** The pressable around a text (a crumb, a sidebar row). */
const ROW = (text, where) => `(${TEXT(text, where)})?.closest('[tabindex], [role=link], [role=button]')`;
const at = async (js, label) => {
  const p = await centerOf(js);
  if (!p) throw new Error(`not on screen: ${label}`);
  return p;
};
const dashed = (js) => b.evaluate(`(() => { const el = ${js}; return !!el && getComputedStyle(el).borderTopStyle === 'dashed'; })()`);

/** Drags from one element to another; returns whether the target showed the dashed highlight while hovering. */
const drag = async (fromJs, toJs, label, shot) => {
  const from = await at(fromJs, label);
  const to = await at(toJs, label);
  let highlighted = false;
  await b.htmlDrag(from, to, {
    midway: async () => {
      highlighted = await dashed(toJs);
      if (shot) await b.shot(shot);
    },
  });
  await b.sleep(1200);
  return highlighted;
};

// ── The database ─────────────────────────────────────────────────────
const fileRow = async (id) => (await admin.from('files').select('course_id, folder_id, deleted_at').eq('id', id).single()).data;
const folderRow = async (id) => (await admin.from('folders').select('course_id, parent_id, deleted_at').eq('id', id).single()).data;
const until = async (fn, msg, timeout = 5000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last === true) return;
    await b.sleep(250);
  }
  throw new Error(`${msg} (${JSON.stringify(last)})`);
};
const undoToast = async () => {
  await b.click('UNDO');
  await b.sleep(1200);
};
const cmdZ = async () => {
  await b.clickAt(1100, 860); // focus the page, not a field
  await b.chord({ code: 'KeyZ', key: 'z', meta: true });
  await b.sleep(1200);
};
/** Clicks a text inside the open dialog (the picker), not the page under it. */
const clickInDialog = async (text) => {
  const p = await at(`[...document.querySelectorAll('[aria-modal="true"] *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)})`, text);
  await b.clickAt(p.x, p.y);
  await b.sleep(800);
};
const mediaRow = async () => (await admin.from('media').select('lecture_id, file_id').eq('id', photo.id).single()).data;
const openFolder = async (id, name) => {
  await b.nav(`${BASE}/project/${data.course.id}${id ? `?folder=${id}` : ''}`);
  await b.waitText(name, { timeout: 20000 });
  await b.sleep(2500);
};

// ── Seed: Math › Tema A › Tema B › Tema C, a PDF, a lecture photo ────
const user = await makeUser();
const data = await seed(user.client);
const mkFolder = async (name, parent) =>
  (await admin.from('folders').insert({ user_id: user.id, course_id: data.course.id, parent_id: parent, name }).select().single()).data;
const A = await mkFolder('Tema A', null);
const B = await mkFolder('Tema B', A.id);
const C = await mkFolder('Tema C', B.id);
const pdf = (await admin.from('files').insert({ user_id: user.id, kind: 'pdf', title: 'Notas.pdf', course_id: data.course.id }).select().single()).data;
const photo = (await admin.from('media').insert({ user_id: user.id, lecture_id: data.lecture.id, kind: 'photo', storage_path: `${user.id}/${data.lecture.id}/p1.jpg` }).select().single()).data;
const lecture2 = (await admin.from('files').insert({ user_id: user.id, kind: 'lecture', title: 'Lecture 2', course_id: data.course.id }).select().single()).data;
await admin.from('lectures').insert({ id: lecture2.id, user_id: user.id, status: 'transcribing', duration_ms: 1000 });
const finderPdf = join(tmpdir(), 'studiply-finder.pdf');
writeFileSync(finderPdf, '%PDF-1.4\n%%EOF\n');

const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Down three levels: a PDF onto Tema A, then B, then C (dashed highlight; Undo each)', async () => {
    await openFolder(null, 'Tema A');
    expect(await drag(TILE(pdf.id), TILE(A.id), 'Notas → A', 'dnd-hover-tile'), 'no dashed highlight on Tema A');
    await until(async () => (await fileRow(pdf.id)).folder_id === A.id, 'not in Tema A');
    await b.waitText("Moved 'Notas.pdf' to Tema A", { timeout: 3000 });
    await b.shot('dnd-into-a');
    await undoToast();
    await until(async () => (await fileRow(pdf.id)).folder_id === null, 'Undo did not bring it back');
    await drag(TILE(pdf.id), TILE(A.id), 'Notas → A again');
    await until(async () => (await fileRow(pdf.id)).folder_id === A.id, 'not in Tema A again');

    await openFolder(A.id, 'Tema B');
    await drag(TILE(pdf.id), TILE(B.id), 'Notas → B');
    await until(async () => (await fileRow(pdf.id)).folder_id === B.id, 'not in Tema B');
    await cmdZ();
    await until(async () => (await fileRow(pdf.id)).folder_id === A.id, '⌘Z did not bring it back to Tema A');
    await drag(TILE(pdf.id), TILE(B.id), 'Notas → B again');
    await until(async () => (await fileRow(pdf.id)).folder_id === B.id, 'not in Tema B again');

    await openFolder(B.id, 'Tema C');
    await drag(TILE(pdf.id), TILE(C.id), 'Notas → C');
    await until(async () => (await fileRow(pdf.id)).folder_id === C.id, 'not in Tema C');
    await undoToast();
    await until(async () => (await fileRow(pdf.id)).folder_id === B.id, 'Undo did not bring it back to Tema B');
    await drag(TILE(pdf.id), TILE(C.id), 'Notas → C again');
    await until(async () => (await fileRow(pdf.id)).folder_id === C.id, 'not in Tema C again');
  });

  await step('Back up through the breadcrumb, one level at a time (Undo and ⌘Z)', async () => {
    await openFolder(C.id, 'Notas.pdf');
    expect(await drag(TILE(pdf.id), ROW('Tema B'), 'Notas → crumb B', 'dnd-hover-crumb'), 'no dashed highlight on the crumb');
    await until(async () => (await fileRow(pdf.id)).folder_id === B.id, 'not up in Tema B');
    await b.shot('dnd-crumb');
    await undoToast();
    await until(async () => (await fileRow(pdf.id)).folder_id === C.id, 'Undo did not put it back in Tema C');
    await openFolder(C.id, 'Notas.pdf');
    await drag(TILE(pdf.id), ROW('Tema B'), 'Notas → crumb B again');
    await until(async () => (await fileRow(pdf.id)).folder_id === B.id, 'not up in Tema B again');

    await openFolder(B.id, 'Notas.pdf');
    await drag(TILE(pdf.id), ROW('Tema A'), 'Notas → crumb A');
    await until(async () => (await fileRow(pdf.id)).folder_id === A.id, 'not up in Tema A');

    await openFolder(A.id, 'Notas.pdf');
    await drag(TILE(pdf.id), ROW('Math'), 'Notas → crumb Math');
    await until(async () => (await fileRow(pdf.id)).folder_id === null, 'not up at the top of Math');
    await cmdZ();
    await until(async () => (await fileRow(pdf.id)).folder_id === A.id, '⌘Z did not put it back in Tema A');
  });

  await step('A folder is refused on itself and on its own subfolder (no highlight, nothing moves)', async () => {
    await openFolder(null, 'Tema A');
    expect(!(await drag(TILE(A.id), TILE(A.id), 'A → A')), 'Tema A highlighted itself');
    // Its subfolder, in the sidebar tree
    await b.clickSelector('[aria-label="Expand Tema A"]');
    await b.sleep(1200);
    expect(!(await drag(TILE(A.id), ROW('Tema B', 'sidebar'), 'A → its own B')), 'Tema B highlighted for its parent');
    await b.shot('dnd-refused');
    const row = await folderRow(A.id);
    expect(row.parent_id === null && row.course_id === data.course.id && !row.deleted_at, JSON.stringify(row));
    expect((await folderRow(B.id)).parent_id === A.id, 'Tema B moved');
  });

  await step('Onto another course in the sidebar, and onto a folder in the sidebar tree (Undo)', async () => {
    expect(await drag(TILE(data.lecture.id), ROW('Science', 'sidebar'), 'Lecture → Science', 'dnd-hover-sidebar'), 'no highlight on Science');
    await until(async () => (await fileRow(data.lecture.id)).course_id === data.science.id, 'not in Science');
    await undoToast();
    await until(async () => (await fileRow(data.lecture.id)).course_id === data.course.id, 'Undo did not bring it back to Math');
    await openFolder(null, 'Lecture 1');
    expect(await drag(TILE(data.lecture.id), ROW('Funcions', 'sidebar'), 'Lecture → sidebar Funcions'), 'no highlight on the sidebar folder');
    await until(async () => (await fileRow(data.lecture.id)).folder_id === data.folder.id, 'not in Funcions');
    await undoToast();
    await until(async () => (await fileRow(data.lecture.id)).folder_id === null, 'Undo did not bring it back');
  });

  await step('Onto Trash: no question, Undo restores; ⌘Z restores too', async () => {
    await openFolder(null, 'Funcions');
    const trash = `document.querySelector('[data-testid=sidebar-trash]')`;
    expect(await drag(TILE(data.folder.id), trash, 'Funcions → Trash'), 'no highlight on Trash');
    await until(async () => !!(await folderRow(data.folder.id)).deleted_at, 'not trashed');
    await b.waitText("Moved 'Funcions' to Trash", { timeout: 3000 });
    await undoToast();
    await until(async () => !(await folderRow(data.folder.id)).deleted_at, 'Undo did not restore it');
    await openFolder(null, 'Lecture 1');
    await drag(TILE(data.lecture.id), trash, 'Lecture → Trash');
    await until(async () => !!(await fileRow(data.lecture.id)).deleted_at, 'lecture not trashed');
    await cmdZ();
    await until(async () => !(await fileRow(data.lecture.id)).deleted_at, '⌘Z did not restore it');
  });

  await step('A lecture photo dropped on a folder leaves its lecture as a library file; Undo puts it back', async () => {
    await openFolder(null, 'Tema A');
    await b.click('PHOTOS & PDFS FROM LECTURES', { exact: false });
    await b.sleep(800);
    const row = `(${TEXT('Photo 1')})?.closest('[draggable=true]')`;
    expect(await drag(row, TILE(A.id), 'photo → A'), 'no highlight for the photo');
    await until(async () => {
      const m = (await admin.from('media').select('lecture_id, file_id').eq('id', photo.id).single()).data;
      return m.lecture_id === null && !!m.file_id;
    }, 'the photo did not leave its lecture');
    const { data: m } = await admin.from('media').select('file_id').eq('id', photo.id).single();
    const { data: f } = await admin.from('files').select('kind, folder_id').eq('id', m.file_id).single();
    expect(f.kind === 'image' && f.folder_id === A.id, JSON.stringify(f));
    await undoToast();
    await until(async () => {
      const back = (await admin.from('media').select('lecture_id, file_id').eq('id', photo.id).single()).data;
      const gone = (await admin.from('files').select('id').eq('id', m.file_id)).data;
      return back.lecture_id === data.lecture.id && back.file_id === null && gone.length === 0;
    }, 'Undo did not give the photo back to its lecture');
  });

  await step('A PDF dragged from the computer: "Coming soon", nothing uploaded', async () => {
    const before = (await admin.from('files').select('id').eq('user_id', user.id)).data.length;
    const to = await at(TILE(A.id), 'Tema A');
    await b.htmlDrag(null, to, { files: [finderPdf] });
    await b.waitText('Coming soon', { timeout: 3000 });
    await b.shot('dnd-finder');
    await b.click('OK', { exact: true });
    expect((await admin.from('files').select('id').eq('user_id', user.id)).data.length === before, 'a file was created');
  });

  await step('A lecture photo: one Move to… (to a folder: out of its lecture; to a lecture: moved there)', async () => {
    await openFolder(null, 'Tema A');
    const label = await b.evaluate(`document.body.innerText.includes('PHOTOS & PDFS FROM LECTURES')`);
    expect(label, 'no lecture photos section');
    if (!(await b.hasText('Photo 1', true))) await b.click('PHOTOS & PDFS FROM LECTURES', { exact: false });
    await b.sleep(600);
    await b.click('Photo 1', { button: 'right', exclude: '[data-testid=sidebar]' });
    await b.waitText('Save a copy to library…', { exact: true, timeout: 3000 });
    expect(!(await b.hasText('Move to another lecture…', true)), 'the old item is still there');
    await b.click('Move to…', { exact: true });
    await b.waitText('Move ‘Photo 1’ to…', { timeout: 3000 });
    await clickInDialog('Math');
    await clickInDialog('Tema A');
    await b.shot('dnd-move-to-folder');
    await b.click('Move to Math / Tema A', { exact: true });
    await until(async () => { const m = await mediaRow(); return m.lecture_id === null && !!m.file_id; }, 'not moved out to Tema A');
    const { file_id } = await mediaRow();
    expect((await admin.from('files').select('folder_id').eq('id', file_id).single()).data.folder_id === A.id, 'not in Tema A');
    await undoToast();
    await until(async () => (await mediaRow()).lecture_id === data.lecture.id, 'Undo did not give it back');

    await openFolder(null, 'Tema A');
    if (!(await b.hasText('Photo 1', true))) await b.click('PHOTOS & PDFS FROM LECTURES', { exact: false });
    await b.sleep(600);
    await b.click('Photo 1', { button: 'right', exclude: '[data-testid=sidebar]' });
    await b.click('Move to…', { exact: true });
    await clickInDialog('Math');
    await clickInDialog('Lecture 2');
    await b.click('Move to Math / Lecture 2', { exact: true });
    await until(async () => { const m = await mediaRow(); return m.lecture_id === lecture2.id && m.file_id === null; }, 'not moved to Lecture 2');
  });

  await step('A click still selects, a right-click still shows the menu', async () => {
    await openFolder(null, 'Tema A');
    await b.click('Tema A', { exact: true, exclude: '[data-testid=sidebar]' });
    await b.sleep(400);
    expect(await b.evaluate(`!!document.querySelector('[data-testid="entry-selected-${A.id}"]')`), 'not selected');
    await b.click('Tema A', { button: 'right', exclude: '[data-testid=sidebar]' });
    await b.waitText('Move to…', { exact: true, timeout: 3000 });
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
