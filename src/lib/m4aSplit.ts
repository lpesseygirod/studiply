/**
 * Cutting a long .m4a part into 30-second pieces on the iPhone, before upload
 * (30 Oct: with the phone locked one part grew to 6.8 min while the rotation
 * didn't run; a 2-hour class would make one part far over the audio bucket's
 * 25 MiB, which could never upload).
 *
 * An .m4a from AVAudioRecorder is AAC frames (each decodes on its own, 1024
 * samples) in an `mdat` box, and a `moov` box that says where each frame is
 * and how long it lasts. A piece is a new, complete .m4a: the same codec
 * description (`stsd`, copied), its own frame table, and its frames' bytes,
 * copied as they are; nothing is decoded or encoded again. Pieces overlap by
 * `overlapMs` as the recorder's own joins do, so the live transcript's join
 * (transcriptJoin) works the same.
 *
 * Plain JS on the file's bytes through `read` / `write` (expo-file-system on
 * the iPhone, memory in the tests); no dependency, no native code.
 */

export interface M4aIo {
  size: number;
  /** `length` bytes from `position`. */
  read(position: number, length: number): Promise<Uint8Array>;
}

export interface M4aTrack {
  timescale: number;
  language: number;
  /** The codec description, the whole `stsd` box, copied into each piece. */
  stsd: Uint8Array;
  /** Where the sound starts (the encoder's priming, from the edit list), in timescale units. */
  skip: number;
  offsets: number[];
  sizes: number[];
  durations: number[];
}

export interface PieceSpan {
  /** Frames [first, end). */
  first: number;
  end: number;
  /** Where the piece starts in the part, and how long it lasts (ms). */
  startMs: number;
  durationMs: number;
}

// ---------- reading ----------

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u64 = (b: Uint8Array, i: number) => u32(b, i) * 2 ** 32 + u32(b, i + 4);
const i32 = (b: Uint8Array, i: number) => u32(b, i) | 0;
const typeAt = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

interface Box {
  type: string;
  /** Where the box's contents start and end, in `bytes`. */
  start: number;
  end: number;
}

/** The boxes directly inside bytes[from, to). */
function children(bytes: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(bytes, at);
    let header = 8;
    if (size === 1) {
      size = u64(bytes, at + 8);
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    out.push({ type: typeAt(bytes, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return out;
}

const find = (bytes: Uint8Array, box: Box | { start: number; end: number }, type: string) =>
  children(bytes, box.start, box.end).find((b) => b.type === type);

/** The top-level `moov` box, read by its header alone first (it's at the file's end in a recording). */
async function readMoov(io: M4aIo): Promise<Uint8Array> {
  let at = 0;
  while (at + 8 <= io.size) {
    const head = await io.read(at, Math.min(16, io.size - at));
    let size = u32(head, 0);
    let header = 8;
    if (size === 1) {
      size = u64(head, 8);
      header = 16;
    } else if (size === 0) size = io.size - at;
    if (size < header) break;
    if (typeAt(head, 4) === 'moov') return io.read(at, size);
    at += size;
  }
  throw new Error('Not an .m4a file (no moov box).');
}

/** The sound track's frame table. */
export async function readM4a(io: M4aIo): Promise<M4aTrack> {
  const moov = await readMoov(io);
  const top = { start: u32(moov, 0) === 1 ? 16 : 8, end: moov.length };
  for (const trak of children(moov, top.start, top.end).filter((b) => b.type === 'trak')) {
    const mdia = find(moov, trak, 'mdia');
    const hdlr = mdia && find(moov, mdia, 'hdlr');
    if (!mdia || !hdlr || typeAt(moov, hdlr.start + 8) !== 'soun') continue;
    const mdhd = find(moov, mdia, 'mdhd');
    const minf = find(moov, mdia, 'minf');
    const stbl = minf && find(moov, minf, 'stbl');
    const stsd = stbl && find(moov, stbl, 'stsd');
    const stts = stbl && find(moov, stbl, 'stts');
    const stsc = stbl && find(moov, stbl, 'stsc');
    const stsz = stbl && find(moov, stbl, 'stsz');
    const stco = stbl && find(moov, stbl, 'stco');
    const co64 = stbl && find(moov, stbl, 'co64');
    if (!mdhd || !stsd || !stts || !stsc || !stsz || (!stco && !co64)) throw new Error('The .m4a frame table is incomplete.');
    const v1 = moov[mdhd.start] === 1;
    const timescale = u32(moov, mdhd.start + (v1 ? 20 : 12));
    const language = (moov[mdhd.start + (v1 ? 32 : 20)] << 8) | moov[mdhd.start + (v1 ? 33 : 21)];
    if (!timescale) throw new Error('The .m4a frame table is incomplete.');

    const count = u32(moov, stsz.start + 8);
    const fixed = u32(moov, stsz.start + 4);
    const sizes = Array.from({ length: count }, (_, i) => (fixed ? fixed : u32(moov, stsz.start + 12 + 4 * i)));

    const durations: number[] = [];
    for (let e = 0, n = u32(moov, stts.start + 4); e < n; e++) {
      const runs = u32(moov, stts.start + 8 + 8 * e);
      const delta = u32(moov, stts.start + 12 + 8 * e);
      for (let k = 0; k < runs; k++) durations.push(delta);
    }

    const chunkOffsets: number[] = [];
    if (stco) for (let i = 0, n = u32(moov, stco.start + 4); i < n; i++) chunkOffsets.push(u32(moov, stco.start + 8 + 4 * i));
    else if (co64) for (let i = 0, n = u32(moov, co64.start + 4); i < n; i++) chunkOffsets.push(u64(moov, co64.start + 8 + 8 * i));
    const runs: { first: number; perChunk: number }[] = [];
    for (let e = 0, n = u32(moov, stsc.start + 4); e < n; e++) {
      runs.push({ first: u32(moov, stsc.start + 8 + 12 * e), perChunk: u32(moov, stsc.start + 12 + 12 * e) });
    }
    const offsets: number[] = [];
    for (let c = 0, r = 0; c < chunkOffsets.length && offsets.length < count; c++) {
      while (r + 1 < runs.length && runs[r + 1].first <= c + 1) r++;
      let at = chunkOffsets[c];
      for (let k = 0; k < (runs[r]?.perChunk ?? 0) && offsets.length < count; k++) {
        offsets.push(at);
        at += sizes[offsets.length - 1];
      }
    }
    if (count === 0 || offsets.length !== count || durations.length < count) throw new Error('The .m4a frame table is incomplete.');
    // A file cut short (the app killed while writing): its table says more than the file holds.
    if (offsets.some((o, i) => o + sizes[i] > io.size)) throw new Error('The .m4a frame table points past the end of the file.');

    // The encoder's priming (AAC: 2112 samples), skipped by players through the edit list.
    let skip = 0;
    const elst = (() => {
      const edts = find(moov, trak, 'edts');
      return edts && find(moov, edts, 'elst');
    })();
    if (elst && u32(moov, elst.start + 4) > 0) {
      const t = moov[elst.start] === 1 ? u64(moov, elst.start + 16) : i32(moov, elst.start + 12);
      // The edit list's media time is in the track's timescale.
      skip = Math.max(0, t);
    }

    return { timescale, language, stsd: moov.slice(stsd.start - 8, stsd.end), skip, offsets, sizes, durations: durations.slice(0, count) };
  }
  throw new Error('No sound track in the .m4a file.');
}

// ---------- planning ----------

/**
 * Pieces of `pieceMs` (the last one shorter), each going on `overlapMs` into
 * the next, as the recorder's own chunks do. Times are the sound's (after the priming).
 */
export function planPieces(track: Pick<M4aTrack, 'timescale' | 'skip' | 'durations'>, pieceMs: number, overlapMs: number): PieceSpan[] {
  const toMs = (units: number) => (units / track.timescale) * 1000;
  const starts: number[] = [];
  let t = 0;
  for (const d of track.durations) {
    starts.push(toMs(t - track.skip));
    t += d;
  }
  const totalMs = toMs(t - track.skip);
  const pieces: PieceSpan[] = [];
  let first = 0;
  for (let k = 0; first < starts.length; k++) {
    // The last piece takes the rest when what would be left is only the overlap.
    const last = (k + 1) * pieceMs >= totalMs - overlapMs;
    const until = last ? Infinity : (k + 1) * pieceMs + overlapMs;
    let end = first;
    while (end < starts.length && starts[end] < until) end++;
    const startMs = Math.max(0, starts[first]);
    const endMs = end < starts.length ? starts[end] : totalMs;
    pieces.push({ first, end, startMs: Math.round(startMs), durationMs: Math.max(1, Math.round(endMs - startMs)) });
    if (last) break;
    // The next piece starts at the next boundary (its first frame at or after it).
    const next = (k + 1) * pieceMs;
    while (first < starts.length && starts[first] < next) first++;
  }
  return pieces;
}

// ---------- writing ----------

function bytesOf(...parts: (Uint8Array | number[])[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0));

/** A box: its size, its type, its contents. */
export function box(type: string, ...contents: (Uint8Array | number[])[]): Uint8Array {
  const body = bytesOf(...contents);
  return bytesOf(be32(body.length + 8), ascii(type), body);
}
const full = (type: string, flags: number, ...contents: (Uint8Array | number[])[]) => box(type, be32(flags), ...contents);
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(be32);

/** Runs of equal values, as stts stores frame durations. */
function runsOf(values: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

/** A complete .m4a: the codec description, these frames' sizes and durations, their bytes (in order). */
export function buildM4a(p: { timescale: number; language: number; stsd: Uint8Array; sizes: number[]; durations: number[]; frames: Uint8Array }): Uint8Array {
  const duration = p.durations.reduce((s, d) => s + d, 0);
  const stts = runsOf(p.durations);
  const ftyp = box('ftyp', ascii('M4A '), be32(0), ascii('M4A '), ascii('mp42'), ascii('isom'));
  const moovWith = (mdatAt: number) =>
    box(
      'moov',
      full('mvhd', 0, be32(0), be32(0), be32(p.timescale), be32(duration), be32(0x00010000), be16(0x0100), new Array(10).fill(0), MATRIX, new Array(24).fill(0), be32(2)),
      box(
        'trak',
        full('tkhd', 7, be32(0), be32(0), be32(1), be32(0), be32(duration), new Array(8).fill(0), be16(0), be16(0), be16(0x0100), be16(0), MATRIX, be32(0), be32(0)),
        box(
          'mdia',
          full('mdhd', 0, be32(0), be32(0), be32(p.timescale), be32(duration), be16(p.language), be16(0)),
          full('hdlr', 0, be32(0), ascii('soun'), new Array(12).fill(0), ascii('SoundHandler'), [0]),
          box(
            'minf',
            full('smhd', 0, be16(0), be16(0)),
            box('dinf', full('dref', 0, be32(1), full('url ', 1))),
            box(
              'stbl',
              p.stsd,
              full('stts', 0, be32(stts.length), stts.flatMap(([n, d]) => [...be32(n), ...be32(d)])),
              full('stsc', 0, be32(1), be32(1), be32(p.sizes.length), be32(1)),
              full('stsz', 0, be32(0), be32(p.sizes.length), p.sizes.flatMap(be32)),
              full('stco', 0, be32(1), be32(mdatAt)),
            ),
          ),
        ),
      ),
    );
  // The frames start right after the mdat header, which follows the moov (its size doesn't depend on the offset).
  const moov = moovWith(0);
  const mdatAt = ftyp.length + moov.length + 8;
  return bytesOf(ftyp, moovWith(mdatAt), box('mdat', p.frames));
}

/** The bytes of frames [first, end), read in as few reads as possible (consecutive frames at once). */
async function framesOf(io: M4aIo, track: M4aTrack, first: number, end: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for (let i = first; i < end; ) {
    let j = i + 1;
    let length = track.sizes[i];
    while (j < end && track.offsets[j] === track.offsets[i] + length) length += track.sizes[j++];
    parts.push(await io.read(track.offsets[i], length));
    i = j;
  }
  return bytesOf(...parts);
}

export interface SplitPiece {
  bytes: Uint8Array;
  startMs: number;
  durationMs: number;
}

/**
 * The part cut into pieces (see planPieces), each a complete .m4a, handed to
 * `each` one by one (only one piece in memory at a time).
 */
export async function splitM4a(io: M4aIo, pieceMs: number, overlapMs: number, each: (piece: SplitPiece, index: number) => Promise<void>): Promise<number> {
  const track = await readM4a(io);
  const spans = planPieces(track, pieceMs, overlapMs);
  for (const [index, s] of spans.entries()) {
    const bytes = buildM4a({
      timescale: track.timescale,
      language: track.language,
      stsd: track.stsd,
      sizes: track.sizes.slice(s.first, s.end),
      durations: track.durations.slice(s.first, s.end),
      frames: await framesOf(io, track, s.first, s.end),
    });
    await each({ bytes, startMs: s.startMs, durationMs: s.durationMs }, index);
  }
  return spans.length;
}
