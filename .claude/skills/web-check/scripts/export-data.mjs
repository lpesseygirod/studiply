// export-data.mjs — step 10.1b-4, Export my data, in Chrome against local Supabase. No AI call (every
// AI function is answered in the page and counted), no Edge Function.
//
// Steps:
//   1. Settings → Account (1280, desktop-05): "Export my data" in its own card; light and dark.
//   2. The sheet: it reads her library, then "About … This can take a few minutes." and Export; Export
//      → the laptop downloads "Studiply export <date>.zip". The ZIP, opened here (the repo's jszip):
//      README.txt, settings.json (her email), data/<every table>.json with only her rows (another
//      student's course isn't there), Courses/Math/Lecture 1/My notes.md, Transcript.txt with times,
//      Marks.csv, Recording/0000.webm and Photos/Photo 1.jpg byte for byte as uploaded,
//      Courses/Math/Flashcards.csv.
//   3. Cancel while it reads: the sheet closes, nothing is downloaded.
//   4. Offline: pressing the row asks the backend once; it says "Exporting your data needs a
//      connection" and doesn't open the sheet.
//   5. 390 (iphone-07): the Settings list's own "Export my data" row after Appearance opens the sheet;
//      Settings → Your data: Export my data, Recently Deleted, Delete account…; the sheet from the
//      bottom; light and dark.
//   6. Composites beside desktop-05 and iphone-07, light and dark.
//
// The run always ends (its Chrome closed, the process exits), also after failures, or after 10 minutes.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/export-data.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const MIN = 60_000;

const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-export-data-${results.length}`).catch(() => {});
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

// ── Her library (and another student's, which must never be in her export) ──
const user = await makeUser();
const data = await seed(user.client);
const other = await makeUser();
await seed(other.client);
const otherCourse = await must(other.client.from('courses').insert({ name: 'Not hers' }).select('id').single(), 'the other course');

const lecture = data.lecture.id;
const AUDIO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const PHOTO = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]);
const audioPath = `${user.id}/${lecture}/0000.webm`;
const photoPath = `${user.id}/${lecture}/board.jpg`;
await must(user.client.storage.from('audio-chunks').upload(audioPath, new Blob([AUDIO], { type: 'audio/webm' }), { contentType: 'audio/webm' }), 'the recording');
await must(user.client.storage.from('photos').upload(photoPath, new Blob([PHOTO], { type: 'image/jpeg' }), { contentType: 'image/jpeg' }), 'the photo');
await must(user.client.from('audio_chunks').insert({ lecture_id: lecture, seq: 0, start_ms: 0, duration_ms: 30000, storage_path: audioPath, status: 'uploaded' }), 'the chunk');
await must(user.client.from('media').insert({ lecture_id: lecture, kind: 'photo', storage_path: photoPath, mime_type: 'image/jpeg' }), 'the photo row');
await must(
  user.client.from('documents').insert({ file_id: lecture, tab: 'notes', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mis notas de clase' }] }] } }),
  'the notes',
);
await must(
  user.client.from('transcript_segments').insert([
    { lecture_id: lecture, start_ms: 0, end_ms: 4000, text: 'Empezamos el tema.' },
    { lecture_id: lecture, start_ms: 400000, end_ms: 404000, text: 'Esto entra en el examen.' },
  ]),
  'the transcript',
);
await must(user.client.from('marks').insert({ lecture_id: lecture, type: 'exam', level: 9, t_ms: 400000 }), 'the mark');
await must(user.client.from('flashcards').insert({ course_id: data.course.id, front: '¿Qué es una función?', back: 'Una relación', source: 'manual' }), 'the card');

b = await launch();
let finished = false;
const finish = async (code) => {
  if (finished) return;
  finished = true;
  await b.close().catch(() => {});
  await dropUser(user.id).catch(() => {});
  await dropUser(other.id).catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => void finish(130));
process.on('SIGTERM', () => void finish(143));
setTimeout(() => {
  console.error('export-data.mjs: still running after 10 minutes; stopping');
  void finish(1);
}, 10 * MIN).unref();

await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const textOf = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.innerText ?? ''`);
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
/** Clicks the first element matching `css` that is really on top where it is drawn. */
const tapTop = async (css) => {
  const p = await b.evaluate(`(() => {
    for (const e of document.querySelectorAll(${JSON.stringify(css)})) {
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === e || e.contains(hit))) return { x, y };
    }
    return null;
  })()`);
  if (!p) throw new Error(`nothing on top matches ${css}`);
  await b.sleep(250);
  await b.clickAt(p.x, p.y);
  await b.sleep(400);
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
const SHEET = '[data-export-data="sheet"]';
const sheetState = () => attr(SHEET, 'data-state');
/** The last downloaded export, from the page (window.studiplyExport), opened with jszip. */
const downloaded = async () => {
  const files = await b.evaluate(`(async () => {
    const files = window.studiplyExport?.files ?? [];
    const out = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      out.push({ name: f.name, base64: btoa(bin) });
    }
    return out;
  })()`);
  return Promise.all(files.map(async (f) => ({ name: f.name, zip: await JSZip.loadAsync(Buffer.from(f.base64, 'base64')) })));
};

try {
  await b.signIn(BASE, user.email, user.password);

  await step('Settings → Account (desktop-05): "Export my data" in its own card', async () => {
    await b.resize(1280, 900);
    await go('/settings/account');
    await waitFor(() => has('[data-export-data="open"]'), 'Export my data', 15000);
    expect((await textOf('[data-export-data="open"]')).includes('Export my data'), 'its label');
    await shots('export-account-1280');
  });

  await step('the sheet: reads her library, says how big, Export → "Studiply export <date>.zip"; the ZIP holds her data and only hers', async () => {
    await tapTop('[data-export-data="open"]');
    await waitFor(async () => (await sheetState()) === 'ready', async () => `the sheet ready (state ${await sheetState()}: ${await textOf(SHEET)})`, 30000);
    const size = await textOf('[data-export-data="size"]');
    expect(/^About .+\. This can take a few minutes\.$/.test(size), `the size line: "${size}"`);
    await shots('export-sheet-1280');
    await tapTop('[data-export-data="start"]');
    await waitFor(async () => (await sheetState()) === 'done', async () => `done (state ${await sheetState()}: ${await textOf(SHEET)})`, 60000);
    const day = new Date().toISOString().slice(0, 10);
    expect((await textOf('[data-export-data="done"]')).includes(`Studiply export ${day}.zip`), `done: ${await textOf('[data-export-data="done"]')}`);
    await shots('export-done-1280');

    const parts = await downloaded();
    expect(parts.length === 1 && parts[0].name === `Studiply export ${day}.zip`, `downloaded: ${parts.map((p) => p.name).join(', ')}`);
    const zip = parts[0].zip;
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    const read = async (n) => {
      const f = zip.file(n);
      if (!f) throw new Error(`not in the ZIP: ${n} (it has: ${names.slice(0, 40).join(', ')})`);
      return f.async('string');
    };
    const bytes = async (n) => {
      const f = zip.file(n);
      if (!f) throw new Error(`not in the ZIP: ${n}`);
      return [...(await f.async('uint8array'))];
    };
    expect((await read('README.txt')).startsWith('Your Studiply data'), 'README.txt');
    expect(JSON.parse(await read('settings.json')).account.email === user.email, 'settings.json: her email');
    const courses = JSON.parse(await read('data/courses.json'));
    expect(courses.length >= 2 && courses.every((c) => c.user_id === user.id) && !courses.some((c) => c.id === otherCourse.id), `data/courses.json: ${JSON.stringify(courses.map((c) => c.name))}`);
    for (const table of ['files', 'lectures', 'documents', 'marks', 'transcript_segments', 'audio_chunks', 'media', 'flashcards', 'terms_acceptances']) {
      const rows = JSON.parse(await read(`data/${table}.json`));
      expect(rows.length > 0 && rows.every((r) => r.user_id === user.id), `data/${table}.json: ${rows.length} rows, owners ${[...new Set(rows.map((r) => r.user_id))].join(',')}`);
    }
    const dir = 'Courses/Math/Lecture 1/';
    expect((await read(`${dir}My notes.md`)) === 'Mis notas de clase\n', 'My notes.md');
    expect((await read(`${dir}Transcript.txt`)) === '[00:00] Empezamos el tema.\n[06:40] Esto entra en el examen.\n', `Transcript.txt: ${await read(`${dir}Transcript.txt`)}`);
    expect((await read(`${dir}Marks.csv`)).startsWith('time,type,level,note\r\n06:40,exam,9,'), 'Marks.csv');
    expect(JSON.stringify(await bytes(`${dir}Recording/0000.webm`)) === JSON.stringify([...AUDIO]), 'the recording, byte for byte');
    expect(JSON.stringify(await bytes(`${dir}Photos/Photo 1.jpg`)) === JSON.stringify([...PHOTO]), 'the photo, byte for byte');
    expect((await read('Courses/Math/Flashcards.csv')).includes('¿Qué es una función?,Una relación,manual'), 'Flashcards.csv');
    expect(!names.some((n) => n.includes('Not hers')), 'another student\'s course is in the ZIP');
    report.push(`RESULT | the ZIP: ${names.length} files (${names.filter((n) => n.startsWith('data/')).length} in data/)`);
    await tapTop('[data-export-data="close"]');
    await waitFor(async () => !(await has(SHEET)), 'closed');
  });

  await step('Cancel while it reads: the sheet closes, nothing is downloaded', async () => {
    await b.evaluate(`window.studiplyExport = { files: [] }`);
    await tapTop('[data-export-data="open"]');
    await waitFor(() => has(SHEET), 'the sheet');
    await tapTop('[data-export-data="cancel"]');
    await waitFor(async () => !(await has(SHEET)), 'closed by Cancel');
    await b.sleep(3000);
    expect((await b.evaluate(`window.studiplyExport.files.length`)) === 0, 'something was downloaded after Cancel');
  });

  await step('offline: "Exporting your data needs a connection"; the sheet doesn’t open', async () => {
    await b.send('Network.enable');
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    try {
      // The web learns it is offline from a request: pressing the row asks the backend once (no polling).
      await tapTop('[data-export-data="open"]');
      await waitFor(async () => (await textOf('[data-export-data="open"]')).includes('Exporting your data needs a connection'), 'the offline line after pressing', 20000);
      await b.sleep(800);
      expect(!(await has(SHEET)), 'the sheet opened offline');
      // The app's own alert says why (src/components/dialogs).
      expect(await b.hasText('Exporting your data needs a connection.', true), 'no alert saying why');
      await b.press('Escape');
      await b.click('OK', { exact: true }).catch(() => {});
      await b.sleep(400);
      await shots('export-offline-1280');
    } finally {
      await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
    await waitFor(async () => !(await textOf('[data-export-data="open"]')).includes('needs a connection'), 'back online', 30000);
  });

  await step('390 (iphone-07): the Settings list has "Export my data" after Appearance, opening the sheet; Your data: Export my data, Recently Deleted, Delete account…; the sheet from the bottom', async () => {
    await b.resize(390, 844);
    await go('/settings');
    await waitFor(() => has('[data-export-data="list-row"]'), 'the list row', 15000);
    const order = await b.evaluate(`(() => {
      const top = (label) => [...document.querySelectorAll('[role=button][aria-label]')].find((e) => e.getAttribute('aria-label').startsWith(label))?.getBoundingClientRect().top ?? -1;
      return { appearance: top('Appearance'), exportRow: document.querySelector('[data-export-data="list-row"]').getBoundingClientRect().top, yourData: top('Your data') };
    })()`);
    expect(order.appearance < order.exportRow && order.exportRow < order.yourData, `not between Appearance and Your data: ${JSON.stringify(order)}`);
    await b.evaluate(`document.querySelector('[data-export-data="list-row"]').scrollIntoView({ block: 'center' })`);
    await shots('export-settings-list-390');
    await tapTop('[data-export-data="list-row"]');
    await waitFor(async () => (await sheetState()) === 'ready', 'the sheet from the list row', 30000);
    await tapTop('[data-export-data="cancel"]');
    await waitFor(async () => !(await has(SHEET)), 'closed');
    await go('/settings/your-data');
    await waitFor(() => has('[data-export-data="open"]'), 'Export my data at 390', 15000);
    for (const t of ['Export my data', 'Recently Deleted', 'Delete account…']) expect(await b.hasText(t, true), `no "${t}" in Your data`);
    expect(await has('[data-account="delete"]'), 'Delete account… is not a button');
    await shots('export-your-data-390');
    await tapTop('[data-export-data="open"]');
    await waitFor(async () => (await sheetState()) === 'ready', 'ready at 390', 30000);
    await shots('export-sheet-390');
    await tapTop('[data-export-data="cancel"]');
    await b.resize(1280, 900);
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
    await compose('export-compose-1280', [['desktop-05-settings (mockup)', mock('desktop-05-settings')], ...pair('Account', 'export-account-1280'), ...pair('The sheet', 'export-sheet-1280'), ...pair('Done', 'export-done-1280')], 560);
    await compose('export-compose-390', [['iphone-07-settings (mockup)', mock('iphone-07-settings')], ...pair('Settings list', 'export-settings-list-390'), ...pair('Your data', 'export-your-data-390'), ...pair('The sheet', 'export-sheet-390')], 390);
    await b.resize(1280, 900);
    const wanted = ['export-account-1280', 'export-sheet-1280', 'export-done-1280', 'export-offline-1280', 'export-settings-list-390', 'export-your-data-390', 'export-sheet-390'].flatMap((n) => [n, `${n}-dark`]);
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
