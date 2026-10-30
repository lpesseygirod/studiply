// photos-live.mjs — step 5.6, board photos while recording (web: the
// laptop's strip and the 390 px layout's bar), with a synthetic microphone,
// Chrome's fake camera (a moving test picture) and no paid call
// (transcribe-chunk is answered inside the page; the check fails if any
// request reaches transcribe-chunk, OpenAI or ElevenLabs).
// Steps:
//   1. laptop: Photo board → Take a photo (webcam): the live picture, Take
//      photo; a thumbnail (35 %) on a new stamped line at the press time; its
//      `media` row (the lecture and its file, kind photo, t_ms) and its
//      Storage file; the recording goes on;
//   2. Choose files…: two images, two thumbnails at the same moment, in order;
//   3. while writing: the photo's line goes right after the line being written;
//   4. from another screen (the course page): a new last line in My notes;
//   5. offline: Photo board greyed out with "Photos need a connection on the
//      laptop", the recording goes on; back online it's usable again;
//   6. 390 px: the bar's Photo tile opens the same menu, the webcam as a
//      sheet; a photo saved;
//   7. the recording never stopped; Stop: the photos stay;
//   8. no paid request.
// Screenshots (each after the splash): photo-menu-1280(-dark), photo-webcam-1280(-dark),
// photo-thumbnails-1280(-dark), photo-offline-1280, photo-menu-390(-dark),
// photo-webcam-390(-dark), photo-thumbnails-390(-dark).
// About 3 minutes. PASS/FAIL per step; exit 1 on a FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node photos-live.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const TITLE = 'Photos check';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-photos-${results.length}`).catch(() => {});
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
 * Before the app: the microphone is a synthetic tone; the camera stays Chrome's fake one (a moving
 * test picture); transcribe-chunk is answered in the page (failing while offline).
 */
const PAGE_SETUP = `(() => {
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) return original(constraints);
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
// "Choose files…": the browser's file chooser is answered here (DOM.setFileInputFiles).
let chooser = null;
b.onEvent('Page.fileChooserOpened', (p) => {
  chooser = p;
});
await b.send('Network.enable', {});
await b.send('DOM.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const path = () => b.evaluate('location.pathname + location.search');
const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const disabled = (label) => b.evaluate(`document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-disabled') === 'true'`);
/** "4:12" or "1:02:03" → ms. */
const clockMs = (s) => s.split(':').map(Number).reduce((t, n) => t * 60 + n, 0) * 1000;
const timer = async () => {
  const m = /(\d+:\d\d(?::\d\d)?)\s*$/.exec((await text('[data-recording="timer"]')).trim());
  return m ? clockMs(m[1]) : null;
};
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

let lectureId = null;
const rows = async () =>
  (await admin.from('media').select('id, lecture_id, file_id, kind, t_ms, storage_path, created_at').eq('lecture_id', lectureId).order('created_at')).data ?? [];
const waitRows = (n, what, timeout = 20000) => waitFor(async () => {
  const list = await rows();
  return list.length >= n ? list : null;
}, async () => `${what}: ${JSON.stringify(await rows())}`, timeout);
/** My notes' photo lines: their place, the line's time and the photo's media id and width. */
const photoLines = () =>
  b.evaluate(`(() => {
    const out = [];
    (window.studiplyEditor.getJSON().content || []).forEach((block, i) => {
      const c = block.content || [];
      const img = c.find((n) => n.type === 'inlineImage');
      if (!img) return;
      out.push({ i, ms: c[0] && c[0].type === 'timestampChip' ? c[0].attrs.ms : null, id: String(img.attrs.src).replace('media:', ''), width: img.attrs.width, stamped: c[0] && c[0].type === 'timestampChip' });
    });
    return out;
  })()`);
const blockCount = () => b.evaluate(`(window.studiplyEditor.getJSON().content || []).length`);
/**
 * Every photo in My notes shown: each Studiply photo's own picture loaded, no "Loading photo…" note. Only the
 * photos' images: ProseMirror adds an empty <img class="ProseMirror-separator"> after a line that ends with a
 * photo (Chrome and Safari), which never loads.
 */
const photosShown = () =>
  b.evaluate(`(() => {
    const frames = [...document.querySelectorAll('.studiply-editor .studiply-photo-frame')];
    return frames.length > 0 && frames.every((f) => {
      const img = f.querySelector(':scope > img'), note = f.querySelector('.studiply-photo-note');
      return !!img && !img.hidden && img.complete && img.naturalWidth > 0 && (!note || note.hidden);
    });
  })()`);
const openMenu = async (label) => {
  await waitFor(async () => !(await disabled(label)), `${label} usable`, 15000);
  await b.clickSelector(`[aria-label="${label}"]`);
  await b.waitText('Take a photo (webcam)', { exact: true, timeout: 5000 });
  await b.sleep(300);
};
/** The webcam panel: live, then Take photo. */
const takeWebcam = async () => {
  await b.click('Take a photo (webcam)', { exact: true });
  await waitFor(() => has('[data-photo="webcam"]'), 'the webcam panel', 5000);
  await waitFor(() => b.evaluate(`(() => { const v = document.querySelector('[data-photo="webcam"] video'); return !!v && v.videoWidth > 0 && !v.paused; })()`), 'the live picture', 15000);
  await waitFor(async () => !(await disabled('Take photo')), 'Take photo usable', 5000);
};
const pressTake = async () => {
  await b.clickSelector('[aria-label="Take photo"]');
  await waitFor(async () => !(await has('[data-photo="webcam"]')), 'the webcam panel closed', 5000);
  // The camera is let go.
  await waitFor(() => b.evaluate(`!document.querySelector('[data-photo="webcam"] video')`), 'the video gone', 5000);
};

let recordingAt = null;
try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  await b.signIn(BASE, user.email, user.password);
  await b.nav(`${BASE}/record?projectId=${data.course.id}`);
  await b.waitText('New Recording', { timeout: 30000 });
  await b.fill('input[placeholder^="e.g."]', TITLE);
  await b.clickSelector('[aria-label="Start recording"]');
  await waitFor(async () => (await path()).startsWith('/doc/'), async () => `the lecture opened (at ${await path()})`, 20000);
  await waitFor(() => has('[data-recording="strip"]'), 'the strip', 10000);
  lectureId = /\/doc\/([^?/]+)/.exec(await path())[1];
  await waitFor(() => has('.ProseMirror'), 'My notes', 15000);
  recordingAt = await waitFor(timer, 'the timer', 5000);

  await step('laptop: Photo board → Take a photo (webcam): a thumbnail on a new stamped line at the press time; its media row and Storage file; still recording', async () => {
    await b.sleep(2000);
    const pressedAt = await timer();
    await openMenu('Photo board');
    expect(await b.hasText('Choose files…', true), 'no Choose files… in the menu');
    await both('photo-menu-1280');
    await takeWebcam();
    expect((await text('[data-photo="webcam"]')).includes('Photo board ·'), await text('[data-photo="webcam"]'));
    await both('photo-webcam-1280');
    await pressTake();
    const list = await waitRows(1, 'the photo\'s media row');
    const r = list[0];
    expect(r.lecture_id === lectureId && r.file_id === lectureId && r.kind === 'photo' && Math.abs(r.t_ms - pressedAt) <= 2000, `the row: ${JSON.stringify(r)} (pressed at ${pressedAt} ms)`);
    const { data: file, error: downloadError } = await admin.storage.from('photos').download(r.storage_path);
    expect(!downloadError && file && file.size > 1000, `the Storage file: ${downloadError?.message ?? file?.size}`);
    const lines = await waitFor(async () => {
      const l = await photoLines();
      return l.length === 1 ? l : null;
    }, 'the photo in My notes', 10000);
    expect(lines[0].id === r.id && lines[0].stamped && lines[0].ms === r.t_ms && lines[0].width === 35, `the line: ${JSON.stringify(lines)}`);
    await waitFor(photosShown, 'the thumbnail shown', 15000);
    expect((await timer()) > pressedAt && (await admin.from('lectures').select('status').eq('id', lectureId).single()).data.status === 'recording', 'the recording stopped');
    report.push(`RESULT | webcam | photo at ${r.t_ms} ms (pressed at ${pressedAt} ms), ${file.size} B`);
  });

  await step('Choose files…: two images, two thumbnails at the same moment, in order', async () => {
    const a = await b.shot('photo-input-a');
    await b.resize(1100, 800);
    const c = await b.shot('photo-input-b');
    await b.resize(1280, 900);
    await b.sleep(500);
    await b.send('Page.setInterceptFileChooserDialog', { enabled: true });
    try {
      chooser = null;
      await openMenu('Photo board');
      await b.click('Choose files…', { exact: true });
      await waitFor(async () => chooser, 'the file chooser', 5000);
      await b.send('DOM.setFileInputFiles', { files: [a, c], backendNodeId: chooser.backendNodeId });
    } finally {
      await b.send('Page.setInterceptFileChooserDialog', { enabled: false });
    }
    const list = await waitRows(3, 'two more rows', 30000);
    const [, r1, r2] = list;
    expect(r1.t_ms === r2.t_ms, `the same moment: ${r1.t_ms}, ${r2.t_ms}`);
    const lines = await waitFor(async () => {
      const l = await photoLines();
      return l.length === 3 ? l : null;
    }, 'three photo lines', 15000);
    expect(lines[1].id === r1.id && lines[2].id === r2.id && lines[2].i === lines[1].i + 1, `in order: ${JSON.stringify(lines)}`);
    await waitFor(photosShown, 'the thumbnails shown', 20000);
    await both('photo-thumbnails-1280');
  });

  await step('while writing: the photo’s line goes right after the line being written', async () => {
    await b.evaluate(`(() => { const e = window.studiplyEditor; e.commands.focus('end'); })()`);
    await b.press('Enter');
    await b.type('Línea escrita antes de la foto');
    await b.sleep(400);
    await openMenu('Photo board');
    await takeWebcam();
    await pressTake();
    await waitRows(4, 'the fourth row');
    const at = await waitFor(async () => {
      const l = await photoLines();
      return l.length === 4 ? l : null;
    }, 'four photo lines', 15000);
    const written = await b.evaluate(`(window.studiplyEditor.getJSON().content || []).findIndex((bl) => (bl.content || []).some((n) => n.text && n.text.includes('Línea escrita')))`);
    expect(at.some((l) => l.i === written + 1), `the photo isn't right after the line written (${written}): ${JSON.stringify(at)}`);
  });

  await step('from another screen (the course page): a new last line in My notes', async () => {
    await b.click('Math', { exact: true });
    await b.waitText('Funcions', { exact: true, timeout: 10000 });
    await openMenu('Photo board');
    await takeWebcam();
    await pressTake();
    const list = await waitRows(5, 'the fifth row', 30000);
    const last = list[4];
    await b.clickSelector('[aria-label^="Recording,"]');
    await waitFor(async () => (await path()).includes(lectureId), 'back at the lecture', 10000);
    const lines = await waitFor(async () => {
      const l = await photoLines();
      return l.some((x) => x.id === last.id) ? l : null;
    }, 'the photo made elsewhere in My notes', 20000);
    const line = lines.find((x) => x.id === last.id);
    expect(line.stamped && line.i === (await blockCount()) - 1, `not a stamped last line: ${JSON.stringify(line)} of ${await blockCount()}`);
  });

  await step('offline: Photo board greyed out with "Photos need a connection on the laptop"; the recording goes on; back online it’s usable', async () => {
    await offline(true);
    // A save that fails tells the app it is offline at once.
    await b.evaluate(`window.studiplyEditor.commands.focus('end')`);
    await b.type(' x');
    await waitFor(async () => (await text('[data-photo="offline"]')) === 'Photos need a connection on the laptop', async () => `the note: "${await text('[data-photo="offline"]')}"`, 45000);
    expect(await disabled('Photo board'), 'Photo board usable offline');
    const t = await timer();
    await shot('photo-offline-1280');
    await b.sleep(2000);
    expect((await timer()) > t, 'the recording stopped offline');
    await offline(false);
    await waitFor(async () => !(await disabled('Photo board')) && !(await has('[data-photo="offline"]')), 'Photo board usable again', 45000);
  });

  await step('390 px: the bar’s Photo tile opens the same menu; the webcam as a sheet; a photo saved', async () => {
    try {
      await b.resize(390, 844);
      await waitFor(() => has('[data-recording="bar"]'), 'the bottom bar', 10000);
      const before = (await rows()).length;
      await openMenu('Photo');
      await both('photo-menu-390');
      await takeWebcam();
      await both('photo-webcam-390');
      await pressTake();
      await waitRows(before + 1, 'the photo saved at 390');
      await waitFor(photosShown, 'the thumbnails shown', 20000);
      await both('photo-thumbnails-390');
    } finally {
      await b.resize(1280, 900);
    }
    await waitFor(() => has('[data-recording="strip"]'), 'the strip again', 15000);
  });

  await step('the recording never stopped; Stop: the photos stay', async () => {
    const t = await timer();
    expect(t - recordingAt >= 30000, `the clock ran ${t - recordingAt} ms`);
    expect((await admin.from('lectures').select('status').eq('id', lectureId).single()).data.status === 'recording', 'not recording');
    expect(((await admin.from('audio_chunks').select('seq').eq('lecture_id', lectureId)).data ?? []).length >= 1, 'no chunk uploaded');
    const kept = (await rows()).map((r) => r.id);
    await b.clickSelector('[aria-label="Stop and summarize"]');
    await b.waitText('Stop recording?', { timeout: 5000 });
    await b.click('Stop', { exact: true });
    await waitFor(async () => (await path()).startsWith('/record/post-session'), async () => `the after-recording step (at ${await path()})`, 90000);
    expect(JSON.stringify((await rows()).map((r) => r.id)) === JSON.stringify(kept), 'the photos changed at Stop');
    report.push(`RESULT | photos | ${kept.length} board photos: ${(await rows()).map((r) => r.t_ms).join(', ')} ms`);
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
