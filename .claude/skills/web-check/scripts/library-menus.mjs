// library-menus.mjs — step 3.4: Upload makes files in the open folder (the
// browser's file picker), files from the Finder dropped on a sidebar
// course, Cut / Copy / Paste (a copy has its own Storage object), Move out,
// the greyed-out items with their hints, menus with the keyboard (⇧F10,
// arrows, Enter, Esc, ⌘X / ⌘V), and at 390 px the "…" button. Every result
// is checked in the database (and Storage). Exit 1 on any FAIL.
//
// Step 7.9: Make exam pack… and Merge lectures… work (the lecture picker); a lecture has Extend with
// next lecture…. Only Copy on a lecture or folder is still greyed ("Coming soon"). A failed step closes
// any menu it left open, so it can't fail the next ones.
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
    await b.shot(`fail-menus34-${results.length}`).catch(() => {});
    // A menu, dialog or picker left open would answer every later step.
    await b.press('Escape').catch(() => {});
    await b.press('Escape').catch(() => {});
    await b.sleep(300);
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };

// ── Files on disk ────────────────────────────────────────────────────
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const disk = (name, data) => {
  const path = join(tmpdir(), name);
  writeFileSync(path, data);
  return path;
};
const apuntesPdf = disk('apuntes.pdf', '%PDF-1.4\n%%EOF\n');
const pizarraPng = disk('pizarra.png', PNG);
const temarioPdf = disk('temario.pdf', '%PDF-1.4\n%%EOF\n');

// ── Screen helpers ───────────────────────────────────────────────────
/** The open menu's lines: text, greyed out, hint. */
const menu = () =>
  b.evaluate(`[...document.querySelectorAll('[role=menuitem]')].map((e) => {
    const [text, hint] = e.innerText.trim().split('\\n');
    return { text, hint: hint ?? null, disabled: e.getAttribute('aria-disabled') === 'true' };
  })`);
const line = async (text) => (await menu()).find((l) => l.text === text || l.text.startsWith(text));
/** Clicks a menu line (buttons with the same text under the menu's overlay come first in the DOM). Any line counts: an item's icon is a line of its own. */
const clickItem = async (text) => {
  const p = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.split('\\n').some((l) => l.trim().startsWith(${JSON.stringify(text)}))); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!p) throw new Error(`no menu item ${text}`);
  await b.clickAt(p.x, p.y);
  await b.sleep(600);
};
const tileOf = async (title) => {
  const { data } = await admin.from('files').select('id').eq('user_id', user.id).eq('title', title).is('deleted_at', null).single();
  return data.id;
};
const tileMenu = async (title) => {
  await b.click(title, { button: 'right', exact: true, ...MAIN });
  await b.sleep(500);
};
const spaceMenu = async () => {
  // Just below the tiles; in an empty folder, inside the empty area.
  const p = await b.evaluate(`(() => {
    const g = document.querySelector('[data-testid=library-grid]')?.getBoundingClientRect();
    if (g) return { x: g.x + g.width / 2, y: g.bottom + 30 };
    const s = document.querySelector('[data-testid=library-space]').getBoundingClientRect();
    return { x: s.x + s.width / 2, y: s.y + 40 };
  })()`);
  await b.clickAt(p.x, p.y, { button: 'right' });
  await b.sleep(500);
};
const open = async (folderId, waitFor) => {
  await b.nav(`${BASE}/project/${data.course.id}${folderId ? `?folder=${folderId}` : ''}`);
  await b.waitText(waitFor, { timeout: 20000 });
  await b.sleep(2500);
};
const until = async (fn, msg, timeout = 8000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last === true) return;
    await b.sleep(250);
  }
  throw new Error(`${msg} (${JSON.stringify(last)})`);
};
const fileRow = async (title) =>
  (await admin.from('files').select('id, kind, course_id, folder_id, deleted_at').eq('user_id', user.id).eq('title', title).is('deleted_at', null)).data;
const undo = async () => {
  await b.click('UNDO');
  await b.sleep(1500);
};
/** Into a folder or up the breadcrumb inside the app (a page load would empty the app's clipboard). */
const into = async (name) => {
  await b.doubleClick(name, { exact: true, ...MAIN });
  await b.sleep(1500);
};
const upTo = async (crumb) => {
  await b.click(crumb, { exact: true, ...MAIN });
  await b.sleep(1500);
};
const focused = () => b.evaluate(`(document.activeElement?.innerText ?? '').trim().split('\\n')[0]`);

// ── Seed: Math › Tema A › Tema B ─────────────────────────────────────
const user = await makeUser();
const data = await seed(user.client);
const mkFolder = async (name, parent) =>
  (await admin.from('folders').insert({ user_id: user.id, course_id: data.course.id, parent_id: parent, name }).select().single()).data;
const A = await mkFolder('Tema A', null);
const B = await mkFolder('Tema B', A.id);
const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Upload (the file picker) adds a PDF and a photo as files in Tema A, with their Storage objects', async () => {
    await open(A.id, 'Tema B');
    // "+ New" → Upload document (the course toolbar is gone, step 3.4).
    await b.chooseFiles([apuntesPdf, pizarraPng], async () => {
      await b.clickSelector('[data-testid=sidebar] [aria-label="New"]');
      await b.sleep(400);
      await clickItem('Upload document');
    });
    await until(async () => (await fileRow('apuntes.pdf')).length === 1 && (await fileRow('pizarra.jpg')).length === 1, 'not added');
    const [pdf] = await fileRow('apuntes.pdf');
    const [photo] = await fileRow('pizarra.jpg');
    expect(pdf.kind === 'pdf' && pdf.folder_id === A.id && photo.kind === 'image' && photo.folder_id === A.id, JSON.stringify([pdf, photo]));
    expect((await admin.storage.from('slides').list(`${user.id}/${pdf.id}`)).data?.length === 1, 'no PDF in Storage');
    expect((await admin.storage.from('photos').list(`${user.id}/${photo.id}`)).data?.length === 1, 'no photo in Storage');
    await b.waitText("Added 2 files to Tema A", { timeout: 5000 });
    await b.waitText('apuntes.pdf', { exact: true, timeout: 5000, ...MAIN });
    await b.shot('menus34-uploaded');
  });

  await step('A PDF from the Finder dropped on a sidebar course goes to its top level', async () => {
    const to = await b.evaluate(`(() => { const el = [...document.querySelectorAll('[data-testid=sidebar] *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'Science'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await b.htmlDrag(null, to, { files: [temarioPdf] });
    await until(async () => {
      const rows = await fileRow('temario.pdf');
      return rows.length === 1 && rows[0].course_id === data.science.id && rows[0].folder_id === null;
    }, 'not in Science');
  });

  await step('Cut, then Paste in Tema B: moved (Undo puts it back); the clipboard empties', async () => {
    await open(A.id, 'apuntes.pdf');
    await tileMenu('apuntes.pdf');
    await clickItem('Cut');
    await into('Tema B');
    await spaceMenu();
    expect((await line('Paste'))?.text === "Paste 'apuntes.pdf'", JSON.stringify(await menu()));
    await clickItem("Paste 'apuntes.pdf'");
    await until(async () => (await fileRow('apuntes.pdf'))[0]?.folder_id === B.id, 'not moved to Tema B');
    await b.waitText("Moved 'apuntes.pdf' to Tema B", { timeout: 5000 });
    await undo();
    await until(async () => (await fileRow('apuntes.pdf'))[0]?.folder_id === A.id, 'Undo did not put it back');
    await spaceMenu();
    const paste = await line('Paste');
    expect(paste.disabled && paste.hint === 'Nothing to paste', JSON.stringify(paste));
    await b.press('Escape');
  });

  await step('Copy, then Paste: a real copy ("pizarra copy.jpg", its own Storage object); Undo deletes it; the clipboard stays', async () => {
    await open(A.id, 'pizarra.jpg');
    await open(A.id, 'pizarra.jpg');
    await tileMenu('pizarra.jpg');
    await clickItem('Copy');
    await upTo('Math');
    await spaceMenu();
    await clickItem("Paste 'pizarra.jpg'");
    await until(async () => (await fileRow('pizarra copy.jpg')).length === 1, 'no copy');
    const [copy] = await fileRow('pizarra copy.jpg');
    const [original] = await fileRow('pizarra.jpg');
    expect(copy.folder_id === null && copy.course_id === data.course.id, JSON.stringify(copy));
    const media = (await admin.from('media').select('file_id, storage_path').in('file_id', [copy.id, original.id])).data;
    expect(media.length === 2 && media[0].storage_path !== media[1].storage_path, JSON.stringify(media));
    expect((await admin.storage.from('photos').list(`${user.id}/${copy.id}`)).data?.length === 1, 'the copy has no Storage object');
    await undo();
    await until(async () => (await fileRow('pizarra copy.jpg')).length === 0, 'Undo did not delete the copy');
    expect((await fileRow('pizarra.jpg')).length === 1, 'the original went too');
    await spaceMenu();
    expect((await line('Paste'))?.text === "Paste 'pizarra.jpg'", 'the clipboard was emptied');
    await b.press('Escape');
  });

  await step('Greyed out with their hints: only Copy on a lecture; Summarize (7.3), Extend with next lecture… and Make exam pack… (7.9) work; New document works', async () => {
    await tileMenu('Lecture 1');
    const copy = await line('Copy');
    const summarize = await line('Summarize');
    const extend = await line('Extend with next lecture…');
    expect(copy.disabled && copy.hint === 'Coming soon', JSON.stringify(copy));
    expect(summarize && !summarize.disabled && !summarize.hint, JSON.stringify(summarize));
    expect(extend && !extend.disabled && !extend.hint, JSON.stringify(extend));
    expect(!(await menu()).some((l) => l.text.startsWith('Merge') || l.text.startsWith('Make exam pack')), `a lecture with a course's items: ${JSON.stringify(await menu())}`);
    await b.shot('menus34-lecture');
    // Since 7.3 Summarize works: the lecture opens with the summarize panel (after class: Cancel · Generate summary).
    await clickItem('Summarize');
    await until(async () => (await b.evaluate('location.pathname')) === `/doc/${data.lecture.id}` && (await b.evaluate(`!!document.querySelector('[data-summarize="preview"]')`)), 'Summarize did not open the lecture with the summarize panel', 20000);
    expect((await b.evaluate(`document.querySelector('[data-summarize="keep"]')?.textContent`)) === 'Cancel', 'not the after-class panel (Cancel · Generate summary)');
    await b.clickSelector('[data-summarize="keep"]');
    await until(async () => !(await b.evaluate(`!!document.querySelector('[data-summarize="panel"]')`)), 'the panel did not close');
    await open(null, 'Tema A');
    await tileMenu('Tema A');
    const pack = await line('Make exam pack…');
    const merge = await line('Merge lectures…');
    expect(pack && !pack.disabled && !pack.hint, JSON.stringify(pack));
    expect(merge && !merge.disabled && !merge.hint, JSON.stringify(merge));
    // Since 7.9: the lecture picker, for the folder's lectures (Tema A has none: nothing to choose).
    await clickItem('Make exam pack…');
    await until(() => b.evaluate(`!!document.querySelector('[data-picker="panel"][data-mode="exam_pack"]')`), 'Make exam pack… did not open the lecture picker');
    await b.clickSelector('[data-picker="cancel"]');
    await until(() => b.evaluate(`!document.querySelector('[data-picker="panel"]')`), 'the picker did not close');
    await spaceMenu();
    const doc = await line('New document');
    expect(!doc.disabled && !doc.hint, JSON.stringify(doc));
    await b.shot('menus34-space');
    await b.press('Escape');
  });

  await step('Move out: up one level (Tema A → Math), Undo puts it back; not offered at the top', async () => {
    await open(A.id, 'pizarra.jpg');
    await tileMenu('pizarra.jpg');
    await clickItem('Move out');
    await until(async () => (await fileRow('pizarra.jpg'))[0]?.folder_id === null, 'not moved out');
    await b.waitText("Moved 'pizarra.jpg' to Math", { timeout: 5000 });
    await undo();
    await until(async () => (await fileRow('pizarra.jpg'))[0]?.folder_id === A.id, 'Undo did not put it back');
    await open(null, 'Tema A');
    await tileMenu('Lecture 1');
    expect(!(await line('Move out')), 'Move out offered at the top of the course');
    await b.press('Escape');
  });

  await step('Keyboard: ⇧F10 opens the selected tile\'s menu, ↓ ↓ Enter chooses Move to…, Esc gives the focus back', async () => {
    await open(A.id, 'pizarra.jpg');
    await b.click('pizarra.jpg', { exact: true, ...MAIN });
    await b.sleep(300);
    await b.chord({ code: 'F10', key: 'F10', shift: true });
    await b.sleep(400);
    expect((await focused()) === 'Open', `focus: ${await focused()}`);
    await b.press('ArrowDown');
    await b.press('ArrowDown');
    expect((await focused()) === 'Move to…', `focus: ${await focused()}`);
    await b.press('Enter');
    await b.waitText('Move ‘pizarra.jpg’ to…', { timeout: 3000 });
    await b.click('Cancel', { exact: true });
    await b.sleep(500);
    await b.chord({ code: 'F10', key: 'F10', shift: true });
    await b.sleep(300);
    await b.press('Escape');
    await b.sleep(400);
    expect(await b.evaluate(`!!document.activeElement?.closest('[data-testid^=entry-]')`), 'the focus is not back on the tile');
  });

  await step('Keyboard: ⌘X on the selected tile, ⌘V in Tema B moves it', async () => {
    await b.click('apuntes.pdf', { exact: true, ...MAIN });
    await b.sleep(300);
    await b.chord({ code: 'KeyX', key: 'x', meta: true });
    await into('Tema B');
    await b.clickAt(1100, 860);
    await b.evaluate(`document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true }))`);
    await until(async () => (await fileRow('apuntes.pdf'))[0]?.folder_id === B.id, 'not moved by ⌘X / ⌘V');
  });

  await step('390: "…" opens the empty-space menu', async () => {
    await b.resize(390, 844);
    await open(A.id, 'pizarra.jpg');
    await b.clickSelector('[aria-label^="More: new folder"]');
    await b.waitText('New folder', { exact: true, timeout: 3000 });
    for (const t of ['New document', 'Upload document', 'Record', 'Sort by…']) expect(await b.hasText(t, true), `no ${t}`);
    await b.shot('menus34-more-390');
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
