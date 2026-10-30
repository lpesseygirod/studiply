// spike.mjs — step 5.1, the recording spike (web half): MediaRecorder in chunks
// on /dev/recording-spike, each chunk uploaded through the app's path and sent
// to transcribe-chunk, the live transcript shown; the joins between chunks
// measured. No microphone and no paid call:
//   - the microphone is a synthetic Web Audio stream (getUserMedia replaced
//     before the app loads): a steady 1 kHz tone (every instant of audio is
//     recognisable) and a 5 ms 3 kHz click every 500 ms at sample-exact times;
//   - transcribe-chunk is answered inside the page ("Simulated chunk N"); the
//     check also watches the network: no request may reach transcribe-chunk,
//     OpenAI or ElevenLabs. The uploads are real (local Supabase).
//   - each chunk is decoded in Chrome (Web Audio): where its audio really
//     starts and ends (the tone present, so encoder padding doesn't count),
//     and its absolute place from its clicks (to the sample; the recorder's
//     timestamps pick which click is which). A join's gap is the next
//     chunk's first audio minus the previous chunk's last audio (ms; > 0 a
//     gap, < 0 an overlap).
//   - restart mode, 30-second chunks (4 chunks, 3 joins); overlap mode, 10 s
//     chunks overlapping by 500 ms (4 chunks, 3 joins): the fix candidate.
//   - also: every chunk is a standalone file that decodes; the audio_chunks
//     rows (seq, start_ms, storage) in order; the live transcript in order.
//   - prints RESULT lines with every join; screenshots spike-restart-1280,
//     spike-overlap-1280.
// About 2.5 minutes. Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// Run from elsewhere (a copy): WEB_CHECK_SCRIPTS=<the web-check scripts folder> node spike.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The driver beside this file (installed), or in WEB_CHECK_SCRIPTS (a copy run from elsewhere).
const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, dropUser } = await import(new URL('testuser.mjs', scripts).href);

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
    await b.shot(`fail-spike-${results.length}`).catch(() => {});
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

const PERIOD_MS = 500;
/** Before the app: the synthetic microphone and transcribe-chunk answered in the page. */
const PAGE_SETUP = `(() => {
  const PERIOD = ${PERIOD_MS / 1000}, CLICK = 0.005;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) throw new Error('only audio here');
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const out = ctx.createMediaStreamDestination();
    const tone = ctx.createOscillator();
    tone.frequency.value = 1000;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.1;
    tone.connect(toneGain).connect(out);
    const click = ctx.createOscillator();
    click.frequency.value = 3000;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0;
    click.connect(clickGain).connect(out);
    const t0 = ctx.currentTime + 0.25;
    for (let n = 0; n < 2400; n++) {
      clickGain.gain.setValueAtTime(0.8, t0 + n * PERIOD);
      clickGain.gain.setValueAtTime(0, t0 + n * PERIOD + CLICK);
    }
    tone.start();
    click.start();
    // When click 0 sounds, on the page's clock (to tell which click is which; it only needs to be within 250 ms).
    const stamp = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    const perf0 = stamp && stamp.performanceTime ? stamp.performanceTime + (t0 - stamp.contextTime) * 1000 : performance.now() + (t0 - ctx.currentTime) * 1000;
    window.__spikeSignal = { perf0, periodMs: PERIOD * 1000 };
    window.__spikeAudio = ctx;
    return out.stream;
  };
  const realFetch = window.fetch.bind(window);
  window.__spikeTranscribeCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/transcribe-chunk')) {
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      window.__spikeTranscribeCalls.push(body);
      const segments = [{ startMs: body.startMs, endMs: body.startMs + 1000, text: 'Simulated chunk ' + body.seq }];
      return new Response(JSON.stringify({ chunkId: 'simulated', durationMs: 0, segments }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

/**
 * In the page: every chunk decoded and measured; the joins. A chunk's audio is where the tone is
 * (1 ms windows with RMS above 0.03; the tone alone is 0.07), its clicks where |x| passes 0.4.
 */
const ANALYSE = `(async () => {
  const spike = window.studiplySpike, signal = window.__spikeSignal;
  const P = signal.periodMs / 1000;
  const ctx = new AudioContext();
  const out = [];
  for (const c of spike.chunks) {
    let buf;
    try {
      buf = await ctx.decodeAudioData(await c.blob.arrayBuffer());
    } catch (e) {
      out.push({ seq: c.seq, error: 'does not decode: ' + (e && e.message) });
      continue;
    }
    const x = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr / 1000);
    let first = -1, last = -1;
    for (let w = 0; w + win <= x.length; w += win) {
      let s = 0;
      for (let i = w; i < w + win; i++) s += x[i] * x[i];
      if (Math.sqrt(s / win) > 0.03) {
        if (first < 0) first = w;
        last = w + win;
      }
    }
    const onsets = [];
    let quietUntil = 0;
    for (let i = 0; i < x.length; i++) {
      if (Math.abs(x[i]) > 0.4) {
        if (i >= quietUntil) onsets.push(i / sr);
        quietUntil = i + Math.round(0.05 * sr);
      }
    }
    if (first < 0 || !onsets.length) {
      out.push({ seq: c.seq, error: 'no signal in it', duration: buf.duration, onsets: onsets.length });
      continue;
    }
    // Its place: click n sounds at n·P after click 0; the recorder's start picks n.
    const approx = (c.startedAt - signal.perf0) / 1000;
    const n0 = Math.round((approx + onsets[0]) / P);
    const A = n0 * P - onsets[0];
    let residual = 0;
    for (const s of onsets) {
      const k = (A + s) / P;
      residual = Math.max(residual, Math.abs(k - Math.round(k)) * P * 1000);
    }
    out.push({
      seq: c.seq, size: c.blob.size, mime: c.mimeType, duration: buf.duration, sampleRate: sr,
      start: A + first / sr, end: A + last / sr, leadMs: (first / sr) * 1000, tailMs: (buf.duration - last / sr) * 1000,
      clicks: onsets.length, residualMs: residual, offsetMs: (A - approx) * 1000,
    });
  }
  await ctx.close();
  const joins = [];
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1].error || out[i].error) continue;
    joins.push({ after: out[i - 1].seq, gapMs: (out[i].start - out[i - 1].end) * 1000 });
  }
  return { chunks: out, joins };
})()`;

const user = await makeUser();
b = await launch();
// Every request the page makes, to prove none reaches transcribe-chunk or a transcription service.
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const spikeState = () => b.evaluate(`(() => { const s = window.studiplySpike; return s ? { lectureId: s.lectureId, chunks: s.chunks.map((c) => ({ seq: c.seq, startMs: c.startMs, durationMs: c.durationMs, size: c.blob.size, uploaded: c.uploaded, transcribed: c.transcribed })), transcript: s.transcript.map((t) => t.text) } : null; })()`);
const status = () => b.evaluate(`document.querySelector('[data-spike="status"]')?.textContent ?? ''`);

/** Records for `seconds` in a mode, stops, and checks the pipeline; returns the measurement. */
async function run({ chunk, overlap, seconds, shot }) {
  await b.nav(`${BASE}/dev/recording-spike?chunk=${chunk}&overlap=${overlap}`);
  await waitFor(() => b.evaluate(`(() => { const e = document.querySelector('[aria-label="Start recording"]'); return !!e && e.getAttribute('aria-disabled') !== 'true'; })()`), 'the spike screen (Start enabled, signed in)', 40000);
  await b.sleep(2500); // the splash
  await b.clickSelector('[aria-label="Start recording"]');
  await waitFor(async () => (await status()).startsWith('Recording'), async () => `recording (status: ${await status()})`, 20000);
  await b.sleep(seconds * 1000);
  await b.clickSelector('[aria-label="Stop recording"]');
  await waitFor(async () => (await status()).startsWith('Stopped'), async () => `stopped (status: ${await status()})`, 60000);
  const state = await spikeState();
  const expected = Math.floor(seconds / chunk) + 1;
  expect(state && state.chunks.length === expected, `chunks: ${state?.chunks.length} (expected ${expected})`);
  expect(state.chunks.every((c, i) => c.seq === i), `seq: ${state.chunks.map((c) => c.seq)}`);
  expect(state.chunks.every((c) => c.uploaded && c.transcribed), `not all uploaded and transcribed: ${JSON.stringify(state.chunks)}`);
  // The live transcript: one line per chunk, in order.
  expect(JSON.stringify(state.transcript) === JSON.stringify(state.chunks.map((c) => `Simulated chunk ${c.seq}`)), `transcript: ${JSON.stringify(state.transcript)}`);
  const shown = await b.evaluate(`document.querySelector('[data-spike="transcript"]')?.innerText ?? ''`);
  expect(state.chunks.every((c) => shown.includes(`Simulated chunk ${c.seq}`)), `the transcript on screen: ${shown}`);
  // The rows and files, as the app saves every chunk.
  const { data: rows } = await admin.from('audio_chunks').select('seq, start_ms, duration_ms, storage_path, status').eq('lecture_id', state.lectureId).order('seq');
  expect(rows?.length === expected && rows.every((r, i) => r.seq === i && r.storage_path && r.status === 'uploaded'), `audio_chunks: ${JSON.stringify(rows)}`);
  expect(rows.every((r, i) => i === 0 || r.start_ms > rows[i - 1].start_ms), `start_ms not increasing: ${rows.map((r) => r.start_ms)}`);
  for (const r of rows) {
    const { data: file, error } = await admin.storage.from('audio-chunks').download(r.storage_path);
    expect(!error && file && file.size > 0, `the file ${r.storage_path}: ${error?.message}`);
  }
  await b.shot(shot);
  return b.evaluate(ANALYSE);
}

const describe = (label, m) => {
  for (const c of m.chunks) {
    report.push(
      c.error
        ? `RESULT | ${label} | chunk ${c.seq} | ${c.error}`
        : `RESULT | ${label} | chunk ${c.seq} | ${c.duration.toFixed(3)} s decoded, ${Math.round(c.size / 1024)} KB ${c.mime} | audio from ${c.leadMs.toFixed(1)} ms to ${c.tailMs.toFixed(1)} ms before its end | ${c.clicks} clicks, alignment within ${c.residualMs.toFixed(2)} ms`,
    );
  }
  for (const j of m.joins) report.push(`RESULT | ${label} | join after chunk ${j.after} | ${j.gapMs > 0 ? `GAP ${j.gapMs.toFixed(1)} ms` : `overlap ${(-j.gapMs).toFixed(1)} ms`}`);
};
const expectMeasured = (m) => {
  expect(m.chunks.every((c) => !c.error), `chunks that don't decode or hold no signal: ${JSON.stringify(m.chunks.filter((c) => c.error))}`);
  expect(m.chunks.every((c) => c.residualMs < 2), `clicks don't line up (the measure isn't exact): ${m.chunks.map((c) => c.residualMs.toFixed(2))}`);
  expect(m.joins.length === m.chunks.length - 1, `joins: ${m.joins.length}`);
};

try {
  const { error } = await user.client.from('ai_consent').insert({ scope: 'transcription', policy_version: POLICY_VERSION });
  if (error) throw new Error(`the consent: ${error.message}`);
  await b.signIn(BASE, user.email, user.password);

  await step('restart, 30-second chunks: each chunk a file of its own, uploaded and transcribed in order; the joins measured', async () => {
    const m = await run({ chunk: 30, overlap: 0, seconds: 95, shot: 'spike-restart-1280' });
    describe('restart 30 s', m);
    expectMeasured(m);
  });

  await step('overlap 500 ms, 10-second chunks: no gap at any join; the overlap measured', async () => {
    const m = await run({ chunk: 10, overlap: 500, seconds: 35, shot: 'spike-overlap-1280' });
    describe('overlap 500 ms', m);
    expectMeasured(m);
    expect(m.joins.every((j) => j.gapMs <= 0), `a gap with the overlap: ${m.joins.map((j) => j.gapMs.toFixed(1))}`);
  });

  await step('no request reached transcribe-chunk, OpenAI or ElevenLabs (transcription answered in the page)', async () => {
    const out = requests.filter((u) => /functions\/v1\/transcribe-chunk|api\.openai\.com|elevenlabs\.io/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
    const calls = await b.evaluate('window.__spikeTranscribeCalls?.length ?? 0');
    expect(calls >= 1, 'transcribe-chunk was never asked (the stand-in saw nothing)');
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
