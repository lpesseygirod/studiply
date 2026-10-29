import { Audio, type AVPlaybackStatus } from 'expo-av';

/**
 * Playing audio (step 4.6, the mini player), in one place: the only file
 * that uses expo-av to play. expo-av is deprecated in Expo SDK 54; when the
 * SDK is upgraded before TestFlight (and when Phase 5 moves recording off
 * expo-av), this file alone switches to expo-audio. Works on iOS and in the
 * browser (expo-av plays through an HTML audio element there).
 */

export interface PlayerStatus {
  /** Where it is in the loaded sound. */
  positionMs: number;
  durationMs: number | null;
  playing: boolean;
  /** The sound played to its end. */
  finished: boolean;
}

export interface AudioPlayer {
  /** Loads `uri` and starts at `startMs`; plays at once when `play`. */
  load: (uri: string, startMs: number, play: boolean) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  unload: () => Promise<void>;
}

export function createAudioPlayer(onStatus: (status: PlayerStatus) => void): AudioPlayer {
  let sound: Audio.Sound | null = null;
  const report = (s: AVPlaybackStatus) => {
    if (!s.isLoaded) return;
    onStatus({ positionMs: s.positionMillis, durationMs: s.durationMillis ?? null, playing: s.isPlaying, finished: s.didJustFinish });
  };
  const unload = async () => {
    const old = sound;
    sound = null;
    await old?.unloadAsync().catch(() => {});
  };
  return {
    load: async (uri, startMs, play) => {
      await unload();
      // Plays with the ringer switch off, as a lecture recording should.
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
      const created = await Audio.Sound.createAsync({ uri }, { positionMillis: Math.max(0, startMs), shouldPlay: play, progressUpdateIntervalMillis: 250 }, report);
      sound = created.sound;
    },
    play: async () => {
      await sound?.playAsync();
    },
    pause: async () => {
      await sound?.pauseAsync();
    },
    seek: async (ms) => {
      await sound?.setPositionAsync(Math.max(0, ms));
    },
    unload,
  };
}
