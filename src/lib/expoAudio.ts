/**
 * expo-audio (the iPhone's recording and playback), loaded only where its native module
 * is in the build: a development build made before it was added (or Expo Go
 * without it) gets null: the app can't record there (Record says so) and
 * keeps its expo-av player, instead of crashing at start.
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
