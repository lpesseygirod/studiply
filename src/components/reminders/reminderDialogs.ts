import { Linking } from 'react-native';

import { showAlert } from '../dialogs/dialogs';
import { reminderPermission, setRemindersEnabled } from '../../services/reminders/reminders.service';

/** What the reminders are, said before iOS asks (its own dialog has no text of ours; DESIGN). */
export function reminderExplanation(time: string): string {
  return `Studiply reminds you 1, 3, 7 and 21 days after each lecture, and before your exam. One notification a day, at ${time}.`;
}

/** She refused (now or before): how to allow them; nothing else changes. */
export function showRemindersDeniedHelp(): void {
  showAlert('Notifications are off for Studiply', 'To get review reminders, open iOS Settings → Studiply → Notifications and allow them.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open iOS Settings', onPress: () => void Linking.openSettings().catch(() => {}) },
  ]);
}

/**
 * Turns the reminders on: when iOS hasn't been asked yet and `explain` (the Settings switch), the
 * app's explanation first; then iOS asks. Resolves true when they are on.
 */
export async function turnOnReminders(time: string, { explain }: { explain: boolean }): Promise<boolean> {
  if (explain && (await reminderPermission()) === 'undetermined') {
    const go = await new Promise<boolean>((resolve) =>
      showAlert('Turn on review reminders?', `${reminderExplanation(time)} iOS asks you next.`, [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ]),
    );
    if (!go) return false;
  }
  const result = await setRemindersEnabled(true);
  if (result === 'denied') showRemindersDeniedHelp();
  return result === 'on';
}
