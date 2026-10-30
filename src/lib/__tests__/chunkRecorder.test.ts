/**
 * @jest-environment jsdom
 */
// Step 5.1: recording in chunks on the web, with a stand-in MediaRecorder (the
// real joins are measured in Chrome by spike.mjs).
import { ChunkRecorder, type RecordedChunk } from '../chunkRecorder.web';

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
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
  }
  start() {
    log.push(`start ${this.id} @${Date.now()}`);
    this.onstart?.();
  }
  stop() {
    log.push(`stop ${this.id} @${Date.now()}`);
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

  it('can’t start twice; WebM / Opus is preferred where the browser has it', () => {
    const { recorder } = make(30000);
    recorder.start(stream);
    expect(() => recorder.start(stream)).toThrow('Already recording.');
    expect(ChunkRecorder.preferredType(FakeRecorder as unknown as typeof MediaRecorder)).toBe('audio/webm;codecs=opus');
    expect(ChunkRecorder.preferredType({ isTypeSupported: (t: string) => t === 'audio/mp4' })).toBe('audio/mp4');
  });
});
