import type { ChunkRecorderOptions, RecordedChunk } from './chunkRecorder';

export type { ChunkRecorderOptions, RecordedChunk };

/**
 * Recording in chunks on the web (step 5.1, the spike): the browser's
 * MediaRecorder on one microphone stream, rotated every `chunkMs` so every
 * chunk is a complete file of its own (WebM / Opus in Chrome) that can be
 * uploaded and transcribed while the lecture goes on. (One recorder with a
 * timeslice gives pieces only the first of which has the file's header.)
 *
 * Rotating:
 * - `overlapMs` 0 (restart): the old recorder stops and the new one starts in
 *   the same task: what the spike measures, for a gap between chunks;
 * - `overlapMs` > 0: the new one starts first and the old one stops that much
 *   later, so the chunks overlap instead (the fix if restarting loses audio).
 *
 * Times are the recorders' own start and stop events (performance.now(), ms).
 */
export class ChunkRecorder {
  private stream: MediaStream | null = null;
  private current: Recording | null = null;
  private seq = 0;
  private origin: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Set<Promise<void>>();
  /** Finished chunks waiting for the ones before them (null: a recorder that captured nothing). */
  private readonly ready = new Map<number, RecordedChunk | null>();
  private nextToHand = 0;
  private readonly now: () => number;
  private readonly Recorder: typeof MediaRecorder;

  constructor(private readonly options: ChunkRecorderOptions) {
    this.now = options.now ?? (() => performance.now());
    this.Recorder = (options.MediaRecorderImpl as typeof MediaRecorder | undefined) ?? MediaRecorder;
  }

  /** WebM / Opus where the browser has it (Chrome, Firefox), else its default (MP4 in Safari). */
  static preferredType(Recorder: Pick<typeof MediaRecorder, 'isTypeSupported'> = MediaRecorder): string | undefined {
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => Recorder.isTypeSupported(t));
  }

  get recording(): boolean {
    return this.stream !== null;
  }

  start(stream: MediaStream): void {
    if (this.stream) throw new Error('Already recording.');
    this.stream = stream;
    this.current = this.begin();
    this.timer = setInterval(() => this.rotate(), this.options.chunkMs);
  }

  /** Stops; resolves once the last chunk has been handed over. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.current?.recorder.stop();
    this.current = null;
    this.stream = null;
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  private rotate(): void {
    const old = this.current;
    if (!old || !this.stream) return;
    const overlap = this.options.overlapMs ?? 0;
    if (overlap > 0) {
      this.current = this.begin();
      const stopping = new Promise<void>((resolve) =>
        setTimeout(() => {
          old.recorder.stop();
          resolve();
        }, overlap),
      );
      this.track(stopping);
    } else {
      old.recorder.stop();
      this.current = this.begin();
    }
  }

  /**
   * Chunks go out in their order: with an overlap, Stop can end the newest
   * chunk before the one still finishing its overlap.
   */
  private handOver(): void {
    while (this.ready.has(this.nextToHand)) {
      const chunk = this.ready.get(this.nextToHand);
      this.ready.delete(this.nextToHand);
      this.nextToHand += 1;
      if (chunk) this.options.onChunk(chunk);
    }
  }

  private track(p: Promise<void>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private begin(): Recording {
    const type = this.options.mimeType ?? ChunkRecorder.preferredType(this.Recorder);
    const recorder = new this.Recorder(this.stream!, type ? { mimeType: type } : undefined);
    const rec: Recording = { recorder, seq: this.seq++, startedAt: this.now(), parts: [] };
    recorder.onstart = () => {
      rec.startedAt = this.now();
      if (this.origin === null) this.origin = rec.startedAt;
    };
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) rec.parts.push(e.data);
    };
    this.track(
      new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const stoppedAt = this.now();
          const mimeType = recorder.mimeType || type || 'audio/webm';
          const blob = new Blob(rec.parts, { type: mimeType });
          // A recorder stopped before it captured anything leaves no chunk (its number is kept, nothing is lost).
          const origin = this.origin ?? rec.startedAt;
          this.ready.set(
            rec.seq,
            blob.size > 0
              ? {
                  seq: rec.seq,
                  blob,
                  mimeType,
                  startedAt: rec.startedAt,
                  stoppedAt,
                  startMs: Math.max(0, Math.round(rec.startedAt - origin)),
                  durationMs: Math.max(1, Math.round(stoppedAt - rec.startedAt)),
                }
              : null,
          );
          this.handOver();
          resolve();
        };
      }),
    );
    recorder.start();
    return rec;
  }
}

interface Recording {
  recorder: MediaRecorder;
  seq: number;
  startedAt: number;
  parts: Blob[];
}
