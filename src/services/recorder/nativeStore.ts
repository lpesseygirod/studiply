/**
 * What the iPhone keeps of a recording (steps 5.2, iPhone half): each
 * recording's details, its chunks (their files' place and size, until
 * uploaded; their transcripts) in AsyncStorage, one entry per lecture, and
 * the recorder's two queue lanes, each in its own entry. The audio itself is
 * in files (the recorder moves each finished chunk to the app's documents).
 * Kept apart from the iPhone's SQLite sync queue, whose jobs it doesn't know.
 * Writes to one entry go one after another, so none is lost.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { QueueStore, SyncOp } from '../../lib/sync/queue';
import type { RecordingMeta, RecordingStore, StoredChunk, StoredPart } from './types';

const PREFIX = 'studiply.recorder';
const INDEX = `${PREFIX}.index`;
const entryKey = (lectureId: string) => `${PREFIX}.rec.${lectureId}`;
const laneKey = (lane: string) => `${PREFIX}.queue.${lane}`;

interface Entry {
  meta: RecordingMeta | null;
  chunks: StoredChunk[];
  parts: StoredPart[];
}

/** One write after another per key (read, change, write). */
function serialized() {
  const chains = new Map<string, Promise<unknown>>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
    chains.set(key, run.catch(() => {}));
    return run;
  };
}

async function readJson<T>(key: string, empty: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return empty;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return empty;
  }
}

export function createNativeStore(): RecordingStore {
  const queue = serialized();
  const read = (id: string) => readJson<Entry>(entryKey(id), { meta: null, chunks: [], parts: [] });
  const change = (id: string, fn: (entry: Entry) => Entry) =>
    queue(id, async () => {
      const next = fn(await read(id));
      await AsyncStorage.setItem(entryKey(id), JSON.stringify(next));
      return next;
    });
  const index = () => readJson<string[]>(INDEX, []);
  const setIndex = (fn: (ids: string[]) => string[]) =>
    queue(INDEX, async () => {
      await AsyncStorage.setItem(INDEX, JSON.stringify(fn(await index())));
    });
  const bySeq = (list: StoredChunk[]) => [...list].sort((a, b) => a.seq - b.seq);

  return {
    async saveRecording(meta) {
      await change(meta.lectureId, (e) => ({ ...e, meta }));
      await setIndex((ids) => (ids.includes(meta.lectureId) ? ids : [...ids, meta.lectureId]));
    },
    async getRecording(id) {
      return (await read(id)).meta;
    },
    async listRecordings() {
      const metas = await Promise.all((await index()).map(async (id) => (await read(id)).meta));
      return metas.filter((m): m is RecordingMeta => m !== null);
    },
    async removeRecording(id) {
      await queue(id, () => AsyncStorage.removeItem(entryKey(id)));
      await setIndex((ids) => ids.filter((x) => x !== id));
    },
    async dropChunks(id, fromSeq) {
      await change(id, (e) => ({ ...e, chunks: e.chunks.filter((c) => c.seq < fromSeq), parts: e.parts.filter((p) => p.seq < fromSeq) }));
    },
    async addPart(part) {
      await change(part.lectureId, (e) => ({
        ...e,
        parts: [...e.parts.filter((p) => p.seq !== part.seq || p.index !== part.index), part],
      }));
    },
    async listParts(id) {
      return [...(await read(id)).parts].sort((a, b) => a.seq - b.seq || a.index - b.index);
    },
    async dropParts(id, seq) {
      await change(id, (e) => ({ ...e, parts: e.parts.filter((p) => p.seq !== seq) }));
    },
    async finishChunk(chunk) {
      await change(chunk.lectureId, (e) => ({
        ...e,
        chunks: [...e.chunks.filter((c) => c.seq !== chunk.seq), chunk],
        parts: e.parts.filter((p) => p.seq !== chunk.seq),
      }));
    },
    async getChunk(id, seq) {
      return (await read(id)).chunks.find((c) => c.seq === seq) ?? null;
    },
    async listChunks(id) {
      return bySeq((await read(id)).chunks);
    },
    async updateChunk(id, seq, patch) {
      let updated: StoredChunk | null = null;
      await change(id, (e) => ({
        ...e,
        chunks: e.chunks.map((c) => {
          if (c.seq !== seq) return c;
          updated = { ...c, ...patch };
          return updated;
        }),
      }));
      return updated;
    },
  };
}

/** One lane of the recorder's queue (oldest first), as the web's IndexedDB lane. */
export function createNativeQueueStore(lane: string): QueueStore {
  const queue = serialized();
  const key = laneKey(lane);
  const all = () => readJson<SyncOp[]>(key, []);
  const write = (fn: (ops: SyncOp[]) => SyncOp[]) =>
    queue(key, async () => {
      await AsyncStorage.setItem(key, JSON.stringify(fn(await all())));
    });
  return {
    list: async (userId) => (await all()).filter((o) => o.userId === userId),
    add: (op) => write((ops) => [...ops, op]),
    update: (op) => write((ops) => ops.map((o) => (o.id === op.id ? op : o))),
    remove: (id) => write((ops) => ops.filter((o) => o.id !== id)),
  };
}
