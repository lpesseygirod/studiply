// The order and contents of trash.service's writes. There are no
// transactions, so order is what keeps a failure from hiding live items.
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { removeFiles } from '../cloud-storage.service';
import { permanentlyDelete, restoreItem, trashFolder, trashProject } from '../trash.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  removeFiles: jest.fn(async () => {}),
}));

const STAMP = '2026-10-24T10:00:00.000+00:00';

/** Table and first method of each chain, e.g. 'files.update'. */
function steps(): string[] {
  return chains.map((c) => `${c.table}.${c.calls[0]?.[0]}`);
}

beforeEach(() => {
  resetSupabaseMock();
  jest.mocked(removeFiles).mockClear();
});

describe('trashProject', () => {
  it('trashes lectures, then folders, then the course, with one timestamp', async () => {
    await trashProject('c1');

    expect(steps()).toEqual(['files.update', 'folders.update', 'courses.update']);
    const stamps = chains.map((c) => (c.calls[0][1] as { deleted_at: string }).deleted_at);
    expect(new Set(stamps).size).toBe(1);
  });
});

describe('trashFolder', () => {
  it('trashes the lectures of the whole subtree before the folders, the folder itself last', async () => {
    answer('folders', { data: { course_id: 'c1' } }, {
      data: [
        { id: 'top', parent_id: null },
        { id: 'child', parent_id: 'top' },
        { id: 'other', parent_id: null },
      ],
    });

    await trashFolder('top');

    expect(steps()).toEqual(['folders.select', 'folders.select', 'files.update', 'folders.update', 'folders.update']);
    expect(callsOn('files', 'in')[0]).toEqual(['folder_id', ['top', 'child']]);
    expect(callsOn('folders', 'in')[0]).toEqual(['id', ['child']]);
    expect(callsOn('folders', 'eq').at(-1)).toEqual(['id', 'top']);
  });
});

describe('restoreItem', () => {
  it('restoring a lecture first restores its trashed folder and course', async () => {
    answer('files', { data: { deleted_at: STAMP } }, { data: { course_id: 'c1', folder_id: 'f1' } });
    answer('folders', { data: { id: 'f1', parent_id: null, deleted_at: STAMP } });

    await restoreItem({ id: 'l1', type: 'session' });

    expect(steps()).toEqual([
      'files.select', // the lecture's stamp
      'files.select', // its course and folder
      'folders.select',
      'folders.update', // its folder comes back
      'courses.update', // and its course
      'files.update', // then the lecture
    ]);
    expect(callsOn('courses', 'eq')[0]).toEqual(['id', 'c1']);
  });

  it('restoring a course brings back only the children trashed with it', async () => {
    answer('courses', { data: { deleted_at: STAMP } });

    await restoreItem({ id: 'c1', type: 'project' });

    expect(callsOn('folders', 'eq')).toContainEqual(['deleted_at', STAMP]);
    expect(callsOn('files', 'eq')).toContainEqual(['deleted_at', STAMP]);
  });

  it('says so when the item is gone', async () => {
    await expect(restoreItem({ id: 'x', type: 'folder' })).rejects.toThrow('no longer in the trash');
  });
});

describe('permanentlyDelete', () => {
  it("deletes the lecture's row, then its audio and media files", async () => {
    answer('audio_chunks', { data: [{ storage_path: 'u/l1/0000.m4a' }] });
    answer('media', { data: [{ kind: 'photo', storage_path: 'u/l1/board.jpg' }] }, { data: [] });

    await permanentlyDelete({ id: 'l1', type: 'session' });

    expect(steps().at(-1)).toBe('files.delete');
    expect(removeFiles).toHaveBeenCalledWith('audio-chunks', ['u/l1/0000.m4a']);
    expect(removeFiles).toHaveBeenCalledWith('photos', ['u/l1/board.jpg']);
  });

  it('keeps the files when the row could not be deleted', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    answer('audio_chunks', { data: [{ storage_path: 'u/l1/0000.m4a' }] });
    answer('files', { error: { message: 'permission denied' } });

    await expect(permanentlyDelete({ id: 'l1', type: 'session' })).rejects.toThrow('Could not delete');
    expect(removeFiles).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
