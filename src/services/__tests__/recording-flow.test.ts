// Step 5.3: the recording flow around the recorder service: Start (microphone
// first, consent, the lecture, its status), Stop (wait until every chunk is
// sent and the live transcript has caught up, then "transcribing" with the
// length) and interrupted recordings (Continue, Finish). Nothing is sent.
import { createRecordingFlow, type FlowDeps } from '../recording-flow';
import type { ChunkInfo, RecorderService, RecorderState, RecordingMeta } from '../recorder/types';

const L = 'lecture-1';
const chunk = (seq: number, state: ChunkInfo['state'], durationMs = 30000): ChunkInfo => ({
  seq,
  startMs: seq * 29500,
  durationMs,
  sizeBytes: 1000,
  state,
  transcriptError: null,
  recovered: false,
});

function rig(opts: { consent?: boolean; micRefused?: boolean; startFails?: boolean; offline?: boolean } = {}) {
  const calls: string[] = [];
  let state: RecorderState = { lectureId: null, status: 'idle', microphoneLost: false };
  const world = {
    chunks: [] as ChunkInfo[],
    transcribe: true,
    interrupted: [] as RecordingMeta[],
    /** Recordings stopped on this device, and their lectures' status on the server. */
    stopped: [] as RecordingMeta[],
    serverStatus: {} as Record<string, string>,
    /** Runs at every wait of the flow (the queue moving on meanwhile). */
    onWait: (() => {}) as () => void,
    clock: 0,
    offline: opts.offline ?? false,
  };
  const recorder: RecorderService = {
    supported: true,
    start: async ({ lectureId, transcribe }) => {
      if (opts.startFails) throw new Error('Permission denied');
      calls.push(`recorder.start ${lectureId} transcribe=${transcribe}`);
      state = { lectureId, status: 'recording', microphoneLost: false };
    },
    pause: async () => {},
    resume: async () => {},
    stop: async () => {
      calls.push('recorder.stop');
      state = { lectureId: null, status: 'idle', microphoneLost: false };
    },
    recover: async () => world.interrupted,
    recordings: async () => [...world.interrupted, ...world.stopped],
    playback: async () => [],
    continueRecording: async (id) => {
      calls.push(`recorder.continue ${id}`);
      state = { lectureId: id, status: 'recording', microphoneLost: false };
    },
    finish: async (id) => {
      calls.push(`recorder.finish ${id}`);
    },
    state: () => state,
    elapsedMs: () => 125_400,
    level: () => 0,
    snapshot: async () => ({
      meta: { transcribe: world.transcribe } as RecordingMeta,
      chunks: world.chunks.map((c) => ({ ...c })),
      transcript: [],
    }),
    subscribe: () => () => {},
  };
  const deps: FlowDeps = {
    recorder,
    openMicrophone: async () => {
      calls.push('microphone');
      if (opts.micRefused) throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    },
    allowTranscription: async () => {
      calls.push('consent');
      return opts.consent ?? true;
    },
    createLecture: async (p) => {
      calls.push(`create ${p.title} in ${p.courseId}/${p.folderId}`);
      return L;
    },
    setStatus: async (id, status, seconds) => {
      calls.push(`status ${id} ${status}${seconds !== undefined ? ` ${seconds}s` : ''}`);
    },
    titleOf: async (id) => `Title of ${id}`,
    statusOf: async (id) => world.serverStatus[id] ?? 'ready',
    isOffline: () => world.offline,
    wait: async (ms) => {
      world.clock += ms;
      world.onWait();
    },
    now: () => world.clock,
  };
  const flow = createRecordingFlow(deps);
  const seen: (string | null)[] = [];
  flow.subscribe(() => {
    const s = flow.getState().saving;
    seen.push(s ? `left ${s.left}${s.offline ? ' offline' : ''}${s.finishing ? ' finishing' : ''}` : null);
  });
  return { flow, calls, world, seen };
}

const params = { userId: 'u1', title: 'Tema 1', courseId: 'c1', folderId: 'f1', mode: 'lecture' as const, language: 'es' };

describe('the recording flow', () => {
  it('Start: the microphone first, then consent, the lecture in its folder, "recording", the recorder', async () => {
    const r = rig();
    expect(await r.flow.start(params)).toBe(L);
    expect(r.calls).toEqual(['microphone', 'consent', 'create Tema 1 in c1/f1', `status ${L} recording`, `recorder.start ${L} transcribe=true`]);
  });

  it('declined consent records anyway, without a live transcript', async () => {
    const r = rig({ consent: false });
    await r.flow.start(params);
    expect(r.calls.at(-1)).toBe(`recorder.start ${L} transcribe=false`);
  });

  it('a refused microphone makes no lecture', async () => {
    const r = rig({ micRefused: true });
    await expect(r.flow.start(params)).rejects.toThrow('Permission denied');
    expect(r.calls).toEqual(['microphone']);
  });

  it('a recorder that can’t start leaves the lecture as a draft', async () => {
    const r = rig({ startFails: true });
    await expect(r.flow.start(params)).rejects.toThrow('Permission denied');
    expect(r.calls.slice(-2)).toEqual([`status ${L} recording`, `status ${L} draft`]);
  });

  it('one recording at a time', async () => {
    const r = rig();
    await r.flow.start(params);
    await expect(r.flow.start(params)).rejects.toThrow('already running');
  });

  it('Stop: waits until every chunk is sent and transcribed, then "transcribing" with the length', async () => {
    const r = rig();
    await r.flow.start(params);
    r.world.chunks = [chunk(0, 'transcribed'), chunk(1, 'on-device'), chunk(2, 'on-device', 4000)];
    // The queue moves on while the flow waits: one upload per wait, then the transcriptions.
    const steps: (() => void)[] = [
      () => (r.world.chunks[1].state = 'uploaded'),
      () => (r.world.chunks[2].state = 'uploaded'),
      () => (r.world.chunks[1].state = 'transcribed'),
      () => (r.world.chunks[2].state = 'transcribed'),
    ];
    r.world.onWait = () => steps.shift()?.();
    expect(await r.flow.stop()).toBe(L);
    expect(r.calls.slice(-2)).toEqual(['recorder.stop', `status ${L} transcribing 125s`]);
    expect(r.seen).toEqual(['left 0', 'left 2', 'left 1', 'left 0 finishing', 'left 0 finishing', 'left 0', null]);
    expect(r.flow.getState().saving).toBeNull();
  });

  it('Stop offline: says the parts will be sent when back online, and waits for them', async () => {
    const r = rig({ offline: true });
    await r.flow.start(params);
    r.world.chunks = [chunk(0, 'on-device')];
    let waits = 0;
    r.world.onWait = () => {
      waits++;
      if (waits === 5) {
        r.world.offline = false;
        r.world.chunks[0].state = 'transcribed';
      }
    };
    await r.flow.stop();
    expect(r.seen.slice(0, 3)).toEqual(['left 0', 'left 1 offline', 'left 1 offline']);
    expect(r.calls.at(-1)).toBe(`status ${L} transcribing 125s`);
  });

  it('Stop gives the live transcript at most a minute after the uploads (the after-recording step does the rest)', async () => {
    const r = rig();
    await r.flow.start(params);
    r.world.chunks = [chunk(0, 'uploaded')];
    await r.flow.stop();
    expect(r.world.clock).toBe(60_000);
    expect(r.calls.at(-1)).toBe(`status ${L} transcribing 125s`);
  });

  it('without live transcription, Stop waits only for the uploads', async () => {
    const r = rig({ consent: false });
    await r.flow.start(params);
    r.world.transcribe = false;
    r.world.chunks = [chunk(0, 'uploaded')];
    await r.flow.stop();
    expect(r.world.clock).toBe(0);
  });

  it('a page closed while "Saving…": on the next start its lecture is handed off in the background, never left "recording"', async () => {
    const r = rig();
    r.world.stopped = [
      { lectureId: 'closed', status: 'stopped' } as RecordingMeta,
      { lectureId: 'done', status: 'stopped' } as RecordingMeta,
    ];
    r.world.serverStatus = { closed: 'recording', done: 'transcribing' };
    // Its last chunk still uploading when the page went.
    r.world.chunks = [chunk(0, 'transcribed'), chunk(1, 'on-device', 9000)];
    r.world.onWait = () => (r.world.chunks[1].state = 'transcribed');
    expect(await r.flow.recover()).toEqual([]);
    await r.flow.settled;
    // Only the one still "recording"; its length from its chunks (29.5 s + 9 s), nothing shown on screen.
    expect(r.calls).toEqual(['status closed transcribing 39s']);
    expect(r.seen).toEqual([null]);
  });

  it('an interrupted recording: offered with its title; Continue records on; Finish hands it off with its length', async () => {
    const r = rig();
    r.world.interrupted = [
      { lectureId: 'a', status: 'interrupted' } as RecordingMeta,
      { lectureId: 'b', status: 'interrupted' } as RecordingMeta,
    ];
    expect(await r.flow.recover()).toEqual([
      { lectureId: 'a', title: 'Title of a' },
      { lectureId: 'b', title: 'Title of b' },
    ]);
    await r.flow.continueRecording('a');
    expect(r.calls.slice(-3)).toEqual(['microphone', 'recorder.continue a', 'status a recording']);
    expect(r.flow.getState().interrupted.map((x) => x.lectureId)).toEqual(['b']);

    r.world.chunks = [chunk(0, 'transcribed'), chunk(1, 'transcribed', 12000)];
    expect(await r.flow.finish('b')).toBe('b');
    // The recording ends where its last chunk ends: 29.5 s + 12 s.
    expect(r.calls.slice(-2)).toEqual(['recorder.finish b', 'status b transcribing 42s']);
    expect(r.flow.getState().interrupted).toEqual([]);
  });
});
