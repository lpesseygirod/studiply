import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { showAlert } from '../dialogs/dialogs';
import { confirmAction } from '../../utils/confirm';
import { errorMessage } from '../../utils/errors';
import { recorder } from '../../services/recorder';
import { recordingFlow } from '../../services/recording.service';
import type { StartInParams } from '../../services/recording-flow';
import { showStartError } from './startError';

/**
 * What the strip, the iPhone screen's bottom bar and the interrupted banner
 * do (step 5.3). Stop asks first, then hands the recording off and opens
 * today's after-recording step (add materials, generate notes).
 */
export function useRecordingActions() {
  const router = useRouter();

  const openLecture = useCallback(
    (lectureId: string) => router.push({ pathname: '/doc/[id]', params: { id: lectureId, tab: 'notes' } }),
    [router],
  );

  const afterRecording = useCallback(
    (lectureId: string) => router.replace({ pathname: '/record/post-session', params: { sessionId: lectureId } }),
    [router],
  );

  const stop = useCallback(async () => {
    if (!(await confirmAction('Stop recording?', 'The recording is saved to this lecture and you can summarize it next.', 'Stop'))) return;
    try {
      const lectureId = await recordingFlow.stop();
      if (lectureId) afterRecording(lectureId);
    } catch (err) {
      showAlert('Could not stop the recording', errorMessage(err, 'Please try again.'));
    }
  }, [afterRecording]);

  // Pause (Lea, 30 Oct): the microphone closes, the clock and the waveform stand still; nothing else changes.
  const pause = useCallback(async () => {
    try {
      await recorder.pause();
    } catch (err) {
      showAlert('Could not pause the recording', errorMessage(err, 'Please try again.'));
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await recorder.resume();
    } catch (err) {
      showAlert('The microphone can’t be opened', errorMessage(err, 'Check that a microphone is connected and allowed, then try again.'));
    }
  }, []);

  const continueRecording = useCallback(
    async (lectureId: string) => {
      try {
        await recordingFlow.continueRecording(lectureId);
        openLecture(lectureId);
      } catch (err) {
        showAlert('Could not continue the recording', errorMessage(err, 'Please try again.'));
      }
    },
    [openLecture],
  );

  /**
   * Step 5.7: Record inside a document (a lecture, or a plain document that becomes one). True when
   * it records; the student is told why when it doesn't (and nothing changed).
   */
  const recordHere = useCallback(async (p: StartInParams): Promise<boolean> => {
    try {
      await recordingFlow.startIn(p);
      return true;
    } catch (err) {
      showStartError(err);
      return false;
    }
  }, []);

  const finish = useCallback(
    async (lectureId: string) => {
      try {
        afterRecording(await recordingFlow.finish(lectureId));
      } catch (err) {
        showAlert('Could not finish the recording', errorMessage(err, 'Please try again.'));
      }
    },
    [afterRecording],
  );

  return { openLecture, stop, pause, resume, continueRecording, finish, recordHere };
}
