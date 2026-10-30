/**
 * expo-audio (step 5.1–5.4, iPhone half), loaded only where its native module
 * is in the build: a development build made before it was added (or Expo Go
 * without it) gets null, and the app keeps its earlier recording screen and
 * expo-av player instead of crashing at start.
 */

type ExpoAudio = typeof import('expo-audio');

let loaded: ExpoAudio | null | undefined;

export function expoAudio(): ExpoAudio | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('expo-audio') as ExpoAudio;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}
