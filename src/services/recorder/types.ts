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
  /**
   * Cancel recording (Lea, 6 Nov): how this recording began (a new lecture; a plain document that became
   * one; a lecture recorded again, step 5.7) and where it starts on the lecture's timeline.
   */
  origin?: RecordingOrigin;
  from?: { seq: number; ms: number };
}

export type RecordingOrigin = 'new' | 'document' | 'lecture';

/** What Discard leaves to the server half (services/discard-recording). */
export interface DiscardedRecording {
  lectureId: string;
  origin: RecordingOrigin;
  /** Where this recording starts on the lecture's timeline. */
  from: { seq: number; ms: number };
  /** The first chunk number after it. */
  toSeq: number;
  /** Its chunks below this number had reached the server when Discard ended (uploads go in order). */
  keepBelow: number;
  /** Where that uploaded part ends (ms). */
  keptMs: number;
}

/** A recorded file on the iPhone (the web keeps a Blob instead). */
export interface AudioFile {
  uri: string;
  size: number;
}

/** A chunk's audio on this device: the browser's Blob, or the iPhone's file. */
export type AudioData = Blob | AudioFile;

export const isAudioFile = (d: AudioData): d is AudioFile => typeof (d as AudioFile).uri === 'string';
export const sizeOf = (d: AudioData): number => d.size;

export interface StoredChunk {
  lectureId: string;
  seq: number;
  startMs: number;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  /** The audio, until it is uploaded (then the server has it). */
  blob: AudioData | null;
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
  /** The chunks and pieces numbered `fromSeq` and after (Cancel recording: only that recording's). */
  dropChunks(lectureId: string, fromSeq: number): Promise<void>;
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
  blob: AudioData;
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
  /** Puts failed jobs back in line (at the next start: the recording's audio is never given up). */
  retryFailed(): Promise<void>;
  /** Removes the waiting jobs `test` picks (Cancel recording); one in flight finishes. */
  discardWhere(test: (op: SyncOp) => boolean): Promise<number>;
  /** Resolves once no job of `key` is being sent. */
  idleFor(key: string): Promise<void>;
}

/** What both queued jobs carry: the chunk itself stays in the store. */
export interface ChunkRef {
  lectureId: string;
  seq: number;
}

export type ChunkState = 'on-device' | 'uploaded' | 'transcribed' | 'no-transcript';

/** A piece of a recording to play: the audio itself, or where it is in Storage. */
export interface PlaybackSource {
  seq: number;
  startMs: number;
  durationMs: number;
  blob: AudioData | null;
  storagePath: string | null;
}

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
  /**
   * `after`: where the lecture's audio already ends on Studiply (step 5.7, recording again into a lecture
   * recorded elsewhere or earlier): the new chunks are numbered and timed after it, as after this device's own.
   */
  start(params: {
    lectureId: string;
    transcribe: boolean;
    chunkMs?: number;
    overlapMs?: number;
    after?: { seq: number; ms: number } | null;
    /** How it began (Cancel recording needs it); default 'new', or 'lecture' with `after`. */
    origin?: RecordingOrigin;
  }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Cancel recording (Lea, 6 Nov): the recording running now ends and its audio is dropped from this
   * device. The microphone closes first; its waiting upload and transcription jobs are removed; one
   * already in flight is waited for (at most `waitMs`); then the chunks' files and the recording's
   * details are deleted, so it is never sent nor offered as interrupted. `cleanUp` runs again if a
   * job still writes to the server after this (./discarded). Returns what the server half needs.
   */
  discard(lectureId: string, options: { cleanUp: (d: DiscardedRecording) => Promise<void>; waitMs?: number }): Promise<DiscardedRecording | null>;
  /**
   * Recordings the app lost mid-lecture: their unfinished chunk rebuilt from
   * its pieces, everything not uploaded queued again. Returns them.
   */
  recover(): Promise<RecordingMeta[]>;
  /**
   * Live notes (step 5.4): a recording's audio as this device has it, for playing a moment while it
   * still records: each chunk's own audio (until uploaded) or its Storage path, and the chunk being
   * recorded from its saved pieces (a file cut short, which plays).
   */
  playback(lectureId: string): Promise<PlaybackSource[]>;
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
