/**
 * The recorder service (step 5.2): records a lecture in chunks, keeps every
 * chunk on the device first and sends it through the queue, so a recording
 * works without internet and uploads later, and survives a crash.
 *
 *  - Pieces: the chunk being recorded is saved piece by piece (every second
 *    on the web); a finished chunk replaces its pieces in one step, then an
 *    upload_chunk job is queued, and once it is uploaded (with consent) a
 *    transcribe_chunk job.
 *  - Two queue lanes (createSyncQueue): uploads and transcription, so a
 *    transcription outage never holds up the audio.
 *  - Ownership: a recording is held (a lock) while this app records it. On
 *    the next start, `recover` takes recordings nobody holds any more, joins
 *    their unfinished chunk's pieces into that chunk, queues whatever isn't
 *    uploaded and marks them interrupted: at most the last piece is lost.
 *  - The live transcript is the chunks' transcripts in order with the
 *    overlaps' duplicated words removed (./transcriptJoin).
 *
 * Everything platform-specific is passed in (./platform.web, ./platform), so
 * the rules are unit tested with in-memory parts.
 */

import { forget, isDiscarded, markDiscarded } from './discarded';
import { joinTranscript } from './transcriptJoin';
import type {
  AudioSource,
  ChunkInfo,
  AudioData,
  ChunkRef,
  DiscardedRecording,
  PlaybackSource,
  RecorderQueue,
  RecorderService,
  RecorderState,
  RecordingMeta,
  RecordingStore,
  StoredChunk,
  StoredPart,
} from './types';

export const CHUNK_MS = 30_000;
/** Measured in 5.1: restarting leaves gaps of 6–56 ms on the web; a 500 ms overlap none. */
export const OVERLAP_MS = 500;
/** A finished recording's details stay this long after everything is sent. */
const KEEP_FINISHED_MS = 24 * 60 * 60_000;
/** Cancel recording: how long Discard waits for an upload or transcription already on its way. */
export const DISCARD_WAIT_MS = 20_000;

export interface RecorderDeps {
  store: RecordingStore;
  createSource: (options: { chunkMs: number; overlapMs: number }) => AudioSource;
  uploads: RecorderQueue;
  transcriptions: RecorderQueue;
  userId: () => string | null;
  /** Resolves once the signed-in student is known (the web reads the session asynchronously). */
  ready?: () => Promise<void>;
  /** Takes the recording for this app; false while someone else (another tab) holds it. */
  claim: (lectureId: string) => Promise<boolean>;
  release: (lectureId: string) => void;
  /** Deletes a chunk's audio from the device (the iPhone's file); the web's Blob goes with the store. */
  dropAudio?: (audio: AudioData) => Promise<void>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

interface Active {
  meta: RecordingMeta;
  source: AudioSource;
  status: 'recording' | 'paused' | 'stopping';
  /** Paused by the microphone going away, not by the student. */
  microphoneLost: boolean;
}

export function createRecorderService(deps: RecorderDeps): RecorderService {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  let active: Active | null = null;
  // The source's pieces and chunks are saved one after another, in order.
  let work: Promise<void> = Promise.resolve();
  const serial = (fn: () => Promise<void>) => {
    work = work.then(fn).catch((err) => console.warn('[recorder] could not save a piece of the recording', err));
    return work;
  };

  // A chunk is queued for transcription once its upload is done (the server reads it from Storage).
  deps.uploads.subscribe((e) => {
    if (e.type === 'done' && e.op.kind === 'upload_chunk') {
      const ref = e.op.payload as ChunkRef;
      // Discarded meanwhile (Cancel recording): never transcribed.
      if (isDiscarded(ref)) return;
      void store
        .getRecording(ref.lectureId)
        .then((meta) => meta && queueChunk(meta, ref.seq))
        .catch((err) => console.warn('[recorder] could not queue a transcription', err));
    }
    if (e.type !== 'progress') emit();
  });
  deps.transcriptions.subscribe((e) => {
    if (e.type !== 'progress') emit();
  });

  async function save(meta: RecordingMeta, status: RecordingMeta['status']): Promise<RecordingMeta> {
    const next = { ...meta, status, updatedAt: new Date(now()).toISOString() };
    await store.saveRecording(next);
    return next;
  }

  async function queued(kind: string, lane: RecorderQueue): Promise<Set<string>> {
    const ops = await lane.list();
    return new Set(ops.filter((o) => o.kind === kind).map((o) => `${(o.payload as ChunkRef).lectureId}/${(o.payload as ChunkRef).seq}`));
  }

  async function queueChunk(meta: RecordingMeta, seq: number, skip?: { uploads: Set<string>; transcriptions: Set<string> }) {
    const ref: ChunkRef = { lectureId: meta.lectureId, seq };
    if (isDiscarded(ref)) return;
    const id = `${ref.lectureId}/${seq}`;
    const chunk = await store.getChunk(meta.lectureId, seq);
    if (!chunk) return;
    if (!chunk.storagePath) {
      if (!skip?.uploads.has(id)) await deps.uploads.enqueue({ kind: 'upload_chunk', key: meta.lectureId, payload: ref });
    } else if (meta.transcribe && !chunk.segments && !chunk.transcriptError && !skip?.transcriptions.has(id)) {
      await deps.transcriptions.enqueue({ kind: 'transcribe_chunk', key: meta.lectureId, payload: ref });
    }
  }

  function chunkOf(meta: RecordingMeta, c: { seq: number; blob: AudioData; mimeType: string; startMs: number; durationMs: number }, recovered: boolean): StoredChunk {
    return {
      lectureId: meta.lectureId,
      seq: c.seq,
      startMs: c.startMs,
      durationMs: c.durationMs,
      mimeType: c.mimeType,
      sizeBytes: c.blob.size,
      blob: c.blob,
      storagePath: null,
      segments: null,
      transcriptError: null,
      recovered,
    };
  }

  async function begin(meta: RecordingMeta, from: { seq: number; ms: number }) {
    const source = deps.createSource({ chunkMs: meta.chunkMs, overlapMs: meta.overlapMs });
    active = { meta, source, status: 'recording', microphoneLost: false };
    const mine = active;
    try {
      await source.start(from, {
        part: (p) => void serial(() => store.addPart({ ...p, lectureId: meta.lectureId })),
        chunk: (c) =>
          void serial(async () => {
            await store.finishChunk(chunkOf(meta, c, false));
            await queueChunk(meta, c.seq);
            emit();
          }),
        // Never a silent stop: the recording pauses (what was recorded is kept) and says why.
        lost: () => {
          if (active !== mine || mine.status !== 'recording') return;
          void service
            .pause()
            .then(() => {
              mine.microphoneLost = true;
              emit();
            })
            .catch((err) => console.warn('[recorder] could not pause after the microphone went away', err));
        },
      });
    } catch (err) {
      // No microphone (refused, none): the recording is as it was before.
      active = null;
      deps.release(meta.lectureId);
      emit();
      throw err;
    }
    emit();
  }

  /** Where a recording goes on: after its last chunk. */
  async function endOf(lectureId: string): Promise<{ seq: number; ms: number }> {
    const chunks = await store.listChunks(lectureId);
    return {
      seq: chunks.reduce((n, c) => Math.max(n, c.seq + 1), 0),
      ms: chunks.reduce((ms, c) => Math.max(ms, c.startMs + c.durationMs), 0),
    };
  }

  /** The pieces of unfinished chunks become those chunks. */
  async function rebuild(meta: RecordingMeta): Promise<void> {
    const parts = await store.listParts(meta.lectureId);
    const bySeq = new Map<number, StoredPart[]>();
    for (const p of parts) bySeq.set(p.seq, [...(bySeq.get(p.seq) ?? []), p]);
    for (const [seq, pieces] of [...bySeq].sort((x, y) => x[0] - y[0])) {
      pieces.sort((x, y) => x.index - y.index);
      // A chunk saved whole before the crash, its pieces not removed yet: finishChunk removes them.
      const existing = await store.getChunk(meta.lectureId, seq);
      if (existing) {
        await store.finishChunk(existing);
        continue;
      }
      // Pieces after a missing one can't be played without it (only the first has the file's header).
      const kept: StoredPart[] = [];
      for (const p of pieces) {
        if (p.index !== kept.length) break;
        kept.push(p);
      }
      if (kept.length === 0) {
        await store.dropParts(meta.lectureId, seq);
        continue;
      }
      const blob = new Blob(
        kept.map((p) => p.blob),
        { type: kept[0].mimeType },
      );
      const startMs = kept[0].startMs;
      const durationMs = Math.max(1, kept[kept.length - 1].endMs - startMs);
      await store.finishChunk(chunkOf(meta, { seq, blob, mimeType: kept[0].mimeType, startMs, durationMs }, true));
    }
  }

  const service: RecorderService = {
    supported: true,

    async start({ lectureId, transcribe, chunkMs = CHUNK_MS, overlapMs = OVERLAP_MS, after = null, origin }) {
      if (active) throw new Error('A recording is already running.');
      await deps.ready?.();
      const userId = deps.userId();
      if (!userId) throw new Error('Not signed in.');
      const earlier = await store.getRecording(lectureId);
      // Recording again into a lecture recorded here goes on after its chunks (numbers are never reused).
      if (earlier && earlier.status !== 'stopped') throw new Error('This lecture has an unfinished recording: continue or finish it first.');
      if (!(await deps.claim(lectureId))) throw new Error('This lecture is being recorded somewhere else.');
      // After this device's chunks and after what Studiply already has (recorded elsewhere or earlier, step 5.7).
      const here = earlier ? await endOf(lectureId) : { seq: 0, ms: 0 };
      const from = after ? { seq: Math.max(here.seq, after.seq), ms: Math.max(here.ms, after.ms) } : here;
      // A recording discarded earlier in this lecture no longer applies to the new one.
      forget(lectureId);
      const at = new Date(now()).toISOString();
      const meta: RecordingMeta = {
        lectureId,
        userId,
        status: 'recording',
        chunkMs,
        overlapMs,
        transcribe,
        createdAt: earlier?.createdAt ?? at,
        updatedAt: at,
        origin: origin ?? (after || earlier ? 'lecture' : 'new'),
        from,
      };
      await store.saveRecording(meta);
      try {
        await begin(meta, from);
      } catch (err) {
        if (earlier) await store.saveRecording(earlier);
        else await store.removeRecording(lectureId);
        throw err;
      }
    },

    async pause() {
      if (!active || active.status !== 'recording') return;
      const a = active;
      await a.source.pause();
      await work;
      a.status = 'paused';
      a.meta = await save(a.meta, 'paused');
      emit();
    },

    async resume() {
      if (!active || active.status !== 'paused') return;
      const a = active;
      await a.source.resume();
      a.status = 'recording';
      a.microphoneLost = false;
      a.meta = await save(a.meta, 'recording');
      emit();
    },

    async stop() {
      if (!active || active.status === 'stopping') return;
      const a = active;
      a.status = 'stopping';
      emit();
      await a.source.stop();
      await work;
      await save(a.meta, 'stopped');
      active = null;
      deps.release(a.meta.lectureId);
      emit();
    },

    async discard(lectureId, { cleanUp, waitMs = DISCARD_WAIT_MS }) {
      const a = active?.meta.lectureId === lectureId ? active : null;
      const meta = a?.meta ?? (await store.getRecording(lectureId));
      if (!meta) return null;
      const from = meta.from ?? { seq: 0, ms: 0 };
      // From now on none of its chunks is sent (the ones the microphone still hands over included).
      markDiscarded({ lectureId, fromSeq: from.seq, toSeq: null });
      if (a) {
        a.status = 'stopping';
        emit();
        // The microphone first.
        await a.source.stop().catch((err) => console.warn('[recorder] could not stop the microphone cleanly', err));
        await work;
        active = null;
        deps.release(lectureId);
        emit();
      }
      // Its waiting jobs go; one already on its way is waited for (it may still write: ./discarded).
      const mine = (op: { key: string; payload: unknown }) => op.key === lectureId && (op.payload as ChunkRef).seq >= from.seq;
      await Promise.all([deps.uploads.discardWhere(mine), deps.transcriptions.discardWhere(mine)]);
      await Promise.race([Promise.all([deps.uploads.idleFor(lectureId), deps.transcriptions.idleFor(lectureId)]), wait(waitMs)]);

      const chunks = (await store.listChunks(lectureId)).filter((c) => c.seq >= from.seq).sort((x, y) => x.seq - y.seq);
      const parts = (await store.listParts(lectureId)).filter((p) => p.seq >= from.seq);
      const toSeq = [...chunks, ...parts].reduce((n, c) => Math.max(n, c.seq + 1), from.seq);
      // Uploads go in order: the chunks the server has are the first ones.
      let keepBelow = from.seq;
      let keptMs = from.ms;
      for (const c of chunks) {
        if (c.seq !== keepBelow || !c.storagePath) break;
        keepBelow = c.seq + 1;
        keptMs = c.startMs + c.durationMs;
      }
      for (const c of chunks) if (c.blob) await deps.dropAudio?.(c.blob).catch(() => {});
      // Only this recording's chunks: an earlier recording of the lecture on this device is kept as it was.
      const earlier = (await store.listChunks(lectureId)).some((c) => c.seq < from.seq);
      if (earlier) {
        await store.dropChunks(lectureId, from.seq);
        await store.saveRecording({ ...meta, status: 'stopped', updatedAt: new Date(now()).toISOString(), origin: undefined, from: undefined });
      } else {
        await store.removeRecording(lectureId);
      }
      const result: DiscardedRecording = { lectureId, origin: meta.origin ?? 'new', from, toSeq, keepBelow, keptMs };
      markDiscarded({ lectureId, fromSeq: from.seq, toSeq }, () => cleanUp(result));
      emit();
      return result;
    },

    async recover() {
      // Re-queueing needs the student: their jobs are theirs.
      await deps.ready?.();
      if (!deps.userId()) return [];
      const found: RecordingMeta[] = [];
      for (const meta of await store.listRecordings()) {
        if (active?.meta.lectureId === meta.lectureId || meta.userId !== deps.userId()) continue;
        if (meta.status === 'recording' || meta.status === 'paused') {
          // Still held: recording in another tab right now.
          if (!(await deps.claim(meta.lectureId))) continue;
          try {
            await rebuild(meta);
            found.push(await save(meta, 'interrupted'));
          } finally {
            deps.release(meta.lectureId);
          }
        } else if (meta.status === 'interrupted') {
          found.push(meta);
        }
      }

      // Jobs an older app gave up on (the Keychain locked, 30 Oct) go back in line; not waited for (that sends them).
      for (const lane of [deps.uploads, deps.transcriptions]) {
        lane.retryFailed().catch((err) => console.warn('[recorder] could not retry the waiting parts', err));
      }
      // Whatever isn't sent yet goes (back) in the queue; finished recordings are forgotten after a day.
      const skip = { uploads: await queued('upload_chunk', deps.uploads), transcriptions: await queued('transcribe_chunk', deps.transcriptions) };
      for (const meta of await store.listRecordings()) {
        if (active?.meta.lectureId === meta.lectureId || meta.userId !== deps.userId()) continue;
        const chunks = await store.listChunks(meta.lectureId);
        for (const c of chunks) await queueChunk(meta, c.seq, skip);
        const settled = chunks.every((c) => c.storagePath && (!meta.transcribe || c.segments || c.transcriptError));
        if (meta.status === 'stopped' && settled && now() - Date.parse(meta.updatedAt) > KEEP_FINISHED_MS) {
          await store.removeRecording(meta.lectureId);
        }
      }
      emit();
      return found;
    },

    async playback(lectureId) {
      const [chunks, parts] = await Promise.all([store.listChunks(lectureId), store.listParts(lectureId)]);
      const sources: PlaybackSource[] = chunks
        .filter((c) => c.blob || c.storagePath)
        .map((c) => ({ seq: c.seq, startMs: c.startMs, durationMs: c.durationMs, blob: c.blob, storagePath: c.storagePath }));
      // The chunks being recorded: their pieces so far, in order from the first (only it has the file's header).
      const bySeq = new Map<number, StoredPart[]>();
      for (const p of parts) bySeq.set(p.seq, [...(bySeq.get(p.seq) ?? []), p]);
      for (const [seq, pieces] of bySeq) {
        if (chunks.some((c) => c.seq === seq)) continue;
        pieces.sort((x, y) => x.index - y.index);
        const kept: StoredPart[] = [];
        for (const p of pieces) {
          if (p.index !== kept.length) break;
          kept.push(p);
        }
        if (!kept.length) continue;
        const startMs = kept[0].startMs;
        sources.push({
          seq,
          startMs,
          durationMs: Math.max(1, kept[kept.length - 1].endMs - startMs),
          blob: new Blob(
            kept.map((p) => p.blob),
            { type: kept[0].mimeType },
          ),
          storagePath: null,
        });
      }
      return sources.sort((x, y) => x.seq - y.seq);
    },

    async recordings() {
      await deps.ready?.();
      const userId = deps.userId();
      return (await store.listRecordings()).filter((m) => m.userId === userId);
    },

    async continueRecording(lectureId) {
      if (active) throw new Error('A recording is already running.');
      const meta = await store.getRecording(lectureId);
      if (!meta || meta.status !== 'interrupted') throw new Error('There is no interrupted recording to continue.');
      if (!(await deps.claim(lectureId))) throw new Error('This lecture is being recorded somewhere else.');
      const from = await endOf(lectureId);
      try {
        await begin(await save(meta, 'recording'), from);
      } catch (err) {
        await store.saveRecording(meta);
        throw err;
      }
    },

    async finish(lectureId) {
      const meta = await store.getRecording(lectureId);
      if (!meta || meta.status !== 'interrupted') return;
      await save(meta, 'stopped');
      emit();
    },

    state(): RecorderState {
      return active
        ? { lectureId: active.meta.lectureId, status: active.status, microphoneLost: active.microphoneLost }
        : { lectureId: null, status: 'idle', microphoneLost: false };
    },

    elapsedMs() {
      return active ? active.source.elapsedMs() : 0;
    },

    level() {
      return active?.status === 'recording' ? (active.source.level?.() ?? 0) : 0;
    },

    async snapshot(lectureId) {
      const [meta, chunks] = await Promise.all([store.getRecording(lectureId), store.listChunks(lectureId)]);
      const info: ChunkInfo[] = chunks.map((c) => ({
        seq: c.seq,
        startMs: c.startMs,
        durationMs: c.durationMs,
        sizeBytes: c.sizeBytes,
        state: !c.storagePath ? 'on-device' : c.segments ? 'transcribed' : c.transcriptError ? 'no-transcript' : 'uploaded',
        transcriptError: c.transcriptError,
        recovered: c.recovered,
      }));
      return { meta, chunks: info, transcript: joinTranscript(chunks) };
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  return service;
}
