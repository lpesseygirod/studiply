// The mini player's recording (step 4.6): the chunk with a moment in it,
// the length, and a recording whose audio was deleted by its setting.
import { resetTables, serverWrite } from '../../test-utils/fakeTables';
import { chunkAt, endOf, getLecturePlayback, getLivePlayback, recordingLength } from '../lecture-audio.service';

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

  it('step 5.4: overlapping chunks play on from where the last one ended, nothing heard twice', () => {
    // The web's chunks: each starts 500 ms before the previous one ends.
    const overlapping = [
      { startMs: 0, durationMs: 10_500 },
      { startMs: 10_000, durationMs: 10_500 },
    ];
    expect(endOf(overlapping, 0)).toBe(10_500);
    expect(chunkAt(overlapping, endOf(overlapping, 0))).toEqual({ index: 1, offsetMs: 500 });
    // A moment in the overlap is the earlier chunk's.
    expect(chunkAt(overlapping, 10_200)).toEqual({ index: 0, offsetMs: 10_200 });
  });

  it('step 5.4: while recording, the device’s own audio, or Storage once uploaded; its links freed after', async () => {
    // Jest has no blob links (the browser does).
    jest.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:local-1');
    const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const playback = await getLivePlayback([
      { seq: 0, startMs: 0, durationMs: 30_500, blob: null, storagePath: 'u/lec/0000.webm' },
      { seq: 1, startMs: 30_000, durationMs: 4_000, blob: new Blob(['audio']), storagePath: null },
      { seq: 2, startMs: 34_000, durationMs: 1_000, blob: null, storagePath: null },
    ]);
    expect(playback.chunks.map((c) => [c.startMs, c.url.startsWith('blob:') ? 'local' : c.url])).toEqual([
      [0, 'https://signed/u/lec/0000.webm'],
      [30_000, 'local'],
    ]);
    playback.release();
    expect(revoke).toHaveBeenCalledWith('blob:local-1');
    jest.restoreAllMocks();
  });
});
