/**
 * The app's recording flow (step 5.3, ./recording-flow) with its real parts:
 * the recorder service, the microphone question (the browser's or the
 * iPhone's), transcription consent, the lecture's row. One per app, like the
 * recorder.
 */

import { recorder, requestMicrophone } from './recorder';
import { createRecordingFlow, type RecordingFlow } from './recording-flow';
import { createSession, getSession, updateSession } from './session.service';
import { ConsentDeclinedError, ensureConsent } from './consent.service';
import { remindBeforeFirstRecording } from './recording-reminder';
import { isOffline } from '../lib/connectivity';
import { isMockAiForced } from '../lib/aiMode';
import { isNetworkError, serviceError } from '../lib/cloudRows';
import { supabase } from '../lib/supabase';
import { convertToLecture } from './lecture-conversion.service';
import { cleanUpLate, discardRecording } from './discard-recording.service';

export type { DiscardPlan, DiscardPreview, FlowState, InterruptedRecording } from './recording-flow';

/**
 * Where a lecture's audio already ends on Studiply (step 5.7: recording again into it), so the new
 * chunks never reuse a number. Offline it can't be read: fine for a lecture never recorded (draft);
 * otherwise the student is asked to connect first.
 */
async function audioEnd(lectureId: string): Promise<{ seq: number; ms: number } | null> {
  if (!isOffline()) {
    const { data, error } = await supabase.from('audio_chunks').select('seq, start_ms, duration_ms').eq('lecture_id', lectureId);
    if (!error) {
      if (!data.length) return null;
      return { seq: Math.max(...data.map((c) => c.seq)) + 1, ms: Math.max(...data.map((c) => c.start_ms + c.duration_ms)) };
    }
    if (!isNetworkError(serviceError(error, ''))) throw serviceError(error, 'Could not start the recording.');
  }
  if ((await getSession(lectureId).catch(() => null))?.status === 'draft') return null;
  throw new Error('Recording again into this lecture needs a connection: its earlier recording is on Studiply.');
}

const shared = globalThis as { __studiplyRecordingFlow?: RecordingFlow };
export const recordingFlow: RecordingFlow = (shared.__studiplyRecordingFlow ??= createRecordingFlow({
  recorder,
  // Step 10.1: the first time, the reminder to check recording is allowed in the class; then the
  // browser's or the iPhone's own microphone question, before a lecture is made.
  openMicrophone: async () => {
    await remindBeforeFirstRecording();
    await requestMicrophone();
  },
  allowTranscription: async () => {
    // EXPO_PUBLIC_MOCK_AI (development): nothing is sent, nothing asked (as the rest of the app).
    if (isMockAiForced()) return true;
    try {
      await ensureConsent('transcription');
      return true;
    } catch (err) {
      // Declined: it records anyway; the transcript is made when asked later.
      if (err instanceof ConsentDeclinedError) return false;
      throw err;
    }
  },
  createLecture: async (p) =>
    (
      await createSession({
        userId: p.userId,
        title: p.title,
        projectId: p.courseId ?? undefined,
        folderId: p.folderId ?? undefined,
        recordingMode: p.mode,
        language: p.language,
      })
    ).id,
  convertToLecture,
  audioEnd,
  setStatus: async (lectureId, status, durationSeconds) => {
    await updateSession(lectureId, { status, ...(durationSeconds !== undefined && { duration_seconds: durationSeconds }) });
  },
  titleOf: async (lectureId) => (await getSession(lectureId)).title,
  statusOf: async (lectureId) => (await getSession(lectureId)).status,
  isOffline,
  // Cancel recording (Lea, 6 Nov): the notes and the server half; a chunk that lands after Discard removed again.
  discardRecording,
  cleanUpLate,
}));
