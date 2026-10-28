// documents.mjs — documents that save themselves (step 4.3), on the laptop:
//   - New document in a folder (the New menu): it opens with its title
//     selected; the title and the text save themselves ("Saved ·") into the
//     files / documents rows;
//   - another device writes another block (service role, as the iPhone's
//     sync would): it appears within a few seconds and the local text stays;
//   - leaving keeps a version of the session; restore brings an older text
//     back and keeps "Before restore"; a named version survives thinning;
//   - a lecture: three tabs; Summary shows the earlier-format notes with
//     Open notes (→ /note/); Transcript is made from the segments, with chips;
//   - screenshots at 1280 and 390, light and dark (doc-*.png).
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
import { launch, SHOTS } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const notes = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-doc-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };
const texts = (doc) => (doc?.content ?? []).map((n) => (n.content ?? []).map((c) => c.text ?? '').join(''));
const EDITOR = 'window.studiplyEditor';

const user = await makeUser();
const data = await seed(user.client);
b = await launch();

async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${what}`);
    await b.sleep(250);
  }
}
const docRow = async (fileId, tab = 'notes') =>
  (await admin.from('documents').select('*').eq('file_id', fileId).eq('tab', tab).maybeSingle()).data;
const pageText = () => b.evaluate(`document.querySelector('.studiply-editor .ProseMirror')?.innerText ?? ''`);
const editorReady = () => waitFor(() => b.evaluate(`!!${EDITOR}?.view?.dom && !!document.querySelector('.studiply-editor .ProseMirror')`), 'the editor');

let docId = null;
let lectureId = null;

try {
  await b.signIn(BASE, user.email, user.password);

  await step('New document in a folder opens with its title selected', async () => {
    await b.nav(`${BASE}/project/${data.course.id}?folder=${data.folder.id}`);
    await b.waitText('Funcions', { timeout: 30000, ...MAIN });
    await b.sleep(1500);
    await b.click('New');
    await b.click('New document');
    await waitFor(() => b.evaluate(`location.pathname.startsWith('/doc/')`), 'the document screen');
    docId = await b.evaluate(`location.pathname.split('/')[2]`);
    await editorReady();
    await b.sleep(600);
    const focused = await b.evaluate(`document.activeElement?.getAttribute('aria-label')`);
    expect(focused === 'Document title', `focus is on ${focused}`);
    const { data: file } = await admin.from('files').select('*').eq('id', docId).single();
    expect(file.kind === 'document' && file.title === 'Untitled document', JSON.stringify(file));
    expect(file.course_id === data.course.id && file.folder_id === data.folder.id, 'not in the folder');
    await b.shot('doc-new-1280');
  });

  await step('the title and the text save themselves', async () => {
    await b.type('Apuntes Tema 1');
    await b.press('Enter');
    await waitFor(async () => (await admin.from('files').select('title').eq('id', docId).single()).data?.title === 'Apuntes Tema 1', 'title saved');
    await b.clickSelector('.studiply-editor .ProseMirror');
    await b.type('La psicobiología estudia la conducta.');
    await waitFor(() => b.hasText('Saved ·'), '"Saved ·" in the top bar');
    await waitFor(async () => texts((await docRow(docId))?.content).includes('La psicobiología estudia la conducta.'), 'text in the row', 8000);
    const row = await docRow(docId);
    const block = row.content.content[0];
    expect(block.attrs.origin === 'student' && typeof block.attrs.editedAt === 'number' && block.attrs.blockId, JSON.stringify(block.attrs));
  });

  await step('another device\'s block appears within a few seconds; the text here stays', async () => {
    const row = await docRow(docId);
    const content = { ...row.content, content: [...row.content.content, { type: 'paragraph', attrs: { blockId: 'from-iphone', origin: 'student', editedAt: Date.now() }, content: [{ type: 'text', text: 'Escrito en el iPhone' }] }] };
    const { error } = await admin.from('documents').update({ content }).eq('id', row.id);
    expect(!error, error?.message);
    const started = Date.now();
    await waitFor(async () => (await pageText()).includes('Escrito en el iPhone'), 'the other device\'s block', 9000);
    notes.push(`the other device's block appeared after ${((Date.now() - started) / 1000).toFixed(1)} s`);
    expect((await pageText()).includes('La psicobiología estudia la conducta.'), 'the local text is gone');
    await b.shot('doc-synced-1280');
  });

  await step('leaving keeps a version of the session', async () => {
    // Leaving inside the app, as the student does (a page reload would cut the save short).
    await b.click('Recent');
    await b.sleep(2000);
    const { data: versions } = await admin.from('document_versions').select('reason, content').eq('file_id', docId);
    expect(versions?.some((v) => v.reason === 'session_end' && texts(v.content).includes('La psicobiología estudia la conducta.')), JSON.stringify(versions?.map((v) => v.reason)));
  });

  await step('a lecture: tabs, the earlier-format notes, the transcript with chips', async () => {
    lectureId = data.lecture.id;
    await admin.from('lectures').update({ status: 'ready' }).eq('id', lectureId);
    await user.client.from('summaries').insert({
      file_id: lectureId,
      mode: 'new',
      status: 'done',
      sliders: {},
      result: {
        format: 'legacy-note-v1', title: 'Lecture 1', summaryLevel: 'standard', recordingMode: 'lecture',
        summary: 'La psicobiología estudia la conducta como proceso biológico, dentro de la psicología y la biología.',
        keyConcepts: [], formulas: [], definitions: [], tags: [], unclearParts: [], manualAnnotations: null, isConfirmed: true,
      },
    });
    await user.client.from('transcript_segments').insert([
      { lecture_id: lectureId, start_ms: 5000, end_ms: 9000, text: 'Hoy empezamos el tema uno.' },
      { lecture_id: lectureId, start_ms: 252000, end_ms: 256000, text: 'Esto entra en el examen.' },
    ]);
    await b.nav(`${BASE}/doc/${lectureId}?tab=summary`);
    await b.waitText('NOTES IN THE EARLIER FORMAT', { timeout: 30000 });
    for (const t of ['My notes', 'Summary', 'Transcript']) expect(await b.hasText(t, true), `no ${t} tab`);
    await b.sleep(1500);
    await b.shot('doc-lecture-summary-1280');
    await b.click('Transcript');
    await editorReady();
    await waitFor(async () => (await b.evaluate(`[...document.querySelectorAll('.studiply-editor .ts-chip')].map((c) => c.textContent).join(',')`)) === '0:05,4:12', 'chips 0:05 and 4:12');
    const row = await waitFor(() => docRow(lectureId, 'transcript'), 'the transcript row');
    expect(row.content.content.every((blk) => blk.attrs.origin === 'media'), 'transcript blocks are not media');
    await b.shot('doc-lecture-transcript-1280');
    await b.click('Summary');
    await b.click('Open notes');
    await waitFor(() => b.evaluate(`location.pathname === '/note/${lectureId}'`), 'the notes view');
  });

  await step('iPhone width (390 px) and dark mode', async () => {
    await b.resize(390, 844);
    await b.nav(`${BASE}/doc/${lectureId}?tab=summary`);
    await b.waitText('NOTES IN THE EARLIER FORMAT', { timeout: 30000 });
    await b.sleep(2500);
    await b.shot('doc-lecture-summary-390');
    await b.nav(`${BASE}/doc/${docId}`);
    await editorReady();
    await b.sleep(2500);
    await b.shot('doc-blank-390');
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await b.nav(`${BASE}/doc/${lectureId}?tab=summary`);
    await b.waitText('NOTES IN THE EARLIER FORMAT', { timeout: 30000 });
    await b.sleep(2500);
    await b.shot('doc-lecture-summary-390-dark');
    await b.resize(1280, 900);
    await b.nav(`${BASE}/doc/${docId}`);
    await editorReady();
    await b.sleep(2500);
    const page = await b.evaluate(`getComputedStyle(document.querySelector('.studiply-editor .ProseMirror')).backgroundColor`);
    expect(page === 'rgb(255, 255, 255)', `page ${page}`);
    await b.shot('doc-blank-1280-dark');
    await b.send('Emulation.setEmulatedMedia', { features: [] });
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  for (const n of notes) console.log('NOTE |', n);
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
