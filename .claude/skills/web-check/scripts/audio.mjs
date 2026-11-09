// audio.mjs — step 10.1b-3, a recording deleted 3 days after transcription by default, in Chrome
// against local Supabase (migration 20261029152600_audio_auto_delete applied). No AI call (every AI
// function is answered in the page and counted) and no Edge Function: the nightly job's two database
// calls (audio_purge_plan, audio_purge) and its Storage removal are made here with the service role,
// for this test user's lecture only. `npm run check:purge` checks the real function.
//
// Steps:
//   1. Settings → Storage & sync (1280, desktop-05; 390, iphone-07): "Default file retention" lists
//      "Delete 3 days after transcription" first, chosen for a new account. Light and dark.
//   2. A lecture transcribed yesterday (the server dates it): its notes' Source Files say
//      "Deletes on <transcribed + 3 days>" for the recording. 1280 and 390, light and dark.
//   3. The job on a lecture transcribed 4 days ago: its audio file removed, its chunk rows kept
//      without a path, the lecture marked deleted; its notes say "Recording: Deleted on <today>. The
//      transcript and notes stay.", the transcript is still there, the photo stays. Nothing of the
//      first lecture touched.
//   4. Changing the setting: Keep forever clears the date (the server's), back to Delete in 3 days
//      dates it again from the transcription.
//   5. Composites beside desktop-05 and iphone-07 (the notes view has no mockup), light and dark.
//
// The run always ends (its Chrome closed, the process exits), also after failures, or after 10 minutes.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/audio.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-audio-${results.length}`).catch(() => {});
    await b.press('Escape').catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(200);
  }
}
const must = async (promise, what) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

/** AI functions answered in the page (nothing reaches them) and counted. */
const PAGE_SETUP = `(() => {
  const realFetch = window.fetch.bind(window);
  window.__aiCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && /\\/functions\\/v1\\/(transcribe-chunk|summarize|assistant-chat|quiz)\\b/.test(url)) {
      window.__aiCalls.push(url.replace(/^.*\\/functions\\/v1\\//, ''));
      return new Response(JSON.stringify({ code: 'server_error', error: 'Answered by the check.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

const user = await makeUser();
const data = await seed(user.client);
b = await launch();
const uploaded = [];

let finished = false;
const finish = async (code) => {
  if (finished) return;
  finished = true;
  await b.close().catch(() => {});
  if (uploaded.length) await admin.storage.from('audio-chunks').remove(uploaded).catch(() => {});
  await dropUser(user.id).catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => void finish(130));
process.on('SIGTERM', () => void finish(143));
setTimeout(() => {
  console.error('audio.mjs: still running after 10 minutes; stopping');
  void finish(1);
}, 10 * MIN).unref();

await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const aiCalls = async () => (await b.evaluate('window.__aiCalls').catch(() => [])) ?? [];
const taken = new Set();
const shot = async (name) => {
  await b.sleep(600);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(700);
};
const shots = async (name) => {
  await shot(name);
  await dark(true);
  await shot(`${name}-dark`);
  await dark(false);
};
const splashGone = () =>
  waitFor(
    () =>
      b.evaluate(`(() => {
        const el = [...document.querySelectorAll('div, span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY');
        if (!el) return true;
        let o = 1;
        for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o <= 0.05;
      })()`),
    'the splash screen gone',
    20000,
  );
const go = async (where) => {
  await b.nav(`${BASE}${where}`);
  await waitFor(() => b.evaluate(`document.body.innerText.trim().length > 0`), 'the app drawn', 30000);
  await b.sleep(300);
  await splashGone();
  await b.sleep(500);
};
/** Scrolls the visible element whose own text includes `t` to the middle. */
const reveal = (t) =>
  b.evaluate(`(() => { const el = [...document.querySelectorAll('div, span')].filter((e) => e.childElementCount === 0 && e.innerText?.includes(${JSON.stringify(t)}) && e.getBoundingClientRect().width > 0)[0]; if (!el) return false; el.scrollIntoView({ block: 'center' }); return true; })()`);
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const rowOf = (id) => must(admin.from('lectures').select('audio_retention, transcribed_at, audio_delete_after, audio_deleted_at').eq('id', id).single(), 'the lecture');

/** A transcribed lecture with an earlier-format note, one audio chunk (a real Storage object), a transcript line and a photo row. */
async function lecture(title, transcribedAgoMs) {
  const file = await must(user.client.from('files').insert({ kind: 'lecture', title, course_id: data.course.id }).select('id').single(), 'the lecture file');
  await must(user.client.from('lectures').insert({ id: file.id, status: 'ready', duration_ms: 30000 }), 'the lecture');
  const path = `${user.id}/${file.id}/0000.webm`;
  await must(user.client.storage.from('audio-chunks').upload(path, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }), { contentType: 'audio/webm' }), 'the audio file');
  uploaded.push(path);
  await must(user.client.from('audio_chunks').insert({ lecture_id: file.id, seq: 0, start_ms: 0, duration_ms: 30000, storage_path: path, status: 'transcribed' }), 'the chunk');
  await must(user.client.from('transcript_segments').insert({ lecture_id: file.id, start_ms: 0, end_ms: 4000, text: 'Hola, empezamos el tema dos.' }), 'the transcript');
  await must(
    admin.from('summaries').insert({
      user_id: user.id, file_id: file.id, mode: 'new', source_lecture_ids: [file.id], sliders: {}, status: 'done',
      result: { format: 'legacy-note-v1', title, summaryLevel: 'standard', recordingMode: 'lecture', summary: 'Notas de la clase.', keyConcepts: [], formulas: [], definitions: [], tags: [], unclearParts: [], manualAnnotations: null, isConfirmed: true },
    }),
    'the note',
  );
  // The server's transcription time (the app never sets it), as the last chunk's trigger would.
  const at = new Date(Date.now() - transcribedAgoMs).toISOString();
  await must(admin.from('lectures').update({ transcribed_at: at }).eq('id', file.id), 'the transcription time');
  return { id: file.id, path, transcribedAt: Date.parse(at) };
}

let due;
let recent;

try {
  await b.signIn(BASE, user.email, user.password);

  await step('Settings → Storage & sync (desktop-05 / iphone-07): "Delete 3 days after transcription" first, chosen for a new account', async () => {
    await b.resize(1280, 900);
    await go('/settings/storage');
    await b.waitText('Delete 3 days after transcription', { timeout: 15000 });
    const radios = await b.evaluate(`[...document.querySelectorAll('[role="radio"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ text: e.innerText.trim(), checked: e.getAttribute('aria-checked') }))`);
    const retention = radios.filter((r) => /Delete|Keep/.test(r.text));
    expect(retention[0]?.text === 'Delete 3 days after transcription' && retention[0]?.checked === 'true', `the choices: ${JSON.stringify(retention)}`);
    await reveal('Delete 3 days after transcription');
    await shots('audio-settings-1280');
    await b.resize(390, 844);
    await go('/settings/storage');
    await b.waitText('Delete 3 days after transcription', { timeout: 15000 });
    await reveal('Delete 3 days after transcription');
    await shots('audio-settings-390');
    await b.resize(1280, 900);
  });

  await step('a lecture transcribed yesterday: its Source Files say "Deletes on <transcribed + 3 days>" (the server’s date)', async () => {
    recent = await lecture('Tema 2 · ayer', DAY);
    const row = await rowOf(recent.id);
    expect(row.audio_retention === 'delete_3_days' && Math.abs(Date.parse(row.audio_delete_after) - (recent.transcribedAt + 3 * DAY)) < MIN, `the date: ${JSON.stringify(row)}`);
    const want = `Deletes on ${day(recent.transcribedAt + 3 * DAY)}`;
    await go(`/note/${recent.id}`);
    await b.waitText('Source Files', { timeout: 20000 });
    await waitFor(() => b.hasText(want, false), `"${want}" in Source Files`, 15000);
    report.push(`RESULT | recent lecture: ${want}`);
    await reveal(want);
    await shots('audio-due-1280');
    await b.resize(390, 844);
    await go(`/note/${recent.id}`);
    await b.waitText('Source Files', { timeout: 20000 });
    await waitFor(() => b.hasText(want, false), `"${want}" at 390`, 15000);
    await reveal(want);
    await shots('audio-due-390');
    await b.resize(1280, 900);
  });

  await step('the job on a lecture transcribed 4 days ago: file removed, chunk row kept without a path, lecture marked deleted; "Recording: Deleted on <today>…", the transcript stays; the other lecture untouched', async () => {
    due = await lecture('Tema 1 · hace 4 días', 4 * DAY);
    await must(admin.from('media').insert({ user_id: user.id, lecture_id: due.id, kind: 'photo', storage_path: `${user.id}/${due.id}/board.jpg` }), 'a photo row');
    // The nightly job, for this lecture only: plan → Storage → mark.
    const plan = (await must(admin.rpc('audio_purge_plan', { due: new Date().toISOString() }), 'the plan')).filter((r) => r.lecture_id === due.id);
    expect(plan.length === 1 && plan[0].path === due.path, `the plan for it: ${JSON.stringify(plan)}`);
    expect(!(await must(admin.rpc('audio_purge_plan', { due: new Date().toISOString() }), 'the plan')).some((r) => r.lecture_id === recent.id), 'the recent lecture is in the plan');
    await must(admin.storage.from('audio-chunks').remove([due.path]), 'removing the file');
    const counts = await must(admin.rpc('audio_purge', { lecture_ids: [due.id] }), 'marking it');
    expect(counts?.[0]?.lectures === 1 && counts?.[0]?.chunks === 1, `marked: ${JSON.stringify(counts)}`);

    const row = await rowOf(due.id);
    expect(row.audio_deleted_at && row.audio_delete_after === null, `the lecture: ${JSON.stringify(row)}`);
    const chunks = await must(admin.from('audio_chunks').select('storage_path').eq('lecture_id', due.id), 'its chunks');
    expect(chunks.length === 1 && chunks[0].storage_path === null, `its chunk: ${JSON.stringify(chunks)}`);
    expect((await must(admin.from('media').select('id').eq('lecture_id', due.id), 'its photo')).length === 1, 'the photo row went');
    const other = await must(admin.from('audio_chunks').select('storage_path').eq('lecture_id', recent.id), 'the other chunks');
    expect(other[0]?.storage_path === recent.path, 'the recent lecture lost its file');

    const want = `Recording: Deleted on ${day(Date.parse(row.audio_deleted_at))}. The transcript and notes stay.`;
    await go(`/note/${due.id}`);
    await b.waitText('Source Files', { timeout: 20000 });
    await waitFor(() => has('[data-lecture-audio="deleted"]'), 'the deleted line', 15000);
    const line = await b.evaluate(`document.querySelector('[data-lecture-audio="deleted"]')?.innerText ?? ''`);
    expect(line === want, `the line: "${line}" (wanted "${want}")`);
    expect(!(await b.hasText('Deletes on', false)), 'a recording row is still listed');
    report.push(`RESULT | after the job: ${line}`);
    await reveal('Recording: Deleted on');
    await shots('audio-deleted-1280');
    await b.resize(390, 844);
    await go(`/note/${due.id}`);
    await waitFor(() => has('[data-lecture-audio="deleted"]'), 'the deleted line at 390', 15000);
    await reveal('Recording: Deleted on');
    await shots('audio-deleted-390');
    await b.resize(1280, 900);
  });

  await step('changing the setting: Keep forever clears the date (the server’s); Delete in 3 days dates it again from the transcription', async () => {
    await must(user.client.from('lectures').update({ audio_retention: 'keep_permanently' }).eq('id', recent.id), 'Keep forever');
    expect((await rowOf(recent.id)).audio_delete_after === null, 'Keep forever kept a date');
    await go(`/note/${recent.id}`);
    await waitFor(() => b.hasText('Kept permanently', false), '"Kept permanently"', 15000);
    await must(user.client.from('lectures').update({ audio_retention: 'delete_3_days', audio_delete_after: new Date(Date.now() + 365 * DAY).toISOString() }).eq('id', recent.id), 'Delete in 3 days');
    const row = await rowOf(recent.id);
    expect(Math.abs(Date.parse(row.audio_delete_after) - (recent.transcribedAt + 3 * DAY)) < MIN, `dated again from the transcription (and not the app's date): ${JSON.stringify(row)}`);
    expect((await aiCalls()).length === 0, `AI calls: ${JSON.stringify(await aiCalls())}`);
  });

  await step('composites beside desktop-05 and iphone-07, light and dark', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const mock = (name) => png(join(repo, 'docs/design', `${name}.png`));
    await b.nav('about:blank');
    const compose = async (name, cells, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 15px -apple-system,sans-serif;margin:0 0 6px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:grid;grid-template-columns:repeat(${cells.length}, ${w}px);gap:24px;align-items:start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => {
        document.open(); document.write(${JSON.stringify(html)}); document.close();
        const loaded = (i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; }));
        await Promise.race([Promise.all([...document.images].map(loaded)), new Promise((r) => setTimeout(r, 5000))]);
      })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    const pair = (label, s) => [
      [`${label} · light`, shotOf(s)],
      [`${label} · dark`, shotOf(`${s}-dark`)],
    ];
    await compose('audio-compose-1280', [['desktop-05-settings (mockup)', mock('desktop-05-settings')], ...pair('Storage & sync', 'audio-settings-1280'), ...pair('Deletes on…', 'audio-due-1280'), ...pair('Deleted on…', 'audio-deleted-1280')], 560);
    await compose('audio-compose-390', [['iphone-07-settings (mockup)', mock('iphone-07-settings')], ...pair('Storage & sync', 'audio-settings-390'), ...pair('Deletes on…', 'audio-due-390'), ...pair('Deleted on…', 'audio-deleted-390')], 390);
    await b.resize(1280, 900);
    const wanted = ['audio-settings-1280', 'audio-settings-390', 'audio-due-1280', 'audio-due-390', 'audio-deleted-1280', 'audio-deleted-390'].flatMap((n) => [n, `${n}-dark`]);
    const missing = wanted.filter((n) => !taken.has(n));
    expect(missing.length === 0, `not taken in this run: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  for (const r of results) console.log(r.join(' | '));
  for (const line of report) console.log(line);
  console.log(`console errors: ${JSON.stringify(errors)}`);
  console.log(`shots: ${SHOTS}`);
  await finish(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
}
