/**
 * @jest-environment node
 */
// Step 10.1: the reminder before the first recording ("check that you may record this class"), once
// per account: shown, then remembered (here and on the account), never again; recording waits for "Got it".
import { RECORDING_REMINDER_TITLE, remindBeforeFirstRecording } from '../recording-reminder';

const mockShown: string[] = [];
let mockSeen = false;
jest.mock('../../components/dialogs/dialogs', () => ({
  showAlert: (title: string, _m: string, buttons: { text: string; onPress?: () => void }[]) => {
    mockShown.push(`${title} [${buttons.map((b) => b.text).join()}]`);
    buttons[0].onPress?.();
  },
}));
jest.mock('../preferences.service', () => ({
  recordingReminderSeen: async () => mockSeen,
  markRecordingReminderSeen: async () => {
    mockSeen = true;
  },
}));

it('shown once per account, then remembered; Got it lets the recording start', async () => {
  await remindBeforeFirstRecording();
  await remindBeforeFirstRecording();
  expect(mockShown).toEqual([`${RECORDING_REMINDER_TITLE} [Got it]`]);
  expect(RECORDING_REMINDER_TITLE).toBe('Check that you may record this class');
  expect(mockSeen).toBe(true);
});
