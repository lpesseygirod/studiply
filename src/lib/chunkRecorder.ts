/**
 * Recording in chunks (step 5.1, the spike). The web's is chunkRecorder.web.ts
 * (MediaRecorder). The iPhone's waits for expo-audio, which needs Lea's OK
 * (a new dependency); until then starting here says so.
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

export interface ChunkRecorderOptions {
  /** A new chunk every… (30 s in the app). */
  chunkMs: number;
  /** 0: stop and start in one go; more: the next chunk starts that much before this one stops. */
  overlapMs?: number;
  mimeType?: string;
  onChunk: (chunk: RecordedChunk) => void;
  /** For tests. */
  now?: () => number;
  MediaRecorderImpl?: unknown;
}

export class ChunkRecorder {
  constructor(private readonly options: ChunkRecorderOptions) {}

  static preferredType(): string | undefined {
    return undefined;
  }

  get recording(): boolean {
    return false;
  }

  start(_stream: MediaStream): void {
    void this.options;
    throw new Error('Recording in chunks on the iPhone waits for expo-audio (Lea’s OK).');
  }

  async stop(): Promise<void> {}
}
