/**
 * Recording in chunks on the iPhone: expo-audio
 * recorders (AVAudioRecorder) rotated every `chunkMs`, each chunk a complete
 * .m4a file of its own, as the web's ChunkRecorder does with MediaRecorder.
 *
 * Rotating with `overlapMs` (500 ms, as measured on the web): the next
 * recorder is prepared ahead, starts first, and the previous one stops that
 * much later, so nothing is lost at a join. If iOS refuses a second recorder
 * while one records (it doesn't start), it falls back for good to stopping
 * the old one first and starting the new one right after (a short gap), and
 * says so once (`onOverlapRefused`).
 *
 * Pause ends the chunk (each chunk stays continuous audio; the microphone is
 * let go); the paused time runs from the last chunk's end until the next
 * recorder starts, so the timeline has no hole. `from` goes on with a
 * recording after a crash. A recorder that stopped by itself (a phone call,
 * the microphone taken) is reported once as lost (`onLost`); the service
 * then pauses. Unlike the browser's, an .m4a being written can't be played
 * before it's finished, so there are no pieces: a crash loses the chunk
 * being recorded (at most `chunkMs`).
 *
 * If the next recorder can't be prepared (30 Oct, the phone locked: one
 * part grew to 6.8 min), the chunk simply goes on, the failure is said once
 * (`onPrepareFailed`) and the rotation is tried again after `retryMs`; one
 * rotation runs at a time. The iPhone's source cuts a part that got long
 * anyway into chunk-long pieces (lib/m4aSplit).
 *
 * expo-audio itself is passed in (`createRecorder`), so this is tested with
 * stand-ins. Times are Date.now() (ms).
 */

/** What this uses of an expo-audio AudioRecorder. */
export interface NativeRecorderLike {
  prepareToRecordAsync(): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  readonly isRecording: boolean;
  readonly uri: string | null;
  getStatus(): { isRecording: boolean; metering?: number };
  release(): void;
}

export interface NativeChunk {
  seq: number;
  uri: string;
  /** Where it starts in the recording, and its length (ms). */
  startMs: number;
  durationMs: number;
}

export interface NativeChunkRecorderOptions {
  chunkMs: number;
  overlapMs: number;
  createRecorder: () => NativeRecorderLike;
  /** Chunks in their order. */
  onChunk: (chunk: NativeChunk) => void;
  onLost?: () => void;
  onOverlapRefused?: () => void;
  from?: { seq: number; ms: number };
  now?: () => number;
  /** How often a recorder that stopped by itself is looked for (ms). */
  watchMs?: number;
  /** The next recorder couldn't be prepared (said once until one is prepared again). */
  onPrepareFailed?: (err: unknown) => void;
  /** After a rotation that couldn't happen (no next recorder), how soon it's tried again (ms). */
  retryMs?: number;
}

const RETRY_MS = 2000;

interface Rec {
  recorder: NativeRecorderLike;
  seq: number;
  startedAt: number;
  startMs: number;
  ended: boolean;
}

export class NativeChunkRecorder {
  private current: Rec | null = null;
  private finishing: { rec: Rec; timer: ReturnType<typeof setTimeout>; done: () => void } | null = null;
  /** The next recorder, prepared ahead so a rotation starts it at once. */
  private next: Promise<NativeRecorderLike | null> | null = null;
  private seq: number;
  private origin: number | null = null;
  private readonly base: number;
  private pausedMs = 0;
  private pausedAt: number | null = null;
  private stoppedAt: number | null = null;
  private endMs: number;
  private overlap: boolean;
  private lostSaid = false;
  private rotateTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  /** A rotation is under way: the next tick waits (two would take the same next recorder). */
  private rotating = false;
  /** A rotation was skipped: once one happens, the 30 seconds count from it. */
  private behind = false;
  private prepareFailing = false;
  private readonly pending = new Set<Promise<void>>();
  private readonly ready = new Map<number, NativeChunk | null>();
  private nextToHand: number;
  private readonly now: () => number;

  constructor(private readonly options: NativeChunkRecorderOptions) {
    this.now = options.now ?? Date.now;
    this.seq = options.from?.seq ?? 0;
    this.nextToHand = this.seq;
    this.base = options.from?.ms ?? 0;
    this.endMs = this.base;
    this.overlap = options.overlapMs > 0;
  }

  get recording(): boolean {
    return this.current !== null || this.pausedAt !== null;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Two recorders at a time worked (false once iOS refused it). */
  get overlapping(): boolean {
    return this.overlap;
  }

  elapsedMs(): number {
    if (this.origin === null) return this.base;
    if (this.pausedAt !== null) return Math.max(this.base, this.endMs, Math.round(this.at(this.pausedAt)));
    return Math.max(this.base, Math.round(this.at(this.stoppedAt ?? this.now())));
  }

  /** The current recorder's loudness, 0 to 1 (metering is dBFS, −160 to 0). */
  level(): number {
    const db = this.current?.recorder.getStatus().metering;
    if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
    return Math.min(1, Math.max(0, (db + 50) / 50));
  }

  async start(): Promise<void> {
    if (this.current) throw new Error('Already recording.');
    this.stoppedAt = null;
    const recorder = await this.prepared();
    const rec = this.begin(recorder, false);
    if (!recorder.isRecording) {
      // As if never started, so a second try hands its chunks over from the same number.
      this.seq = rec.seq;
      this.origin = null;
      recorder.release();
      throw new Error('The microphone could not be started.');
    }
    this.current = rec;
    this.afterStart();
  }

  async pause(): Promise<void> {
    if (!this.current || this.pausedAt !== null) return;
    this.clearTimers();
    this.pausedAt = this.now();
    await this.endFinishing();
    const rec = this.current;
    this.current = null;
    await this.end(rec);
    await this.settle();
  }

  async resume(): Promise<void> {
    if (this.pausedAt === null || this.current) return;
    const recorder = await (this.next ?? this.prepared());
    this.next = null;
    if (!recorder) throw new Error('The microphone could not be started.');
    const pausedAt = this.pausedAt;
    const pausedMs = this.pausedMs;
    const rec = this.begin(recorder, true);
    if (!recorder.isRecording) {
      // Still paused, as before the try.
      this.seq = rec.seq;
      this.pausedAt = pausedAt;
      this.pausedMs = pausedMs;
      recorder.release();
      throw new Error('The microphone could not be started.');
    }
    this.current = rec;
    this.lostSaid = false;
    this.afterStart();
  }

  async stop(): Promise<void> {
    this.clearTimers();
    if (this.stoppedAt === null) this.stoppedAt = this.pausedAt ?? this.now();
    await this.endFinishing();
    if (this.current) {
      const rec = this.current;
      this.current = null;
      await this.end(rec);
    }
    const spare = await this.next?.catch(() => null);
    this.next = null;
    spare?.release();
    await this.settle();
  }

  private at(t: number): number {
    return this.base + (this.origin === null ? 0 : t - this.origin) - this.pausedMs;
  }

  private async prepared(): Promise<NativeRecorderLike> {
    const recorder = this.options.createRecorder();
    await recorder.prepareToRecordAsync();
    this.prepareFailing = false;
    return recorder;
  }

  /** prepared(), or null when it fails (said once until one is prepared again). */
  private preparedOrNull(): Promise<NativeRecorderLike | null> {
    return this.prepared().catch((err) => {
      if (!this.prepareFailing) this.options.onPrepareFailed?.(err);
      this.prepareFailing = true;
      return null;
    });
  }

  /** The next recorder, ready before it's needed. */
  private prepareNext(): void {
    if (this.next) return;
    this.next = this.preparedOrNull();
  }

  private afterStart(): void {
    this.startRotation();
    this.watchTimer = setInterval(() => this.watch(), this.options.watchMs ?? 1000);
    this.prepareNext();
  }

  private startRotation(): void {
    if (this.rotateTimer) clearInterval(this.rotateTimer);
    this.rotateTimer = setInterval(() => this.tick(), this.options.chunkMs);
  }

  private tick(): void {
    if (this.rotating) return;
    this.rotating = true;
    this.track(
      this.rotate().finally(() => {
        this.rotating = false;
      }),
    );
  }

  private clearTimers(): void {
    if (this.rotateTimer) clearInterval(this.rotateTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.rotateTimer = null;
    this.retryTimer = null;
    this.watchTimer = null;
  }

  /** A rotation that couldn't happen is tried again soon, not a whole chunk later. */
  private retrySoon(): void {
    this.behind = true;
    if (this.retryTimer || !this.rotateTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.tick();
    }, this.options.retryMs ?? RETRY_MS);
  }

  /** A new chunk began: after a late rotation, the next one comes a whole chunk later. */
  private rotated(): void {
    if (!this.behind) return;
    this.behind = false;
    if (this.rotateTimer) this.startRotation();
  }

  /** Starts `recorder` as the next chunk; after a pause the paused time ends here. */
  private begin(recorder: NativeRecorderLike, afterPause: boolean): Rec {
    recorder.record();
    const startedAt = this.now();
    if (this.origin === null) this.origin = startedAt;
    if (afterPause) {
      this.pausedMs = this.base + (startedAt - this.origin) - this.endMs;
      this.pausedAt = null;
    }
    return { recorder, seq: this.seq++, startedAt, startMs: Math.max(0, Math.round(this.at(startedAt))), ended: false };
  }

  private async rotate(): Promise<void> {
    const old = this.current;
    if (!old) return;
    const fresh = (await this.next) ?? (await this.preparedOrNull());
    this.next = null;
    if (!fresh || this.current !== old) {
      fresh?.release();
      // The chunk goes on (nothing is lost); it's cut later if it gets long (the iPhone's source).
      if (!fresh && this.current === old) this.retrySoon();
      return;
    }
    if (this.overlap) {
      const seqBefore = this.seq;
      const rec = this.begin(fresh, false);
      if (fresh.isRecording) {
        this.current = rec;
        this.rotated();
        await this.endFinishing();
        await new Promise<void>((done) => {
          this.finishing = { rec: old, timer: setTimeout(() => void this.endFinishing(), this.options.overlapMs), done };
        });
        // Not after a Stop or Pause during the overlap (nothing would let it go).
        if (this.current === rec) this.prepareNext();
        return;
      }
      // iOS refused a second recorder while one records: restart from now on.
      this.seq = seqBefore;
      this.overlap = false;
      this.options.onOverlapRefused?.();
    }
    await this.end(old);
    if (this.current !== old) {
      fresh.release();
      return;
    }
    this.current = this.begin(fresh, false);
    this.rotated();
    this.prepareNext();
  }

  private async endFinishing(): Promise<void> {
    const f = this.finishing;
    if (!f) return;
    this.finishing = null;
    clearTimeout(f.timer);
    await this.end(f.rec);
    f.done();
  }

  private async end(rec: Rec): Promise<void> {
    if (rec.ended) return;
    rec.ended = true;
    const stoppedAt = this.now();
    await rec.recorder.stop().catch(() => {});
    const uri = rec.recorder.uri;
    rec.recorder.release();
    const durationMs = Math.max(1, Math.round(stoppedAt - rec.startedAt));
    if (uri) this.endMs = Math.max(this.endMs, rec.startMs + durationMs);
    this.ready.set(rec.seq, uri ? { seq: rec.seq, uri, startMs: rec.startMs, durationMs } : null);
    this.handOver();
  }

  private handOver(): void {
    while (this.ready.has(this.nextToHand)) {
      const chunk = this.ready.get(this.nextToHand);
      this.ready.delete(this.nextToHand);
      this.nextToHand += 1;
      if (chunk) this.options.onChunk(chunk);
    }
  }

  /** A recorder that stopped by itself (a call, the microphone taken): said once. */
  private watch(): void {
    const rec = this.current;
    if (!rec || rec.ended || this.pausedAt !== null || this.lostSaid) return;
    if (!rec.recorder.isRecording) {
      this.lostSaid = true;
      this.options.onLost?.();
    }
  }

  private track(p: Promise<void>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p)).catch(() => {});
  }

  private async settle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending].map((p) => p.catch(() => {})));
  }
}
