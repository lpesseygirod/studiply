/**
 * The types of recording in chunks. The web's recorder is chunkRecorder.web.ts
 * (MediaRecorder); the iPhone's is nativeChunkRecorder.ts (expo-audio).
 */

export interface RecordedChunk {
  /** The chunk's number in the recording, from 0. */
  seq: number;
  blob: Blob;
  mimeType: string;
  /** When its recorder started and stopped (performance.now(), ms). */
  startedAt: number;
  stoppedAt: number;
  /** From the recording's start (ms): where the transcript places it. */
  startMs: number;
  durationMs: number;
}

/**
 * A piece of the chunk being recorded (every `timesliceMs`), saved so that a
 * crash loses at most one piece. A chunk's pieces in order are one file.
 */
export interface RecordedPart {
  seq: number;
  /** The piece's number in its chunk, from 0. */
  index: number;
  blob: Blob;
  mimeType: string;
  /** Where its chunk starts, and where this piece ends, in the recording (ms). */
  startMs: number;
  endMs: number;
}

export interface ChunkRecorderOptions {
  /** A new chunk every… (30 s in the app). */
  chunkMs: number;
  /** 0: stop and start in one go; more: the next chunk starts that much before this one stops. */
  overlapMs?: number;
  mimeType?: string;
  onChunk: (chunk: RecordedChunk) => void;
  /** Pieces of the current chunk every `timesliceMs` (none without it). */
  timesliceMs?: number;
  onPart?: (part: RecordedPart) => void;
  /** Going on with a recording: its next chunk number and where it ended (ms). */
  from?: { seq: number; ms: number };
  /** For tests. */
  now?: () => number;
  MediaRecorderImpl?: unknown;
}
