import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { useRecorderState } from '../../hooks/useRecorder';
import { recorder } from '../../services/recorder';
import { recordingFlow } from '../../services/recording.service';

/**
 * Runs once in the app's shell, never with a screen:
 *  - after sign-in, looks for a recording the app lost (a reload, a crash)
 *    and sends whatever is still waiting (the recovery); the strip or the
 *    pill then offers Continue · Finish;
 *  - in the browser, closing or reloading the tab while recording asks
 *    first (the browser's own question).
 */
export function RecordingHost() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const recording = useRecorderState().status !== 'idle';

  useEffect(() => {
    if (!userId || !recorder.supported) return;
    recordingFlow.recover().catch((err) => console.warn('[recorder] could not look for interrupted recordings', err));
  }, [userId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !recording) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need a value to ask.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [recording]);

  return null;
}
