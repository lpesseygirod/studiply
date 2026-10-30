import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { showAlert } from '../dialogs/dialogs';
import { confirmAction } from '../../utils/confirm';
import { errorMessage } from '../../utils/errors';
import { recorder } from '../../services/recorder';
import { recordingFlow } from '../../services/recording.service';

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

  return { openLecture, stop, resume, continueRecording, finish };
}
