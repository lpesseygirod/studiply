// Step 5.3: the recording flow around the recorder service: Start (microphone
// first, consent, the lecture, its status), Stop (wait until every chunk is
// sent and the live transcript has caught up, then "transcribing" with the
// length) and interrupted recordings (Continue, Finish). Nothing is sent.
import { createRecordingFlow, type FlowDeps } from '../recording-flow';
import type { ChunkInfo, DiscardedRecording, RecorderService, RecorderState, RecordingMeta } from '../recorder/types';

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
    /** Where the lecture's audio already ends on the server (step 5.7). */
    audioEnd: null as { seq: number; ms: number } | null,
    /** Cancel recording: what the recorder reports it discarded, and its clean-up for a late chunk. */
    discarded: { lectureId: L, origin: 'new', from: { seq: 0, ms: 0 }, toSeq: 3, keepBelow: 2, keptMs: 60_000 } as DiscardedRecording,
    meta: {} as Partial<RecordingMeta>,
    late: null as (() => Promise<void>) | null,
  };
  const recorder: RecorderService = {
    supported: true,
    start: async ({ lectureId, transcribe, after }) => {
      if (opts.startFails) throw new Error('Permission denied');
      calls.push(`recorder.start ${lectureId} transcribe=${transcribe}${after ? ` after ${after.seq}/${after.ms}` : ''}`);
      state = { lectureId, status: 'recording', microphoneLost: false };
    },
    discard: async (id, { cleanUp }) => {
      calls.push(`recorder.discard ${id}`);
      state = { lectureId: null, status: 'idle', microphoneLost: false };
      world.late = () => cleanUp(world.discarded);
      return world.discarded;
    },
    pause: async () => {},
    resume: async () => {},
    stop: async () => {
      calls.push('recorder.stop');
      state = { lectureId: null, status: 'idle', microphoneLost: false };
    },
    recover: async () => world.interrupted,
    resendWaiting: async () => 0,
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
      meta: { transcribe: world.transcribe, ...world.meta } as RecordingMeta,
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
    convertToLecture: async (id, language) => {
      calls.push(`convert ${id} ${language}`);
      return async () => {
        calls.push(`put back ${id}`);
      };
    },
    audioEnd: async (id) => {
      calls.push(`audio end ${id}`);
      return world.audioEnd;
    },
    setStatus: async (id, status, seconds) => {
      calls.push(`status ${id} ${status}${seconds !== undefined ? ` ${seconds}s` : ''}`);
    },
    titleOf: async (id) => `Title of ${id}`,
    statusOf: async (id) => world.serverStatus[id] ?? 'ready',
    isOffline: () => world.offline,
    discardRecording: async (p) => {
      calls.push(`discard ${p.origin} ${p.lectureId}${p.before ? ` before ${p.before}` : ''}`);
    },
    cleanUpLate: async (p) => {
      calls.push(`clean up late ${p.origin} ${p.lectureId}`);
    },
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

describe('step 5.7: Record inside a document', () => {
  it('a plain document: the microphone, consent, then it becomes a lecture, "recording", the recorder', async () => {
    const r = rig();
    await r.flow.startIn({ fileId: 'doc-1', isLecture: false, language: 'es' });
    expect(r.calls).toEqual(['microphone', 'consent', 'convert doc-1 es', 'status doc-1 recording', 'recorder.start doc-1 transcribe=true']);
  });

  it('cancelled at the microphone: nothing changes, it stays a plain document', async () => {
    const r = rig({ micRefused: true });
    await expect(r.flow.startIn({ fileId: 'doc-1', isLecture: false, language: 'es' })).rejects.toThrow('Permission denied');
    expect(r.calls).toEqual(['microphone']);
  });

  it('the recorder can’t start after it became a lecture: it is put back', async () => {
    const r = rig({ startFails: true });
    await expect(r.flow.startIn({ fileId: 'doc-1', isLecture: false, language: 'es' })).rejects.toThrow('Permission denied');
    expect(r.calls).toEqual(['microphone', 'consent', 'convert doc-1 es', 'status doc-1 recording', 'put back doc-1']);
  });

  it('a lecture records again after the audio Studiply already has; refused, it gets its status back', async () => {
    const r = rig();
    r.world.audioEnd = { seq: 4, ms: 121_000 };
    await r.flow.startIn({ fileId: L, isLecture: true, language: 'es' });
    expect(r.calls).toEqual(['microphone', 'consent', `audio end ${L}`, `status ${L} recording`, `recorder.start ${L} transcribe=true after 4/121000`]);

    const refused = rig({ startFails: true });
    refused.world.serverStatus[L] = 'completed';
    await expect(refused.flow.startIn({ fileId: L, isLecture: true, language: 'es' })).rejects.toThrow();
    expect(refused.calls.slice(-1)).toEqual([`status ${L} completed`]);
  });

  it('refused while something already records', async () => {
    const r = rig();
    await r.flow.start(params);
    await expect(r.flow.startIn({ fileId: 'doc-1', isLecture: false, language: 'es' })).rejects.toThrow('already running');
  });
});

describe('Cancel recording (Lea, 6 Nov): Discard', () => {
  it('a new lecture: the recorder discards (no Stop, no hand-off), the status keeps what reached Studiply, then the server half', async () => {
    const r = rig();
    await r.flow.start(params);
    const before = r.calls.length;
    const plan = await r.flow.discard();
    expect(plan).toMatchObject({ lectureId: L, origin: 'new', keepBelow: 2, before: null });
    expect(r.calls.slice(before)).toEqual([`recorder.discard ${L}`, `status ${L} transcribing 60s`, `discard new ${L}`]);
    // Never the hand-off of Stop (Saving…, waiting for transcripts).
    expect(r.calls).not.toContain('recorder.stop');
    expect(r.seen).toEqual([]);
  });

  it('a new lecture none of whose audio reached Studiply: a draft', async () => {
    const r = rig();
    await r.flow.start(params);
    r.world.discarded = { ...r.world.discarded, keepBelow: 0, keptMs: 0 };
    await r.flow.discard();
    expect(r.calls.slice(-2)).toEqual([`status ${L} draft 0s`, `discard new ${L}`]);
  });

  it('a lecture recorded again: its status before and its earlier length back', async () => {
    const r = rig();
    r.world.serverStatus[L] = 'completed';
    r.world.audioEnd = { seq: 4, ms: 121_000 };
    await r.flow.startIn({ fileId: L, isLecture: true, language: 'es' });
    r.world.discarded = { lectureId: L, origin: 'lecture', from: { seq: 4, ms: 121_000 }, toSeq: 6, keepBelow: 5, keptMs: 151_000 };
    await r.flow.discard();
    expect(r.calls.slice(-3)).toEqual([`recorder.discard ${L}`, `status ${L} completed 121s`, `discard lecture ${L} before completed`]);
  });

  it('a document that became a lecture: no status (it is a document again: the server half)', async () => {
    const r = rig();
    await r.flow.startIn({ fileId: 'doc-1', isLecture: false, language: 'es' });
    r.world.discarded = { lectureId: 'doc-1', origin: 'document', from: { seq: 0, ms: 0 }, toSeq: 2, keepBelow: 2, keptMs: 60_000 };
    await r.flow.discard();
    expect(r.calls.slice(-2)).toEqual(['recorder.discard doc-1', 'discard document doc-1']);
  });

  it('a chunk that lands after Discard: the clean-up runs with the same plan', async () => {
    const r = rig();
    await r.flow.start(params);
    await r.flow.discard();
    await r.world.late?.();
    expect(r.calls.at(-1)).toBe(`clean up late new ${L}`);
  });

  it('nothing to discard: not recording, or after Stop ("Saving…")', async () => {
    const r = rig();
    expect(await r.flow.discard()).toBeNull();
    expect(await r.flow.discardPreview()).toBeNull();
    await r.flow.start(params);
    r.world.chunks = [chunk(0, 'on-device')];
    let during: unknown = 'not asked';
    r.world.onWait = () => {
      if (during === 'not asked') {
        during = null;
        void r.flow.discard().then((v) => (during = v));
      }
      r.world.chunks[0].state = 'transcribed';
    };
    await r.flow.stop();
    expect(during).toBeNull();
    expect(r.calls).not.toContain(`recorder.discard ${L}`);
  });

  it('the preview says what it would do, from the recorder', async () => {
    const r = rig();
    await r.flow.start(params);
    r.world.meta = { origin: 'lecture', from: { seq: 4, ms: 121_000 } };
    expect(await r.flow.discardPreview()).toEqual({ lectureId: L, origin: 'lecture', fromMs: 121_000 });
  });
});
