// Steps 5.1–5.2, iPhone half: recording in chunks with expo-audio's recorders
// (stand-ins here): 30-second chunks overlapping by 500 ms in their order,
// the fallback when iOS refuses two recorders at once, pause and resume with
// a continuous timeline, a recorder that stopped by itself, the waveform's
// level, going on after a crash.
import { NativeChunkRecorder, type NativeChunk, type NativeRecorderLike } from '../nativeChunkRecorder';

const log: string[] = [];

class FakeRecorder implements NativeRecorderLike {
  static made = 0;
  static recordingNow = 0;
  /** How many may record at once (iOS's answer to a second recorder). */
  static maxAtOnce = 2;
  readonly id = FakeRecorder.made++;
  isRecording = false;
  uri: string | null = null;
  metering = -25;
  async prepareToRecordAsync() {
    this.uri = `file:///caches/r${this.id}.m4a`;
  }
  record() {
    if (FakeRecorder.recordingNow >= FakeRecorder.maxAtOnce) return;
    this.isRecording = true;
    FakeRecorder.recordingNow++;
    log.push(`start ${this.id} @${Date.now()}`);
  }
  async stop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    FakeRecorder.recordingNow--;
    log.push(`stop ${this.id} @${Date.now()}`);
  }
  getStatus() {
    return { isRecording: this.isRecording, metering: this.metering };
  }
  release() {}
  /** Stopped by iOS (a phone call). */
  interrupt() {
    this.isRecording = false;
    FakeRecorder.recordingNow--;
  }
}

const made: FakeRecorder[] = [];
const make = (extra: Partial<ConstructorParameters<typeof NativeChunkRecorder>[0]> = {}) => {
  const chunks: NativeChunk[] = [];
  const recorder = new NativeChunkRecorder({
    chunkMs: 30000,
    overlapMs: 500,
    createRecorder: () => {
      const r = new FakeRecorder();
      made.push(r);
      return r;
    },
    onChunk: (c) => chunks.push(c),
    now: () => Date.now(),
    ...extra,
  });
  return { recorder, chunks };
};
const shape = (chunks: NativeChunk[]) => chunks.map((c) => [c.seq, c.startMs, c.durationMs]);

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  log.length = 0;
  made.length = 0;
  FakeRecorder.made = 0;
  FakeRecorder.recordingNow = 0;
  FakeRecorder.maxAtOnce = 2;
});
afterEach(() => jest.useRealTimers());

describe('recording in chunks on the iPhone', () => {
  it('30-second chunks overlapping by 500 ms, in their order, each its own file', async () => {
    const { recorder, chunks } = make();
    await recorder.start();
    await jest.advanceTimersByTimeAsync(30000);
    // The next one started first; the previous one still records for 500 ms.
    expect(FakeRecorder.recordingNow).toBe(2);
    await jest.advanceTimersByTimeAsync(500);
    expect(shape(chunks)).toEqual([[0, 0, 30500]]);
    await jest.advanceTimersByTimeAsync(39500);
    await recorder.stop();
    expect(shape(chunks)).toEqual([
      [0, 0, 30500],
      [1, 30000, 30500],
      [2, 60000, 10000],
    ]);
    expect(log).toEqual(['start 0 @0', 'start 1 @30000', 'stop 0 @30500', 'start 2 @60000', 'stop 1 @60500', 'stop 2 @70000']);
    expect(new Set(chunks.map((c) => c.uri)).size).toBe(3);
    expect(recorder.overlapping).toBe(true);
    expect(FakeRecorder.recordingNow).toBe(0);
  });

  it('Stop during an overlap still hands both chunks over in their order', async () => {
    const { recorder, chunks } = make();
    await recorder.start();
    await jest.advanceTimersByTimeAsync(30200);
    await recorder.stop();
    expect(shape(chunks)).toEqual([
      [0, 0, 30200],
      [1, 30000, 200],
    ]);
  });

  it('if iOS refuses a second recorder, the joins restart instead (said once), nothing out of order', async () => {
    FakeRecorder.maxAtOnce = 1;
    const refused = jest.fn();
    const { recorder, chunks } = make({ onOverlapRefused: refused });
    await recorder.start();
    await jest.advanceTimersByTimeAsync(60000);
    await recorder.stop();
    expect(shape(chunks)).toEqual([
      [0, 0, 30000],
      [1, 30000, 30000],
      [2, 60000, 1],
    ]);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(recorder.overlapping).toBe(false);
  });

  it('pause ends the chunk and lets the microphone go; the paused time is left out; resume goes on', async () => {
    const { recorder, chunks } = make();
    await recorder.start();
    await jest.advanceTimersByTimeAsync(10000);
    await recorder.pause();
    expect(recorder.paused).toBe(true);
    expect(FakeRecorder.recordingNow).toBe(0);
    await jest.advanceTimersByTimeAsync(5000);
    expect(recorder.elapsedMs()).toBe(10000);
    await recorder.resume();
    await jest.advanceTimersByTimeAsync(3000);
    expect(recorder.elapsedMs()).toBe(13000);
    await recorder.stop();
    // The chunk after the pause starts exactly where the one before ended.
    expect(shape(chunks)).toEqual([
      [0, 0, 10000],
      [1, 10000, 3000],
    ]);
  });

  it('a recorder stopped by iOS (a call) is said once, as lost', async () => {
    const lost = jest.fn();
    const { recorder } = make({ onLost: lost });
    await recorder.start();
    await jest.advanceTimersByTimeAsync(2000);
    made[0].interrupt();
    await jest.advanceTimersByTimeAsync(3000);
    expect(lost).toHaveBeenCalledTimes(1);
    await recorder.stop();
  });

  it('the waveform’s level from the metering (dBFS); going on with a recording after a crash', async () => {
    const { recorder, chunks } = make({ from: { seq: 4, ms: 90000 } });
    expect(recorder.level()).toBe(0);
    await recorder.start();
    expect(recorder.level()).toBe(0.5);
    made[0].metering = -160;
    expect(recorder.level()).toBe(0);
    await jest.advanceTimersByTimeAsync(5000);
    await recorder.stop();
    expect(shape(chunks)).toEqual([[4, 90000, 5000]]);
  });

  it('a microphone that can’t start says so', async () => {
    FakeRecorder.maxAtOnce = 0;
    const { recorder } = make();
    await expect(recorder.start()).rejects.toThrow('could not be started');
    expect(recorder.recording).toBe(false);
  });
});
