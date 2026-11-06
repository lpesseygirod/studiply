/**
 * The recording flow (step 5.3) around the recorder service (./recorder):
 * what the setup's Start, the strip's and the bottom bar's Stop, and the
 * "Interrupted recording" banner do, shared by every screen so that leaving
 * a screen never stops anything.
 *
 *  - start: the microphone first (so a refusal leaves no empty lecture),
 *    transcription consent (declined: it records without a live transcript),
 *    the lecture, its status "recording", then the recorder.
 *  - stop: the recorder stops; the flow waits until every chunk has reached
 *    Studiply (offline it waits for the connection) and the live
 *    transcription has caught up (at most a minute), then the lecture moves
 *    on to "transcribing" with its length, and the caller opens today's
 *    after-recording step.
 *  - recover: a recording the page lost (a reload, a crash) is offered with
 *    its title: Continue records on, Finish hands it off like Stop.
 *  - startIn (step 5.7): the Record button inside a document; a plain
 *    document becomes a lecture only once the student has really started.
 *  - discard (Cancel recording, Lea 6 Nov): only after the student confirmed;
 *    the recorder closes the microphone and drops the audio from the device,
 *    then the lecture's status and the server half (./discard-recording).
 *    No summary request, no AI call. Not offered after Stop ("Saving…") or
 *    for an interrupted recording.
 *
 * Everything it uses is passed in (tested with fakes); the app's flow is
 * ./recording.service.
 */

import type { DiscardedRecording, RecorderService, RecordingOrigin } from './recorder/types';

export interface InterruptedRecording {
  lectureId: string;
  title: string;
}

export interface FlowState {
  /** After Stop or Finish, until the recording is handed off. */
  saving: { lectureId: string; left: number; offline: boolean; finishing: boolean } | null;
  interrupted: InterruptedRecording[];
}

export interface StartParams {
  userId: string;
  title: string;
  courseId?: string | null;
  folderId?: string | null;
  mode: 'lecture' | 'standard' | 'discussion';
  language: string;
}

/** A lecture's status as the flow sets it (and puts back): the app's session names (session.service). */
export type LectureStatus = 'draft' | 'recording' | 'transcribing' | 'processing' | 'review' | 'completed' | 'failed';

/**
 * Cancel recording (Lea, 6 Nov): what the recorder discarded, with the lecture's status before it
 * recorded again (case "lecture"; null otherwise or when not known here).
 */
export interface DiscardPlan extends DiscardedRecording {
  before: LectureStatus | null;
}

/** What Discard will do, for its question (before anything happens). */
export interface DiscardPreview {
  lectureId: string;
  origin: RecordingOrigin;
  /** Where this recording starts on the lecture's timeline. */
  fromMs: number;
}

/** Step 5.7: recording from inside a document: a lecture, or a plain document that becomes one. */
export interface StartInParams {
  fileId: string;
  isLecture: boolean;
  language: string;
}

export interface FlowDeps {
  recorder: RecorderService;
  /** Asks for the microphone before anything is made (web: getUserMedia, then closed again). */
  openMicrophone: () => Promise<void>;
  /** True when the student allows transcription (asked once). */
  allowTranscription: () => Promise<boolean>;
  createLecture: (p: StartParams) => Promise<string>;
  /**
   * Step 5.7: turns a plain document into a lecture (its first tab becomes My notes); returns how to
   * put it back if the recording can't start.
   */
  convertToLecture: (fileId: string, language: string) => Promise<() => Promise<void>>;
  /** Where a lecture's audio already ends on Studiply (recording again into it); throws when that can't be known. */
  audioEnd: (lectureId: string) => Promise<{ seq: number; ms: number } | null>;
  setStatus: (lectureId: string, status: LectureStatus, durationSeconds?: number) => Promise<void>;
  titleOf: (lectureId: string) => Promise<string>;
  /** The lecture's status on the server ('recording', 'transcribing'…). */
  statusOf: (lectureId: string) => Promise<string>;
  isOffline: () => boolean;
  /** Cancel recording: the notes and the server half (laptop at once; iPhone saved here and queued). */
  discardRecording: (plan: DiscardPlan) => Promise<void>;
  /** A job of a discarded recording wrote to the server after Discard: its rows and files removed again. */
  cleanUpLate: (plan: DiscardPlan) => Promise<void>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** How long Stop waits for the live transcription after the uploads (the after-recording step does the rest). */
const TRANSCRIPT_WAIT_MS = 60_000;
const POLL_MS = 500;

export function createRecordingFlow(deps: FlowDeps) {
  const { recorder } = deps;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  let state: FlowState = { saving: null, interrupted: [] };
  /** Recording again into a lecture (step 5.7): its status before, put back if the recording is discarded. */
  const statusBefore = new Map<string, LectureStatus>();
  const listeners = new Set<() => void>();
  const set = (change: Partial<FlowState>) => {
    state = { ...state, ...change };
    listeners.forEach((fn) => fn());
  };

  /**
   * Until every chunk is on the server and the live transcript has caught up (or a minute has
   * passed), then "transcribing" with the length. `quiet`: in the background, nothing shown.
   */
  async function handOff(lectureId: string, durationSeconds: number, quiet = false): Promise<void> {
    let sentAt: number | null = null;
    for (;;) {
      const snap = await recorder.snapshot(lectureId);
      const left = snap.chunks.filter((c) => c.state === 'on-device').length;
      const transcribing = snap.meta?.transcribe ? snap.chunks.filter((c) => c.state === 'uploaded').length : 0;
      if (left === 0 && sentAt === null) sentAt = now();
      if (!quiet) set({ saving: { lectureId, left, offline: left > 0 && deps.isOffline(), finishing: left === 0 && transcribing > 0 } });
      if (left === 0 && (transcribing === 0 || now() - (sentAt ?? now()) >= TRANSCRIPT_WAIT_MS)) break;
      await wait(POLL_MS);
    }
    await deps.setStatus(lectureId, 'transcribing', durationSeconds);
    if (!quiet) set({ saving: null });
  }

  /** Where a recording ends (s): its last chunk's end. */
  async function lengthOf(lectureId: string): Promise<number> {
    const snap = await recorder.snapshot(lectureId);
    return Math.round(snap.chunks.reduce((ms, c) => Math.max(ms, c.startMs + c.durationMs), 0) / 1000);
  }

  /**
   * Recordings stopped here whose hand-off never finished (the page was closed while
   * "Saving…"): their lecture still says "recording". Settled in the background, one by one.
   */
  async function settleStopped(): Promise<void> {
    for (const meta of await recorder.recordings()) {
      if (meta.status !== 'stopped' || settling.has(meta.lectureId) || state.saving?.lectureId === meta.lectureId) continue;
      if ((await deps.statusOf(meta.lectureId).catch(() => null)) !== 'recording') continue;
      settling.add(meta.lectureId);
      try {
        await handOff(meta.lectureId, await lengthOf(meta.lectureId), true);
      } finally {
        settling.delete(meta.lectureId);
      }
    }
  }
  const settling = new Set<string>();

  const flow = {
    getState: () => state,

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    /** Starts recording a new lecture; returns its id. */
    async start(p: StartParams): Promise<string> {
      if (recorder.state().status !== 'idle' || state.saving) throw new Error('A recording is already running.');
      await deps.openMicrophone();
      const transcribe = await deps.allowTranscription();
      const lectureId = await deps.createLecture(p);
      await deps.setStatus(lectureId, 'recording');
      try {
        await recorder.start({ lectureId, transcribe, origin: 'new' });
      } catch (err) {
        // The lecture stays, empty, as a draft (it can be recorded into later).
        await deps.setStatus(lectureId, 'draft').catch(() => {});
        throw err;
      }
      return lectureId;
    },

    /**
     * Step 5.7: the Record button inside a document. A lecture records again (after the audio it already
     * has); a plain document becomes a lecture, but only once the microphone and the consent question
     * are answered: cancelled before, nothing changes. If the recorder then can't start, everything is
     * put back (a document stays a document; a lecture gets its status back).
     */
    async startIn(p: StartInParams): Promise<void> {
      if (recorder.state().status !== 'idle' || state.saving) throw new Error('A recording is already running.');
      await deps.openMicrophone();
      const transcribe = await deps.allowTranscription();
      const lectureId = p.fileId;
      let putBack: () => Promise<void>;
      let after: { seq: number; ms: number } | null = null;
      if (p.isLecture) {
        const before = (await deps.statusOf(lectureId).catch(() => 'draft')) as LectureStatus;
        after = await deps.audioEnd(lectureId);
        putBack = () => deps.setStatus(lectureId, before);
        statusBefore.set(lectureId, before);
      } else {
        putBack = await deps.convertToLecture(lectureId, p.language);
        statusBefore.delete(lectureId);
      }
      try {
        await deps.setStatus(lectureId, 'recording');
        await recorder.start({ lectureId, transcribe, after, origin: p.isLecture ? 'lecture' : 'document' });
      } catch (err) {
        await putBack().catch((e) => console.warn('[recording] could not put the document back', e));
        throw err;
      }
    },

    /** Cancel recording: what Discard would do for the recording running now (null: nothing to discard). */
    async discardPreview(): Promise<DiscardPreview | null> {
      const { lectureId, status } = recorder.state();
      if (!lectureId || status === 'idle' || status === 'stopping' || state.saving) return null;
      const meta = (await recorder.snapshot(lectureId)).meta;
      return { lectureId, origin: meta?.origin ?? 'new', fromMs: meta?.from?.ms ?? 0 };
    },

    /**
     * Cancel recording (Lea, 6 Nov), once the student confirmed: the recorder stops and drops the audio
     * (./recorder: in-flight jobs waited for, nothing sent after), then the status and the server half.
     * Resolves with what was discarded (null when nothing was recording).
     */
    async discard(): Promise<DiscardPlan | null> {
      const { lectureId, status } = recorder.state();
      if (!lectureId || status === 'idle' || status === 'stopping' || state.saving) return null;
      const before = statusBefore.get(lectureId) ?? null;
      const planOf = (d: DiscardedRecording): DiscardPlan => ({ ...d, before: d.origin === 'lecture' ? before : null });
      const discarded = await recorder.discard(lectureId, { cleanUp: (d) => deps.cleanUpLate(planOf(d)) });
      if (!discarded) return null;
      const plan = planOf(discarded);
      statusBefore.delete(lectureId);
      // The lecture's status: a new one keeps what reached Studiply (its length); one recorded again gets
      // its status and length back; a document that became a lecture is a document again (the server half).
      if (plan.origin === 'new') {
        const kept = plan.keepBelow > plan.from.seq;
        await deps.setStatus(lectureId, kept ? 'transcribing' : 'draft', Math.round(plan.keptMs / 1000)).catch((err) => console.warn('[recording] could not set the status', err));
      } else if (plan.origin === 'lecture') {
        await deps.setStatus(lectureId, plan.before ?? 'transcribing', Math.round(plan.from.ms / 1000)).catch((err) => console.warn('[recording] could not set the status', err));
      }
      await deps.discardRecording(plan);
      return plan;
    },

    /** Stops and hands the recording off; resolves with the lecture once it can be processed. */
    async stop(): Promise<string | null> {
      const { lectureId, status } = recorder.state();
      if (!lectureId || status === 'idle' || status === 'stopping') return null;
      const seconds = Math.round(recorder.elapsedMs() / 1000);
      set({ saving: { lectureId, left: 0, offline: false, finishing: false } });
      try {
        await recorder.stop();
        await handOff(lectureId, seconds);
      } catch (err) {
        set({ saving: null });
        throw err;
      }
      return lectureId;
    },

    /**
     * Interrupted recordings (after a reload or a crash), with their titles. Recordings
     * stopped but never handed off are settled in the background (`settled` resolves then).
     */
    async recover(): Promise<InterruptedRecording[]> {
      const found = await recorder.recover();
      const interrupted = await Promise.all(
        found
          .filter((m) => m.status === 'interrupted')
          .map(async (m) => ({ lectureId: m.lectureId, title: await deps.titleOf(m.lectureId).catch(() => 'A lecture') })),
      );
      set({ interrupted });
      flow.settled = settleStopped().catch((err) => console.warn('[recorder] could not hand off a stopped recording', err));
      return interrupted;
    },

    /** The background hand-off started by the last recover (for tests). */
    settled: Promise.resolve() as Promise<void>,

    async continueRecording(lectureId: string): Promise<void> {
      await deps.openMicrophone();
      await recorder.continueRecording(lectureId);
      await deps.setStatus(lectureId, 'recording').catch(() => {});
      set({ interrupted: state.interrupted.filter((r) => r.lectureId !== lectureId) });
    },

    /** Ends an interrupted recording there; resolves with the lecture once handed off. */
    async finish(lectureId: string): Promise<string> {
      await recorder.finish(lectureId);
      set({ interrupted: state.interrupted.filter((r) => r.lectureId !== lectureId) });
      const seconds = await lengthOf(lectureId);
      set({ saving: { lectureId, left: 0, offline: false, finishing: false } });
      try {
        await handOff(lectureId, seconds);
      } catch (err) {
        set({ saving: null });
        throw err;
      }
      return lectureId;
    },
  };
  return flow;
}

export type RecordingFlow = ReturnType<typeof createRecordingFlow>;
