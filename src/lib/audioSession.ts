import { expoAudio } from './expoAudio';

/**
 * The iPhone's audio session, set in one place (step 5.1–5.4, iPhone half).
 * expo-audio's mode is all or nothing: a mode without `allowsRecording` stops
 * every recorder. So while a lecture records (or is paused), only the
 * recording mode is ever set, and playing a chip leaves it alone; otherwise a
 * playback mode is set before playing.
 *
 * Recording: record and play, also with the ringer switch off, on with the
 * screen locked and in the background, other apps' sound paused.
 */

let recording = false;

export function isRecordingSession(): boolean {
  return recording;
}

export async function startRecordingSession(): Promise<void> {
  const audio = expoAudio();
  recording = true;
  await audio?.setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    allowsBackgroundRecording: true,
    interruptionMode: 'doNotMix',
  });
}

export async function endRecordingSession(): Promise<void> {
  recording = false;
  await forPlayback();
}

/** Before playing: a playback mode, unless a recording owns the session. */
export async function forPlayback(): Promise<void> {
  if (recording) return;
  await expoAudio()
    ?.setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsBackgroundRecording: false,
      interruptionMode: 'doNotMix',
    })
    .catch(() => {});
}
