// record-in-doc.mjs — step 5.7, Record inside a document (web: the laptop's
// row above the page and the 390 px layout's header), with a synthetic
// microphone, Chrome's fake camera and no paid call (transcribe-chunk is
// answered inside the page; the check fails if any request reaches
// transcribe-chunk, OpenAI or ElevenLabs).
// The document: "Apuntes de clase", its first tab renamed "Semana 3" with
// formatted text (a heading, bold, a list), a named version, Tab 2 and a
// sheet tab.
// Steps:
//   1. the Record button in a plain document (1280 and 390, light and dark);
//   2. Record: it becomes a lecture (files.kind, a lectures row "recording");
//      the tabs My notes · Summary · Transcript · Tab 2 · Sheet 1; My notes
//      is the same row with the same content; the old tab name is in a
//      version "Before recording · the tab was “Semana 3”", the earlier
//      version still there; the recording screens (1280 and 390, light and dark);
//   3. new lines get their time, the old ones don't; a mark and a photo go
//      into the lecture;
//   4. Stop: "transcribing", its chunks uploaded;
//   5. cancelled (the microphone refused): a plain document stays one, unchanged;
//   6. Record in that lecture again: the new chunks go on after the old ones;
//      meanwhile Record in another document is greyed out ("A recording is
//      already running");
//   7. the laptop offline: Record greyed out ("Recording needs a connection on
//      the laptop");
//   8. no paid request.
// Screenshots (each after the splash): record-button-1280(-dark), record-button-390(-dark),
// converted-1280(-dark), converted-390(-dark), record-blocked-1280.
// About 3 minutes. PASS/FAIL per step; exit 1 on a FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node record-in-doc.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-record-in-doc-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(250);
  }
}

const repo = join(fileURLToPath(scripts), '../../../../');
const policy = readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(policy)?.[1];
if (!POLICY_VERSION) throw new Error('CONSENT_POLICY_VERSION not found in policy.ts');

/**
 * Before the app: the microphone is a synthetic tone (refused while window.__denyMic is set); the
 * camera stays Chrome's fake one; transcribe-chunk is answered in the page (failing while offline).
 */
const PAGE_SETUP = `(() => {
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.__denyMic = false;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) return original(constraints);
    if (window.__denyMic) throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const out = ctx.createMediaStreamDestination();
    const tone = ctx.createOscillator();
    tone.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    tone.connect(gain).connect(out);
    tone.start();
    return out.stream;
  };
  const realFetch = window.fetch.bind(window);
  window.__checkOffline = false;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      if (window.__checkOffline) throw new TypeError('Failed to fetch');
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      const segments = [{ startMs: body.startMs, endMs: body.startMs + 1000, text: 'Simulated chunk ' + body.seq }];
      return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 0, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

const user = await makeUser();
const data = await seed(user.client);
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const path = () => b.evaluate('location.pathname + location.search');
const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  await b.sleep(400);
  return b.shot(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(600);
};
const both = async (name) => {
  await shot(name);
  await dark(true);
  await shot(`${name}-dark`);
  await dark(false);
};
const offline = async (on) => {
  await b.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.evaluate(`window.__checkOffline = ${on}`);
};
/**
 * The document's tabs, in order (their names): only its own tab row (the one with "Add tab"); the app's
 * bottom navigation (Library, Search…, in the page but hidden on the laptop) also marks its items selected.
 */
const tabNames = () =>
  b.evaluate(`(() => {
    const add = document.querySelector('[aria-label="Add tab"]');
    let row = add && add.parentElement;
    while (row && !row.querySelector('[aria-selected]')) row = row.parentElement;
    return row ? [...row.querySelectorAll('[aria-selected]')].map((t) => t.getAttribute('aria-label')).filter(Boolean) : [];
  })()`);
const openDoc = async (id, tab) => {
  await b.nav(`${BASE}/doc/${id}${tab ? `?tab=${tab}` : ''}`);
  await waitFor(() => has('.ProseMirror'), 'the document', 30000);
  await b.sleep(800);
};
const fileRow = async (id) => (await admin.from('files').select('kind, title, course_id').eq('id', id).single()).data;
const lectureRow = async (id) => (await admin.from('lectures').select('status, duration_ms').eq('id', id).maybeSingle()).data;
const notesRow = async (id) => (await admin.from('documents').select('id, content, title, deleted_at').eq('file_id', id).eq('tab', 'notes').single()).data;
const chunkRows = async (id) => (await admin.from('audio_chunks').select('seq, start_ms, duration_ms, storage_path').eq('lecture_id', id).order('seq')).data ?? [];
const stopRecording = async () => {
  await b.clickSelector('[aria-label="Stop and summarize"]');
  // Step 7.3: the summarize panel; its Stop & generate summary stops, saves and opens the Summary tab.
  await waitFor(() => b.evaluate(`!!document.querySelector('[data-summarize="preview"]')`), 'the summarize panel', 15000);
  await b.clickSelector('[data-summarize="generate"]');
  await waitFor(() => b.evaluate(`!!document.querySelector('[data-summarize="requested"]')`), async () => `the Summary tab after Stop (at ${await path()})`, 90000);
};

// The plain document: its first tab renamed, formatted text, a named version, Tab 2 and a sheet tab.
const blk = (id, node) => ({ ...node, attrs: { ...(node.attrs ?? {}), blockId: id, origin: 'student', editedAt: 1000 } });
const WRITTEN = {
  type: 'doc',
  content: [
    blk('b1', { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Tema 3: la sinapsis' }] }),
    blk('b2', { type: 'paragraph', content: [{ type: 'text', text: 'Lo que ya escribí ', marks: [] }, { type: 'text', text: 'en negrita', marks: [{ type: 'bold' }] }] }),
    blk('b3', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Un punto de la lista' }] }] }] }),
  ],
};
const T2 = 't-0b6f1c2e-4d3a-4f5b-9c8d-000000000002';
const SHEET = 't-0b6f1c2e-4d3a-4f5b-9c8d-000000000003';
async function plainDocument(title, notesTitle) {
  const { data: file, error } = await user.client.from('files').insert({ kind: 'document', title, course_id: data.course.id }).select().single();
  if (error) throw new Error(`the document: ${error.message}`);
  const rows = [
    { file_id: file.id, tab: 'notes', content: WRITTEN, title: notesTitle },
    { file_id: file.id, tab: T2, content: { type: 'doc', content: [blk('c1', { type: 'paragraph', content: [{ type: 'text', text: 'Texto de la pestaña 2' }] })] }, title: 'Tab 2', position: 1 },
    { file_id: file.id, tab: SHEET, content: { type: 'doc', content: [] }, title: 'Sheet 1', position: 2, kind: 'sheet' },
  ];
  const { data: docs, error: docError } = await user.client.from('documents').insert(rows).select('id, tab');
  if (docError) throw new Error(`the tabs: ${docError.message}`);
  const notesId = docs.find((d) => d.tab === 'notes').id;
  const { error: versionError } = await user.client.from('document_versions').insert({ file_id: file.id, document_id: notesId, reason: 'session_end', content: WRITTEN, name: 'Mi versión' });
  if (versionError) throw new Error(`the version: ${versionError.message}`);
  return file.id;
}

let docId = null;
let otherId = null;
try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  docId = await plainDocument('Apuntes de clase', 'Semana 3');
  otherId = await plainDocument('Otro documento', null);
  await b.signIn(BASE, user.email, user.password);

  await step('the Record button in a plain document (1280 and 390, light and dark)', async () => {
    await openDoc(docId);
    await waitFor(async () => (await attr('[aria-label="Record"]', 'data-record-button')) === 'ready', 'the Record button', 10000);
    expect(JSON.stringify(await tabNames()) === JSON.stringify(['Semana 3', 'Tab 2', 'Sheet 1']), `the tabs before: ${JSON.stringify(await tabNames())}`);
    await both('record-button-1280');
    await b.resize(390, 844);
    try {
      await waitFor(() => has('[aria-label="Record"]'), 'the Record button at 390', 10000);
      await both('record-button-390');
    } finally {
      await b.resize(1280, 900);
    }
  });

  let before = null;
  await step('Record: it becomes a lecture; My notes is the same row and content; the old tab name in a version; the tabs; recording', async () => {
    before = await notesRow(docId);
    // The editor before Record: the same one must still be there after (not re-mounted, its text not replaced).
    await b.evaluate(`(() => { window.__editorBefore = window.studiplyEditor; window.studiplyEditor.view.dom.dataset.beforeRecord = '1'; })()`);
    await b.clickSelector('[aria-label="Record"]');
    await waitFor(() => has('[data-recording="strip"]'), 'recording (the strip)', 20000);
    expect((await fileRow(docId)).kind === 'lecture', `files.kind: ${(await fileRow(docId)).kind}`);
    const lecture = await waitFor(() => lectureRow(docId), 'the lectures row', 5000);
    expect(lecture.status === 'recording', `status: ${lecture.status}`);
    const after = await notesRow(docId);
    expect(after.id === before.id && JSON.stringify(after.content) === JSON.stringify(before.content) && after.title === null, `My notes: ${JSON.stringify({ id: after.id, title: after.title })}`);
    await waitFor(async () => JSON.stringify(await tabNames()) === JSON.stringify(['My notes', 'Summary', 'Transcript', 'Tab 2', 'Sheet 1']), async () => `the tabs: ${JSON.stringify(await tabNames())}`, 10000);
    const { data: versions } = await admin.from('document_versions').select('name, content').eq('file_id', docId);
    const names = versions.map((v) => v.name);
    expect(names.includes('Before recording · the tab was “Semana 3”') && names.includes('Mi versión'), `versions: ${JSON.stringify(names)}`);
    // The editor shows the same text, its formatting kept.
    const shown = await b.evaluate(`JSON.stringify(window.studiplyEditor.getJSON())`);
    expect(shown.includes('Lo que ya escribí') && shown.includes('"bold"') && shown.includes('bulletList'), 'My notes in the editor lost its text or formatting');
    // The same editor all along: nothing re-mounted it or swapped its page while the document became a lecture.
    const same = await b.evaluate(`window.studiplyEditor === window.__editorBefore && window.studiplyEditor.view.dom.dataset.beforeRecord === '1'`);
    expect(same, 'the editor was re-mounted when the document became a lecture');
    await both('converted-1280');
    await b.resize(390, 844);
    try {
      await waitFor(() => has('[data-recording="bar"]'), 'the iPhone recording screen', 10000);
      await both('converted-390');
    } finally {
      await b.resize(1280, 900);
    }
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 10000);
  });

  await step('new lines get their time, the old ones don’t; a mark and a photo go into the lecture', async () => {
    // The text ends with a list: Enter there makes a new list item, a line like any other (live stamps stamp it too).
    // Tiptap's focus() moves the browser's focus in the next animation frame (Chrome): keys sent before
    // that go to the page. So the keys wait until the editor really has the focus, as after a click.
    await b.evaluate(`window.studiplyEditor.commands.focus('end')`);
    await waitFor(() => b.evaluate(`window.studiplyEditor.view.hasFocus()`), 'the editor focused', 5000);
    await b.press('Enter');
    await b.type('Nueva línea en clase');
    await b.sleep(800);
    // Every line of the text (a heading, a paragraph, a list item's line), with whether it starts with a time.
    const lines = await b.evaluate(`(() => {
      const out = [];
      window.studiplyEditor.state.doc.descendants((n) => {
        if (!n.isTextblock) return true;
        out.push({ text: n.textContent, chip: !!n.firstChild && n.firstChild.type.name === 'timestampChip' });
        return false;
      });
      return out;
    })()`);
    const added = lines.find((l) => l.text.includes('Nueva línea en clase'));
    expect(added && added.chip, `the new line has no time: ${JSON.stringify(lines)}`);
    const old = lines.filter((l) => l !== added && l.text.trim());
    expect(old.length === 3 && old.every((l) => !l.chip), `an old line got a time: ${JSON.stringify(lines)}`);
    // A mark.
    await b.clickSelector('[data-mark-button="important"]');
    await waitFor(() => has('[data-mark="panel"]'), 'the mark panel', 5000);
    await b.clickSelector('[aria-label="Save mark"]');
    await waitFor(async () => ((await admin.from('marks').select('id').eq('lecture_id', docId)).data ?? []).length === 1, 'the mark\'s row', 20000);
    // A photo (the webcam).
    await b.clickSelector('[aria-label="Photo board"]');
    await b.waitText('Take a photo (webcam)', { exact: true, timeout: 5000 });
    await b.click('Take a photo (webcam)', { exact: true });
    await waitFor(async () => (await attr('[aria-label="Take photo"]', 'aria-disabled')) !== 'true', 'the webcam live', 15000);
    await b.clickSelector('[aria-label="Take photo"]');
    await waitFor(async () => ((await admin.from('media').select('id').eq('lecture_id', docId)).data ?? []).length === 1, 'the photo\'s row', 20000);
  });

  let firstChunks = [];
  await step('Stop: "transcribing", its chunks uploaded', async () => {
    await b.sleep(3000);
    await stopRecording();
    const lecture = await lectureRow(docId);
    firstChunks = await chunkRows(docId);
    expect(lecture.status === 'transcribing' && firstChunks.length >= 1 && firstChunks.every((c) => c.storage_path), `${JSON.stringify(lecture)}; chunks ${JSON.stringify(firstChunks)}`);
    report.push(`RESULT | first recording | ${firstChunks.length} chunk(s), ${Math.round(lecture.duration_ms / 1000)} s`);
  });

  await step('cancelled (the microphone refused): a plain document stays one, unchanged', async () => {
    const was = await notesRow(otherId);
    await openDoc(otherId);
    await b.evaluate('window.__denyMic = true');
    try {
      await b.clickSelector('[aria-label="Record"]');
      await b.waitText('Microphone access needed', { timeout: 10000 });
      await b.click('OK', { exact: true });
    } finally {
      await b.evaluate('window.__denyMic = false');
    }
    await b.sleep(1000);
    expect((await fileRow(otherId)).kind === 'document' && (await lectureRow(otherId)) === null, 'it changed');
    expect(JSON.stringify(await notesRow(otherId)) === JSON.stringify(was), 'its first tab changed');
    expect(!(await has('[data-recording="strip"]')), 'recording');
  });

  await step('Record in that lecture again: the new chunks go on after the old ones; Record elsewhere is greyed out meanwhile', async () => {
    await openDoc(docId, 'notes');
    await waitFor(async () => (await attr('[aria-label="Record"]', 'data-record-button')) === 'ready', 'Record in the lecture', 10000);
    await b.clickSelector('[aria-label="Record"]');
    await waitFor(() => has('[data-recording="strip"]'), 'recording again', 20000);
    expect((await lectureRow(docId)).status === 'recording', 'not recording');
    // Another document meanwhile (opened inside the app: a page load would interrupt the recording):
    // Record greyed out with the reason.
    await b.click('Math', { exact: true });
    await b.waitText('Otro documento', { exact: true, timeout: 10000 });
    await b.click('Otro documento', { button: 'right' });
    await b.click('Open', { exact: true });
    await waitFor(async () => (await path()).includes(otherId), async () => `the other document opened (at ${await path()})`, 10000);
    await waitFor(() => has('[aria-label="Record"]'), 'its Record button', 10000);
    await waitFor(async () => (await attr('[aria-label="Record"]', 'data-reason')) === 'A recording is already running', async () => `the reason: ${await attr('[aria-label="Record"]', 'data-reason')}`, 10000);
    expect((await attr('[aria-label="Record"]', 'aria-disabled')) === 'true', 'Record usable while another lecture records');
    await shot('record-blocked-1280');
    await b.clickSelector('[aria-label^="Recording,"]');
    await waitFor(async () => (await path()).includes(docId), 'back at the lecture', 10000);
    await b.sleep(3000);
    await stopRecording();
    const all = await chunkRows(docId);
    const lastOld = firstChunks[firstChunks.length - 1];
    const fresh = all.filter((c) => c.seq > lastOld.seq);
    expect(fresh.length >= 1 && all.length === firstChunks.length + fresh.length, `chunks: ${JSON.stringify(all.map((c) => c.seq))}`);
    expect(fresh[0].seq === lastOld.seq + 1 && fresh[0].start_ms >= lastOld.start_ms + lastOld.duration_ms - 600, `the new chunk ${JSON.stringify(fresh[0])} after ${JSON.stringify(lastOld)}`);
    report.push(`RESULT | again | chunks ${all.map((c) => `${c.seq}@${c.start_ms}`).join(', ')}`);
  });

  await step('the laptop offline: Record greyed out ("Recording needs a connection on the laptop")', async () => {
    await openDoc(otherId);
    await offline(true);
    try {
      // A save that fails tells the app it is offline at once.
      await b.evaluate(`window.studiplyEditor.commands.focus('end')`);
      await waitFor(() => b.evaluate(`window.studiplyEditor.view.hasFocus()`), 'the editor focused', 5000);
      await b.type(' x');
      await waitFor(async () => (await attr('[aria-label="Record"]', 'data-reason')) === 'Recording needs a connection on the laptop', async () => `the reason: ${await attr('[aria-label="Record"]', 'data-reason')}`, 45000);
      expect((await attr('[aria-label="Record"]', 'aria-disabled')) === 'true', 'Record usable offline');
    } finally {
      await offline(false);
    }
  });

  await step('no request reached transcribe-chunk, OpenAI or ElevenLabs (transcription answered in the page)', async () => {
    const out = requests.filter((u) => /functions\/v1\/transcribe-chunk|api\.openai\.com|elevenlabs\.io/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  for (const r of report) console.log(r);
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
