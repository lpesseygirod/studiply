/**
 * @jest-environment node
 */
// 30 Oct, Lea's iPhone: recording in a locked pocket, every upload failed with
// the Keychain's "User interaction is not allowed" (the session unreadable
// while locked), the upload lane gave up after five tries and "Saving the
// recording · sending 13 parts…" never ended. The recorder as the app builds it
// (./build) with stand-ins for Supabase, the connection and the Keychain: the
// lanes never give up on a part, and send at once when the app is back in
// front, the connection or the session is back, and at the next start.
import { createMemoryStore } from '../../../lib/sync/memoryStore';
import type { SyncOp } from '../../../lib/sync/queue';
import { buildRecorder } from '../build';
import { createMemoryRecordingStore } from '../memoryStore';
import type { AudioSource, RecorderService, SourceChunk, SourcePart } from '../types';

const mockNet = { backOnline: [] as (() => void)[] };
const mockKeychain = { readable: [] as (() => void)[] };
const mockAuth = { listeners: [] as ((event: string, session: unknown) => void)[] };

jest.mock('../../../lib/aiMode', () => ({ isMockAiForced: () => false }));
jest.mock('../../../lib/functions', () => ({ callFunction: jest.fn() }));
jest.mock('../../../lib/mappers', () => {
  let n = 0;
  return { newId: () => `op-${++n}` };
});
jest.mock('../../source-file.service', () => ({ chunkOnServer: async () => false }));
jest.mock('../../../lib/connectivity', () => ({
  getConnection: () => 'online',
  onBackOnline: (fn: () => void) => mockNet.backOnline.push(fn),
}));
jest.mock('../../../lib/secureStorage', () => ({
  secureStorage: {
    onReadable: (fn: () => void) => {
      mockKeychain.readable.push(fn);
      return () => {};
    },
  },
}));
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      refreshSession: async () => ({ error: null }),
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        mockAuth.listeners.push(fn);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

const L = 'lecture-1';
const LOCKED = "Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: User interaction is not allowed.";

/** A microphone that records when told: a piece per second, a chunk when cut. */
class FakeSource implements AudioSource {
  private on!: { part: (p: SourcePart) => void; chunk: (c: SourceChunk) => void };
  private seq = 0;
  private ms = 0;
  private chunkStart = 0;
  private pieces: Blob[] = [];
  async start(from: { seq: number; ms: number }, on: FakeSource['on']) {
    this.on = on;
    this.seq = from.seq;
    this.ms = this.chunkStart = from.ms;
  }
  tick(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      this.ms += 1000;
      const blob = new Blob([`chunk ${this.seq} piece ${this.pieces.length};`]);
      this.on.part({ seq: this.seq, index: this.pieces.length, blob, mimeType: 'audio/mp4', startMs: this.chunkStart, endMs: this.ms });
      this.pieces.push(blob);
    }
  }
  cut() {
    this.on.chunk({ seq: this.seq, blob: new Blob(this.pieces), mimeType: 'audio/mp4', startMs: this.chunkStart, durationMs: this.ms - this.chunkStart });
    this.seq += 1;
    this.chunkStart = this.ms;
    this.pieces = [];
  }
  async pause() {}
  async resume() {}
  async stop() {
    if (this.pieces.length) this.cut();
  }
  elapsedMs() {
    return this.ms;
  }
  level() {
    return 0.5;
  }
}

/** Every pending promise runs (timers are fake: a backoff only ends when the test says). */
const idle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/** The phone: what survives the app being closed, and what the server answers. */
function phone() {
  const store = createMemoryRecordingStore();
  const uploadOps = createMemoryStore();
  const transcribeOps = createMemoryStore();
  const server = { error: null as Error | null, uploaded: [] as number[] };
  const sources: FakeSource[] = [];
  const wakes: (() => void)[] = [];

  /** The app starting (again) on this phone. */
  function app(): RecorderService {
    return buildRecorder({
      store,
      queueStore: (lane) => (lane === 'uploads' ? uploadOps : transcribeOps),
      createSource: () => {
        const s = new FakeSource();
        sources.push(s);
        return s;
      },
      upload: async (chunk) => {
        if (server.error) throw server.error;
        server.uploaded.push(chunk.seq);
        return `u1/${chunk.lectureId}/${chunk.seq}.m4a`;
      },
      claim: async () => true,
      release: () => {},
      onWake: (send) => wakes.push(send),
    });
  }
  return {
    store,
    uploadOps,
    server,
    app,
    mic: () => sources[sources.length - 1],
    /** Back in the foreground (AppState 'active'). */
    wake: () => wakes.forEach((send) => send()),
  };
}

/** Records two chunks and Stop, with the upload failing like the locked Keychain. */
async function recordLocked(p: ReturnType<typeof phone>, error = new Error(LOCKED)) {
  const service = p.app();
  await idle();
  await service.start({ lectureId: L, transcribe: false });
  p.server.error = error;
  p.mic().tick(3);
  p.mic().cut();
  p.mic().tick(2);
  await service.stop();
  await idle();
  return service;
}

const uploadsWaiting = (p: ReturnType<typeof phone>): SyncOp[] => p.uploadOps.ops.filter((o) => o.kind === 'upload_chunk');

beforeAll(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  mockNet.backOnline.length = 0;
  mockKeychain.readable.length = 0;
  mockAuth.listeners.length = 0;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('a recording made while the phone is locked', () => {
  it('keeps trying its parts past five tries, then sends them when the app is back in front', async () => {
    const p = phone();
    const service = await recordLocked(p);
    for (let i = 0; i < 7; i++) {
      p.wake();
      await idle();
    }

    const ops = uploadsWaiting(p);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.status === 'pending')).toBe(true);
    expect(ops[0].attempts).toBe(8);
    expect(ops[0].lastError).toContain('User interaction is not allowed');
    // The wait between tries stops growing at a minute.
    expect(Date.parse(ops[0].nextAttemptAt!) - Date.now()).toBeLessThanOrEqual(60_000);
    expect((await service.snapshot(L)).chunks.map((c) => c.state)).toEqual(['on-device', 'on-device']);

    // Unlocked: the app comes to the front.
    p.server.error = null;
    p.wake();
    await idle();
    expect(p.server.uploaded).toEqual([0, 1]);
    expect(uploadsWaiting(p)).toEqual([]);
    expect((await service.snapshot(L)).chunks.map((c) => c.state)).toEqual(['uploaded', 'uploaded']);
  });

  it('never gives up on an unexplained error either; the connection or the session coming back sends at once', async () => {
    const p = phone();
    await recordLocked(p, new Error('Something nobody expected'));
    for (let i = 0; i < 6; i++) {
      mockNet.backOnline.forEach((fn) => fn());
      await idle();
    }
    expect(uploadsWaiting(p).map((o) => [o.status, o.attempts])).toEqual([
      ['pending', 7],
      ['pending', 0],
    ]);

    // The Keychain readable again (secureStorage.onReadable).
    p.server.error = null;
    mockKeychain.readable.forEach((fn) => fn());
    await idle();
    expect(p.server.uploaded).toEqual([0, 1]);
  });

  it('a refreshed session sends at once', async () => {
    const p = phone();
    await recordLocked(p);
    p.server.error = null;
    mockAuth.listeners.forEach((fn) => fn('TOKEN_REFRESHED', { user: { id: 'u1' } }));
    jest.advanceTimersByTime(1);
    await idle();
    expect(p.server.uploaded).toEqual([0, 1]);
  });

  it('the next start sends parts an older app gave up on (marked failed)', async () => {
    const p = phone();
    await recordLocked(p);
    // What the app before this fix left on Lea's phone: the parts' jobs failed after five tries.
    for (const op of uploadsWaiting(p)) await p.uploadOps.update({ ...op, status: 'failed', attempts: 5 });

    // Closed and opened again, unlocked.
    p.server.error = null;
    const next = p.app();
    await idle();
    await next.recover();
    await idle();
    expect(p.server.uploaded).toEqual([0, 1]);
    expect(uploadsWaiting(p)).toEqual([]);
    expect((await next.snapshot(L)).chunks.map((c) => c.state)).toEqual(['uploaded', 'uploaded']);
  });
});
