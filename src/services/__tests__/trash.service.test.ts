// The order and contents of trash.service's writes. There are no
// transactions, so order is what keeps a failure from hiding live items.
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { removeFiles } from '../cloud-storage.service';
import { autoCleanTrash, emptyTrash, getTrashItems, permanentlyDelete, restoreItem, trashFolder, trashProject } from '../trash.service';

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

describe('getTrashItems', () => {
  it('real kinds and places; what went with its folder is inside it', async () => {
    answer('courses', { data: [{ id: 'math', name: 'Math', deleted_at: null }] });
    answer('folders', {
      data: [
        { id: 'tema1', name: 'Tema 1', course_id: 'math', parent_id: null, deleted_at: STAMP },
        { id: 'tema2', name: 'Tema 2', course_id: 'math', parent_id: null, deleted_at: null },
      ],
    });
    answer('files', {
      data: [
        { id: 'inside', title: 'Clase 1', kind: 'lecture', course_id: 'math', folder_id: 'tema1', deleted_at: STAMP },
        { id: 'pdf', title: 'Notas.pdf', kind: 'pdf', course_id: 'math', folder_id: 'tema2', deleted_at: '2026-10-25T10:00:00.000+00:00' },
      ],
    });
    const items = await getTrashItems('u');
    expect(items.map((i) => [i.id, i.kind, i.place])).toEqual([
      ['pdf', 'pdf', 'Math › Tema 2'],
      ['tema1', 'folder', 'Math'],
    ]);
  });
});

describe('emptyTrash and autoCleanTrash', () => {
  it('Empty deletes everything in the trash (no date limit)', async () => {
    answer('courses', { data: [] });
    answer('folders', { data: [] });
    answer('files', { data: [{ id: 'l1' }] });
    await emptyTrash('u');
    const lists = chains.filter((c) => c.calls[0]?.[0] === 'select');
    expect(lists.some((c) => c.calls.some(([m]) => m === 'lt'))).toBe(false);
    expect(steps()).toContain('files.delete');
  });

  it('the sign-in clean-up only takes what is older than 30 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T12:00:00.000Z'));
    for (const table of ['courses', 'folders', 'files']) answer(table, { data: [] });
    await autoCleanTrash('u');
    const cutoffs = chains.flatMap((c) => c.calls.filter(([m]) => m === 'lt').map(([, , v]) => v));
    expect(cutoffs).toEqual(Array(3).fill('2026-09-26T12:00:00.000Z'));
    jest.useRealTimers();
  });
});

describe('permanentlyDelete: a photo moved out of a lecture', () => {
  it('a library file\'s photo is found by file_id (its old lecture path is still removed with it)', async () => {
    answer('audio_chunks', { data: [] });
    answer('media', { data: [] }, { data: [{ kind: 'photo', storage_path: 'u/old-lecture/m1.jpg' }] });
    await permanentlyDelete({ id: 'f1', type: 'session' });
    expect(removeFiles).toHaveBeenCalledWith('photos', ['u/old-lecture/m1.jpg']);
    const mediaQueries = chains.filter((c) => c.table === 'media').map((c) => c.calls.find(([m]) => m === 'in'));
    expect(mediaQueries).toEqual([['in', 'lecture_id', ['f1']], ['in', 'file_id', ['f1']]]);
  });
});
