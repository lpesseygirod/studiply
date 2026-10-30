/**
 * The recorder service's parts (step 5.2). The service (./service) is the
 * same on every platform; the microphone, the local store, the queues and the
 * lock are each platform's own (./platform.web, ./platform).
 */

import type { SyncEvent, SyncOp } from '../../lib/sync/queue';

/** A transcript segment on the recording's timeline (ms), as transcribe-chunk returns it. */
export interface Segment {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * As last saved. `interrupted`: the app was closed or crashed while it was
 * recording or paused (found by `recover`); it can be continued or finished.
 */
export type RecordingStatus = 'recording' | 'paused' | 'stopped' | 'interrupted';

export interface RecordingMeta {
  lectureId: string;
  userId: string;
  status: RecordingStatus;
  chunkMs: number;
  overlapMs: number;
  /** Each chunk is transcribed as it is uploaded (the student consented). */
  transcribe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredChunk {
  lectureId: string;
  seq: number;
  startMs: number;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  /** The audio, until it is uploaded (then the server has it). */
  blob: Blob | null;
  /** Its path in `audio-chunks` once uploaded. */
  storagePath: string | null;
  /** Its transcript once transcribed. */
  segments: Segment[] | null;
  /** Why it couldn't be transcribed during the recording (the after-Stop transcription tries again). */
  transcriptError: string | null;
  /** Rebuilt from its saved pieces after the app closed mid-chunk. */
  recovered: boolean;
}

/** A piece of the chunk being recorded (see RecordedPart). */
export interface StoredPart {
  lectureId: string;
  seq: number;
  index: number;
  blob: Blob;
  mimeType: string;
  startMs: number;
  endMs: number;
}

/** What's kept on the device: IndexedDB on the web, in memory in the tests. */
export interface RecordingStore {
  saveRecording(meta: RecordingMeta): Promise<void>;
  getRecording(lectureId: string): Promise<RecordingMeta | null>;
  listRecordings(): Promise<RecordingMeta[]>;
  /** The recording with its chunks and pieces. */
  removeRecording(lectureId: string): Promise<void>;
  addPart(part: StoredPart): Promise<void>;
  /** Pieces of chunks not finished yet, by chunk and piece number. */
  listParts(lectureId: string): Promise<StoredPart[]>;
  dropParts(lectureId: string, seq: number): Promise<void>;
  /** Saves a finished chunk and removes its pieces, in one step. */
  finishChunk(chunk: StoredChunk): Promise<void>;
  getChunk(lectureId: string, seq: number): Promise<StoredChunk | null>;
  /** By chunk number. */
  listChunks(lectureId: string): Promise<StoredChunk[]>;
  updateChunk(lectureId: string, seq: number, change: Partial<StoredChunk>): Promise<StoredChunk | null>;
}

export interface SourceChunk {
  seq: number;
  blob: Blob;
  mimeType: string;
  startMs: number;
  durationMs: number;
}

export type SourcePart = Omit<StoredPart, 'lectureId'>;

/** The microphone in chunks (the web's ChunkRecorder; the iPhone's after expo-audio). */
export interface AudioSource {
  /**
   * Opens the microphone and records from chunk `from.seq`, at `from.ms` in the recording.
   * `lost`: the microphone went away by itself (unplugged, permission withdrawn).
   */
  start(
    from: { seq: number; ms: number },
    on: { part: (p: SourcePart) => void; chunk: (c: SourceChunk) => void; lost?: () => void },
  ): Promise<void>;
  /** Each resolves once the chunks it ended have been handed over. */
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  elapsedMs(): number;
  /** How loud the microphone is right now, 0 to 1 (the waveform). */
  level?(): number;
}

/** One of the recorder's two queue lanes (createSyncQueue). */
export interface RecorderQueue {
  enqueue<P>(input: { kind: string; key: string; payload: P }): Promise<SyncOp<P>>;
  flush(options?: { now?: boolean }): Promise<void>;
  subscribe(fn: (e: SyncEvent) => void): () => void;
  list(): Promise<SyncOp[]>;
}

/** What both queued jobs carry: the chunk itself stays in the store. */
export interface ChunkRef {
  lectureId: string;
  seq: number;
}

export type ChunkState = 'on-device' | 'uploaded' | 'transcribed' | 'no-transcript';

export interface ChunkInfo {
  seq: number;
  startMs: number;
  durationMs: number;
  sizeBytes: number;
  state: ChunkState;
  transcriptError: string | null;
  recovered: boolean;
}

export interface RecordingSnapshot {
  meta: RecordingMeta | null;
  chunks: ChunkInfo[];
  /** The live transcript: in order, the overlaps' duplicated words removed. */
  transcript: Segment[];
}

export interface RecorderState {
  lectureId: string | null;
  status: 'idle' | 'recording' | 'paused' | 'stopping';
  /** Paused because the microphone went away (not by the student); Resume reopens it. */
  microphoneLost: boolean;
}

export interface RecorderService {
  /** False on the iPhone until expo-audio. */
  readonly supported: boolean;
  start(params: { lectureId: string; transcribe: boolean; chunkMs?: number; overlapMs?: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Recordings the app lost mid-lecture: their unfinished chunk rebuilt from
   * its pieces, everything not uploaded queued again. Returns them.
   */
  recover(): Promise<RecordingMeta[]>;
  /** The signed-in student's recordings kept on this device (any status). */
  recordings(): Promise<RecordingMeta[]>;
  /** Records on into an interrupted recording, after its last chunk. */
  continueRecording(lectureId: string): Promise<void>;
  /** An interrupted recording ends there (its chunks still upload). */
  finish(lectureId: string): Promise<void>;
  state(): RecorderState;
  /** Where the recording is (ms), pauses left out. */
  elapsedMs(): number;
  /** The microphone's loudness now, 0 to 1 (0 when not recording). */
  level(): number;
  snapshot(lectureId: string): Promise<RecordingSnapshot>;
  /** Anything changed: a chunk saved, uploaded or transcribed, the state. */
  subscribe(fn: () => void): () => void;
}
