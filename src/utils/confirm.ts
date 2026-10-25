import { showAlert } from '../components/dialogs/dialogs';

/**
 * Asks the user to confirm a destructive action. Works on iPhone (native
 * alert) and on the web (the app's own dialog; see components/dialogs).
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(title, message || undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
