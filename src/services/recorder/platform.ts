/**
 * The recorder on the iPhone (steps 5.1–5.4, iPhone half): expo-audio in
 * 30-second chunks overlapping by 500 ms (lib/nativeChunkRecorder), on with
 * the screen locked (the background audio mode, app.json); each finished
 * chunk moved to the app's documents, then uploaded and transcribed through
 * the recorder's two queue lanes (./nativeStore, AsyncStorage); the
 * waveform from expo-audio's metering. The service is the web's (./service,
 * ./build).
 *
 * A build without expo-audio's native module (one made before it was added)
 * isn't `supported`: the setup then keeps the earlier recording screen
 * (`record/active`, expo-av) as before.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Platform } from 'react-native';

import { expoAudio } from '../../lib/expoAudio';
import { endRecordingSession, startRecordingSession } from '../../lib/audioSession';
import { base64ToBytes, bytesToBase64 } from '../../lib/base64';
import { splitM4a } from '../../lib/m4aSplit';
import { NativeChunkRecorder, type NativeChunk, type NativeRecorderLike } from '../../lib/nativeChunkRecorder';
import { createNativeQueueStore, createNativeStore } from './nativeStore';
import { isAudioFile, type AudioData, type AudioSource, type RecorderService, type StoredChunk } from './types';

/** AAC in an .m4a, mono, 64 kbit/s (about 240 KB per 30-second chunk). */
function recordingOptions() {
  const audio = expoAudio()!;
  const common = { extension: '.m4a', sampleRate: 44100, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true };
  return Platform.OS === 'ios'
    ? { ...common, outputFormat: audio.IOSOutputFormat.MPEG4AAC, audioQuality: audio.AudioQuality.MEDIUM }
    : { ...common, outputFormat: 'mpeg4', audioEncoder: 'aac' };
}

function createRecorder(): NativeRecorderLike {
  const audio = expoAudio()!;
  return new audio.AudioModule.AudioRecorder(recordingOptions() as never) as unknown as NativeRecorderLike;
}

/** Finished chunks wait for upload in the app's documents (iOS may empty the caches). */
const KEEP_DIR = `${FileSystem.documentDirectory ?? ''}recorder/`;

async function keep(uri: string, seq: number): Promise<{ uri: string; size: number }> {
  try {
    await FileSystem.makeDirectoryAsync(KEEP_DIR, { intermediates: true }).catch(() => {});
    const target = `${KEEP_DIR}${Date.now()}-${seq}.m4a`;
    await FileSystem.moveAsync({ from: uri, to: target });
    uri = target;
  } catch (err) {
    // Left where it is: uploaded from there.
    console.warn('[recorder] could not move a chunk', err);
  }
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return { uri, size: info && info.exists && 'size' in info ? (info.size ?? 0) : 0 };
}

/** Longer than a chunk by this much, a part is cut into chunk-long pieces before upload (lib/m4aSplit). */
const SPLIT_SLACK_MS = 5_000;

/**
 * The part as it is, or (longer than a chunk: the rotation didn't run, 30 Oct, the phone locked)
 * cut into chunk-long pieces, so none can outgrow the audio bucket's 25 MiB. Kept whole if it
 * can't be cut (an unexpected file): nothing is lost either way.
 */
async function bounded(c: NativeChunk, chunkMs: number, overlapMs: number): Promise<{ uri: string; startMs: number; durationMs: number }[]> {
  const whole = [{ uri: c.uri, startMs: c.startMs, durationMs: c.durationMs }];
  if (c.durationMs <= chunkMs + overlapMs + SPLIT_SLACK_MS) return whole;
  const pieces: { uri: string; startMs: number; durationMs: number }[] = [];
  try {
    const info = await FileSystem.getInfoAsync(c.uri);
    const io = {
      size: info.exists ? info.size : 0,
      read: async (position: number, length: number) =>
        base64ToBytes(await FileSystem.readAsStringAsync(c.uri, { encoding: FileSystem.EncodingType.Base64, position, length })),
    };
    await splitM4a(io, chunkMs, overlapMs, async (piece, i) => {
      const uri = `${c.uri.replace(/\.m4a$/i, '')}-piece${i}.m4a`;
      await FileSystem.writeAsStringAsync(uri, bytesToBase64(piece.bytes), { encoding: FileSystem.EncodingType.Base64 });
      pieces.push({ uri, startMs: c.startMs + piece.startMs, durationMs: piece.durationMs });
    });
    console.warn(`[recorder] part ${c.seq} lasted ${Math.round(c.durationMs / 1000)} s (its rotation didn't run): cut into ${pieces.length} pieces`);
    await FileSystem.deleteAsync(c.uri, { idempotent: true }).catch(() => {});
    return pieces;
  } catch (err) {
    console.warn(`[recorder] could not cut part ${c.seq} (${Math.round(c.durationMs / 1000)} s) into pieces; it stays whole`, err instanceof Error ? err.message : err);
    for (const p of pieces) await FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => {});
    return whole;
  }
}

function nativeSource({ chunkMs, overlapMs }: { chunkMs: number; overlapMs: number }): AudioSource {
  let recorder: NativeChunkRecorder | null = null;
  let fromMs = 0;
  // Chunks are moved and measured one after another, so they reach the service in order.
  let chain: Promise<void> = Promise.resolve();
  // The service's numbers: the recorder's, plus the extra pieces a cut part became.
  let nextSeq = 0;
  return {
    async start(from, on) {
      fromMs = from.ms;
      nextSeq = from.seq;
      await startRecordingSession();
      recorder = new NativeChunkRecorder({
        chunkMs,
        overlapMs,
        from,
        createRecorder,
        onLost: on.lost,
        onOverlapRefused: () => console.warn('[recorder] iOS refused two recorders at once: chunks now restart (a short gap at each join)'),
        onPrepareFailed: (err) => console.warn('[recorder] could not prepare the next part', err instanceof Error ? err.message : err),
        onChunk: (c) => {
          chain = chain
            .then(async () => {
              for (const part of await bounded(c, chunkMs, overlapMs)) {
                const seq = nextSeq++;
                const file = await keep(part.uri, seq);
                on.chunk({ seq, blob: file, mimeType: 'audio/m4a', startMs: part.startMs, durationMs: part.durationMs });
              }
            })
            .catch((err) => console.warn('[recorder] could not hand a part over', err));
        },
      });
      try {
        await recorder.start();
      } catch (err) {
        recorder = null;
        await endRecordingSession();
        throw err;
      }
    },
    async pause() {
      await recorder?.pause();
      await chain;
    },
    async resume() {
      // After a call iOS has deactivated the session: set it for recording again first.
      await startRecordingSession();
      await recorder?.resume();
    },
    async stop() {
      await recorder?.stop();
      await chain;
      recorder = null;
      await endRecordingSession();
    },
    elapsedMs: () => recorder?.elapsedMs() ?? fromMs,
    level: () => recorder?.level() ?? 0,
  };
}

async function upload(chunk: StoredChunk & { blob: AudioData }, onProgress: (fraction: number) => void): Promise<string> {
  if (!isAudioFile(chunk.blob)) throw new Error('No file for this part of the recording.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sendRecordingChunk } = require('../source-file.service') as typeof import('../source-file.service');
  return sendRecordingChunk({ lectureId: chunk.lectureId, seq: chunk.seq, startMs: chunk.startMs, durationMs: chunk.durationMs, uri: chunk.blob.uri }, onProgress);
}

async function discard(audio: AudioData): Promise<void> {
  if (isAudioFile(audio)) await FileSystem.deleteAsync(audio.uri, { idempotent: true });
}

/** The iPhone asks for the microphone before a lecture is made. */
export async function requestMicrophone(): Promise<void> {
  const audio = expoAudio();
  if (!audio) return;
  const { granted } = await audio.requestRecordingPermissionsAsync();
  if (!granted) throw Object.assign(new Error('Microphone access is off for Studiply.'), { name: 'NotAllowedError' });
}

// One app at a time records on an iPhone: a recording is held while this app makes it.
const held = new Set<string>();

let built: RecorderService | null = null;
function real(): RecorderService {
  // Loaded here, not at import: screens and tests that only read `recorder.state()` don't load Supabase.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildRecorder } = require('./build') as typeof import('./build');
  return (built ??= buildRecorder({
    store: createNativeStore(),
    queueStore: createNativeQueueStore,
    createSource: nativeSource,
    upload,
    discard,
    claim: async (id) => {
      if (held.has(id)) return true;
      held.add(id);
      return true;
    },
    release: (id) => {
      held.delete(id);
    },
    // Back in the foreground: send what waited.
    onWake: (send) => {
      AppState.addEventListener('change', (state) => {
        if (state === 'active') send();
      });
    },
  }));
}

const IDLE = { lectureId: null, status: 'idle', microphoneLost: false } as const;

/** Built on first use (not at import), so screens and tests that never record don't start it. */
const shared = globalThis as { __studiplyRecorder?: RecorderService };
export const recorder: RecorderService = (shared.__studiplyRecorder ??= {
  get supported() {
    return expoAudio() !== null;
  },
  start: (p) => real().start(p),
  pause: () => (built ? built.pause() : Promise.resolve()),
  resume: () => (built ? built.resume() : Promise.resolve()),
  stop: () => (built ? built.stop() : Promise.resolve()),
  recover: () => real().recover(),
  recordings: () => real().recordings(),
  playback: (id) => real().playback(id),
  continueRecording: (id) => real().continueRecording(id),
  finish: (id) => real().finish(id),
  state: () => (built ? built.state() : { ...IDLE }),
  elapsedMs: () => (built ? built.elapsedMs() : 0),
  level: () => (built ? built.level() : 0),
  snapshot: (id) => real().snapshot(id),
  subscribe: (fn) => real().subscribe(fn),
});
