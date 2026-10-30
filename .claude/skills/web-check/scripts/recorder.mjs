// recorder.mjs — step 5.2, the recorder service on /dev/recorder (web): every
// chunk saved in the browser first (IndexedDB) and sent through the recorder's
// queue; offline for a while, then online, the transcript fills in; pause and
// resume; a reload mid-recording loses no audio. No microphone and no paid call:
//   - the microphone is a synthetic Web Audio stream (getUserMedia replaced
//     before the app loads): a steady 1 kHz tone, so every chunk's audio can be
//     decoded and measured;
//   - transcribe-chunk is answered inside the page ("Simulated chunk N"); while
//     the check is offline the stand-in fails like the network does. The check
//     also watches the network: no request may reach transcribe-chunk, OpenAI or
//     ElevenLabs. The uploads are real (local Supabase); offline is Chrome's own
//     network emulation (every request from the page fails).
//   - 5-second chunks overlapping by 500 ms (the app's overlap, shorter chunks).
//   - steps: recording; offline ~16 s (chunks kept in IndexedDB, not uploaded,
//     recording goes on); online (the missing chunks upload in order, the
//     transcript fills in); pause / resume (the microphone's track is stopped
//     while paused, a new one opened on Resume; the chunk ends at the pause,
//     the paused time isn't in the recording); a reload mid-chunk (the unfinished
//     chunk is rebuilt from its one-second pieces and uploaded, at most a second
//     lost, the recovered file decodes); Continue, Stop (everything uploaded and
//     transcribed, the timeline without a hole, the audio_chunks rows and files,
//     every file decodes to its length).
//   - screenshots recorder-ready-1280, recorder-recording-1280,
//     recorder-offline-1280, recorder-interrupted-1280, recorder-done-1280
//     (each after the splash screen is gone).
// About 2.5 minutes. Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node recorder.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The driver beside this file (installed), or in WEB_CHECK_SCRIPTS (a copy run from elsewhere).
const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const CHUNK_S = 5;
const OVERLAP_MS = 500;
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-recorder-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(250);
  }
}

// The consent the app asks for before transcribing (its policy version, as the app has it).
const repo = join(fileURLToPath(scripts), '../../../../');
const policy = readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(policy)?.[1];
if (!POLICY_VERSION) throw new Error('CONSENT_POLICY_VERSION not found in policy.ts');

/** Before the app: the synthetic microphone, and transcribe-chunk answered in the page (failing while offline). */
const PAGE_SETUP = `(() => {
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) throw new Error('only audio here');
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const out = ctx.createMediaStreamDestination();
    const tone = ctx.createOscillator();
    tone.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    tone.connect(gain).connect(out);
    tone.start();
    window.__recorderAudio = ctx;
    // Every microphone stream the app opened, to see that Pause closes it.
    (window.__micStreams = window.__micStreams || []).push(out.stream);
    return out.stream;
  };
  const realFetch = window.fetch.bind(window);
  window.__checkOffline = false;
  window.__transcribeCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      if (window.__checkOffline) throw new TypeError('Failed to fetch');
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      window.__transcribeCalls.push(body.seq);
      const segments = [{ startMs: body.startMs, endMs: body.startMs + 1000, text: 'Simulated chunk ' + body.seq }];
      return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 0, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

/** The recordings' chunks as IndexedDB keeps them (the audio's size until uploaded), and the pieces of unfinished chunks. */
const IDB = `(async () => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('studiply-recorder'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const all = (name) => new Promise((resolve, reject) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const chunks = (await all('chunks')).map((c) => ({ seq: c.seq, blob: c.blob ? c.blob.size : 0, storagePath: c.storagePath }));
  const parts = (await all('parts')).map((p) => ({ seq: p.seq, index: p.index, size: p.blob.size }));
  db.close();
  return { chunks, parts };
})()`;

const user = await makeUser();
b = await launch();
// Every request the page makes, to prove none reaches transcribe-chunk or a transcription service.
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const rec = () => b.evaluate(`(() => { const r = window.studiplyRecorder; return r ? JSON.parse(JSON.stringify(r)) : null; })()`);
/** The same while the page reloads (null until the new page answers). */
const recSoon = () => rec().catch(() => null);
const status = () => b.evaluate(`document.querySelector('[data-recorder="status"]')?.textContent ?? ''`);
/** Each microphone stream the app opened (oldest first): its audio tracks' states ('live' or 'ended'). */
const micTracks = () => b.evaluate(`(window.__micStreams || []).map((s) => s.getAudioTracks().map((t) => t.readyState))`);
const enabled = (label) => b.evaluate(`(() => { const e = document.querySelector('[aria-label="${label}"]'); return !!e && e.getAttribute('aria-disabled') !== 'true'; })()`);
const press = async (label) => {
  await waitFor(() => enabled(label), async () => `${label} enabled (status: ${await status()})`, 20000);
  await b.clickSelector(`[aria-label="${label}"]`);
};
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  await b.shot(name);
};
const offline = async (on) => {
  await b.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.evaluate(`window.__checkOffline = ${on}`);
};
const end = (c) => c.startMs + c.durationMs;
const describe = (chunks) => chunks.map((c) => `#${c.seq} ${c.startMs}+${c.durationMs} ${c.state}${c.recovered ? ' (recovered)' : ''}`).join(', ');
/**
 * Each chunk starts no later than the one before it ends: overlapping it (a rotation) or exactly
 * at its end (after a pause, or Continue after a reload). No tolerance: the times are whole ms.
 */
const noHole = (chunks) => chunks.every((c, i) => i === 0 || c.startMs <= end(chunks[i - 1]));
const joins = (chunks) => chunks.slice(1).map((c, i) => `#${chunks[i].seq}→#${c.seq} ${c.startMs - end(chunks[i])}`).join(', ');

/** Decodes a stored chunk in Chrome: its length (s) and loudness (the tone alone is 0.07 RMS). */
async function decode(path) {
  const { data: file, error } = await admin.storage.from('audio-chunks').download(path);
  if (error || !file) throw new Error(`the file ${path}: ${error?.message}`);
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  return b.evaluate(`(async () => {
    const bytes = Uint8Array.from(atob('${base64}'), (ch) => ch.charCodeAt(0));
    const ctx = new AudioContext();
    try {
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const x = buf.getChannelData(0);
      let s = 0;
      for (let i = 0; i < x.length; i++) s += x[i] * x[i];
      return { duration: buf.duration, rms: Math.sqrt(s / Math.max(1, x.length)) };
    } catch (e) {
      return { error: 'does not decode: ' + (e && e.message) };
    } finally {
      await ctx.close();
    }
  })()`);
}

let lectureId = null;
try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  await b.signIn(BASE, user.email, user.password);

  await step('recording: each chunk saved, uploaded and transcribed in order (5-second chunks, 500 ms overlap)', async () => {
    await b.nav(`${BASE}/dev/recorder?chunk=${CHUNK_S}&overlap=${OVERLAP_MS}`);
    await waitFor(() => enabled('Start recording'), 'the recorder screen (Start enabled, signed in)', 40000);
    await shot('recorder-ready-1280');
    await b.clickSelector('[aria-label="Start recording"]');
    await waitFor(async () => (await status()).startsWith('recording'), async () => `recording (status: ${await status()}; ${JSON.stringify((await rec())?.error)})`, 20000);
    lectureId = (await rec()).lectureId;
    expect(lectureId, 'no lecture');
    await waitFor(async () => (await rec()).chunks.filter((c) => c.state === 'transcribed').length >= 2, async () => `two chunks transcribed: ${describe((await rec()).chunks)}`, 25000);
    const r = await rec();
    expect(r.chunks.every((c, i) => c.seq === i), `seq: ${r.chunks.map((c) => c.seq)}`);
    expect(r.transcript.map((s) => s.text).join('|') === r.chunks.filter((c) => c.state === 'transcribed').map((c) => `Simulated chunk ${c.seq}`).join('|'), `transcript: ${JSON.stringify(r.transcript)}`);
    await shot('recorder-recording-1280');
  });

  let offlineFrom = 0;
  await step('offline for 16 s: the recording goes on; its chunks are kept in the browser (IndexedDB), not uploaded', async () => {
    await offline(true);
    offlineFrom = (await rec()).chunks.length;
    await b.sleep(16000);
    const r = await rec();
    expect(r.state.status === 'recording', `status: ${r.state.status}`);
    const later = r.chunks.filter((c) => c.seq > offlineFrom);
    expect(later.length >= 2, `chunks recorded offline: ${describe(r.chunks)}`);
    expect(later.every((c) => c.state === 'on-device'), `uploaded while offline: ${describe(later)}`);
    expect(!r.transcript.some((s) => later.some((c) => s.text === `Simulated chunk ${c.seq}`)), `transcribed while offline: ${JSON.stringify(r.transcript)}`);
    const idb = await b.evaluate(IDB);
    for (const c of later) {
      const kept = idb.chunks.find((x) => x.seq === c.seq);
      expect(kept && kept.blob > 0 && !kept.storagePath, `chunk ${c.seq} in IndexedDB: ${JSON.stringify(kept)}`);
    }
    expect((await status()).includes('offline'), `the connection not seen as offline: ${await status()}`);
    report.push(`RESULT | offline | ${later.length} chunks kept in IndexedDB: ${later.map((c) => `#${c.seq} ${idb.chunks.find((x) => x.seq === c.seq).blob} B`).join(', ')}`);
    await shot('recorder-offline-1280');
  });

  await step('back online: the missing chunks upload in order and the transcript fills in, in order', async () => {
    const backAt = Date.now();
    await offline(false);
    const missing = (await rec()).chunks.filter((c) => c.state === 'on-device').map((c) => c.seq);
    await waitFor(
      async () => {
        const r = await rec();
        return missing.every((seq) => r.chunks.find((c) => c.seq === seq)?.state === 'transcribed');
      },
      async () => `the offline chunks transcribed: ${describe((await rec()).chunks)}`,
      60000,
    );
    report.push(`RESULT | online | ${missing.length} chunks uploaded and transcribed ${((Date.now() - backAt) / 1000).toFixed(1)} s after the connection came back`);
    const r = await rec();
    const done = r.chunks.filter((c) => c.state === 'transcribed');
    expect(r.transcript.map((s) => s.text).join('|') === done.map((c) => `Simulated chunk ${c.seq}`).join('|'), `transcript not in order: ${JSON.stringify(r.transcript.map((s) => s.text))}`);
    const calls = await b.evaluate('window.__transcribeCalls');
    expect(calls.every((seq, i) => i === 0 || seq > calls[i - 1]), `transcribe-chunk asked out of order: ${calls}`);
    const { data: rows } = await admin.from('audio_chunks').select('seq, created_at, storage_path').eq('lecture_id', lectureId).order('seq');
    expect(rows.every((row, i) => row.seq === i && row.storage_path), `audio_chunks: ${JSON.stringify(rows)}`);
    expect(rows.every((row, i) => i === 0 || row.created_at >= rows[i - 1].created_at), `uploaded out of order: ${rows.map((row) => `${row.seq}@${row.created_at}`)}`);
  });

  await step('pause and resume: the microphone is closed while paused and opened again; the chunk ends at the pause; the paused time is not in the recording', async () => {
    const opened = (await micTracks()).length;
    expect(opened >= 1 && (await micTracks()).at(-1).every((s) => s === 'live'), `the microphone before Pause: ${JSON.stringify(await micTracks())}`);
    await press('Pause recording');
    await waitFor(async () => (await rec()).state.status === 'paused', 'paused', 10000);
    await b.sleep(500);
    const closed = await micTracks();
    expect(closed.length === opened && closed.every((tracks) => tracks.length > 0 && tracks.every((s) => s === 'ended')), `a microphone track still live while paused: ${JSON.stringify(closed)}`);
    const paused = await rec();
    const at = paused.elapsedMs;
    const last = paused.chunks.at(-1);
    expect(Math.abs(end(last) - at) < 400, `the last chunk ends at ${end(last)}, paused at ${at}`);
    await b.sleep(3000);
    const still = await rec();
    expect(Math.abs(still.elapsedMs - at) < 300, `the time moved while paused: ${at} → ${still.elapsedMs}`);
    expect(still.chunks.length === paused.chunks.length, 'a chunk was made while paused');
    expect((await micTracks()).flat().every((s) => s === 'ended'), `the microphone opened while paused: ${JSON.stringify(await micTracks())}`);
    await press('Resume recording');
    await waitFor(async () => (await rec()).state.status === 'recording', 'recording again', 10000);
    const reopened = await micTracks();
    expect(reopened.length === opened + 1 && reopened.at(-1).every((s) => s === 'live') && reopened.slice(0, -1).flat().every((s) => s === 'ended'), `the microphone after Resume: ${JSON.stringify(reopened)}`);
    await waitFor(async () => (await rec()).chunks.length > paused.chunks.length, 'the first chunk after the pause', 15000);
    const after = (await rec()).chunks.find((c) => c.seq > last.seq);
    // Exactly: the paused time is everything between the last chunk's end and the next recorder's start.
    expect(after.startMs === end(last), `the chunk after the pause starts at ${after.startMs}, the one before ended at ${end(last)}`);
    expect(at === end(last), `the clock while paused (${at}) isn't where the last chunk ended (${end(last)})`);
    report.push(`RESULT | pause | chunk #${last.seq} ends at ${end(last)} ms, #${after.seq} starts at ${after.startMs} ms (3.5 s paused)`);
  });

  let beforeReload = null;
  await step('a reload mid-chunk loses no audio: the unfinished chunk is rebuilt from its pieces and uploaded', async () => {
    // Two to three and a half seconds into a chunk (and out of any overlap).
    await waitFor(async () => {
      const r = await rec();
      const current = r.elapsedMs - end(r.chunks.at(-1)) + OVERLAP_MS;
      return r.state.status === 'recording' && current >= 2000 && current <= 3500;
    }, 'mid-chunk', 15000);
    const idb = await b.evaluate(IDB);
    beforeReload = await rec();
    await b.send('Page.reload', {});
    const pieces = idb.parts.filter((p) => p.seq === beforeReload.chunks.at(-1).seq + 1);
    expect(pieces.length >= 1, `no piece of the current chunk saved before the reload: ${JSON.stringify(idb.parts)}`);

    await b.sleep(1000);
    await waitFor(async () => {
      const r = await recSoon();
      return r && r.interrupted.length === 1 && r.interrupted[0] === lectureId;
    }, async () => `the interrupted recording found: ${JSON.stringify(await recSoon())}`, 40000);
    await waitFor(async () => {
      const r = await recSoon();
      const last = r?.chunks.at(-1);
      return last?.recovered && last.state === 'transcribed';
    }, async () => `the recovered chunk uploaded and transcribed: ${describe((await recSoon())?.chunks ?? [])}`, 40000);
    const r = await rec();
    const recovered = r.chunks.at(-1);
    expect(recovered.seq === beforeReload.chunks.at(-1).seq + 1, `recovered chunk #${recovered.seq}, expected #${beforeReload.chunks.at(-1).seq + 1}`);
    expect(r.chunks.filter((c) => c.recovered).length === 1, `recovered: ${describe(r.chunks)}`);
    expect(noHole(r.chunks), `a hole in the timeline (joins in ms, > 0 a hole): ${joins(r.chunks)}; ${describe(r.chunks)}`);
    const lost = beforeReload.elapsedMs - end(recovered);
    expect(lost <= 1500, `lost ${lost} ms (recorded until ${beforeReload.elapsedMs}, kept until ${end(recovered)})`);
    const { data: row } = await admin.from('audio_chunks').select('storage_path, duration_ms').eq('lecture_id', lectureId).eq('seq', recovered.seq).single();
    const audio = await decode(row.storage_path);
    expect(!audio.error, `the recovered file: ${audio.error}`);
    expect(Math.abs(audio.duration * 1000 - recovered.durationMs) < 700 && audio.rms > 0.03, `the recovered file: ${JSON.stringify(audio)} for ${recovered.durationMs} ms`);
    report.push(`RESULT | reload | ${pieces.length} pieces saved; chunk #${recovered.seq} recovered: ${recovered.durationMs} ms (decodes to ${(audio.duration * 1000).toFixed(0)} ms); recorded until ${beforeReload.elapsedMs} ms, kept until ${end(recovered)} ms: ${Math.max(0, lost)} ms lost`);
    await shot('recorder-interrupted-1280');
  });

  await step('Continue records on after the recovered chunk; Stop: everything uploaded and transcribed, rows and files in order, every file decodes', async () => {
    const recoveredEnd = end((await rec()).chunks.at(-1));
    await press('Continue recording');
    await waitFor(async () => (await rec()).state.status === 'recording', async () => `recording again (${JSON.stringify((await rec()).error)})`, 20000);
    await b.sleep(7000);
    await press('Stop recording');
    await waitFor(async () => (await rec()).state.status === 'idle', 'stopped', 20000);
    await waitFor(async () => (await rec()).chunks.every((c) => c.state === 'transcribed'), async () => `all transcribed: ${describe((await rec()).chunks)}`, 40000);
    const r = await rec();
    const continued = r.chunks.find((c) => c.seq === beforeReload.chunks.at(-1).seq + 2);
    expect(continued && continued.startMs === recoveredEnd, `the first chunk after Continue starts at ${continued?.startMs}, the recovered one ended at ${recoveredEnd}`);
    expect(r.chunks.every((c, i) => c.seq === i), `seq: ${r.chunks.map((c) => c.seq)}`);
    expect(noHole(r.chunks), `a hole in the timeline (joins in ms, > 0 a hole): ${joins(r.chunks)}; ${describe(r.chunks)}`);
    report.push(`RESULT | timeline | joins (ms, < 0 an overlap, 0 exact): ${joins(r.chunks)}`);
    expect(r.transcript.map((s) => s.text).join('|') === r.chunks.map((c) => `Simulated chunk ${c.seq}`).join('|'), `transcript: ${JSON.stringify(r.transcript.map((s) => s.text))}`);
    const shown = await b.evaluate(`document.querySelector('[data-recorder="transcript"]')?.innerText ?? ''`);
    expect(r.chunks.every((c) => shown.includes(`Simulated chunk ${c.seq}`)), `the transcript on screen: ${shown}`);
    const { data: rows } = await admin.from('audio_chunks').select('seq, start_ms, duration_ms, storage_path, status').eq('lecture_id', lectureId).order('seq');
    expect(rows.length === r.chunks.length && rows.every((row, i) => row.seq === i && row.storage_path && row.status === 'uploaded'), `audio_chunks: ${JSON.stringify(rows)}`);
    expect(rows.every((row, i) => row.start_ms === r.chunks[i].startMs), `start_ms: ${rows.map((row) => row.start_ms)} vs ${r.chunks.map((c) => c.startMs)}`);
    for (const row of rows) {
      const audio = await decode(row.storage_path);
      expect(!audio.error, `chunk ${row.seq}: ${audio.error}`);
      expect(Math.abs(audio.duration * 1000 - row.duration_ms) < 700 && audio.rms > 0.03, `chunk ${row.seq}: ${JSON.stringify(audio)} for ${row.duration_ms} ms`);
      report.push(`RESULT | file | chunk ${row.seq} at ${row.start_ms} ms: ${row.duration_ms} ms, decodes to ${(audio.duration * 1000).toFixed(0)} ms`);
    }
    // Uploaded: the browser no longer keeps the audio, and no piece is left.
    const idb = await b.evaluate(IDB);
    expect(idb.chunks.every((c) => c.blob === 0 && c.storagePath) && idb.parts.length === 0, `IndexedDB after Stop: ${JSON.stringify(idb)}`);
    await shot('recorder-done-1280');
  });

  await step('no request reached transcribe-chunk, OpenAI or ElevenLabs (transcription answered in the page)', async () => {
    const out = requests.filter((u) => /functions\/v1\/transcribe-chunk|api\.openai\.com|elevenlabs\.io/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
    const calls = await b.evaluate('window.__transcribeCalls?.length ?? 0');
    expect(calls >= 1, 'transcribe-chunk was never asked (the stand-in saw nothing)');
  });
} finally {
  const errors = b.errors();
  await offline(false).catch(() => {});
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  for (const r of report) console.log(r);
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
