/**
 * The recorder on the iPhone: A STUB until expo-audio (a new dependency that
 * waits for Lea's OK). It has the same interface as the web's
 * (./platform.web) and says it isn't supported yet.
 *
 * When expo-audio comes, this file gets:
 *  - an AudioSource over two expo-audio recorders, rotated like the web's
 *    (30-second chunks, the next started 500 ms before the previous stops),
 *    measured on Lea's phone with the screen locked (5.1, iPhone half);
 *  - the store in SQLite, the chunks' files kept with keepRecordingChunk
 *    (lib/pendingFiles), and the uploads through the iPhone's own sync queue
 *    (lib/sync: upload_chunk is already registered in source-file.service);
 *  - the background audio mode in app.json (expo-audio's config plugin), so
 *    recording goes on with the screen locked; it needs an EAS development
 *    build (Expo Go can't).
 * The service itself (./service) is shared and doesn't change.
 */

import type { RecorderService } from './types';

const NOT_YET = 'Recording in chunks on the iPhone waits for expo-audio (Lea’s OK).';

export const recorder: RecorderService = {
  supported: false,
  start: async () => {
    throw new Error(NOT_YET);
  },
  pause: async () => {},
  resume: async () => {},
  stop: async () => {},
  recover: async () => [],
  continueRecording: async () => {
    throw new Error(NOT_YET);
  },
  finish: async () => {},
  state: () => ({ lectureId: null, status: 'idle' }),
  elapsedMs: () => 0,
  snapshot: async () => ({ meta: null, chunks: [], transcript: [] }),
  subscribe: () => () => {},
};
