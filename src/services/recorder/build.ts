/**
 * The recorder service as the app runs it, on the web and the iPhone alike
 * (./platform.web, ./platform): the two queue lanes (uploads, then the
 * transcription of each uploaded chunk), the signed-in student, sending when
 * the backend is reachable again and at sign-in. Each platform brings its
 * own microphone, store, queue storage and copy of the audio.
 */

import { isMockAiForced } from '../../lib/aiMode';
import { getConnection, onBackOnline } from '../../lib/connectivity';
import { callFunction } from '../../lib/functions';
import { newId } from '../../lib/mappers';
import { secureStorage } from '../../lib/secureStorage';
import { supabase } from '../../lib/supabase';
import { createSyncQueue, type QueueStore } from '../../lib/sync/queue';
import { chunkOnServer } from '../source-file.service';
import { transcribeChunkHandler, uploadChunkHandler } from './handlers';
import { createRecorderService } from './service';
import type { AudioData, AudioSource, RecorderService, RecordingStore, Segment, StoredChunk } from './types';

export interface PlatformParts {
  store: RecordingStore;
  queueStore: (lane: 'uploads' | 'transcriptions') => QueueStore;
  createSource: (options: { chunkMs: number; overlapMs: number }) => AudioSource;
  upload: (chunk: StoredChunk & { blob: AudioData }, onProgress: (fraction: number) => void) => Promise<string>;
  discard?: (audio: AudioData) => Promise<void>;
  claim: (lectureId: string) => Promise<boolean>;
  release: (lectureId: string) => void;
  /** One flush at a time across tabs (the web); the iPhone has one app. */
  exclusive?: (name: string) => <T>(fn: () => Promise<T>) => Promise<T>;
  /** Also sends when this happens (the iPhone: back in the foreground). */
  onWake?: (send: () => void) => void;
}

/** Longest wait between tries of a part: a minute (a locked pocket, a bad connection). */
const MAX_BACKOFF_MS = 60_000;

async function transcribe(p: { lectureId: string; seq: number; storagePath: string; startMs: number; durationMs: number }): Promise<Segment[]> {
  // EXPO_PUBLIC_MOCK_AI (development): nothing is sent.
  if (isMockAiForced()) return [{ startMs: p.startMs, endMs: p.startMs + p.durationMs, text: `(Simulated transcript, part ${p.seq + 1}.)` }];
  const { segments } = await callFunction<{ segments: Segment[] }>('transcribe-chunk', {
    lectureId: p.lectureId,
    seq: p.seq,
    storagePath: p.storagePath,
    startMs: p.startMs,
  });
  return segments;
}

export function buildRecorder(parts: PlatformParts): RecorderService {
  let user: string | null = null;
  const lane = (name: 'uploads' | 'transcriptions', kind: string, handler: ReturnType<typeof uploadChunkHandler>) =>
    createSyncQueue({
      store: parts.queueStore(name),
      handlers: { [kind]: handler },
      userId: () => user,
      canSync: () => getConnection() !== 'offline',
      refresh: async () => !(await supabase.auth.refreshSession()).error,
      newId,
      log: __DEV__ ? (message) => console.log(`[recorder ${name}] ${message}`) : undefined,
      exclusive: parts.exclusive?.(`studiply-recorder-${name}`),
      // The audio is never given up on; waking, the connection or the session back sends at once (sendNow).
      persistent: true,
      maxBackoffMs: MAX_BACKOFF_MS,
    });
  const uploads = lane(
    'uploads',
    'upload_chunk',
    uploadChunkHandler({ store: parts.store, upload: parts.upload, discard: parts.discard, onServer: (r) => chunkOnServer(r.lectureId, r.seq) }),
  );
  const transcriptions = lane('transcriptions', 'transcribe_chunk', transcribeChunkHandler({ store: parts.store, transcribe }));
  const sendNow = () => {
    uploads.flush({ now: true }).catch(() => {});
    transcriptions.flush({ now: true }).catch(() => {});
  };

  const setUser = (id: string | null) => {
    const was = user;
    user = id;
    if (id && id !== was) sendNow();
  };
  const known = supabase.auth
    .getSession()
    .then(({ data }) => setUser(data.session?.user.id ?? null))
    .catch(() => {});
  // Not inside the callback itself: Supabase calls made there wait for it.
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      setUser(session?.user.id ?? null);
      // A new token after refreshing failed (the session unreadable while locked, offline).
      if (event === 'TOKEN_REFRESHED' && session) sendNow();
    }, 0);
  });
  onBackOnline(sendNow);
  parts.onWake?.(sendNow);
  // The saved session readable again (the iPhone unlocked after a locked Keychain read failed).
  secureStorage.onReadable(sendNow);

  return createRecorderService({
    store: parts.store,
    createSource: parts.createSource,
    uploads,
    transcriptions,
    userId: () => user,
    ready: () => known,
    claim: parts.claim,
    release: parts.release,
  });
}
