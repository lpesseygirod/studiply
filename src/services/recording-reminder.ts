/**
 * recording-reminder.ts
 * Before the first recording (once per account, on either device), a reminder to check
 * that recording is allowed in the class. Shown before the microphone question and the AI consent
 * screen (recording.service). The same sentence stays readable under Settings → Recording.
 */

import { showAlert } from '../components/dialogs/dialogs';
import { markRecordingReminderSeen, recordingReminderSeen } from './preferences.service';

export const RECORDING_REMINDER_TITLE = 'Check that you may record this class';
export const RECORDING_REMINDER_TEXT =
  'Many universities and lecturers ask you to get permission before you record. Recordings are for your own study.';

/** Shows the reminder the first time; resolves once it is closed (or at once when seen before). */
export async function remindBeforeFirstRecording(): Promise<void> {
  if (await recordingReminderSeen()) return;
  await new Promise<void>((resolve) => {
    showAlert(RECORDING_REMINDER_TITLE, RECORDING_REMINDER_TEXT, [{ text: 'Got it', onPress: () => resolve() }]);
  });
  await markRecordingReminderSeen();
}
