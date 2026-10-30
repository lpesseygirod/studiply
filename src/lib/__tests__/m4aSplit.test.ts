/**
 * @jest-environment node
 */
// 30 Oct: a part recorded while the phone was locked lasted 6.8 min (its
// rotation didn't run); a 2-hour class would make one part far over the audio
// bucket's 25 MiB. The iPhone cuts such a part into 30-second .m4a pieces
// before upload: here on a file laid out as AVAudioRecorder writes it (the
// frames first, the frame table at the end, the encoder's priming in an edit
// list, several frames per chunk), with made-up frame bytes.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { base64ToBytes, bytesToBase64 } from '../base64';
import { box, buildM4a, planPieces, readM4a, splitM4a, type M4aIo } from '../m4aSplit';

const RATE = 44100;
const FRAME = 1024;
const PRIMING = 2112;
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0));
const full = (type: string, ...contents: (Uint8Array | number[])[]) => box(type, be32(0), ...contents);
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Frame i: 180–299 bytes, every byte saying which frame it is. */
const frameBytes = (i: number) => new Uint8Array(180 + ((i * 37) % 120)).fill(i % 251);
const STSD = full('stsd', be32(1), box('mp4a', new Array(28).fill(7), full('esds', [3, 25, 0, 0, 0, 4, 17, 64, 21, 0, 0, 0, 1, 244, 0, 0, 1, 244, 0, 5, 2, 18, 8, 6, 1, 2])));

/** An .m4a as the recorder leaves it: ftyp, free, mdat, then moov (22 frames per chunk). */
function recording(seconds: number): { file: Uint8Array; frames: Uint8Array[] } {
  const count = Math.ceil(((seconds * RATE) + PRIMING) / FRAME);
  const frames = Array.from({ length: count }, (_, i) => frameBytes(i));
  const ftyp = box('ftyp', ascii('M4A '), be32(0), ascii('M4A '), ascii('mp42'), ascii('isom'));
  const free = box('free', new Array(20).fill(0));
  const mdat = box('mdat', cat(...frames));
  const mdatData = ftyp.length + free.length + 8;
  const perChunk = 22;
  const chunkOffsets: number[] = [];
  for (let i = 0, at = mdatData; i < count; i += perChunk) {
    chunkOffsets.push(at);
    for (let k = i; k < Math.min(count, i + perChunk); k++) at += frames[k].length;
  }
  const lastCount = count - (chunkOffsets.length - 1) * perChunk;
  const stsc = lastCount === perChunk ? [[1, perChunk]] : [[1, perChunk], [chunkOffsets.length, lastCount]];
  const total = count * FRAME;
  const moov = box(
    'moov',
    full('mvhd', be32(0), be32(0), be32(RATE), be32(total), new Array(80).fill(0)),
    box(
      'trak',
      full('tkhd', new Array(80).fill(0)),
      box('edts', full('elst', be32(1), be32(total - PRIMING), be32(PRIMING), be32(0x00010000))),
      box(
        'mdia',
        full('mdhd', be32(0), be32(0), be32(RATE), be32(total), [0x55, 0xc4], [0, 0]),
        full('hdlr', be32(0), ascii('soun'), new Array(12).fill(0), [0]),
        box(
          'minf',
          full('smhd', [0, 0, 0, 0]),
          box(
            'stbl',
            STSD,
            full('stts', be32(1), be32(count), be32(FRAME)),
            full('stsc', be32(stsc.length), stsc.flatMap(([first, n]) => [...be32(first), ...be32(n), ...be32(1)])),
            full('stsz', be32(0), be32(count), frames.flatMap((f) => be32(f.length))),
            full('stco', be32(chunkOffsets.length), chunkOffsets.flatMap(be32)),
          ),
        ),
      ),
    ),
  );
  return { file: cat(ftyp, free, mdat, moov), frames };
}

const memory = (file: Uint8Array): M4aIo & { reads: number } => {
  const io = {
    size: file.length,
    reads: 0,
    read: async (position: number, length: number) => {
      io.reads++;
      return file.slice(position, position + length);
    },
  };
  return io;
};

async function split(file: Uint8Array) {
  const pieces: { bytes: Uint8Array; startMs: number; durationMs: number }[] = [];
  await splitM4a(memory(file), 30_000, 500, async (p) => {
    pieces.push(p);
  });
  return pieces;
}

describe('cutting a long recording part into 30-second pieces', () => {
  it('reads the frame table of a recording (frames first, table last, several frames per chunk)', async () => {
    const { file, frames } = recording(100);
    const track = await readM4a(memory(file));
    expect(track.timescale).toBe(RATE);
    expect(track.skip).toBe(PRIMING);
    expect(track.sizes).toEqual(frames.map((f) => f.length));
    expect(track.durations.every((d) => d === FRAME)).toBe(true);
    for (const i of [0, 21, 22, 23, frames.length - 1]) {
      expect(file.slice(track.offsets[i], track.offsets[i] + track.sizes[i])).toEqual(frames[i]);
    }
  });

  it('100 s → four complete .m4a pieces at 0, 30, 60 and 90 s, each going on 500 ms into the next, every frame copied as it is', async () => {
    const { file, frames } = recording(100);
    const pieces = await split(file);
    expect(pieces).toHaveLength(4);
    const frameMs = (FRAME / RATE) * 1000;
    pieces.forEach((p, k) => expect(Math.abs(p.startMs - 30_000 * k)).toBeLessThanOrEqual(frameMs));
    pieces.slice(0, 3).forEach((p) => expect(Math.abs(p.durationMs - 30_500)).toBeLessThanOrEqual(frameMs + 1));
    expect(Math.abs(pieces[3].durationMs - 10_000)).toBeLessThanOrEqual(frameMs + 1);

    // Each piece reads back as an .m4a of its own: the same codec description, its frames in order.
    const covered = new Set<number>();
    let firstFrame = 0;
    for (const [k, p] of pieces.entries()) {
      const track = await readM4a(memory(p.bytes));
      expect(track.stsd).toEqual(STSD);
      expect(track.timescale).toBe(RATE);
      expect(track.skip).toBe(0);
      // Which frames: found by the first one's size and filling (together unique for 30 120 frames).
      const first = frames.findIndex((f) => f.length === track.sizes[0] && f[0] === p.bytes[track.offsets[0]]);
      track.sizes.forEach((size, j) => {
        expect(p.bytes.slice(track.offsets[j], track.offsets[j] + size)).toEqual(frames[first + j]);
        covered.add(first + j);
      });
      if (k > 0) {
        // The overlap: the previous piece's last 500 ms are this piece's first.
        const overlapFrames = firstFrame - first;
        expect(Math.abs(overlapFrames * frameMs - 500)).toBeLessThanOrEqual(frameMs);
      }
      firstFrame = first + track.sizes.length;
    }
    expect(covered.size).toBe(frames.length);
  });

  it('a 2-hour part → 240 pieces, none longer than 30.5 s (so each stays far below 25 MiB)', () => {
    const count = Math.ceil((7200 * RATE + PRIMING) / FRAME);
    const spans = planPieces({ timescale: RATE, skip: PRIMING, durations: new Array(count).fill(FRAME) }, 30_000, 500);
    expect(spans).toHaveLength(240);
    expect(Math.max(...spans.map((s) => s.durationMs))).toBeLessThanOrEqual(30_500 + 24);
    // Every frame in a piece, in order, no gap between pieces.
    expect(spans[0].first).toBe(0);
    expect(spans.at(-1)!.end).toBe(count);
    spans.slice(1).forEach((s, i) => expect(s.first).toBeLessThan(spans[i].end));
  });

  it('reads the frames in as few reads as the file allows (consecutive frames at once)', async () => {
    const { file } = recording(100);
    const io = memory(file);
    await splitM4a(io, 30_000, 500, async () => {});
    // The table (the four top-level headers, then the moov), then one read per piece.
    expect(io.reads).toBe(5 + 4);
  });

  it('a piece cut again stays the same frames', async () => {
    const { file } = recording(30);
    const [piece] = await split(file);
    const again = await split(piece.bytes);
    expect(again).toHaveLength(1);
    expect((await readM4a(memory(again[0].bytes))).sizes).toEqual((await readM4a(memory(piece.bytes))).sizes);
  });

  it('a file that is not an .m4a is refused (the part then stays whole)', async () => {
    await expect(readM4a(memory(new Uint8Array(64).fill(9)))).rejects.toThrow();
    await expect(readM4a(memory(box('ftyp', ascii('M4A '))))).rejects.toThrow('no moov');
  });

  it('a corrupt part is refused, never cut into broken pieces', async () => {
    const { file } = recording(100);
    // Cut short before its table (the app killed while the part was written).
    await expect(split(file.slice(0, Math.floor(file.length * 0.6)))).rejects.toThrow('no moov');
    // A table that claims more than the file holds.
    const lying = buildM4a({ timescale: RATE, language: 0x55c4, stsd: STSD, sizes: [300, 300, 300], durations: [FRAME, FRAME, FRAME], frames: new Uint8Array(100) });
    await expect(split(lying)).rejects.toThrow('past the end');
    // A table with its frame sizes missing.
    const moovAt = file.length - (await readMoovLength(file));
    const broken = file.slice();
    const stsz = indexOfType(broken, 'stsz', moovAt);
    broken.set(ascii('xxxx'), stsz);
    await expect(split(broken)).rejects.toThrow('incomplete');
  });
});

/** The moov's size (the last top-level box in `recording`). */
async function readMoovLength(file: Uint8Array): Promise<number> {
  let at = 0;
  let last = 0;
  while (at + 8 <= file.length) {
    last = ((file[at] << 24) | (file[at + 1] << 16) | (file[at + 2] << 8) | file[at + 3]) >>> 0;
    at += last;
  }
  return last;
}
const indexOfType = (file: Uint8Array, type: string, from: number) => {
  for (let i = from; i + 4 <= file.length; i++) if (String.fromCharCode(...file.slice(i, i + 4)) === type) return i;
  return -1;
};

describe('the 25 MiB audio bucket', () => {
  const LIMIT = 25 * 1024 * 1024;
  it('no piece can come near it: at most 30.5 s of AAC frames, and an AAC frame is at most 768 bytes (mono)', () => {
    const frames = Math.ceil(((30_500 + 1000 * (FRAME / RATE)) / 1000) * (RATE / FRAME));
    const worst = frames * 768 + frames * 4 + 4096; // the frames, their sizes in the table, the rest of the file
    expect(worst).toBeLessThan(1.1 * 1024 * 1024);
    expect(worst).toBeLessThan(LIMIT);
  });

  it('a 2-hour part kept whole would not fit at the recorder’s rate (4.35 MB in 6.8 min, 30 Oct)', () => {
    const bytesPerSecond = 4.35e6 / (6.8 * 60);
    expect(bytesPerSecond * 7200).toBeGreaterThan(LIMIT);
    // Whole parts stop fitting after about 41 min.
    expect(LIMIT / bytesPerSecond / 60).toBeLessThan(42);
    // Cut into pieces: each about a third of a megabyte.
    expect(bytesPerSecond * 30.5).toBeLessThan(0.35e6);
  });
});

// A real .m4a written by macOS's AAC encoder and file writer (Core Audio, which AVAudioRecorder uses),
// cut, then each piece read and decoded again by Core Audio. Only where afconvert exists (macOS).
const afconvert = spawnSync('afconvert', ['-h']).error === undefined;
(afconvert ? describe : describe.skip)('a real recording (Core Audio’s AAC .m4a)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studiply-m4a-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** 16-bit mono WAV: a quiet tone with a click every 50 ms (like the join test's click track). */
  function wav(seconds: number): Buffer {
    const n = seconds * RATE;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const click = i % (RATE / 20) < 40 ? 0.6 : 0;
      data.writeInt16LE(Math.round(32767 * (0.05 * Math.sin((2 * Math.PI * 440 * i) / RATE) + click)), i * 2);
    }
    const head = Buffer.alloc(44);
    head.write('RIFF', 0);
    head.writeUInt32LE(36 + data.length, 4);
    head.write('WAVEfmt ', 8);
    head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22);
    head.writeUInt32LE(RATE, 24);
    head.writeUInt32LE(RATE * 2, 28);
    head.writeUInt16LE(2, 32);
    head.writeUInt16LE(16, 34);
    head.write('data', 36);
    head.writeUInt32LE(data.length, 40);
    return Buffer.concat([head, data]);
  }

  it('100 s of real AAC → four pieces Core Audio reads and decodes, 30.5 s each (the last 10 s)', async () => {
    writeFileSync(join(dir, 'in.wav'), wav(100));
    const made = spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', '-c', '1', join(dir, 'in.wav'), join(dir, 'part.m4a')]);
    expect(made.status).toBe(0);
    const file = new Uint8Array(readFileSync(join(dir, 'part.m4a')));
    const track = await readM4a(memory(file));
    expect(track.timescale).toBe(RATE);

    const pieces = await split(file);
    expect(pieces.map((p) => Math.round(p.startMs / 1000))).toEqual([0, 30, 60, 90]);
    for (const [k, p] of pieces.entries()) {
      const path = join(dir, `piece${k}.m4a`);
      writeFileSync(path, p.bytes);
      const info = spawnSync('afinfo', [path], { encoding: 'utf8' });
      expect(info.status).toBe(0);
      const seconds = Number(/estimated duration: ([\d.]+)/.exec(info.stdout)?.[1]);
      expect(Math.abs(seconds * 1000 - p.durationMs)).toBeLessThan(60);
      expect(Math.abs(p.durationMs - (k < 3 ? 30_500 : 10_000))).toBeLessThan(60);
      // Decodes back to sound of that length.
      const out = join(dir, `piece${k}.wav`);
      expect(spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', path, out]).status).toBe(0);
      const decodedMs = ((readFileSync(out).length - 44) / 2 / RATE) * 1000;
      expect(Math.abs(decodedMs - p.durationMs)).toBeLessThan(100);
    }
    // At 64 kbit/s a 30.5-s piece is about a quarter of a megabyte.
    expect(Math.max(...pieces.map((p) => p.bytes.length))).toBeLessThan(0.3e6);
  });
});

describe('base64 for the pieces’ files', () => {
  it('round-trips any bytes, and reads expo-file-system’s line-broken base64', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 1000, 10_001]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) % 256);
      const text = bytesToBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(base64ToBytes(text)).toEqual(bytes);
      expect(base64ToBytes(text.replace(/(.{64})/g, '$1\n'))).toEqual(bytes);
    }
  });
});
