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
import { isOffline } from '../lib/connectivity';
import { isMockAiForced } from '../lib/aiMode';

export type { FlowState, InterruptedRecording } from './recording-flow';

const shared = globalThis as { __studiplyRecordingFlow?: RecordingFlow };
export const recordingFlow: RecordingFlow = (shared.__studiplyRecordingFlow ??= createRecordingFlow({
  recorder,
  // The browser's or the iPhone's own question, before a lecture is made.
  openMicrophone: requestMicrophone,
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
  setStatus: async (lectureId, status, durationSeconds) => {
    await updateSession(lectureId, { status, ...(durationSeconds !== undefined && { duration_seconds: durationSeconds }) });
  },
  titleOf: async (lectureId) => (await getSession(lectureId)).title,
  statusOf: async (lectureId) => (await getSession(lectureId)).status,
  isOffline,
}));
