/**
 * The recorder on the web (step 5.2): the browser's MediaRecorder in
 * 30-second chunks overlapping by 500 ms (lib/chunkRecorder.web, measured in
 * 5.1), with a piece saved every second; IndexedDB for the recordings, their
 * chunks and pieces and the two queue lanes; Web Locks for who holds a
 * recording (a crashed or reloaded page lets go of its locks).
 *
 * The rest of the web app keeps no queue (it sends changes directly); a
 * recording does, because the connection can drop in the middle of a
 * lecture. The lanes send when something is added, when the backend is
 * reachable again and at sign-in. IndexedDB is written by hand (no
 * dependency); everything in it belongs to the signed-in student's
 * recordings and stays in this browser.
 */

import { ChunkRecorder } from '../../lib/chunkRecorder';
import type { QueueStore, SyncOp } from '../../lib/sync/queue';
import { sendRecordingChunk } from '../source-file.service';
import { buildRecorder } from './build';
import { isAudioFile, type AudioData, type AudioSource, type RecorderService, type RecordingMeta, type RecordingStore, type StoredChunk, type StoredPart } from './types';

/** A piece of the current chunk is saved this often: at most this much is lost in a crash. */
const PIECE_MS = 1000;

// -------------------------------------------------------------------
// IndexedDB
// -------------------------------------------------------------------

const DB_NAME = 'studiply-recorder';
let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('recordings', { keyPath: 'lectureId' });
      db.createObjectStore('chunks', { keyPath: ['lectureId', 'seq'] });
      db.createObjectStore('parts', { keyPath: ['lectureId', 'seq', 'index'] });
      // In the order added (the queue sends oldest first); `lane` keeps the two queues apart.
      db.createObjectStore('queue', { keyPath: 'n', autoIncrement: true }).createIndex('id', 'op.id', { unique: true });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

const ask = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** One transaction; `fn` may only wait on its own requests. */
async function inTx<T>(names: string[], mode: IDBTransactionMode, fn: (s: (name: string) => IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(names, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The recording store could not be written.'));
  });
  try {
    const result = await fn((name) => tx.objectStore(name));
    await done;
    return result;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished.
    }
    throw err;
  }
}

const lectureChunks = (id: string) => IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
const lectureParts = (id: string) => IDBKeyRange.bound([id, -Infinity, -Infinity], [id, Infinity, Infinity]);
const chunkParts = (id: string, seq: number) => IDBKeyRange.bound([id, seq, -Infinity], [id, seq, Infinity]);

const idbStore: RecordingStore = {
  saveRecording: (meta) => inTx(['recordings'], 'readwrite', async (s) => void (await ask(s('recordings').put(meta)))),
  getRecording: (id) => inTx(['recordings'], 'readonly', async (s) => ((await ask(s('recordings').get(id))) as RecordingMeta | undefined) ?? null),
  listRecordings: () => inTx(['recordings'], 'readonly', async (s) => (await ask(s('recordings').getAll())) as RecordingMeta[]),
  removeRecording: (id) =>
    inTx(['recordings', 'chunks', 'parts'], 'readwrite', async (s) => {
      await ask(s('recordings').delete(id));
      await ask(s('chunks').delete(lectureChunks(id)));
      await ask(s('parts').delete(lectureParts(id)));
    }),
  addPart: (part) => inTx(['parts'], 'readwrite', async (s) => void (await ask(s('parts').put(part)))),
  listParts: (id) => inTx(['parts'], 'readonly', async (s) => (await ask(s('parts').getAll(lectureParts(id)))) as StoredPart[]),
  dropParts: (id, seq) => inTx(['parts'], 'readwrite', async (s) => void (await ask(s('parts').delete(chunkParts(id, seq))))),
  finishChunk: (chunk) =>
    inTx(['chunks', 'parts'], 'readwrite', async (s) => {
      await ask(s('chunks').put(chunk));
      await ask(s('parts').delete(chunkParts(chunk.lectureId, chunk.seq)));
    }),
  getChunk: (id, seq) => inTx(['chunks'], 'readonly', async (s) => ((await ask(s('chunks').get([id, seq]))) as StoredChunk | undefined) ?? null),
  listChunks: (id) => inTx(['chunks'], 'readonly', async (s) => (await ask(s('chunks').getAll(lectureChunks(id)))) as StoredChunk[]),
  updateChunk: (id, seq, change) =>
    inTx(['chunks'], 'readwrite', async (s) => {
      const chunk = (await ask(s('chunks').get([id, seq]))) as StoredChunk | undefined;
      if (!chunk) return null;
      const next = { ...chunk, ...change };
      await ask(s('chunks').put(next));
      return next;
    }),
};

interface QueueRow {
  n?: number;
  lane: string;
  op: SyncOp;
}

/** One lane of the recorder's queue, in IndexedDB. */
function idbQueueStore(lane: string): QueueStore {
  return {
    list: (userId) =>
      inTx(['queue'], 'readonly', async (s) => {
        const rows = (await ask(s('queue').getAll())) as QueueRow[];
        return rows.filter((r) => r.lane === lane && r.op.userId === userId).map((r) => r.op);
      }),
    add: (op) => inTx(['queue'], 'readwrite', async (s) => void (await ask(s('queue').add({ lane, op } satisfies QueueRow)))),
    update: (op) =>
      inTx(['queue'], 'readwrite', async (s) => {
        const n = await ask(s('queue').index('id').getKey(op.id));
        if (n !== undefined) await ask(s('queue').put({ n, lane, op } as QueueRow));
      }),
    remove: (id) =>
      inTx(['queue'], 'readwrite', async (s) => {
        const n = await ask(s('queue').index('id').getKey(id));
        if (n !== undefined) await ask(s('queue').delete(n));
      }),
  };
}

// -------------------------------------------------------------------
// Locks: who holds a recording, and one tab sending at a time
// -------------------------------------------------------------------

const held = new Map<string, () => void>();

async function claim(lectureId: string): Promise<boolean> {
  if (held.has(lectureId)) return true;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  // Without Web Locks (very old browsers) a recording is taken over as soon as asked.
  if (!locks) return true;
  return new Promise<boolean>((resolve) => {
    void locks.request(`studiply-recording:${lectureId}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      // Held until released (or the page goes).
      return new Promise<void>((letGo) => held.set(lectureId, letGo));
    });
  });
}

function release(lectureId: string): void {
  held.get(lectureId)?.();
  held.delete(lectureId);
}

const exclusive =
  (name: string) =>
  <T>(fn: () => Promise<T>): Promise<T> =>
    typeof navigator !== 'undefined' && navigator.locks ? (navigator.locks.request(name, fn) as Promise<T>) : fn();

// -------------------------------------------------------------------
// The microphone
// -------------------------------------------------------------------

function webSource({ chunkMs, overlapMs }: { chunkMs: number; overlapMs: number }): AudioSource {
  let stream: MediaStream | null = null;
  let recorder: ChunkRecorder | null = null;
  let fromMs = 0;
  let lost: (() => void) | undefined;
  // The waveform: an analyser on the same stream (Web Audio, no dependency).
  let audio: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;

  // The browser's own processing, as the recording screen has today.
  const open = async () => {
    const opened = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Ended by the browser (unplugged, permission withdrawn), not by close(): stop() fires no event.
    opened.getAudioTracks().forEach((t) => t.addEventListener('ended', () => lost?.()));
    try {
      audio ??= new AudioContext();
      analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      audio.createMediaStreamSource(opened).connect(analyser);
    } catch {
      // No waveform; recording itself doesn't need it.
      analyser = null;
    }
    return opened;
  };
  const close = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
  };
  return {
    async start(from, on) {
      fromMs = from.ms;
      lost = on.lost;
      stream = await open();
      recorder = new ChunkRecorder({ chunkMs, overlapMs, timesliceMs: PIECE_MS, from, onPart: on.part, onChunk: on.chunk });
      try {
        recorder.start(stream);
      } catch (err) {
        close();
        throw err;
      }
    },
    // The microphone is closed while paused (no recording indicator while nothing records).
    async pause() {
      await recorder?.pause();
      close();
    },
    async resume() {
      if (!recorder?.paused) return;
      stream = await open();
      recorder.resume(stream);
    },
    async stop() {
      await recorder?.stop();
      close();
      void audio?.close().catch(() => {});
      audio = null;
    },
    elapsedMs: () => recorder?.elapsedMs() ?? fromMs,
    level() {
      if (!analyser || !samples) return 0;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const x of samples) sum += x * x;
      // Speech is about 0.02–0.3 RMS: spread over the bar's height.
      return Math.min(1, Math.sqrt(sum / samples.length) * 4);
    },
  };
}

// -------------------------------------------------------------------
// Sending
// -------------------------------------------------------------------

async function upload(chunk: StoredChunk & { blob: AudioData }, onProgress: (fraction: number) => void): Promise<string> {
  const uri = isAudioFile(chunk.blob) ? chunk.blob.uri : URL.createObjectURL(chunk.blob);
  try {
    return await sendRecordingChunk({ lectureId: chunk.lectureId, seq: chunk.seq, startMs: chunk.startMs, durationMs: chunk.durationMs, uri }, onProgress);
  } finally {
    if (!isAudioFile(chunk.blob)) URL.revokeObjectURL(uri);
  }
}

/** The browser asks for the microphone now (before a lecture is made), then lets it go. */
export async function requestMicrophone(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

/** One per page, also across development reloads (a second would send the same chunks). */
const shared = globalThis as { __studiplyRecorder?: RecorderService };
export const recorder: RecorderService = (shared.__studiplyRecorder ??= buildRecorder({
  store: idbStore,
  queueStore: idbQueueStore,
  createSource: webSource,
  upload,
  claim,
  release,
  exclusive,
}));
