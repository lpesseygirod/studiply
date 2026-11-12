import { Audio, type AVPlaybackStatus } from 'expo-av';

import type { AudioPlayer, PlayerStatus } from './audioPlayer';

export type { AudioPlayer, PlayerStatus };

/**
 * Playing audio in the browser (the mini player): expo-av's HTML
 * audio element, as before. The iPhone's (./audioPlayer.ts) moved to
 * expo-audio, because expo-av's audio mode would
 * stop expo-audio's recording; the browser has no such shared session, so
 * this stays until the SDK upgrade.
 */
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
