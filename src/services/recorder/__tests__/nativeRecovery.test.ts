/**
 * @jest-environment node
 */
// Steps 5.1–5.2, iPhone half: the recorder service as the iPhone runs it —
// lib/nativeChunkRecorder on stand-in expo-audio recorders, the recording
// kept in AsyncStorage (./nativeStore, the package's in-memory mock), the
// real queue lanes. The app is killed mid-chunk while offline: the finished
// chunks survive, are sent after the restart, and the recording goes on
// after them. Nothing is sent anywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NativeChunkRecorder, type NativeRecorderLike } from '../../../lib/nativeChunkRecorder';
import { NetworkError } from '../../../lib/cloudRows';
import { createSyncQueue, type QueueStore } from '../../../lib/sync/queue';
import { transcribeChunkHandler, uploadChunkHandler } from '../handlers';
import { createNativeQueueStore, createNativeStore } from '../nativeStore';
import { createRecorderService } from '../service';
import { isAudioFile, type AudioSource } from '../types';

const L = 'lecture-1';

/** An expo-audio AudioRecorder stand-in (two may record at once). */
class FakeRecorder implements NativeRecorderLike {
  static made = 0;
  readonly id = FakeRecorder.made++;
  isRecording = false;
  uri: string | null = null;
  async prepareToRecordAsync() {
    this.uri = `file:///documents/recorder/r${this.id}.m4a`;
  }
  record() {
    this.isRecording = true;
  }
  async stop() {
    this.isRecording = false;
  }
  getStatus() {
    return { isRecording: this.isRecording, metering: -20 };
  }
  release() {}
}

/** platform.ts's nativeSource without the file system: each chunk is its file. */
function iosSource(options: { chunkMs: number; overlapMs: number }, sources: { from: { seq: number; ms: number } }[]): AudioSource {
  let recorder: NativeChunkRecorder | null = null;
  return {
    async start(from, on) {
      sources.push({ from });
      recorder = new NativeChunkRecorder({
        ...options,
        from,
        createRecorder: () => new FakeRecorder(),
        onLost: on.lost,
        onChunk: (c) => on.chunk({ seq: c.seq, blob: { uri: c.uri, size: 240_000 }, mimeType: 'audio/m4a', startMs: c.startMs, durationMs: c.durationMs }),
      });
      await recorder.start();
    },
    pause: async () => recorder?.pause(),
    resume: async () => recorder?.resume(),
    async stop() {
      await recorder?.stop();
      recorder = null;
    },
    elapsedMs: () => recorder?.elapsedMs() ?? 0,
    level: () => recorder?.level() ?? 0,
  };
}

/** Every pending promise and microtask runs (the clock stands still). */
const idle = async () => {
  for (let i = 0; i < 10; i++) await jest.advanceTimersByTimeAsync(0);
};

/** The iPhone: AsyncStorage outlives the app; `make` is the app (re)starting. */
function phone() {
  const server = { online: false, uploaded: [] as number[], transcribed: [] as number[], discarded: [] as string[] };
  const sources: { from: { seq: number; ms: number } }[] = [];
  let ids = 0;
  const lane = (opsStore: QueueStore, kind: string, handler: ReturnType<typeof uploadChunkHandler>) =>
    createSyncQueue({
      store: opsStore,
      handlers: { [kind]: handler },
      userId: () => 'u1',
      canSync: () => true,
      refresh: async () => true,
      newId: () => `op-${Date.now()}-${++ids}`,
      setTimer: () => 0,
      clearTimer: () => {},
    });

  function make() {
    const store = createNativeStore();
    const held = new Set<string>();
    const uploads = lane(
      createNativeQueueStore('uploads'),
      'upload_chunk',
      uploadChunkHandler({
        store,
        upload: async (chunk) => {
          if (!server.online) throw new NetworkError();
          if (!isAudioFile(chunk.blob)) throw new Error('not a file');
          server.uploaded.push(chunk.seq);
          return `u1/${chunk.lectureId}/${String(chunk.seq).padStart(4, '0')}.m4a`;
        },
        onServer: async (ref) => server.uploaded.includes(ref.seq),
        discard: async (audio) => {
          if (isAudioFile(audio)) server.discarded.push(audio.uri);
        },
      }),
    );
    const transcriptions = lane(
      createNativeQueueStore('transcriptions'),
      'transcribe_chunk',
      transcribeChunkHandler({
        store,
        transcribe: async (p) => {
          if (!server.online) throw new NetworkError();
          server.transcribed.push(p.seq);
          return [{ startMs: p.startMs, endMs: p.startMs + 1000, text: `chunk ${p.seq}` }];
        },
      }),
    );
    const service = createRecorderService({
      store,
      createSource: (o) => iosSource(o, sources),
      uploads,
      transcriptions,
      userId: () => 'u1',
      claim: async (id) => {
        held.add(id);
        return true;
      },
      release: (id) => {
        held.delete(id);
      },
    });
    return { service, store, uploads, transcriptions };
  }
  return { server, sources, make };
}

beforeEach(async () => {
  jest.useFakeTimers({ now: 0 });
  FakeRecorder.made = 0;
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

describe('the recorder on the iPhone', () => {
  it('killed mid-chunk while offline: the finished chunks are kept and sent after the restart; the recording goes on after them', async () => {
    const p = phone();
    const before = p.make();
    await before.service.start({ lectureId: L, transcribe: true });
    // Chunks 0 and 1 finished (the 500 ms overlaps); chunk 2 is 5 s in.
    await jest.advanceTimersByTimeAsync(65000);
    await idle();
    let chunks = await before.store.listChunks(L);
    expect(chunks.map((c) => [c.seq, c.startMs, c.durationMs])).toEqual([
      [0, 0, 30500],
      [1, 30000, 30500],
    ]);
    // Each on the device as its file until uploaded.
    expect(chunks.map((c) => (c.blob && isAudioFile(c.blob) ? c.blob.uri : null))).toEqual(['file:///documents/recorder/r0.m4a', 'file:///documents/recorder/r1.m4a']);
    expect(p.server.uploaded).toEqual([]);

    // The app is killed (its timers go with it); the network is back.
    jest.clearAllTimers();
    p.server.online = true;
    const after = p.make();
    const found = await after.service.recover();
    expect(found.map((m) => [m.lectureId, m.status])).toEqual([[L, 'interrupted']]);
    await after.uploads.flush({ now: true });
    await idle();
    await after.transcriptions.flush({ now: true });
    await idle();
    expect(p.server.uploaded).toEqual([0, 1]);
    expect(p.server.transcribed).toEqual([0, 1]);
    // Uploaded: the device's files are deleted.
    expect(p.server.discarded).toEqual(['file:///documents/recorder/r0.m4a', 'file:///documents/recorder/r1.m4a']);

    // Continue: chunk 2 again, where chunk 1 ended (the unfinished one is lost: at most 30 s).
    await after.service.continueRecording(L);
    expect(p.sources[p.sources.length - 1].from).toEqual({ seq: 2, ms: 60500 });
    await jest.advanceTimersByTimeAsync(5000);
    await after.service.stop();
    await idle();
    await after.uploads.flush({ now: true });
    await idle();
    await after.transcriptions.flush({ now: true });
    await idle();
    chunks = await after.store.listChunks(L);
    expect(chunks.map((c) => [c.seq, c.startMs, c.durationMs, c.storagePath !== null, c.blob])).toEqual([
      [0, 0, 30500, true, null],
      [1, 30000, 30500, true, null],
      [2, 60500, 5000, true, null],
    ]);
    expect(p.server.uploaded).toEqual([0, 1, 2]);
    expect((await after.store.getRecording(L))?.status).toBe('stopped');
    // Nothing waits in the lanes.
    expect(await createNativeQueueStore('uploads').list('u1')).toEqual([]);
    expect(await createNativeQueueStore('transcriptions').list('u1')).toEqual([]);
  });

  it('pause and resume: the chunk ends at Pause, the next starts where it ended', async () => {
    const p = phone();
    p.server.online = true;
    const { service, store } = p.make();
    await service.start({ lectureId: L, transcribe: false });
    await jest.advanceTimersByTimeAsync(12000);
    await service.pause();
    expect(service.state().status).toBe('paused');
    await jest.advanceTimersByTimeAsync(60000);
    expect(service.elapsedMs()).toBe(12000);
    await service.resume();
    await jest.advanceTimersByTimeAsync(4000);
    await service.stop();
    await idle();
    expect((await store.listChunks(L)).map((c) => [c.seq, c.startMs, c.durationMs])).toEqual([
      [0, 0, 12000],
      [1, 12000, 4000],
    ]);
    expect(p.server.uploaded).toEqual([0, 1]);
  });
});
