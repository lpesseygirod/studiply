// joins.mjs — the iPhone join test (steps 5.1–5.2, iPhone half): measures every
// join between the chunks of a lecture the iPhone recorded while the laptop
// played click-track.html (a click every 50 ms, a longer beep on each whole
// second). Reads only, and only LOCAL Supabase (the iPhone's development
// build uses it): the lecture's audio_chunks rows and their files, decoded
// in headless Chrome. Nothing is changed, sent or stored.
//
// For each join it prints:
//   - the clicks heard in both chunks (the overlap: about 10 with 500 ms),
//   - the clicks heard in neither (audio lost at the join; each ≈ 50 ms),
//   - how far the next chunk's start_ms is off (ms, from the clicks),
//   - the join itself from the files' lengths (ms, < 0 an overlap; ± the AAC
//     encoder's padding, a few tens of ms).
// Also the clicks missed inside chunks (a dropout), each file's decoded
// length against its row, chunks far longer than 30 s (a rotation that
// didn't run), and the phone's clock drift.
//
// Too quiet (30 Oct): a chunk where fewer than half of its clicks are heard
// on the 50 ms grid didn't hear the click track (too far, too soft, a loud
// room). It is not measured, its "missed" clicks are not counted as lost,
// and the verdict says NOT MEASURED (exit code 3) with what to change.
// Exit code 1 if a join lost audio or couldn't be measured.
//
// Usage, from the Studiply folder (supabase start running):
//   node .claude/skills/web-check/scripts/joins.mjs "Join test"
// (or from elsewhere: WEB_CHECK_SCRIPTS=<the web-check scripts folder> node joins.mjs "Join test")
// The newest lecture with that title is measured. Record it without Pause:
// a pause (or a call) shows as "not continuous" and the joins after it are
// measured on their own.
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
/** Fewer of a chunk's clicks heard than this: the click track didn't reach the phone. */
const TOO_QUIET = 0.5;
/** Fewer than this: heard, but quietly (some "missed" clicks may only be too soft). */
const QUIET = 0.9;
/** A chunk longer than this: its rotation didn't run (30 s + the 500 ms overlap + slack). */
const LONG_MS = 31_500;

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

/** In the page: decodes a chunk and finds the clicks' onsets (ms) and which are the second's beeps. */
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
  window.__measure = async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const ctx = new AudioContext();
    try {
      const buf = await ctx.decodeAudioData(bytes.buffer);
      return { durationMs: buf.duration * 1000, ...onsets(buf.getChannelData(0), buf.sampleRate) };
    } catch (e) {
      return { error: 'does not decode: ' + (e && e.message) };
    } finally {
      await ctx.close();
    }
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
    const r = await b.evaluate(`window.__measure('${b64}')`);
    if (r.error) {
      c.error = r.error;
      continue;
    }
    c.dur = r.durationMs;
    c.expected = Math.max(1, Math.round(r.durationMs / P));
    // A beep stays loud well longer than this chunk's usual click (most onsets are clicks).
    const usual = r.onsets.length ? median(r.onsets.map((o) => o.len)) : 0;
    c.clicks = r.onsets.map((o) => ({ T: row.start_ms + o.t, mark: o.len >= Math.max(12, 1.8 * usual) }));
    if (!c.clicks.length) {
      c.share = 0;
      c.quiet = true;
      c.error = 'too quiet: no clicks heard at all';
    }
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

// Every click gets its number on the laptop's track (G), chunk after chunk; a jump starts a new stretch.
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
  Object.assign(c, local(c));
  c.share = c.onGrid / c.expected;
  if (c.share < TOO_QUIET) {
    c.quiet = true;
    c.error = `too quiet: ${c.onGrid} of about ${c.expected} clicks heard (${pct(c.share)})`;
    seg = null;
    continue;
  }
  if (!c.marks) {
    c.quiet = true;
    c.error = 'too quiet: no second beeps heard';
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

const minutes = (rows.at(-1).start_ms + rows.at(-1).duration_ms) / 60000;
console.log(`LECTURE | "${lecture.title}" | ${rows.length} chunks | ${minutes.toFixed(1)} min recorded`);
const seqsInOrder = rows.every((r, i) => r.seq === i);
console.log(`RESULT | order | ${seqsInOrder ? `chunks 0–${rows.length - 1}, none missing` : `numbers ${rows.map((r) => r.seq).join(', ')} (some missing)`}`);

let lost = 0;
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
  if (B.breakOff !== undefined) {
    unmeasured++;
    console.log(`JOIN | ${name} | not continuous: #${B.seq}'s clicks are ${ms(B.breakOff)} away from where #${A.seq}'s put them (a pause, a call, or a clock jump); measured on from here`);
    continue;
  }
  const shared = B.list.filter((x) => A.gs.has(x.G)).length;
  const missing = Math.max(0, B.lo - A.hi - 1);
  const step = B.r - A.r;
  const audioJoin = B.start - B.r - (A.start - A.r + A.dur);
  if (missing) lost++;
  kinds.push(shared > 0 ? 'overlap' : 'restart');
  console.log(
    `JOIN | ${name} | ${shared} clicks in both (≈ ${shared * P} ms overlap), ${missing} in neither${missing ? ` (≈ ${missing * P} ms LOST)` : ''} | start_ms off by ${ms(step)} | join from the files ≈ ${ms(audioJoin)}`,
  );
}

// How well the click track was heard, chunk by chunk.
const tooQuiet = chunks.filter((c) => c.quiet);
const decoded = chunks.filter((c) => c.share !== undefined);
if (decoded.length) {
  const shares = decoded.map((c) => c.share);
  const worst = decoded.reduce((w, c) => (c.share < w.share ? c : w));
  console.log(`RESULT | loudness | clicks heard per chunk: median ${pct(median(shares))}, lowest ${pct(worst.share)} (#${worst.seq})`);
}
if (tooQuiet.length) {
  console.log(
    `TOO QUIET | ${tooQuiet.length} of ${chunks.length} chunks didn't hear the click track (${tooQuiet.map((c) => `#${c.seq} ${pct(c.share ?? 0)}`).join(', ')}): ` +
      'their joins are not measured and their missing clicks are not counted as lost. Phone 30 cm from the laptop speaker, volume 75 %, a quiet room, then record again.',
  );
}
const faint = decoded.filter((c) => !c.quiet && c.share < QUIET);
if (faint.length) console.log(`NOTE | quiet (some missed clicks may only be too soft): ${faint.map((c) => `#${c.seq} ${pct(c.share)}`).join(', ')}`);

const heard = chunks.reduce((n, c) => n + (c.list?.length ?? 0), 0);
const inside = chunks.filter((c) => !c.quiet && c.missedInside > 0);
console.log(`RESULT | clicks | ${heard} heard across the chunks; missed inside a chunk: ${inside.length ? inside.map((c) => `#${c.seq} ${c.missedInside}`).join(', ') : 'none'}`);
const bad = chunks.filter((c) => c.badMarks > 0);
if (bad.length) console.log(`NOTE | beeps out of place (noise taken for a beep): ${bad.map((c) => `#${c.seq} ${c.badMarks}`).join(', ')}`);
const durs = chunks.filter((c) => c.dur !== undefined).map((c) => c.dur - c.rowDur);
if (durs.length) console.log(`RESULT | lengths | decoded minus duration_ms: ${ms(Math.min(...durs))} to ${ms(Math.max(...durs))}`);
const long = chunks.filter((c) => c.rowDur > LONG_MS);
console.log(
  `RESULT | chunk lengths | ${long.length ? `LONG: ${long.map((c) => `#${c.seq} ${length(c.rowDur)}`).join(', ')} (its rotation didn't run; the phone should have cut it into 30-s pieces)` : `all ≤ ${LONG_MS / 1000} s`}`,
);
for (const s of segments) {
  console.log(`RESULT | clock | chunks #${s.chunks[0].seq}–#${s.chunks.at(-1).seq}: the phone's clock against the laptop's ${((s.b / P - 1) * 1e6).toFixed(0)} ppm`);
}
const mode = kinds.every((k) => k === 'overlap') ? 'two recorders at each join (overlap)' : kinds.every((k) => k === 'restart') ? 'one recorder, restarted at each join (iOS refused two)' : 'mixed (overlap at some joins, restart at others)';
if (kinds.length) console.log(`RESULT | joins | ${mode}`);
if (tooQuiet.length) {
  console.log(
    `VERDICT | NOT MEASURED | the click track was too quiet in ${tooQuiet.length} of ${chunks.length} chunks, so the joins can't be judged` +
      `${lost ? ` (${lost} join(s) between heard chunks lost audio)` : ''}. Move the phone closer and record again.`,
  );
  process.exit(3);
}
console.log(
  lost || unmeasured || long.length
    ? `VERDICT | FAIL | ${lost} join(s) lost audio, ${unmeasured} not measured${long.length ? `, ${long.length} chunk(s) longer than ${LONG_MS / 1000} s` : ''}`
    : `VERDICT | PASS | all ${kinds.length} rotations measured, no click lost at any join${paused ? ` (${paused} Pause/Continue joins left out)` : ''}`,
);
process.exit(lost || unmeasured || long.length ? 1 : 0);
