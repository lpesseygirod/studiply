import { Linking, Platform } from 'react-native';

import { showAlert } from '../dialogs/dialogs';
import { errorMessage } from '../../utils/errors';

/**
 * Why a recording couldn't start (the setup's Start, step 5.3, and the Record
 * button inside a document, step 5.7): the microphone refused (the iPhone's
 * Settings, or the browser's address bar), or the reason.
 */
export function showStartError(err: unknown): void {
  const denied = err instanceof Error && err.name === 'NotAllowedError';
  if (denied && Platform.OS !== 'web') {
    showAlert('Microphone Access Required', 'Studiply needs microphone access to record lectures. Please enable it in Settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
    return;
  }
  // The flow's own messages ("A recording is already running.", "…needs a connection…") are written for the student.
  const own = err instanceof Error && !denied && /recording|connection/i.test(err.message) ? err.message : null;
  showAlert(
    denied ? 'Microphone access needed' : 'Could not start recording',
    denied ? 'Allow the microphone for Studiply (the icon in the address bar), then press Start again.' : own ?? errorMessage(err, 'Please try again.'),
  );
}
