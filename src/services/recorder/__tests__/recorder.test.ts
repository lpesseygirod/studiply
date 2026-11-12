/**
 * @jest-environment node
 */
// Step 5.2: the recorder service with a stand-in microphone, the in-memory
// store and the real queue (createSyncQueue on memory stores). Chunk order,
// the upload queue offline and back online, transcription that waits for its
// upload or is refused, and recovery after a crash. Nothing is sent anywhere.
import { NetworkError } from '../../../lib/cloudRows';
import { createMemoryStore } from '../../../lib/sync/memoryStore';
import { createSyncQueue, SyncHttpError } from '../../../lib/sync/queue';
import { resetDiscardedForTests } from '../discarded';
import { transcribeChunkHandler, transcriptRefused, uploadChunkHandler, waitsForCredits } from '../handlers';
import { createMemoryRecordingStore } from '../memoryStore';
import { createRecorderService } from '../service';
import type { AudioSource, DiscardedRecording, SourceChunk, SourcePart } from '../types';

const L = 'lecture-1';

/** A microphone that records when told: a piece per second, a chunk when cut. */
class FakeSource implements AudioSource {
  from: { seq: number; ms: number } | null = null;
  private on!: { part: (p: SourcePart) => void; chunk: (c: SourceChunk) => void; lost?: () => void };
  loudness = 0.5;
  private seq = 0;
  private ms = 0;
  private chunkStart = 0;
  private pieces: Blob[] = [];
  constructor(private readonly fail = false) {}
  async start(from: { seq: number; ms: number }, on: FakeSource['on']) {
    if (this.fail) throw new Error('Permission denied');
    this.from = from;
    this.on = on;
    this.seq = from.seq;
    this.ms = this.chunkStart = from.ms;
  }
  /** Records `seconds` more, one piece a second. */
  tick(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      this.ms += 1000;
      const blob = new Blob([`chunk ${this.seq} piece ${this.pieces.length};`]);
      this.on.part({ seq: this.seq, index: this.pieces.length, blob, mimeType: 'audio/webm', startMs: this.chunkStart, endMs: this.ms });
      this.pieces.push(blob);
    }
  }
  /** The chunk ends (rotation) and the next begins. */
  cut() {
    const blob = new Blob(this.pieces, { type: 'audio/webm' });
    this.on.chunk({ seq: this.seq, blob, mimeType: 'audio/webm', startMs: this.chunkStart, durationMs: this.ms - this.chunkStart });
    this.seq += 1;
    this.chunkStart = this.ms;
    this.pieces = [];
  }
  async pause() {
    if (this.pieces.length) this.cut();
  }
  async resume() {}
  async stop() {
    if (this.pieces.length) this.cut();
  }
  elapsedMs() {
    return this.ms;
  }
  level() {
    return this.loudness;
  }
  /** The microphone goes away by itself (unplugged). */
  unplug() {
    this.on.lost?.();
  }
}

/** Every pending promise and microtask runs. */
const idle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/**
 * A device: the store and the queue lanes' stores survive a crash; `make` is
 * the app (re)starting on it. `held` are the locks (a crash lets go of them).
 */
function rig() {
  const store = createMemoryRecordingStore();
  const uploadOps = createMemoryStore();
  const transcribeOps = createMemoryStore();
  const server = {
    online: true,
    uploaded: [] as number[],
    transcribed: [] as number[],
    refuse: new Set<number>(),
    transcriptionDown: false,
    /** Step 10.2-1: no lecture credits left (402 no_credits). */
    noCredits: false,
    /** Cancel recording: an upload or a transcription held on its way until released. */
    uploadGate: null as Promise<void> | null,
    transcribeGate: null as Promise<void> | null,
  };
  const held = new Map<string, number>();
  const sources: FakeSource[] = [];
  let ids = 0;
  let apps = 0;
  let failMic = false;

  const lane = (opsStore: typeof uploadOps, kind: string, handler: ReturnType<typeof uploadChunkHandler>) =>
    createSyncQueue({
      store: opsStore,
      handlers: { [kind]: handler },
      userId: () => 'u1',
      // Connection unknown: every send is tried, and fails while offline.
      canSync: () => true,
      refresh: async () => true,
      newId: () => `op-${++ids}`,
      // Backoff timers never fire by themselves: the tests flush.
      setTimer: () => 0,
      clearTimer: () => {},
    });

  function make() {
    const me = ++apps;
    const uploads = lane(
      uploadOps,
      'upload_chunk',
      uploadChunkHandler({
        store,
        upload: async (chunk) => {
          if (!server.online) throw new NetworkError();
          if (server.uploadGate) await server.uploadGate;
          server.uploaded.push(chunk.seq);
          return `u1/${chunk.lectureId}/${String(chunk.seq).padStart(4, '0')}.webm`;
        },
        onServer: async (ref) => server.uploaded.includes(ref.seq),
      }),
    );
    const transcriptions = lane(
      transcribeOps,
      'transcribe_chunk',
      transcribeChunkHandler({
        store,
        transcribe: async (p) => {
          if (!server.online) throw new NetworkError();
          if (server.transcriptionDown) throw new SyncHttpError('The transcription service is down.', 503);
          if (server.refuse.has(p.seq)) throw new SyncHttpError('Transcription needs your consent.', 403);
          if (server.noCredits) throw new SyncHttpError('No lecture credits left.', 402);
          if (server.transcribeGate) await server.transcribeGate;
          server.transcribed.push(p.seq);
          return [{ startMs: p.startMs, endMs: p.startMs + 1000, text: `chunk ${p.seq}` }];
        },
      }),
    );
    const service = createRecorderService({
      store,
      createSource: () => {
        const s = new FakeSource(failMic);
        sources.push(s);
        return s;
      },
      uploads,
      transcriptions,
      userId: () => 'u1',
      claim: async (id) => {
        const owner = held.get(id);
        if (owner !== undefined && owner !== me) return false;
        held.set(id, me);
        return true;
      },
      release: (id) => {
        if (held.get(id) === me) held.delete(id);
      },
    });
    return { service, uploads, transcriptions };
  }

  return {
    store,
    uploadOps,
    transcribeOps,
    server,
    held,
    sources,
    make,
    /** The page is gone: its locks with it. */
    crash: () => held.clear(),
    failMic: (on: boolean) => {
      failMic = on;
    },
    source: () => sources[sources.length - 1],
  };
}

describe('the recorder service', () => {
  it('saves each chunk on the device, then uploads and transcribes them in order', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    expect(service.state()).toEqual({ lectureId: L, status: 'recording', microphoneLost: false });
    const mic = r.source();
    mic.tick(3);
    mic.cut();
    mic.tick(3);
    mic.cut();
    mic.tick(2);
    await service.stop();
    await idle();

    expect(r.server.uploaded).toEqual([0, 1, 2]);
    expect(r.server.transcribed).toEqual([0, 1, 2]);
    const snap = await service.snapshot(L);
    expect(snap.chunks.map((c) => [c.seq, c.startMs, c.durationMs, c.state])).toEqual([
      [0, 0, 3000, 'transcribed'],
      [1, 3000, 3000, 'transcribed'],
      [2, 6000, 2000, 'transcribed'],
    ]);
    expect(snap.transcript.map((s) => s.text)).toEqual(['chunk 0', 'chunk 1', 'chunk 2']);
    expect(snap.meta?.status).toBe('stopped');
    // Uploaded: the device's copy is dropped; no pieces left.
    expect(r.store.chunks.every((c) => c.blob === null && c.storagePath)).toBe(true);
    expect(r.store.parts).toEqual([]);
    expect(service.state()).toEqual({ lectureId: null, status: 'idle', microphoneLost: false });
    expect(r.held.size).toBe(0);
  });

  it('offline: the chunks wait on the device; back online they upload in order and the transcript fills in', async () => {
    const r = rig();
    const { service, uploads } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    r.server.online = false;
    const mic = r.source();
    for (let n = 0; n < 3; n++) {
      mic.tick(2);
      mic.cut();
    }
    await idle();
    expect(r.server.uploaded).toEqual([]);
    let snap = await service.snapshot(L);
    expect(snap.chunks.map((c) => c.state)).toEqual(['on-device', 'on-device', 'on-device']);
    expect(snap.transcript).toEqual([]);
    expect(r.store.chunks.map((c) => c.blob?.size ?? 0).every((size) => size > 0)).toBe(true);
    // Waiting in the queue, in order (the first one already tried and backing off).
    expect(r.uploadOps.ops.map((o) => (o.payload as { seq: number }).seq)).toEqual([0, 1, 2]);
    expect(r.uploadOps.ops[0].attempts).toBeGreaterThan(0);

    // Still recording while offline, then the connection comes back.
    mic.tick(1);
    r.server.online = true;
    await uploads.flush({ now: true });
    await idle();
    expect(r.server.uploaded).toEqual([0, 1, 2]);
    // Each finished upload queued its transcription.
    expect(r.server.transcribed).toEqual([0, 1, 2]);
    snap = await service.snapshot(L);
    expect(snap.transcript.map((s) => s.text)).toEqual(['chunk 0', 'chunk 1', 'chunk 2']);

    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0, 1, 2, 3]);
    expect(r.server.transcribed).toEqual([0, 1, 2, 3]);
    expect(r.uploadOps.ops).toEqual([]);
    expect(r.transcribeOps.ops).toEqual([]);
  });

  it('a transcription refused for good is noted on its chunk; the next chunks and the uploads go on', async () => {
    const r = rig();
    r.server.refuse.add(1);
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    const mic = r.source();
    for (let n = 0; n < 3; n++) {
      mic.tick(2);
      mic.cut();
    }
    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0, 1, 2]);
    expect(r.server.transcribed).toEqual([0, 2]);
    const snap = await service.snapshot(L);
    expect(snap.chunks.map((c) => c.state)).toEqual(['transcribed', 'no-transcript', 'transcribed']);
    expect(snap.chunks[1].transcriptError).toMatch(/consent/);
    expect(r.transcribeOps.ops).toEqual([]);
  });

  it('no credits left: the recording and uploads go on, the chunks wait and are sent again by the next sweep', async () => {
    const r = rig();
    r.server.noCredits = true;
    const { service, transcriptions } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    const mic = r.source();
    for (let n = 0; n < 3; n++) {
      mic.tick(2);
      mic.cut();
    }
    await idle();
    expect(service.state().status).toBe('recording');
    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0, 1, 2]);
    expect(r.server.transcribed).toEqual([]);
    expect(r.store.chunks.map((c) => c.transcriptError)).toEqual(['no_credits', 'no_credits', 'no_credits']);
    expect(r.transcribeOps.ops).toEqual([]);

    // Credits again (bought, granted): the app comes back to the front, the sweep sends them.
    r.server.noCredits = false;
    await service.recover();
    await transcriptions.flush({ now: true });
    await idle();
    expect(r.server.transcribed).toEqual([0, 1, 2]);
    const snap = await service.snapshot(L);
    expect(snap.chunks.map((c) => c.state)).toEqual(['transcribed', 'transcribed', 'transcribed']);
    expect(snap.chunks.map((c) => c.transcriptError)).toEqual([null, null, null]);
  });

  it('step 10.2-2: resendWaiting sends the waiting chunks of the recording in progress too, never refused ones', async () => {
    const r = rig();
    r.server.noCredits = true;
    r.server.refuse.add(0);
    const { service, transcriptions } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    const mic = r.source();
    for (let n = 0; n < 3; n++) {
      mic.tick(2);
      mic.cut();
    }
    await idle();
    expect(r.store.chunks.map((c) => c.transcriptError)).toEqual([expect.stringMatching(/consent/), 'no_credits', 'no_credits']);
    // Still recording: recover() leaves this one alone; resendWaiting doesn't.
    r.server.noCredits = false;
    expect(await service.resendWaiting()).toBe(2);
    await transcriptions.flush({ now: true });
    await idle();
    expect(r.server.transcribed).toEqual([1, 2]);
    expect(service.state().status).toBe('recording');
    expect(await service.resendWaiting()).toBe(0);
    await service.stop();
  });

  it('a chunk waiting for credits is not a refused one', () => {
    expect(waitsForCredits({ transcriptError: 'no_credits' })).toBe(true);
    expect(transcriptRefused({ transcriptError: 'no_credits' })).toBe(false);
    expect(transcriptRefused({ transcriptError: 'Transcription needs your consent. (HTTP 403)' })).toBe(true);
    expect(transcriptRefused({ transcriptError: null })).toBe(false);
  });

  it('a transcription outage never holds up the audio', async () => {
    const r = rig();
    r.server.transcriptionDown = true;
    const { service, transcriptions } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    const mic = r.source();
    for (let n = 0; n < 3; n++) {
      mic.tick(2);
      mic.cut();
    }
    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0, 1, 2]);
    expect(r.server.transcribed).toEqual([]);
    expect(r.transcribeOps.ops).toHaveLength(3);
    r.server.transcriptionDown = false;
    await transcriptions.flush({ now: true });
    await idle();
    expect(r.server.transcribed).toEqual([0, 1, 2]);
  });

  it('without consent to transcribe, chunks are only uploaded', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    r.source().tick(2);
    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0]);
    expect(r.server.transcribed).toEqual([]);
    expect(r.transcribeOps.ops).toEqual([]);
    expect((await service.snapshot(L)).chunks.map((c) => c.state)).toEqual(['uploaded']);
  });

  it('after a crash: the unfinished chunk is rebuilt from its pieces and sent; the recording goes on after it, nothing lost', async () => {
    const r = rig();
    const before = r.make();
    await before.service.start({ lectureId: L, transcribe: true });
    const mic = r.source();
    mic.tick(3);
    mic.cut();
    // Chunk 1 is two seconds in when the page goes, offline.
    r.server.online = false;
    mic.tick(2);
    await idle();
    const savedPieces = r.store.parts.filter((p) => p.seq === 1);
    expect(savedPieces.map((p) => p.index)).toEqual([0, 1]);
    r.crash();

    r.server.online = true;
    const after = r.make();
    const found = await after.service.recover();
    expect(found.map((m) => [m.lectureId, m.status])).toEqual([[L, 'interrupted']]);
    await after.uploads.flush({ now: true });
    await idle();
    const recovered = r.store.chunks.find((c) => c.seq === 1)!;
    expect([recovered.startMs, recovered.durationMs, recovered.recovered]).toEqual([3000, 2000, true]);
    expect(recovered.sizeBytes).toBe(savedPieces.reduce((n, p) => n + p.blob.size, 0));
    expect(r.store.parts).toEqual([]);
    expect(r.server.uploaded).toEqual([0, 1]);
    expect(r.server.transcribed).toEqual([0, 1]);

    // Continue: the next chunk number, where the recording ended.
    await after.service.continueRecording(L);
    const mic2 = r.source();
    expect(mic2.from).toEqual({ seq: 2, ms: 5000 });
    mic2.tick(2);
    await after.service.stop();
    await idle();
    const snap = await after.service.snapshot(L);
    expect(snap.chunks.map((c) => [c.seq, c.startMs, c.durationMs, c.state, c.recovered])).toEqual([
      [0, 0, 3000, 'transcribed', false],
      [1, 3000, 2000, 'transcribed', true],
      [2, 5000, 2000, 'transcribed', false],
    ]);
    // The timeline has no hole: each chunk starts where the one before ended.
    expect(snap.chunks.every((c, i) => i === 0 || c.startMs <= snap.chunks[i - 1].startMs + snap.chunks[i - 1].durationMs)).toBe(true);
    expect(snap.meta?.status).toBe('stopped');
  });

  it('recovery leaves alone a recording another tab is still making', async () => {
    const r = rig();
    const tab1 = r.make();
    await tab1.service.start({ lectureId: L, transcribe: false });
    r.source().tick(2);
    await idle();
    const tab2 = r.make();
    expect(await tab2.service.recover()).toEqual([]);
    expect((await r.store.getRecording(L))?.status).toBe('recording');
    expect(r.store.parts).toHaveLength(2);
    await expect(tab2.service.continueRecording(L)).rejects.toThrow('no interrupted recording');
  });

  it('recovery queues again a chunk whose job was lost, once', async () => {
    const r = rig();
    const before = r.make();
    r.server.online = false;
    await before.service.start({ lectureId: L, transcribe: false });
    const mic = r.source();
    mic.tick(2);
    mic.cut();
    mic.tick(2);
    await before.service.stop();
    await idle();
    expect(r.uploadOps.ops).toHaveLength(2);
    // Closed between saving the chunks and queueing their jobs.
    r.uploadOps.ops.length = 0;
    r.crash();

    const after = r.make();
    await after.service.recover();
    await after.service.recover();
    expect(r.uploadOps.ops.map((o) => (o.payload as { seq: number }).seq)).toEqual([0, 1]);
    r.server.online = true;
    await after.uploads.flush({ now: true });
    await idle();
    expect(r.server.uploaded).toEqual([0, 1]);
  });

  it('pause and resume are saved; recording again into the lecture goes on after its chunks', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    const mic = r.source();
    mic.tick(2);
    await service.pause();
    expect(service.state().status).toBe('paused');
    expect((await r.store.getRecording(L))?.status).toBe('paused');
    // Pause ended the chunk.
    expect(r.store.chunks.map((c) => c.seq)).toEqual([0]);
    await service.resume();
    expect((await r.store.getRecording(L))?.status).toBe('recording');
    mic.tick(1);
    await service.stop();
    await expect(service.pause()).resolves.toBeUndefined();

    await service.start({ lectureId: L, transcribe: false });
    expect(r.source().from).toEqual({ seq: 2, ms: 3000 });
    await service.stop();
  });

  it('refuses a second recording, or a new one over an unfinished one', async () => {
    const r = rig();
    const tab1 = r.make();
    await tab1.service.start({ lectureId: L, transcribe: false });
    await expect(tab1.service.start({ lectureId: 'other', transcribe: false })).rejects.toThrow('already running');
    r.crash();
    const tab2 = r.make();
    await expect(tab2.service.start({ lectureId: L, transcribe: false })).rejects.toThrow('unfinished recording');
    await tab2.service.recover();
    await tab2.service.finish(L);
    expect((await r.store.getRecording(L))?.status).toBe('stopped');
  });

  it('step 5.4: playback while recording: each chunk’s own audio or its Storage path, and the chunk being recorded from its pieces', async () => {
    const r = rig();
    r.server.online = false;
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    const mic = r.source();
    mic.tick(3);
    mic.cut();
    mic.tick(2);
    await idle();
    let sources = await service.playback(L);
    expect(sources.map((s) => [s.seq, s.startMs, s.durationMs, s.blob ? 'device' : s.storagePath])).toEqual([
      [0, 0, 3000, 'device'],
      [1, 3000, 2000, 'device'],
    ]);
    // The chunk being recorded is its two pieces so far, as one file.
    expect(sources[1].blob!.size).toBe(r.store.parts.filter((p) => p.seq === 1).reduce((n, p) => n + p.blob.size, 0));
    r.server.online = true;
    await r.make().uploads.flush({ now: true });
    await idle();
    sources = await service.playback(L);
    expect(sources[0].storagePath).toMatch(/0000\.webm$/);
    expect(sources[0].blob).toBeNull();
    await service.stop();
  });

  it('a microphone that goes away pauses the recording (never a silent stop); Resume goes on', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    const mic = r.source();
    mic.tick(3);
    expect(service.level()).toBe(0.5);
    mic.unplug();
    await idle();
    expect(service.state()).toEqual({ lectureId: L, status: 'paused', microphoneLost: true });
    // What was recorded is kept: the chunk ended at the moment it went.
    expect(r.store.chunks.map((c) => [c.seq, c.durationMs])).toEqual([[0, 3000]]);
    expect(service.level()).toBe(0);
    await service.resume();
    expect(service.state()).toEqual({ lectureId: L, status: 'recording', microphoneLost: false });
    await service.stop();
  });

  it('step 5.7: recording again into a lecture recorded elsewhere goes on after the audio Studiply already has', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false, after: { seq: 4, ms: 121_000 } });
    expect(r.source().from).toEqual({ seq: 4, ms: 121_000 });
    r.source().tick(2);
    await service.stop();
    // And after this device's own chunks when those end later.
    await service.start({ lectureId: L, transcribe: false, after: { seq: 2, ms: 60_000 } });
    expect(r.source().from).toEqual({ seq: 5, ms: 123_000 });
    await service.stop();
  });

  it('a microphone that can’t start leaves nothing behind', async () => {
    const r = rig();
    r.failMic(true);
    const { service } = r.make();
    await expect(service.start({ lectureId: L, transcribe: true })).rejects.toThrow('Permission denied');
    expect(await r.store.getRecording(L)).toBeNull();
    expect(r.held.size).toBe(0);
    expect(service.state().status).toBe('idle');
  });
});

describe('Cancel recording (Lea, 6 Nov): Discard', () => {
  beforeEach(() => resetDiscardedForTests());

  /** The server's rows as the clean-up leaves them: the discarded range removed (as discard-recording's deleteAudio). */
  const cleaner = (r: ReturnType<typeof rig>) => {
    const runs: DiscardedRecording[] = [];
    const cleanUp = async (d: DiscardedRecording) => {
      runs.push(d);
      const from = d.origin === 'new' ? d.keepBelow : d.from.seq;
      r.server.uploaded = r.server.uploaded.filter((s) => s < from);
      r.server.transcribed = r.server.transcribed.filter((s) => s < from);
    };
    return { runs, cleanUp };
  };

  it('offline: the microphone closes, the chunks on the device are dropped and never sent, nothing is offered as interrupted', async () => {
    const r = rig();
    const { service, uploads } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    r.server.online = false;
    const mic = r.source();
    mic.tick(2);
    mic.cut();
    mic.tick(2);
    mic.cut();
    mic.tick(1);
    await idle();
    expect(r.uploadOps.ops).toHaveLength(2);
    const { cleanUp } = cleaner(r);
    const d = await service.discard(L, { cleanUp, waitMs: 10 });
    expect(d).toEqual({ lectureId: L, origin: 'new', from: { seq: 0, ms: 0 }, toSeq: 3, keepBelow: 0, keptMs: 0 });
    expect(service.state()).toEqual({ lectureId: null, status: 'idle', microphoneLost: false });
    expect(r.held.size).toBe(0);
    // Nothing waits to be sent, nothing is kept on the device.
    expect(r.uploadOps.ops).toEqual([]);
    expect(r.transcribeOps.ops).toEqual([]);
    expect(r.store.chunks).toEqual([]);
    expect(r.store.parts).toEqual([]);
    expect(await r.store.getRecording(L)).toBeNull();
    // Back online, and on the next start: nothing is sent, nothing offered.
    r.server.online = true;
    await uploads.flush({ now: true });
    expect(await r.make().service.recover()).toEqual([]);
    await idle();
    expect(r.server.uploaded).toEqual([]);
    expect(r.server.transcribed).toEqual([]);
  });

  it('an upload already on its way is waited for; what it wrote after Discard was pressed goes with the server half, and it is never transcribed', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    let release!: () => void;
    r.server.uploadGate = new Promise<void>((res) => (release = res));
    r.source().tick(2);
    r.source().cut();
    await idle();
    setTimeout(release, 5);
    const { runs, cleanUp } = cleaner(r);
    const d = await service.discard(L, { cleanUp, waitMs: 2000 });
    await idle();
    // Discard ended only after the upload did: nothing can land after the server half.
    expect(r.server.uploaded).toEqual([0]);
    // Only what reached Studiply before Discard is kept; this chunk landed after: deleted by the server half.
    expect(d).toMatchObject({ keepBelow: 0, keptMs: 0, toSeq: 1 });
    expect(runs).toEqual([]);
    await cleanUp(d!);
    expect(r.server.uploaded).toEqual([]);
    expect(r.server.transcribed).toEqual([]);
    expect(r.transcribeOps.ops).toEqual([]);
  });

  it('a chunk uploaded before Discard is kept for a new lecture (to Recently Deleted with it)', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    r.source().tick(2);
    r.source().cut();
    await idle();
    expect(r.server.uploaded).toEqual([0]);
    r.server.online = false;
    r.source().tick(1);
    const { cleanUp } = cleaner(r);
    const d = await service.discard(L, { cleanUp, waitMs: 10 });
    expect(d).toMatchObject({ origin: 'new', keepBelow: 1, keptMs: 2000, toSeq: 2 });
    await cleanUp(d!);
    expect(r.server.uploaded).toEqual([0]);
  });

  it('an upload that answers after Discard leaves no row: what it wrote is removed again', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: true });
    let release!: () => void;
    r.server.uploadGate = new Promise<void>((res) => (release = res));
    r.source().tick(2);
    r.source().cut();
    await idle();
    const { runs, cleanUp } = cleaner(r);
    // Discard doesn't wait for ever.
    const d = await service.discard(L, { cleanUp, waitMs: 10 });
    expect(d).toMatchObject({ keepBelow: 0, toSeq: 1 });
    release();
    await idle();
    // It landed (the row was written), then the clean-up ran with the same range: no row left.
    expect(runs).toHaveLength(1);
    expect(r.server.uploaded).toEqual([]);
    expect(r.server.transcribed).toEqual([]);
    expect(r.store.chunks).toEqual([]);
  });

  it('a transcription that answers after Discard leaves no chunk or segment: the clean-up runs again', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: true, origin: 'document' });
    let release!: () => void;
    r.server.transcribeGate = new Promise<void>((res) => (release = res));
    r.source().tick(2);
    r.source().cut();
    await idle();
    expect(r.server.uploaded).toEqual([0]);
    const { runs, cleanUp } = cleaner(r);
    const d = await service.discard(L, { cleanUp, waitMs: 10 });
    expect(d).toMatchObject({ origin: 'document', keepBelow: 1 });
    // The server half (here: the test's clean-up) removes the recording's range…
    await cleanUp(d!);
    expect(r.server.uploaded).toEqual([]);
    // …and transcribe-chunk, answering late, wrote its chunk and segments again: removed again.
    release();
    await idle();
    expect(runs).toHaveLength(2);
    expect(r.server.transcribed).toEqual([]);
    expect(r.server.uploaded).toEqual([]);
  });

  it('recording again into a lecture recorded here: only the new recording goes; the earlier one is kept as it was', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    r.source().tick(3);
    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0]);
    await service.start({ lectureId: L, transcribe: false, origin: 'lecture' });
    r.server.online = false;
    r.source().tick(2);
    r.source().cut();
    await idle();
    const { cleanUp } = cleaner(r);
    const d = await service.discard(L, { cleanUp, waitMs: 10 });
    expect(d).toEqual({ lectureId: L, origin: 'lecture', from: { seq: 1, ms: 3000 }, toSeq: 2, keepBelow: 1, keptMs: 3000 });
    expect(r.store.chunks.map((c) => c.seq)).toEqual([0]);
    expect((await r.store.getRecording(L))?.status).toBe('stopped');
    r.server.online = true;
    await r.make().service.recover();
    await idle();
    expect(r.server.uploaded).toEqual([0]);
  });

  it('a new recording of the same lecture after a Discard is sent as usual', async () => {
    const r = rig();
    const { service } = r.make();
    await service.start({ lectureId: L, transcribe: false });
    r.source().tick(1);
    await service.discard(L, { cleanUp: async () => {}, waitMs: 10 });
    await service.start({ lectureId: L, transcribe: false });
    r.source().tick(2);
    await service.stop();
    await idle();
    expect(r.server.uploaded).toEqual([0]);
  });

  it('nothing to discard: null', async () => {
    const r = rig();
    const { service } = r.make();
    expect(await service.discard('nothing', { cleanUp: async () => {}, waitMs: 10 })).toBeNull();
  });
});
