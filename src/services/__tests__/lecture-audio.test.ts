// The mini player's recording (step 4.6): the chunk with a moment in it,
// the length, and a recording whose audio was deleted by its setting.
import { resetTables, serverWrite } from '../../test-utils/fakeTables';
import { chunkAt, getLecturePlayback, recordingLength } from '../lecture-audio.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../cloud-storage.service', () => ({ Buckets: { audioChunks: 'audio-chunks' }, getSignedUrl: async (_b: string, path: string) => `https://signed/${path}` }));

const CHUNKS = [0, 1, 2, 3].map((i) => ({ startMs: i * 30_000, durationMs: i === 3 ? 12_000 : 30_000 }));

beforeEach(() => resetTables());

describe('playing a lecture from a moment', () => {
  it('the chunk with the moment in it, and how far in', () => {
    expect(chunkAt(CHUNKS, 0)).toEqual({ index: 0, offsetMs: 0 });
    expect(chunkAt(CHUNKS, 75_500)).toEqual({ index: 2, offsetMs: 15_500 });
    expect(chunkAt(CHUNKS, 90_000)).toEqual({ index: 3, offsetMs: 0 });
    // Past the end: the end; before the start: the start.
    expect(chunkAt(CHUNKS, 500_000)).toEqual({ index: 3, offsetMs: 12_000 });
    expect(chunkAt(CHUNKS, -5)).toEqual({ index: 0, offsetMs: 0 });
    expect(chunkAt([], 10)).toBeNull();
    expect(recordingLength(CHUNKS)).toBe(102_000);
  });

  it('the chunks in order with their links; a recording whose audio was deleted says so', async () => {
    serverWrite('audio_chunks', { id: 'c2', lecture_id: 'lec', seq: 1, start_ms: 30_000, duration_ms: 30_000, storage_path: 'u/lec/1.m4a' });
    serverWrite('audio_chunks', { id: 'c1', lecture_id: 'lec', seq: 0, start_ms: 0, duration_ms: 30_000, storage_path: 'u/lec/0.m4a' });
    const playback = await getLecturePlayback('lec');
    expect(playback).toEqual({
      deleted: false,
      chunks: [
        { startMs: 0, durationMs: 30_000, url: 'https://signed/u/lec/0.m4a' },
        { startMs: 30_000, durationMs: 30_000, url: 'https://signed/u/lec/1.m4a' },
      ],
    });
    serverWrite('audio_chunks', { id: 'd1', lecture_id: 'gone', seq: 0, start_ms: 0, duration_ms: 30_000, storage_path: null });
    expect(await getLecturePlayback('gone')).toEqual({ chunks: [], deleted: true });
    expect(await getLecturePlayback('none')).toEqual({ chunks: [], deleted: false });
  });
});
