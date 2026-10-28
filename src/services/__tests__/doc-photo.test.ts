// Photos in documents (step 4.5): kept on the iPhone and queued, sent by
// `upload_doc_photo` (safe to repeat), and found again for the editor: the
// phone's copy, this device's file, or a signed link.
import { Platform } from 'react-native';

import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { readRow, saveLocalRow } from '../../lib/cache';
import { isOffline } from '../../lib/connectivity';
import { pendingFileExists, removePendingFile } from '../../lib/pendingFiles';
import { cachedPhoto, downloadPhoto, keepPhoto } from '../../lib/photoCache';
import { PermanentSyncError } from '../../lib/sync/queue';
import { getSignedUrl, uploadFile } from '../cloud-storage.service';
import { addDocPhoto, docPhotoSource, editorPhotoSource } from '../doc-photo.service';

type Handler = { run: (payload: unknown, ctx: { progress: (f: number) => void }) => Promise<void> };
type Queued = { kind: string; key: string; payload: Record<string, unknown> };

jest.mock('../../lib/connectivity', () => ({ ...jest.requireActual('../../lib/connectivity'), isOffline: jest.fn(() => false) }));
jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { newId: () => `m${++n}` };
});
jest.mock('../../utils/toJpeg', () => ({
  toJpeg: jest.fn(async () => ({ uri: 'file:///cache/converted.jpg', mimeType: 'image/jpeg' })),
}));
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => ({ path: `user-1/${path}` })),
  removeFiles: jest.fn(async () => {}),
  getSignedUrl: jest.fn(async (_bucket: string, path: string) => `https://signed/${path}`),
}));
jest.mock('../../lib/pendingFiles', () => ({
  keepPendingFile: jest.fn(async (dir: string, name: string) => `file:///docs/pending-uploads/${dir}/${name}`),
  pendingFileExists: jest.fn(async () => true),
  removePendingFile: jest.fn(async () => {}),
}));
jest.mock('../../lib/photoCache', () => ({
  cachedPhoto: jest.fn(async () => null),
  keepPhoto: jest.fn(async () => {}),
  downloadPhoto: jest.fn(async (id: string) => `file:///docs/doc-photos/${id}.jpg`),
  photoDataUri: jest.fn(async (uri: string) => `data:${uri}`),
}));
jest.mock('../../lib/cache', () => ({
  ...jest.requireActual('../../lib/cache'),
  cacheUser: () => 'user-1',
  saveLocalRow: jest.fn(async () => {}),
  readRow: jest.fn(async () => null),
  markClean: jest.fn(async () => {}),
  remember: jest.fn(),
}));
jest.mock('../../lib/sync', () => {
  const handlers: Record<string, unknown> = {};
  const queued: unknown[] = [];
  return {
    ...jest.requireActual('../../lib/sync/index.web'),
    syncEnabled: true,
    handlers,
    queued,
    registerSyncHandler: (kind: string, handler: unknown) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: unknown) => {
      queued.push(op);
      return op;
    },
  };
});

const syncMock = jest.requireMock('../../lib/sync') as { handlers: Record<string, Handler>; queued: Queued[]; syncEnabled: boolean };
const ctx = { progress: jest.fn() };
const setOffline = (on: boolean) => jest.mocked(isOffline).mockReturnValue(on);
const picked = { uri: 'file:///camera/1.heic', name: null, mimeType: 'image/heic', sizeBytes: null, size: { width: 4032, height: 3024 } };

beforeEach(() => {
  resetSupabaseMock();
  setOffline(false);
  syncMock.queued.length = 0;
  syncMock.syncEnabled = true;
  jest.mocked(saveLocalRow).mockClear();
  jest.mocked(uploadFile).mockClear();
  jest.mocked(removePendingFile).mockClear();
  jest.mocked(keepPhoto).mockClear();
  jest.mocked(downloadPhoto).mockClear();
  jest.mocked(readRow).mockResolvedValue(null);
  jest.mocked(cachedPhoto).mockResolvedValue(null);
  jest.mocked(pendingFileExists).mockResolvedValue(true);
});

describe('addDocPhoto on the iPhone', () => {
  it('keeps the photo on the phone, saves its media row (the document, no lecture) and queues it behind the document', async () => {
    const ready = jest.fn();
    const id = await addDocPhoto('doc-1', picked, { onReady: ready });
    expect(ready).toHaveBeenCalledWith(id, `file:///docs/pending-uploads/doc-1/${id}.jpg`);
    expect(jest.mocked(saveLocalRow).mock.calls[0]).toEqual([
      'media',
      expect.objectContaining({ id, file_id: 'doc-1', lecture_id: null, kind: 'photo', storage_path: `user-1/doc-1/${id}.jpg`, local_uri: `file:///docs/pending-uploads/doc-1/${id}.jpg` }),
    ]);
    expect(syncMock.queued).toEqual([{ kind: 'upload_doc_photo', key: 'doc-1', payload: { fileId: 'doc-1', mediaId: id, uri: `file:///docs/pending-uploads/doc-1/${id}.jpg` } }]);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("an image that can't be read: a message, nothing saved", async () => {
    const { toJpeg } = jest.requireMock('../../utils/toJpeg') as { toJpeg: jest.Mock };
    toJpeg.mockRejectedValueOnce(new Error('decode'));
    await expect(addDocPhoto('doc-1', picked)).rejects.toThrow("This image can't be read. Try a JPEG or PNG.");
    expect(saveLocalRow).not.toHaveBeenCalled();
  });
});

describe('addDocPhoto on the laptop', () => {
  beforeEach(() => {
    syncMock.syncEnabled = false;
  });

  it('shows it first (onReady), then uploads and writes the media row', async () => {
    answer('media', { data: [{ id: 'x' }] });
    const order: string[] = [];
    jest.mocked(uploadFile).mockImplementationOnce(async ({ path }) => {
      order.push('upload');
      return { path: `user-1/${path}` };
    });
    const id = await addDocPhoto('doc-1', picked, { onReady: () => order.push('ready') });
    expect(order).toEqual(['ready', 'upload']);
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'photos', path: `doc-1/${id}.jpg`, contentType: 'image/jpeg' });
    expect(callsOn('media', 'insert')[0][0]).toEqual({ id, file_id: 'doc-1', lecture_id: null, kind: 'photo', storage_path: `user-1/doc-1/${id}.jpg`, mime_type: 'image/jpeg' });
  });

  it('the row is refused: the uploaded file is removed and the student told', async () => {
    const { removeFiles } = jest.requireMock('../cloud-storage.service') as { removeFiles: jest.Mock };
    answer('media', { data: null, error: { code: '42501', message: 'denied' } });
    await expect(addDocPhoto('doc-1', picked)).rejects.toThrow('Could not add the photo.');
    expect(removeFiles).toHaveBeenCalledWith('photos', [expect.stringMatching(/^user-1\/doc-1\/m\d+\.jpg$/)]);
  });

  it('offline: refused before anything shows', async () => {
    setOffline(true);
    const ready = jest.fn();
    await expect(addDocPhoto('doc-1', picked, { onReady: ready })).rejects.toThrow();
    expect(ready).not.toHaveBeenCalled();
  });
});

describe('upload_doc_photo', () => {
  const payload = { fileId: 'doc-1', mediaId: 'm7', uri: 'file:///docs/pending-uploads/doc-1/m7.jpg' };

  it('uploads, writes the media row, keeps a copy for offline, then the pending file goes', async () => {
    answer('media', { data: null }, { data: { id: 'm7', file_id: 'doc-1', updated_at: 'x' } });
    await syncMock.handlers.upload_doc_photo.run(payload, ctx);
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'photos', path: 'doc-1/m7.jpg', upsert: true });
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({ id: 'm7', file_id: 'doc-1', lecture_id: null, storage_path: 'user-1/doc-1/m7.jpg' });
    expect(keepPhoto).toHaveBeenCalledWith('m7', payload.uri);
    expect(removePendingFile).toHaveBeenCalledWith(payload.uri);
  });

  it('sent again after it reached the server: no second upload', async () => {
    answer('media', { data: { id: 'm7', file_id: 'doc-1', updated_at: 'x' } });
    await syncMock.handlers.upload_doc_photo.run(payload, ctx);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(callsOn('media', 'insert')).toEqual([]);
    expect(removePendingFile).toHaveBeenCalledWith(payload.uri);
  });

  it('the photo is gone from the phone and never reached the server: a permanent failure', async () => {
    jest.mocked(pendingFileExists).mockResolvedValue(false);
    answer('media', { data: null });
    await expect(syncMock.handlers.upload_doc_photo.run(payload, ctx)).rejects.toBeInstanceOf(PermanentSyncError);
  });
});

describe('finding a photo', () => {
  it("not uploaded yet: this device's file", async () => {
    jest.mocked(readRow).mockResolvedValue({ id: 'm1', storage_path: 'user-1/doc-1/m1.jpg', local_uri: 'file:///docs/pending-uploads/doc-1/m1.jpg' });
    expect(await docPhotoSource('m1')).toEqual({ url: 'file:///docs/pending-uploads/doc-1/m1.jpg' });
  });

  it('uploaded: a signed link from its row', async () => {
    answer('media', { data: { id: 'm1', storage_path: 'user-1/doc-1/m1.jpg' } });
    expect(await docPhotoSource('m1')).toEqual({ url: 'https://signed/user-1/doc-1/m1.jpg' });
  });

  it('offline and not on this device: offline; no row anywhere: missing (another device may still be sending it)', async () => {
    setOffline(true);
    jest.mocked(readRow).mockResolvedValue({ id: 'm1', storage_path: 'user-1/doc-1/m1.jpg' });
    expect(await docPhotoSource('m1')).toEqual({ state: 'offline' });
    setOffline(false);
    jest.mocked(readRow).mockResolvedValue(null);
    answer('media', { data: null });
    expect(await docPhotoSource('m1')).toEqual({ state: 'missing' });
  });

  describe('for the editor on the iPhone', () => {
    it('its copy on the phone, as a data URI, without asking the server', async () => {
      jest.mocked(cachedPhoto).mockResolvedValue('file:///docs/doc-photos/m1.jpg');
      expect(await editorPhotoSource('m1')).toEqual({ url: 'data:file:///docs/doc-photos/m1.jpg' });
      expect(callsOn('media', 'select')).toEqual([]);
    });

    it('first time: downloads it into the copies (so it shows offline afterwards)', async () => {
      answer('media', { data: { id: 'm1', storage_path: 'user-1/doc-1/m1.jpg' } });
      expect(await editorPhotoSource('m1')).toEqual({ url: 'data:file:///docs/doc-photos/m1.jpg' });
      expect(downloadPhoto).toHaveBeenCalledWith('m1', 'https://signed/user-1/doc-1/m1.jpg');
    });

    it('the download fails: the link itself', async () => {
      jest.mocked(downloadPhoto).mockResolvedValueOnce(null);
      answer('media', { data: { id: 'm1', storage_path: 'user-1/doc-1/m1.jpg' } });
      expect(await editorPhotoSource('m1')).toEqual({ url: 'https://signed/user-1/doc-1/m1.jpg' });
    });
  });

  it('on the laptop: the signed link, nothing kept', async () => {
    const os = Platform.OS;
    Platform.OS = 'web';
    try {
      answer('media', { data: { id: 'm1', storage_path: 'user-1/doc-1/m1.jpg' } });
      expect(await editorPhotoSource('m1')).toEqual({ url: 'https://signed/user-1/doc-1/m1.jpg' });
      expect(downloadPhoto).not.toHaveBeenCalled();
      expect(getSignedUrl).toHaveBeenCalled();
    } finally {
      Platform.OS = os;
    }
  });
});
