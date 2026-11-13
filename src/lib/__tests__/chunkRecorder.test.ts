/**
 * @jest-environment jsdom
 */
// Recording in chunks on the web, with a stand-in MediaRecorder (the
// real joins are measured in Chrome by spike.mjs).
import { ChunkRecorder, type RecordedChunk, type RecordedPart } from '../chunkRecorder.web';

const log: string[] = [];
let empty = new Set<number>();

class FakeRecorder {
  static made = 0;
  static isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus';
  readonly id = FakeRecorder.made++;
  mimeType: string;
  onstart: (() => void) | null = null;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  private slices: ReturnType<typeof setInterval> | null = null;
  static streams: unknown[] = [];
  constructor(stream: unknown, options?: { mimeType?: string }) {
    FakeRecorder.streams.push(stream);
    this.mimeType = options?.mimeType ?? '';
  }
  /** How long a recorder takes to really start (a just-opened microphone). */
  static startDelay = 0;
  start(timeslice?: number) {
    log.push(`start ${this.id} @${Date.now()}`);
    if (FakeRecorder.startDelay) setTimeout(() => this.onstart?.(), FakeRecorder.startDelay);
    else this.onstart?.();
    if (timeslice) this.slices = setInterval(() => this.ondataavailable?.({ data: new Blob([`piece ${this.id}`]) }), timeslice);
  }
  stop() {
    log.push(`stop ${this.id} @${Date.now()}`);
    if (this.slices) clearInterval(this.slices);
    void Promise.resolve().then(() => {
      this.ondataavailable?.({ data: new Blob(empty.has(this.id) ? [] : [`audio ${this.id}`]) });
      this.onstop?.();
    });
  }
}

const stream = {} as MediaStream;
const make = (chunkMs: number, overlapMs = 0) => {
  const chunks: RecordedChunk[] = [];
  const recorder = new ChunkRecorder({ chunkMs, overlapMs, onChunk: (c) => chunks.push(c), now: () => Date.now(), MediaRecorderImpl: FakeRecorder });
  return { recorder, chunks };
};

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  log.length = 0;
  empty = new Set();
  FakeRecorder.made = 0;
  FakeRecorder.streams = [];
  FakeRecorder.startDelay = 0;
});
afterEach(() => jest.useRealTimers());

describe('recording in chunks', () => {
  it('restart: every 30 s the recorder stops and the next starts at once; chunks in order with their place', async () => {
    const { recorder, chunks } = make(30000);
    recorder.start(stream);
    await jest.advanceTimersByTimeAsync(30000);
    await jest.advanceTimersByTimeAsync(30000);
    const stopped = recorder.stop();
    await jest.advanceTimersByTimeAsync(0);
    await stopped;
    expect(log).toEqual(['start 0 @0', 'stop 0 @30000', 'start 1 @30000', 'stop 1 @60000', 'start 2 @60000', 'stop 2 @60000']);
    expect(chunks.map((c) => [c.seq, c.startMs, c.durationMs])).toEqual([
      [0, 0, 30000],
      [1, 30000, 30000],
      [2, 60000, 1],
    ]);
    expect(chunks.every((c) => c.mimeType === 'audio/webm;codecs=opus' && c.blob.size > 0)).toBe(true);
  });

  it('overlap: the next chunk starts first, the previous one stops 500 ms later', async () => {
    const { recorder, chunks } = make(10000, 500);
    recorder.start(stream);
    await jest.advanceTimersByTimeAsync(10000);
    expect(log).toEqual(['start 0 @0', 'start 1 @10000']);
    await jest.advanceTimersByTimeAsync(500);
    expect(log.at(-1)).toBe('stop 0 @10500');
    const [first] = chunks;
    expect([first.seq, first.startMs, first.durationMs]).toEqual([0, 0, 10500]);
    // Stopping during an overlap still hands over both chunks.
    await jest.advanceTimersByTimeAsync(9500);
    const stopped = recorder.stop();
    await jest.advanceTimersByTimeAsync(500);
    await stopped;
    expect(chunks.map((c) => [c.seq, c.startMs])).toEqual([
      [0, 0],
      [1, 10000],
      [2, 20000],
    ]);
    // Chunk 1 ends 500 ms after chunk 2 starts.
    expect(chunks[1].startMs + chunks[1].durationMs - chunks[2].startMs).toBe(500);
  });

  it('a recorder that captured nothing leaves no chunk; the numbers after it go on', async () => {
    empty = new Set([1]);
    const { recorder, chunks } = make(5000);
    recorder.start(stream);
    await jest.advanceTimersByTimeAsync(10000);
    const stopped = recorder.stop();
    await jest.advanceTimersByTimeAsync(0);
    await stopped;
    expect(chunks.map((c) => c.seq)).toEqual([0, 2]);
  });

  it('pause ends the chunk (and an overlap at once); the paused time is left out of the timeline', async () => {
    const chunks: RecordedChunk[] = [];
    const recorder = new ChunkRecorder({ chunkMs: 10000, overlapMs: 500, onChunk: (c) => chunks.push(c), now: () => Date.now(), MediaRecorderImpl: FakeRecorder });
    recorder.start(stream);
    await jest.advanceTimersByTimeAsync(10200);
    // Mid-overlap: chunk 0 still finishing, chunk 1 started at 10 s.
    await recorder.pause();
    expect(log).toEqual(['start 0 @0', 'start 1 @10000', 'stop 0 @10200', 'stop 1 @10200']);
    expect(recorder.paused).toBe(true);
    await jest.advanceTimersByTimeAsync(5000);
    expect(recorder.elapsedMs()).toBe(10200);
    // No rotation while paused.
    expect(log).toHaveLength(4);
    // The microphone was closed during the pause: the next chunk records from the new stream.
    const reopened = {} as MediaStream;
    recorder.resume(reopened);
    expect(FakeRecorder.streams.at(-1)).toBe(reopened);
    await jest.advanceTimersByTimeAsync(3000);
    expect(recorder.elapsedMs()).toBe(13200);
    const stopped = recorder.stop();
    await jest.advanceTimersByTimeAsync(0);
    await stopped;
    expect(chunks.map((c) => [c.seq, c.startMs, c.durationMs])).toEqual([
      [0, 0, 10200],
      [1, 10000, 200],
      // Starts where the recording paused, though 5 s later.
      [2, 10200, 3000],
    ]);
    expect(recorder.elapsedMs()).toBe(13200);
  });

  it('a reopened microphone that takes a moment to start leaves no hole: the chunk after the pause starts where the last one ended', async () => {
    const chunks: RecordedChunk[] = [];
    const recorder = new ChunkRecorder({ chunkMs: 10000, overlapMs: 500, onChunk: (c) => chunks.push(c), now: () => Date.now(), MediaRecorderImpl: FakeRecorder });
    recorder.start(stream);
    await jest.advanceTimersByTimeAsync(4000);
    await recorder.pause();
    await jest.advanceTimersByTimeAsync(2000);
    // From here on every recorder starts 60 ms after it is asked to (Chrome measured about 50 ms).
    FakeRecorder.startDelay = 60;
    recorder.resume({} as MediaStream);
    expect(recorder.paused).toBe(false);
    await jest.advanceTimersByTimeAsync(30);
    // Not started yet: the recording hasn't moved on.
    expect(recorder.elapsedMs()).toBe(4000);
    await jest.advanceTimersByTimeAsync(3000);
    // Paused again before a rotation, then once more with a pause asked before the recorder started.
    await recorder.pause();
    recorder.resume({} as MediaStream);
    await jest.advanceTimersByTimeAsync(10);
    await recorder.pause();
    await jest.advanceTimersByTimeAsync(100);
    recorder.resume({} as MediaStream);
    await jest.advanceTimersByTimeAsync(2000);
    const stopped = recorder.stop();
    await jest.advanceTimersByTimeAsync(100);
    await stopped;
    const joins = chunks.slice(1).map((c, i) => c.startMs - (chunks[i].startMs + chunks[i].durationMs));
    expect(chunks[0]).toMatchObject({ startMs: 0, durationMs: 4000 });
    expect(chunks[1].startMs).toBe(4000);
    // Every join after a pause: exactly where the previous chunk ended (no hole, no overlap).
    expect(joins.every((ms) => ms === 0)).toBe(true);
  });

  it('hands over a piece every timeslice with where it ends; a chunk is its pieces; `from` goes on with a recording', async () => {
    const parts: RecordedPart[] = [];
    const chunks: RecordedChunk[] = [];
    const recorder = new ChunkRecorder({
      chunkMs: 5000,
      timesliceMs: 1000,
      from: { seq: 7, ms: 60000 },
      onPart: (p) => parts.push(p),
      onChunk: (c) => chunks.push(c),
      now: () => Date.now(),
      MediaRecorderImpl: FakeRecorder,
    });
    recorder.start(stream);
    await jest.advanceTimersByTimeAsync(7500);
    const stopped = recorder.stop();
    await jest.advanceTimersByTimeAsync(0);
    await stopped;
    expect(chunks.map((c) => [c.seq, c.startMs, c.durationMs])).toEqual([
      [7, 60000, 5000],
      [8, 65000, 2500],
    ]);
    const of = (seq: number) => parts.filter((p) => p.seq === seq).map((p) => [p.index, p.startMs, p.endMs]);
    // A piece a second, and the last one when the recorder stops.
    expect(of(7)).toEqual([
      [0, 60000, 61000],
      [1, 60000, 62000],
      [2, 60000, 63000],
      [3, 60000, 64000],
      [4, 60000, 65000],
      [5, 60000, 65000],
    ]);
    expect(of(8)).toEqual([
      [0, 65000, 66000],
      [1, 65000, 67000],
      [2, 65000, 67500],
    ]);
    // The chunk's file is its pieces, in order.
    expect(chunks[1].blob.size).toBe('piece 1piece 1audio 1'.length);
  });

  it('can’t start twice; WebM / Opus is preferred where the browser has it', () => {
    const { recorder } = make(30000);
    recorder.start(stream);
    expect(() => recorder.start(stream)).toThrow('Already recording.');
    expect(ChunkRecorder.preferredType(FakeRecorder as unknown as typeof MediaRecorder)).toBe('audio/webm;codecs=opus');
    expect(ChunkRecorder.preferredType({ isTypeSupported: (t: string) => t === 'audio/mp4' })).toBe('audio/mp4');
  });
});
