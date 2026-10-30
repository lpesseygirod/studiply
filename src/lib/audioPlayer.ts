import { Audio, type AVPlaybackStatus } from 'expo-av';

import { forPlayback } from './audioSession';
import { expoAudio } from './expoAudio';

/**
 * Playing audio (step 4.6, the mini player), in one place. On the iPhone
 * (since step 5.4's iPhone half) through expo-audio, the recorder's own
 * library: expo-av sets its own audio mode when it plays, which switched the
 * session away from recording and stopped expo-audio's recorders, so a chip
 * tapped during a lecture would have stopped the recording. The player keeps
 * the session active and leaves its mode to lib/audioSession (the recording
 * mode while recording). A build without expo-audio still plays through
 * expo-av, as before. The browser's is ./audioPlayer.web.ts.
 *
 * While recording, iOS sends playback to the earpiece unless headphones are
 * in (its record-and-play mode); the player says once to use headphones.
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

const LOAD_WAIT_MS = 8000;

export function createAudioPlayer(onStatus: (status: PlayerStatus) => void): AudioPlayer {
  const audio = expoAudio();
  return audio ? expoAudioPlayer(audio, onStatus) : expoAvPlayer(onStatus);
}

function expoAudioPlayer(audio: NonNullable<ReturnType<typeof expoAudio>>, onStatus: (status: PlayerStatus) => void): AudioPlayer {
  type Player = ReturnType<typeof audio.createAudioPlayer>;
  let player: Player | null = null;
  let subscription: { remove: () => void } | null = null;
  const unload = async () => {
    subscription?.remove();
    subscription = null;
    const old = player;
    player = null;
    old?.pause();
    old?.release();
  };
  return {
    load: async (uri, startMs, play) => {
      await unload();
      await forPlayback();
      const created = audio.createAudioPlayer({ uri }, { updateInterval: 250, keepAudioSessionActive: true });
      player = created;
      subscription = created.addListener('playbackStatusUpdate', (s) => {
        if (player !== created || !s.isLoaded) return;
        onStatus({ positionMs: s.currentTime * 1000, durationMs: s.duration ? s.duration * 1000 : null, playing: s.playing, finished: s.didJustFinish });
      });
      // A seek before the file is loaded is lost.
      const until = Date.now() + LOAD_WAIT_MS;
      while (!created.isLoaded && Date.now() < until && player === created) await new Promise((r) => setTimeout(r, 50));
      if (player !== created) return;
      if (startMs > 0) await created.seekTo(startMs / 1000);
      if (play) created.play();
    },
    play: async () => {
      await forPlayback();
      player?.play();
    },
    pause: async () => {
      player?.pause();
    },
    seek: async (ms) => {
      await player?.seekTo(Math.max(0, ms) / 1000);
    },
    unload,
  };
}

/** A build without expo-audio's native module: as before step 5.4's iPhone half. */
function expoAvPlayer(onStatus: (status: PlayerStatus) => void): AudioPlayer {
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
