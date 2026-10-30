// joins.mjs — the iPhone join test (steps 5.1–5.2, iPhone half): measures every
// join between the chunks of a lecture the iPhone recorded while the laptop
// played click-track.html (a click every 50 ms, a longer beep on each whole
// second). Reads only, and only LOCAL Supabase (the iPhone's development
// build uses it): the lecture's audio_chunks rows and their files, decoded
// in headless Chrome. Nothing is changed, sent or stored.
//
// Each join is measured two ways:
//   1. From the audio itself (the verdict): consecutive chunks overlap by
//      500 ms, so the start of chunk n+1 is also the end of chunk n. A piece
//      of n+1's start (300 ms, after its first 50 ms) is cross-correlated with
//      the end of n around where start_ms puts it (± 300 ms). Printed: the
//      overlap measured, how far start_ms is off, and whether the overlap is
//      the same audio (ρ, the correlation: 1 = identical). This needs no
//      beeps and works with any sound, even the room's.
//   2. From the clicks (a second opinion): the clicks heard in both chunks and
//      in neither, placed on the laptop's track by the second's beeps. The
//      iPhone's recording often loses the beeps (2nd test, 30 Oct: heard in 2
//      of 31 chunks, clicks in 63–95 %), and then this one says why it can't.
// Also: how much of the click track each chunk heard, chunks far longer than
// 30 s (a rotation that didn't run), short chunks in the middle and what they
// look like (a long part cut on the phone, a pause), the decoded lengths and
// the phone's clock drift.
//
// A periodic sound (the click track) matches equally well a period (50 ms)
// further on, and then the best match can also land at the search's edge:
// such a join is reported "audio continuous (ρ …), exact overlap not
// measurable on a periodic signal", not as a failure. Speech isn't periodic,
// so a real lecture gets exact overlaps: it is the definitive join test.
//
// Exit code 0 PASS, 1 FAIL (a join lost or shifted audio, or a chunk too
// long), 3 NOT MEASURED (most joins couldn't be measured either way),
// 4 CONTINUOUS (the audio goes on at every join, but some exact overlaps
// couldn't be measured on a periodic signal).
//
// Usage, from the Studiply folder (supabase start running):
//   node .claude/skills/web-check/scripts/joins.mjs "Join test"
// (or from elsewhere: WEB_CHECK_SCRIPTS=<the web-check scripts folder> node joins.mjs "Join test")
// The newest lecture with that title is measured. Record it without Pause:
// a pause (or a call) is shown and left out.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS
  ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`)
  : existsSync(new URL('./cdp.mjs', import.meta.url))
    ? new URL('./', import.meta.url)
    : pathToFileURL(`${join(process.cwd(), '.claude/skills/web-check/scripts')}/`);
const { launch } = await import(new URL('cdp.mjs', scripts).href);
const { admin } = await import(new URL('testuser.mjs', scripts).href);

/** click-track.html: a click every 50 ms; every 20th is the second's beep. */
const P = 50;
const PER_SECOND = 20;
/** A chunk whose clicks are this far from where the ones before put them: not continuous. */
const BREAK_MS = 300;
/** A click this close to its place on the chunk's 50 ms grid counts as heard (ms). */
const ON_GRID_MS = 6;
/** Fewer of a chunk's clicks than this on the grid: too few for the click method (quiet, or its timing jumps). */
const FEW_CLICKS = 0.5;
/** Heard, but quietly. */
const QUIET = 0.9;
/** A chunk longer than this: its rotation didn't run (30 s + the 500 ms overlap + slack). */
const LONG_MS = 31_500;
/** The overlap is the same audio from this correlation; below the second, audio was lost or shifted. */
const SAME = 0.8;
const DIFFERENT = 0.5;
/** A rotation's overlap should be about 500 ms; outside this it's reported as wrong. */
const OVERLAP_OK = [300, 700];
/** start_ms may be off by this much (ms) before it's reported. */
const START_OK_MS = 50;

const title = process.argv[2];
if (!title) {
  console.error('Usage: node joins.mjs "<lecture title>"');
  process.exit(2);
}

const { data: files, error: filesError } = await admin
  .from('files')
  .select('id, title, created_at')
  .eq('kind', 'lecture')
  .eq('title', title)
  .is('deleted_at', null)
  .order('created_at', { ascending: false });
if (filesError) throw filesError;
if (!files?.length) {
  console.error(`No lecture titled "${title}" on local Supabase.`);
  process.exit(2);
}
const lecture = files[0];
if (files.length > 1) console.log(`NOTE | ${files.length} lectures are titled "${title}": the newest (${lecture.created_at}) is measured.`);
const { data: rows, error: rowsError } = await admin
  .from('audio_chunks')
  .select('seq, start_ms, duration_ms, storage_path, status')
  .eq('lecture_id', lecture.id)
  .order('seq');
if (rowsError) throw rowsError;
if (!rows?.length) {
  console.error('The lecture has no audio_chunks rows yet (still uploading?).');
  process.exit(2);
}

/**
 * In the page: decodes a chunk, finds the clicks' onsets (ms) and which are the second's beeps,
 * and keeps the chunk's first 2 s and last 2.5 s for measuring its joins (__join).
 * (No backticks or dollar-braces in here: this is a template string.)
 */
const PAGE = `(() => {
  const onsets = (x, sr) => {
    // 1 ms frames of the first difference (rumble and low voices out, clicks kept).
    const frame = Math.max(1, Math.round(sr / 1000));
    const frames = Math.floor(x.length / frame);
    const env = new Float32Array(frames);
    let prev = 0;
    for (let f = 0; f < frames; f++) {
      let m = 0;
      for (let i = f * frame; i < (f + 1) * frame; i++) {
        const d = Math.abs(x[i] - prev);
        prev = x[i];
        if (d > m) m = d;
      }
      env[f] = m;
    }
    const sorted = Float32Array.from(env).sort();
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0;
    const noise = at(0.5);
    const loud = at(0.98);
    const thr = noise + 0.3 * (loud - noise);
    const found = [];
    let quiet = 99;
    for (let f = 0; f < frames; f++) {
      if (env[f] > thr && quiet >= 15) {
        // The first sample over the threshold, for sub-millisecond timing.
        let i = f * frame;
        let p = i > 0 ? x[i - 1] : 0;
        for (; i < (f + 1) * frame; i++) {
          if (Math.abs(x[i] - p) > thr) break;
          p = x[i];
        }
        // How long it stays loud (ms): the beep is 25 ms, a click 3 ms (plus the room's echo).
        let len = 0;
        for (let g = f, below = 0; g < frames && below < 3; g++, len++) below = env[g] > thr / 2 ? 0 : below + 1;
        found.push({ t: (i / sr) * 1000, len });
      }
      quiet = env[f] > thr / 2 ? 0 : quiet + 1;
    }
    return { onsets: found, noise, loud };
  };
  window.__edges = {};
  window.__measure = async (b64, seq) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const ctx = new AudioContext();
    try {
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const x = buf.getChannelData(0);
      const sr = buf.sampleRate;
      window.__edges[seq] = {
        sr,
        n: x.length,
        head: x.slice(0, Math.min(x.length, Math.round(2 * sr))),
        tail: x.slice(Math.max(0, x.length - Math.round(2.5 * sr))),
      };
      return { durationMs: buf.duration * 1000, ...onsets(x, sr) };
    } catch (e) {
      return { error: 'does not decode: ' + (e && e.message) };
    } finally {
      await ctx.close();
    }
  };

  const pearson = (t, x, at) => {
    const n = t.length;
    let st = 0;
    let sx = 0;
    for (let i = 0; i < n; i++) {
      st += t[i];
      sx += x[at + i];
    }
    const mt = st / n;
    const mx = sx / n;
    let sxy = 0;
    let stt = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      const a = t[i] - mt;
      const b = x[at + i] - mx;
      sxy += a * b;
      stt += a * a;
      sxx += b * b;
    }
    return stt > 0 && sxx > 0 ? sxy / Math.sqrt(stt * sxx) : 0;
  };
  const decimate = (x, d) => {
    const out = new Float32Array(Math.floor(x.length / d));
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += x[i * d + k];
      out[i] = s / d;
    }
    return out;
  };
  const rms = (x) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, x.length));
  };

  // Where chunk b's start is found in chunk a's end; offsetMs: b.start_ms - a.start_ms.
  window.__join = (a, b, offsetMs) => {
    const A = window.__edges[a];
    const B = window.__edges[b];
    if (!A || !B) return { error: 'not decoded' };
    if (A.sr !== B.sr) return { error: 'different sample rates' };
    const sr = A.sr;
    const tailStart = A.n - A.tail.length;
    // B's first 50 ms are left out: a decoder starting fresh needs a frame or two.
    const skip = Math.round(0.05 * sr);
    const offset = Math.round((offsetMs * sr) / 1000);
    const predictedOverlap = A.n - offset;
    const predictedOverlapMs = (predictedOverlap / sr) * 1000;
    const len = Math.min(Math.round(0.3 * sr), predictedOverlap - skip - Math.round(0.02 * sr), B.head.length - skip);
    if (len < Math.round(0.1 * sr)) return { noOverlap: true, predictedOverlapMs };
    const t = B.head.subarray(skip, skip + len);
    if (rms(t) < 1e-4) return { silent: true, predictedOverlapMs };
    const expected = offset + skip - tailStart;
    const search = Math.round(0.3 * sr);
    const lo = Math.max(0, expected - search);
    const hi = Math.min(A.tail.length - len, expected + search);
    if (hi < lo) return { noOverlap: true, predictedOverlapMs };
    // Coarse at about 6 kHz, then sample by sample around the best place.
    const d = Math.max(1, Math.round(sr / 6000));
    const td = decimate(t, d);
    const ad = decimate(A.tail, d);
    let best = -2;
    let bestAt = lo;
    const coarse = [];
    for (let p = Math.ceil(lo / d); p * d <= hi && p + td.length <= ad.length; p++) {
      const r = pearson(td, ad, p);
      coarse.push({ at: p * d, r });
      if (r > best) {
        best = r;
        bestAt = p * d;
      }
    }
    // A periodic sound (the click every 50 ms) matches as well one period further on: the best
    // other peak at least 20 ms away, nearly as high, makes the place ambiguous.
    const apart = Math.round(0.02 * sr);
    let rival = -2;
    let rivalAt = null;
    for (const c of coarse) {
      if (Math.abs(c.at - bestAt) >= apart && c.r > rival) {
        rival = c.r;
        rivalAt = c.at;
      }
    }
    let fine = -2;
    let fineAt = bestAt;
    for (let p = Math.max(lo, bestAt - 2 * d); p <= Math.min(hi, bestAt + 2 * d); p++) {
      const r = pearson(t, A.tail, p);
      if (r > fine) {
        fine = r;
        fineAt = p;
      }
    }
    const bAt = tailStart + fineAt - skip;
    return {
      rho: fine,
      overlapMs: ((A.n - bAt) / sr) * 1000,
      predictedOverlapMs,
      offErrMs: ((bAt - offset) / sr) * 1000,
      lenMs: (len / sr) * 1000,
      // Nearly as good elsewhere (within 0.05), and how far away (ms): a period of the sound.
      ambiguous: rival >= best - 0.05,
      rivalMs: rivalAt === null ? null : ((rivalAt - bestAt) / sr) * 1000,
      // The best place at the search's edge: the true one may lie beyond it.
      edge: fineAt - lo <= d || hi - fineAt <= d,
    };
  };
  return true;
})()`;

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ms = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x))} ms`;
const pct = (x) => `${Math.round(x * 100)} %`;
const length = (x) => (x >= 120_000 ? `${(x / 60_000).toFixed(1)} min` : `${(x / 1000).toFixed(1)} s`);

const b = await launch();
const chunks = [];
const audioJoins = new Map();
try {
  await b.evaluate(PAGE);
  for (const row of rows) {
    const c = { seq: row.seq, start: row.start_ms, rowDur: row.duration_ms };
    chunks.push(c);
    if (!row.storage_path) {
      c.error = `not uploaded (${row.status})`;
      continue;
    }
    const { data: file, error } = await admin.storage.from('audio-chunks').download(row.storage_path);
    if (error || !file) {
      c.error = `the file: ${error?.message ?? 'missing'}`;
      continue;
    }
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const r = await b.evaluate(`window.__measure('${b64}', ${row.seq})`);
    if (r.error) {
      c.error = r.error;
      continue;
    }
    c.dur = r.durationMs;
    c.expected = Math.max(1, Math.round(r.durationMs / P));
    // A beep stays loud well longer than this chunk's usual click (most onsets are clicks).
    const usual = r.onsets.length ? median(r.onsets.map((o) => o.len)) : 0;
    c.clicks = r.onsets.map((o) => ({ T: row.start_ms + o.t, mark: o.len >= Math.max(12, 1.8 * usual) }));
  }
  // Method 1: each join from the shared audio.
  for (let i = 0; i + 1 < chunks.length; i++) {
    const A = chunks[i];
    const B = chunks[i + 1];
    if (A.error || B.error) continue;
    audioJoins.set(B.seq, await b.evaluate(`window.__join(${A.seq}, ${B.seq}, ${B.start - A.start})`));
  }
} finally {
  await b.close();
}

/**
 * A chunk's clicks numbered from its first (k), one per 50 ms; which number the beeps fall on;
 * how many sit on the 50 ms grid (a line fitted through them: a long chunk drifts a little).
 */
function local(c) {
  const T0 = c.clicks[0].T;
  const byK = new Map();
  for (const click of c.clicks) {
    const k = Math.round((click.T - T0) / P);
    if (!byK.has(k)) byK.set(k, { ...click, k });
  }
  const list = [...byK.values()];
  const mk = mean(list.map((x) => x.k));
  const mt = mean(list.map((x) => x.T));
  let num = 0;
  let den = 0;
  for (const x of list) {
    num += (x.k - mk) * (x.T - mt);
    den += (x.k - mk) ** 2;
  }
  const slope = den > 0 ? num / den : P;
  const onGrid = list.filter((x) => Math.abs(x.T - (mt + slope * (x.k - mk))) <= ON_GRID_MS).length;
  const a = mean(list.map((x) => x.T - P * x.k));
  const votes = new Array(PER_SECOND).fill(0);
  for (const x of list) if (x.mark) votes[x.k % PER_SECOND]++;
  const marks = votes.reduce((s, v) => s + v, 0);
  const phase = votes.indexOf(Math.max(...votes));
  return { list, a, phase, marks, badMarks: marks - votes[phase], onGrid };
}

/** Least squares T = a + b·G over a stretch of continuous chunks (b: the click period on the phone's clock). */
function fit(seg) {
  const gs = seg.pts.map((p) => p.G);
  const ts = seg.pts.map((p) => p.T);
  const mg = mean(gs);
  const mt = mean(ts);
  let num = 0;
  let den = 0;
  for (let i = 0; i < gs.length; i++) {
    num += (gs[i] - mg) * (ts[i] - mt);
    den += (gs[i] - mg) ** 2;
  }
  seg.b = den > 0 ? num / den : P;
  seg.a = mt - seg.b * mg;
}

// Method 2: every click gets its number on the laptop's track (G), chunk after chunk, placed by the
// beeps; a chunk without beeps (or too few clicks) is left out of this method only (`clickError`).
const segments = [];
let seg = null;
for (const [i, c] of chunks.entries()) {
  // A chunk that starts exactly where the one before ended: after a Pause or Continue, not a rotation
  // (rotations overlap, or restart a few ms after the end). The laptop's clicks went on meanwhile.
  const before = chunks[i - 1];
  if (before && c.start === before.start + before.rowDur) {
    c.pauseBefore = true;
    seg = null;
  }
  if (c.error) {
    seg = null;
    continue;
  }
  if (!c.clicks.length) {
    c.share = 0;
    c.clickError = 'no clicks heard';
    seg = null;
    continue;
  }
  Object.assign(c, local(c));
  c.share = c.onGrid / c.expected;
  if (c.share < FEW_CLICKS) {
    c.clickError = `only ${pct(c.share)} of its clicks on the 50 ms grid (quiet, or its timing jumps)`;
    seg = null;
    continue;
  }
  if (!c.marks) {
    c.clickError = 'no second beeps heard to place its clicks';
    seg = null;
    continue;
  }
  const beepAt = c.a + P * c.phase;
  const place = (s) => {
    const S = Math.round((beepAt - s.a) / (s.b * PER_SECOND));
    for (const x of c.list) x.G = S * PER_SECOND + (x.k - c.phase);
    return median(c.list.map((x) => x.T - (s.a + s.b * x.G)));
  };
  const off = seg ? place(seg) : 0;
  if (Math.abs(off) > BREAK_MS) {
    c.breakOff = off;
    seg = null;
  }
  if (!seg) {
    seg = { a: beepAt, b: P, pts: [], chunks: [] };
    segments.push(seg);
    place(seg);
  }
  c.segment = seg;
  seg.chunks.push(c);
  seg.pts.push(...c.list);
  fit(seg);
}
for (const s of segments) {
  for (const c of s.chunks) {
    c.r = median(c.list.map((x) => x.T - (s.a + s.b * x.G)));
    const gs = new Set(c.list.map((x) => x.G));
    const lo = Math.min(...gs);
    const hi = Math.max(...gs);
    c.lo = lo;
    c.hi = hi;
    c.gs = gs;
    c.missedInside = hi - lo + 1 - gs.size;
  }
}

/** The second opinion for a join, from the clicks. */
function clickOpinion(A, B) {
  const why = A.clickError ? `#${A.seq} ${A.clickError}` : B.clickError ? `#${B.seq} ${B.clickError}` : null;
  if (why) return { text: `clicks: not placed (${why})` };
  if (B.breakOff !== undefined || A.segment !== B.segment) return { text: `clicks: not continuous (#${B.seq}'s clicks ${ms(B.breakOff ?? 0)} from where #${A.seq}'s put them)` };
  const shared = B.list.filter((x) => A.gs.has(x.G)).length;
  const missing = Math.max(0, B.lo - A.hi - 1);
  return { shared, missing, text: `clicks: ${shared} in both (≈ ${shared * P} ms), ${missing} in neither${missing ? ` (≈ ${missing * P} ms LOST)` : ''}, start_ms off by ${ms(B.r - A.r)}` };
}

const minutes = (rows.at(-1).start_ms + rows.at(-1).duration_ms) / 60000;
console.log(`LECTURE | "${lecture.title}" | ${rows.length} chunks | ${minutes.toFixed(1)} min recorded`);
const seqsInOrder = rows.every((r, i) => r.seq === i);
console.log(`RESULT | order | ${seqsInOrder ? `chunks 0–${rows.length - 1}, none missing` : `numbers ${rows.map((r) => r.seq).join(', ')} (some missing)`}`);

let good = 0;
let bad = 0;
/** The same audio across the join, its exact place not measurable (a periodic signal). */
let continuous = 0;
let unmeasured = 0;
let paused = 0;
const kinds = [];
for (let i = 0; i + 1 < chunks.length; i++) {
  const A = chunks[i];
  const B = chunks[i + 1];
  const name = `#${A.seq}→#${B.seq}`;
  if (A.error || B.error) {
    unmeasured++;
    console.log(`JOIN | ${name} | not measured: ${A.error ? `#${A.seq} ${A.error}` : `#${B.seq} ${B.error}`}`);
    continue;
  }
  if (B.pauseBefore) {
    paused++;
    console.log(`JOIN | ${name} | a Pause or Continue here (#${B.seq} starts exactly where #${A.seq} ended): not a rotation, not measured`);
    continue;
  }
  const j = audioJoins.get(B.seq) ?? { error: 'not measured' };
  const clicks = clickOpinion(A, B);
  let audio;
  if (j.error) {
    audio = `audio: ${j.error}`;
  } else if (j.noOverlap) {
    audio = `audio: no overlap to compare (start_ms says ${ms(j.predictedOverlapMs)}: a restart, not two recorders)`;
  } else if (j.silent) {
    audio = 'audio: silent where the chunks overlap, nothing to compare';
  } else if (j.rho >= SAME && (j.ambiguous || j.edge)) {
    // The audio goes on across the join, but where exactly can't be told: the click track repeats
    // every 50 ms (the beeps that would tell are lost on the iPhone). Speech has no such repeats.
    j.periodic = true;
    const why = [
      j.ambiguous ? `matches nearly as well ${ms(j.rivalMs)} away` : null,
      j.edge ? `best match at the ± 300 ms search edge (overlap ${Math.round(j.overlapMs)} ms, start_ms ${ms(j.offErrMs)})` : null,
    ].filter(Boolean);
    audio = `audio continuous (ρ ${j.rho.toFixed(2)}), exact overlap not measurable on a periodic signal (${why.join('; ')})`;
  } else {
    const same = j.rho >= SAME;
    const different = j.rho < DIFFERENT;
    const overlapOk = j.overlapMs >= OVERLAP_OK[0] && j.overlapMs <= OVERLAP_OK[1];
    const startOk = Math.abs(j.offErrMs) <= START_OK_MS;
    const verdict = different ? 'NOT the same audio (lost or shifted here)' : same ? 'the same audio' : 'similar audio';
    audio =
      `audio: overlap ${Math.round(j.overlapMs)} ms${overlapOk ? '' : ' (WRONG: should be about 500)'}, start_ms off by ${ms(j.offErrMs)}${startOk ? '' : ' (TOO FAR)'}` +
      ` · ${verdict} (ρ ${j.rho.toFixed(2)} over ${Math.round(j.lenMs)} ms)`;
    j.ok = same && overlapOk && startOk;
    j.bad = different || !overlapOk || !startOk;
  }
  // Counted: the audio when it could be compared, otherwise the clicks.
  if (j.periodic) continuous++;
  else if (j.ok) good++;
  else if (j.bad) bad++;
  else if (clicks.missing !== undefined) clicks.missing ? bad++ : good++;
  else if (!j.error && !j.noOverlap && !j.silent) good++; // similar audio, no clicks to say otherwise
  else unmeasured++;
  if (j.periodic) kinds.push('overlap');
  else if (j.overlapMs !== undefined) kinds.push(j.overlapMs > 100 ? 'overlap' : 'restart');
  else if (j.noOverlap) kinds.push('restart');
  console.log(`JOIN | ${name} | ${audio} | ${clicks.text}`);
}

// How well the click track was heard, chunk by chunk (it decides the click method only).
const decoded = chunks.filter((c) => c.share !== undefined);
if (decoded.length) {
  const shares = decoded.map((c) => c.share);
  const worst = decoded.reduce((w, c) => (c.share < w.share ? c : w));
  console.log(`RESULT | loudness | clicks heard per chunk: median ${pct(median(shares))}, lowest ${pct(worst.share)} (#${worst.seq})`);
  const noBeeps = decoded.filter((c) => c.clickError === 'no second beeps heard to place its clicks');
  if (noBeeps.length) {
    console.log(
      `NOTE | beeps | no second beeps heard in ${noBeeps.length} of ${chunks.length} chunks although their clicks were (the iPhone's recording loses the longer, lower beep): ` +
        'the click method can only check those joins partly; the joins are measured from the audio instead',
    );
  }
  const few = decoded.filter((c) => c.share < FEW_CLICKS);
  if (few.length) console.log(`NOTE | few clicks | ${few.map((c) => `#${c.seq} ${pct(c.share)}`).join(', ')} on the 50 ms grid: too quiet there, or the timing jumps inside the chunk`);
  const faint = decoded.filter((c) => c.share >= FEW_CLICKS && c.share < QUIET);
  if (faint.length) console.log(`NOTE | quiet | some missed clicks may only be too soft: ${faint.map((c) => `#${c.seq} ${pct(c.share)}`).join(', ')}`);
  // Too quiet only when most chunks heard fewer than half their clicks (missing beeps alone never count).
  if (few.length > chunks.length / 2) console.log('TOO QUIET | most chunks heard fewer than half the clicks (the joins are still measured from the audio): phone 30 cm from the laptop speaker, volume 75 %, a quiet room.');
}

const heard = chunks.reduce((n, c) => n + (c.list?.length ?? 0), 0);
const inside = chunks.filter((c) => !c.clickError && c.missedInside > 0);
console.log(`RESULT | clicks | ${heard} heard across the chunks; missed inside a chunk (where placed): ${inside.length ? inside.map((c) => `#${c.seq} ${c.missedInside}`).join(', ') : 'none'}`);
const badMarks = chunks.filter((c) => c.badMarks > 0);
if (badMarks.length) console.log(`NOTE | beeps out of place (noise taken for a beep): ${badMarks.map((c) => `#${c.seq} ${c.badMarks}`).join(', ')}`);
const durs = chunks.filter((c) => c.dur !== undefined).map((c) => c.dur - c.rowDur);
if (durs.length) console.log(`RESULT | lengths | decoded minus duration_ms: ${ms(Math.min(...durs))} to ${ms(Math.max(...durs))}`);
const long = chunks.filter((c) => c.rowDur > LONG_MS);
console.log(
  `RESULT | chunk lengths | ${long.length ? `LONG: ${long.map((c) => `#${c.seq} ${length(c.rowDur)}`).join(', ')} (its rotation didn't run; the phone should have cut it into 30-s pieces)` : `all ≤ ${LONG_MS / 1000} s`}`,
);
// Short chunks in the middle: what they look like from start_ms and duration_ms.
for (let i = 1; i + 1 < chunks.length; i++) {
  const c = chunks[i];
  if (c.rowDur >= 25_000) continue;
  const prev = chunks[i - 1];
  const next = chunks[i + 1];
  const where = `#${c.seq} ${length(c.rowDur)} (starts ${length(c.start - prev.start)} after #${prev.seq}, which lasted ${length(prev.rowDur)})`;
  if (Math.abs(c.start - prev.start - 30_000) <= 100 && Math.abs(prev.rowDur - 30_500) <= 100) {
    const part = c.start + c.rowDur - prev.start;
    console.log(
      `NOTE | short | ${where}: with #${prev.seq} ONE part of ${length(part)} cut into two pieces on the phone; its rotation came ${length(part - 30_500)} late ` +
        `(Metro: "[recorder] part N lasted ${Math.round(part / 1000)} s … cut into 2 pieces", and "could not prepare the next part" if preparing failed rather than hung)`,
    );
  } else if (next.start === c.start + c.rowDur) {
    console.log(`NOTE | short | ${where}: a Pause (or the microphone lost) right after it`);
  } else {
    console.log(`NOTE | short | ${where}: ended early, not a cut piece and not a pause: send the Metro log`);
  }
}
for (const s of segments) {
  console.log(`RESULT | clock | chunks #${s.chunks[0].seq}–#${s.chunks.at(-1).seq}: the phone's clock against the laptop's ${((s.b / P - 1) * 1e6).toFixed(0)} ppm`);
}
const mode = kinds.every((k) => k === 'overlap') ? 'two recorders at each join (overlap)' : kinds.every((k) => k === 'restart') ? 'one recorder, restarted at each join (iOS refused two)' : 'mixed (overlap at some joins, restart at others)';
if (kinds.length) console.log(`RESULT | joins | ${mode}; ${good} measured exactly, ${continuous} continuous (exact place not measurable), ${bad} lost or wrong, ${unmeasured} not measured`);

const rotations = good + continuous + bad + unmeasured;
if (rotations && unmeasured > rotations / 2) {
  console.log(`VERDICT | NOT MEASURED | ${unmeasured} of ${rotations} joins couldn't be measured, from the audio or the clicks`);
  process.exit(3);
}
const failed = bad || unmeasured || long.length;
if (failed) {
  console.log(`VERDICT | FAIL | ${bad} join(s) lost or shifted audio, ${unmeasured} not measured${long.length ? `, ${long.length} chunk(s) longer than ${LONG_MS / 1000} s` : ''}`);
  process.exit(1);
}
if (continuous) {
  console.log(
    `VERDICT | CONTINUOUS | the overlap is the same audio at every join, but ${continuous} of ${rotations} joins' exact overlap can't be measured on the periodic click track` +
      ` (${good} measured exactly). A real lecture (speech) is the definitive join test.`,
  );
  process.exit(4);
}
console.log(`VERDICT | PASS | all ${good} rotations measured exactly, the overlap is the same audio at every join${paused ? ` (${paused} Pause/Continue joins left out)` : ''}`);
process.exit(0);
