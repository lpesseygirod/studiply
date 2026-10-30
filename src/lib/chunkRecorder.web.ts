import type { ChunkRecorderOptions, RecordedChunk, RecordedPart } from './chunkRecorder';

export type { ChunkRecorderOptions, RecordedChunk, RecordedPart };

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
 *   The spike measured gaps when restarting, so the app overlaps by 500 ms.
 *
 * Since 5.2 (the recorder service):
 * - `timesliceMs`: each recorder also hands over the piece recorded so far
 *   (`onPart`), which the service saves, so a crash loses at most one piece.
 *   A chunk's pieces in order are the chunk's file;
 * - pause ends the chunk (each chunk stays continuous audio) and the paused
 *   time is left out of the recording's timeline; resume starts the next one,
 *   on a new stream when the microphone was closed during the pause. The
 *   paused time runs from the last chunk's end until the next recorder really
 *   starts, so the chunk after a pause starts exactly where the one before
 *   ended (no hole for the moment a reopened microphone takes);
 * - `from` goes on with a recording after a crash: the next chunk number and
 *   where the recording ended.
 *
 * Times are the recorders' own start and stop events (performance.now(), ms).
 */
export class ChunkRecorder {
  private stream: MediaStream | null = null;
  private current: Recording | null = null;
  /** The previous chunk, recording the overlap until its timer stops it. */
  private finishing: { rec: Recording; timer: ReturnType<typeof setTimeout>; done: () => void } | null = null;
  private seq: number;
  private origin: number | null = null;
  /** Where the recording was when this recorder took over (ms). */
  private readonly base: number;
  /** Paused time so far, and since when it is paused. */
  private pausedMs = 0;
  private pausedAt: number | null = null;
  /** Resume was asked; the pause lasts until the next recorder really starts. */
  private resuming = false;
  /** Where the chunks handed over so far end in the recording (ms). */
  private endMs: number;
  private stoppedAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Set<Promise<void>>();
  /** Finished chunks waiting for the ones before them (null: a recorder that captured nothing). */
  private readonly ready = new Map<number, RecordedChunk | null>();
  private nextToHand: number;
  private readonly now: () => number;
  private readonly Recorder: typeof MediaRecorder;

  constructor(private readonly options: ChunkRecorderOptions) {
    this.now = options.now ?? (() => performance.now());
    this.Recorder = (options.MediaRecorderImpl as typeof MediaRecorder | undefined) ?? MediaRecorder;
    this.seq = options.from?.seq ?? 0;
    this.nextToHand = this.seq;
    this.base = options.from?.ms ?? 0;
    this.endMs = this.base;
  }

  /** WebM / Opus where the browser has it (Chrome, Firefox), else its default (MP4 in Safari). */
  static preferredType(Recorder: Pick<typeof MediaRecorder, 'isTypeSupported'> = MediaRecorder): string | undefined {
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => Recorder.isTypeSupported(t));
  }

  get recording(): boolean {
    return this.stream !== null;
  }

  get paused(): boolean {
    return this.pausedAt !== null && !this.resuming;
  }

  /** Where the recording is now (ms), pauses left out; while paused, where its last chunk ends. */
  elapsedMs(): number {
    if (this.origin === null) return this.base;
    if (this.pausedAt !== null) return Math.max(this.base, this.endMs, Math.round(this.at(this.pausedAt)));
    return Math.max(this.base, Math.round(this.at(this.stoppedAt ?? this.now())));
  }

  start(stream: MediaStream): void {
    if (this.stream) throw new Error('Already recording.');
    this.stream = stream;
    this.stoppedAt = null;
    this.current = this.begin();
    this.timer = setInterval(() => this.rotate(), this.options.chunkMs);
  }

  /** Ends the current chunk; resolves once it has been handed over. */
  async pause(): Promise<void> {
    if (!this.stream || (this.pausedAt !== null && !this.resuming)) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Paused again before the resumed recorder started: still the same pause.
    if (this.resuming) this.resuming = false;
    else this.pausedAt = this.now();
    // The previous chunk too: its overlap mustn't run past the pause on the timeline.
    this.endFinishing();
    if (this.current) this.end(this.current);
    this.current = null;
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  /** Goes on, on `stream` if given (the microphone is closed while paused and opened again). */
  resume(stream?: MediaStream): void {
    if (!this.stream || this.pausedAt === null || this.resuming) return;
    if (stream) this.stream = stream;
    // The pause ends when the new recorder really starts (its onstart), not now: a
    // newly opened microphone takes a moment, and that moment is recorded nowhere.
    this.resuming = true;
    this.current = this.begin();
    this.timer = setInterval(() => this.rotate(), this.options.chunkMs);
  }

  /** Stops; resolves once the last chunk has been handed over. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.stream && this.stoppedAt === null) this.stoppedAt = this.pausedAt ?? this.now();
    if (this.current) this.end(this.current);
    this.current = null;
    this.stream = null;
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  /** `t` (performance.now()) on the recording's timeline (ms). */
  private at(t: number): number {
    return this.base + (this.origin === null ? 0 : t - this.origin) - this.pausedMs;
  }

  private rotate(): void {
    const old = this.current;
    if (!old || !this.stream) return;
    const overlap = this.options.overlapMs ?? 0;
    if (overlap > 0) {
      this.endFinishing();
      this.current = this.begin();
      this.track(
        new Promise<void>((done) => {
          this.finishing = { rec: old, timer: setTimeout(() => this.endFinishing(), overlap), done };
        }),
      );
    } else {
      this.end(old);
      this.current = this.begin();
    }
  }

  private endFinishing(): void {
    const f = this.finishing;
    if (!f) return;
    this.finishing = null;
    clearTimeout(f.timer);
    this.end(f.rec);
    f.done();
  }

  private end(rec: Recording): void {
    if (rec.ended) return;
    rec.ended = true;
    rec.recorder.stop();
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
    const startedAt = this.now();
    const afterPause = this.resuming;
    const rec: Recording = { recorder, seq: this.seq++, startedAt, startMs: Math.round(this.at(startedAt)), parts: [], ended: false };
    const mimeType = () => recorder.mimeType || type || 'audio/webm';
    recorder.onstart = () => {
      rec.startedAt = this.now();
      if (this.origin === null) this.origin = rec.startedAt;
      if (afterPause) {
        // The pause ends here: the paused time is everything since the last chunk's
        // end, so this chunk starts exactly where that one ended.
        this.pausedMs = this.base + (rec.startedAt - this.origin) - this.endMs;
        if (this.resuming) {
          this.resuming = false;
          this.pausedAt = null;
        }
      }
      rec.startMs = Math.max(0, Math.round(this.at(rec.startedAt)));
    };
    recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return;
      rec.parts.push(e.data);
      this.options.onPart?.({
        seq: rec.seq,
        index: rec.parts.length - 1,
        blob: e.data,
        mimeType: mimeType(),
        startMs: rec.startMs,
        endMs: Math.round(rec.startMs + (this.now() - rec.startedAt)),
      });
    };
    this.track(
      new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const stoppedAt = this.now();
          const blob = new Blob(rec.parts, { type: mimeType() });
          if (blob.size > 0) this.endMs = Math.max(this.endMs, rec.startMs + Math.max(1, Math.round(stoppedAt - rec.startedAt)));
          // A recorder stopped before it captured anything leaves no chunk (its number is kept, nothing is lost).
          this.ready.set(
            rec.seq,
            blob.size > 0
              ? {
                  seq: rec.seq,
                  blob,
                  mimeType: mimeType(),
                  startedAt: rec.startedAt,
                  stoppedAt,
                  startMs: rec.startMs,
                  durationMs: Math.max(1, Math.round(stoppedAt - rec.startedAt)),
                }
              : null,
          );
          this.handOver();
          resolve();
        };
      }),
    );
    if (this.options.timesliceMs) recorder.start(this.options.timesliceMs);
    else recorder.start();
    return rec;
  }
}

interface Recording {
  recorder: MediaRecorder;
  seq: number;
  startedAt: number;
  /** Where it starts in the recording (ms). */
  startMs: number;
  parts: Blob[];
  ended: boolean;
}
