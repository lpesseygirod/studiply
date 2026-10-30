/**
 * The recorder service (step 5.2): `recorder` is the web's (MediaRecorder,
 * IndexedDB) or the iPhone's (a stub until expo-audio). See ./service.
 */

export { recorder, requestMicrophone } from './platform';
export { CHUNK_MS, OVERLAP_MS } from './service';
export type { ChunkInfo, PlaybackSource, RecorderService, RecorderState, RecordingMeta, RecordingSnapshot, Segment } from './types';
