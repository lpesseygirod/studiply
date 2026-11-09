// Uploads and rows written by source-file.service (jest-expo runs as iOS).
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { removeFiles, uploadFile } from '../cloud-storage.service';
import { toJpeg } from '../../utils/toJpeg';
import {
  bulkApplyRetention,
  createSourceFile,
  saveRecordingChunks,
  sourceFileName,
} from '../source-file.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/mappers', () => ({ newId: () => 'media-1' }));
jest.mock('../../utils/toJpeg', () => ({
  toJpeg: jest.fn(async () => ({ uri: 'file:///cache/converted.jpg', mimeType: 'image/jpeg' })),
}));
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => ({ path: `user-1/${path}` })),
  getSignedUrl: jest.fn(async () => 'https://signed'),
  removeFiles: jest.fn(async () => {}),
}));

const T = '2026-10-24T10:00:00.000Z';
const chunkRow = (seq: number, start_ms: number) => ({
  id: `chunk-${seq}`,
  user_id: 'user-1',
  lecture_id: 'l1',
  seq,
  start_ms,
  duration_ms: 1000,
  storage_path: `user-1/l1/${String(seq).padStart(4, '0')}.m4a`,
  status: 'uploaded',
  created_at: T,
  updated_at: T,
});

beforeEach(() => {
  resetSupabaseMock();
  jest.mocked(uploadFile).mockClear();
  jest.mocked(removeFiles).mockClear();
  jest.mocked(toJpeg).mockClear();
});

describe('saveRecordingChunks', () => {
  it('uploads the chunks in order, each starting where the previous one ended', async () => {
    answer('audio_chunks', { data: chunkRow(0, 0) }, { data: chunkRow(1, 1_200_000) });

    await saveRecordingChunks({
      userId: 'user-1',
      sessionId: 'l1',
      chunks: [
        { uri: 'file:///a.m4a', durationMs: 1_200_000 },
        { uri: 'file:///b.m4a', durationMs: 30_500 },
      ],
    });

    expect(callsOn('lectures', 'update')[0][0]).toEqual({ status: 'uploading' });
    expect(jest.mocked(uploadFile).mock.calls.map(([o]) => [o.bucket, o.path, o.contentType, o.upsert])).toEqual([
      ['audio-chunks', 'l1/0000.m4a', 'audio/m4a', true],
      ['audio-chunks', 'l1/0001.m4a', 'audio/m4a', true],
    ]);
    const rows = callsOn('audio_chunks', 'upsert').map(([row]) => row);
    expect(rows).toEqual([
      expect.objectContaining({ seq: 0, start_ms: 0, duration_ms: 1_200_000, storage_path: 'user-1/l1/0000.m4a', status: 'uploaded' }),
      expect.objectContaining({ seq: 1, start_ms: 1_200_000, duration_ms: 30_500, storage_path: 'user-1/l1/0001.m4a' }),
    ]);
    expect(callsOn('audio_chunks', 'upsert')[0][1]).toEqual({ onConflict: 'lecture_id,seq' });
  });

  it('stops at the first chunk that fails', async () => {
    jest.mocked(uploadFile).mockRejectedValueOnce(new Error('Could not upload. Check your connection and try again.'));

    await expect(
      saveRecordingChunks({ userId: 'user-1', sessionId: 'l1', chunks: [{ uri: 'a', durationMs: 1 }, { uri: 'b', durationMs: 1 }] }),
    ).rejects.toThrow('Check your connection');
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });
});

describe('createSourceFile', () => {
  it('converts a photo to JPEG and stores it in the photos bucket', async () => {
    answer('media', { data: { id: 'media-1', kind: 'photo', lecture_id: 'l1', storage_path: 'user-1/l1/media-1.jpg', caption: null } });

    await createSourceFile({
      userId: 'user-1',
      sessionId: 'l1',
      fileType: 'photo',
      filePath: 'file:///IMG_1.HEIC',
      size: { width: 4032, height: 3024 },
    });

    expect(toJpeg).toHaveBeenCalledWith('file:///IMG_1.HEIC', { width: 4032, height: 3024 });
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({
      bucket: 'photos',
      path: 'l1/media-1.jpg',
      uri: 'file:///cache/converted.jpg',
      contentType: 'image/jpeg',
    });
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({ id: 'media-1', kind: 'photo', caption: null });
  });

  it('keeps a PDF’s original name, accents included, out of its Storage path', async () => {
    answer('media', {
      data: { id: 'media-1', kind: 'slides', lecture_id: 'l1', storage_path: 'user-1/l1/media-1.pdf', caption: 'Funcions àlgebra.pdf' },
    });

    const file = await createSourceFile({
      userId: 'user-1',
      sessionId: 'l1',
      fileType: 'pdf',
      filePath: 'file:///x.pdf',
      fileName: 'Funcions àlgebra.pdf',
      fileSizeBytes: 2048,
      mimeType: 'application/pdf',
    });

    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'slides', path: 'l1/media-1.pdf' });
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({ kind: 'slides', caption: 'Funcions àlgebra.pdf', size_bytes: 2048 });
    expect(sourceFileName(file)).toBe('Funcions àlgebra.pdf');
  });

  it('removes the uploaded file when its row cannot be saved', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    answer('media', { error: { message: 'denied' } });

    await expect(
      createSourceFile({ userId: 'user-1', sessionId: 'l1', fileType: 'pdf', filePath: 'file:///x.pdf' }),
    ).rejects.toThrow('Could not save the file.');
    expect(removeFiles).toHaveBeenCalledWith('slides', ['user-1/l1/media-1.pdf']);
    jest.restoreAllMocks();
  });
});

describe('bulkApplyRetention', () => {
  it('delete_3_days saves the setting only: the server dates it, 3 days after transcription (step 10.1b-3); deletes nothing', async () => {
    await bulkApplyRetention('l1', 'delete_3_days');

    expect(callsOn('lectures', 'update')).toEqual([[{ audio_retention: 'delete_3_days' }]]);
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it('delete_now removes the audio files, keeps the chunk rows (and their transcript), marks the audio deleted', async () => {
    answer('audio_chunks', { data: [{ id: 'chunk-0', storage_path: 'user-1/l1/0000.m4a' }] });

    await bulkApplyRetention('l1', 'delete_now');

    expect(callsOn('audio_chunks', 'update')[0][0]).toEqual({ storage_path: null });
    expect(callsOn('audio_chunks', 'delete')).toHaveLength(0);
    expect(removeFiles).toHaveBeenCalledWith('audio-chunks', ['user-1/l1/0000.m4a']);
    expect(callsOn('media', 'update')).toHaveLength(0);
    const marked = callsOn('lectures', 'update')[1][0] as { audio_deleted_at: string };
    expect(Date.parse(marked.audio_deleted_at)).toBeGreaterThan(Date.now() - 60_000);
  });
});
