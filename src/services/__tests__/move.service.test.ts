// Moving library items, photos and PDFs (src/services/move.service.ts), the
// rules a move and its Undo follow, and the two guarantees around deleting:
// a photo moved to another lecture never goes with its old lecture, and
// retention never removes photos, PDFs or library files.

import { NetworkError } from '../../lib/cloudRows';
import { reportFailure, reportReachable, resetConnectivityForTests } from '../../lib/connectivity';
import { answer, answerStorage, callsOn, chains, resetSupabaseMock, storageCalls } from '../../test-utils/supabaseMock';
import type { SourceFile } from '../../types/database';
import { removeFiles } from '../cloud-storage.service';
import { canMoveTo, MoveError, moveItem, moveMediaToLecture, saveMediaToLibrary, type LibraryItem, type Place } from '../move.service';
import { bulkApplyRetention } from '../source-file.service';
import { permanentlyDelete } from '../trash.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { newId: () => `id-${++n}`, now: () => '2026-10-26T10:00:00.000Z', escapeLike: (s: string) => s };
});
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(),
  getSignedUrl: jest.fn(async () => 'https://signed'),
  removeFiles: jest.fn(async () => {}),
}));

const folders = [
  { id: 'funcions', parent_id: null },
  { id: 'derivades', parent_id: 'funcions' },
  { id: 'limits', parent_id: 'derivades' },
  { id: 'algebra', parent_id: null },
];
const folder: LibraryItem = { type: 'folder', id: 'funcions', title: 'Funcions', courseId: 'math', parentId: null };
const lecture: LibraryItem = { type: 'lecture', id: 'l1', title: 'Lecture 1', courseId: 'math', folderId: null };
const libraryFile: LibraryItem = { type: 'file', id: 'f1', title: 'Tema 1.pdf', courseId: 'math', folderId: 'algebra' };
const to = (courseId: string | null, folderId: string | null, label = 'there'): Place => ({ courseId, folderId, label });

const photo = {
  id: 'm1', session_id: 'lecture-a', file_type: 'photo', storage_path: 'user-1/lecture-a/m1.png',
  mime_type: 'image/png', file_size_bytes: 1200, is_uploaded: true, display_name: null,
} as SourceFile;
const pdf = { ...photo, id: 'm2', file_type: 'pdf', storage_path: 'user-1/lecture-a/m2.pdf', mime_type: 'application/pdf', display_name: 'Tema 1.pdf' } as SourceFile;

beforeEach(() => {
  resetSupabaseMock();
  resetConnectivityForTests();
  reportReachable();
  jest.mocked(removeFiles).mockClear();
});

describe('canMoveTo (also for Phase 2 drop targets)', () => {
  it('a folder never goes into itself or anything below it', () => {
    expect(canMoveTo(folder, to('math', 'funcions'), folders)).toBe('into-itself');
    expect(canMoveTo(folder, to('math', 'limits'), folders)).toBe('into-itself');
  });

  it('a sibling folder, another course or the course top level is fine', () => {
    expect(canMoveTo(folder, to('math', 'algebra'), folders)).toBe('ok');
    expect(canMoveTo(folder, to('science', null), folders)).toBe('ok');
    expect(canMoveTo({ ...folder, parentId: 'algebra' }, to('math', null), folders)).toBe('ok');
  });

  it('where it already is: nothing to do', () => {
    expect(canMoveTo(folder, to('math', null), folders)).toBe('same-place');
    expect(canMoveTo(lecture, to('math', null), [])).toBe('same-place');
    expect(canMoveTo(libraryFile, to('math', 'algebra'), [])).toBe('same-place');
    expect(canMoveTo(lecture, to('science', null), [])).toBe('ok');
  });
});

describe('moveItem and Undo', () => {
  it('a lecture moves and comes back to exactly where it was', async () => {
    const result = await moveItem(lecture, to('science', 'bio', 'Science / Bio'));
    expect(callsOn('files', 'update')[0][0]).toEqual({ course_id: 'science', folder_id: 'bio' });
    expect(result.to.label).toBe('Science / Bio');
    await result.undo();
    expect(callsOn('files', 'update')[1][0]).toEqual({ course_id: 'math', folder_id: null });
  });

  it('a library file moves like a lecture', async () => {
    const result = await moveItem(libraryFile, to('math', null));
    await result.undo();
    expect(callsOn('files', 'update').map(([u]) => u)).toEqual([
      { course_id: 'math', folder_id: null },
      { course_id: 'math', folder_id: 'algebra' },
    ]);
  });

  it('a folder moves with its course, and Undo puts back its parent and course', async () => {
    answer('folders', { data: folders });
    const result = await moveItem({ ...folder, parentId: 'algebra' }, to('science', null));
    await result.undo();
    expect(callsOn('folders', 'update').map(([u]) => u)).toEqual([
      { course_id: 'science', parent_id: null },
      { course_id: 'math', parent_id: 'algebra' },
    ]);
  });

  it('refuses a folder into its own subfolder before asking the database', async () => {
    answer('folders', { data: folders });
    await expect(moveItem(folder, to('math', 'limits'))).rejects.toBeInstanceOf(MoveError);
    expect(callsOn('folders', 'update')).toEqual([]);
  });

  it('offline: nothing is sent', async () => {
    reportFailure();
    await expect(moveItem(lecture, to('science', null))).rejects.toBeInstanceOf(NetworkError);
    expect(chains).toEqual([]);
  });
});

describe('Move to another lecture', () => {
  it("points the photo to lecture B (its file stays where it is), and Undo points it back", async () => {
    answer('media', { data: [{ id: 'm1', lecture_id: 'lecture-b' }] }, { data: [{ id: 'm1', lecture_id: 'lecture-a' }] });
    const result = await moveMediaToLecture(photo, { id: 'lecture-b', title: 'Lecture B' });
    expect(callsOn('media', 'update')[0][0]).toEqual({ lecture_id: 'lecture-b' });
    expect(storageCalls).toEqual([]);
    await result.undo();
    expect(callsOn('media', 'update')[1][0]).toEqual({ lecture_id: 'lecture-a' });
  });

  it('refuses audio, the same lecture, and a photo still uploading', async () => {
    await expect(moveMediaToLecture({ ...photo, file_type: 'audio' }, { id: 'x', title: 'X' })).rejects.toThrow('stays with its lecture');
    await expect(moveMediaToLecture(photo, { id: 'lecture-a', title: 'Lecture A' })).rejects.toThrow("It's already in Lecture A.");
    answer('media', { data: [] });
    await expect(moveMediaToLecture(photo, { id: 'lecture-b', title: 'B' })).rejects.toThrow('still uploading');
  });
});

describe('Save to library', () => {
  it('a PDF becomes its own file with its own copy; the lecture keeps its PDF', async () => {
    const result = await saveMediaToLibrary(pdf, 'Tema 1.pdf', to('math', 'algebra', 'Math / Algebra'));
    expect(callsOn('files', 'insert')[0][0]).toEqual({ id: 'id-1', kind: 'pdf', title: 'Tema 1.pdf', course_id: 'math', folder_id: 'algebra' });
    expect(storageCalls).toEqual([['slides', 'copy', 'user-1/lecture-a/m2.pdf', 'user-1/id-1/id-2.pdf']]);
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({
      id: 'id-2', file_id: 'id-1', lecture_id: null, kind: 'slides', storage_path: 'user-1/id-1/id-2.pdf', caption: 'Tema 1.pdf',
    });
    // The lecture's own media row is never written.
    expect(callsOn('media', 'update')).toEqual([]);
    expect(result.title).toBe('Tema 1.pdf');
  });

  it('a .png photo becomes an image file named with its real extension', async () => {
    await saveMediaToLibrary(photo, 'Photo 1', to('math', null));
    expect(callsOn('files', 'insert')[0][0]).toMatchObject({ kind: 'image', title: 'Photo 1.png' });
    expect(storageCalls[0]).toEqual(['photos', 'copy', 'user-1/lecture-a/m1.png', expect.stringMatching(/^user-1\/id-\d+\/id-\d+\.png$/)]);
  });

  it('copy fails → the new file is deleted again', async () => {
    answerStorage({ error: { message: 'Object not found' } });
    await expect(saveMediaToLibrary(pdf, 'Tema 1.pdf', to('math', null))).rejects.toThrow('Could not save the file.');
    expect(callsOn('files', 'delete')).toHaveLength(1);
    expect(callsOn('media', 'insert')).toEqual([]);
  });

  it('media row refused → the copy is removed and the file deleted', async () => {
    answer('media', { error: { code: '23503', message: 'fk' } });
    await expect(saveMediaToLibrary(pdf, 'Tema 1.pdf', to('math', null))).rejects.toThrow();
    expect(removeFiles).toHaveBeenCalledWith('slides', [expect.stringMatching(/\.pdf$/)]);
    expect(callsOn('files', 'delete')).toHaveLength(1);
  });

  it('Undo deletes the library file and its copy, never the original', async () => {
    const result = await saveMediaToLibrary(pdf, 'Tema 1.pdf', to('math', null));
    await result.undo();
    expect(callsOn('files', 'delete')).toHaveLength(1);
    const removed = jest.mocked(removeFiles).mock.calls.flatMap(([, paths]) => paths);
    expect(removed).not.toContain('user-1/lecture-a/m2.pdf');
    expect(removed[0]).toMatch(/^user-1\/id-\d+\/id-\d+\.pdf$/);
  });

  it('a recording, an upload in progress, or no place: refused', async () => {
    await expect(saveMediaToLibrary({ ...photo, file_type: 'audio' }, 'x', to('math', null))).rejects.toBeInstanceOf(MoveError);
    await expect(saveMediaToLibrary({ ...photo, is_uploaded: false }, 'x', to('math', null))).rejects.toThrow('still uploading');
    await expect(saveMediaToLibrary(photo, 'x', to(null, null))).rejects.toThrow('Choose a course or folder.');
  });
});

describe("deleting a lecture never takes a photo moved away from it", () => {
  it('photo moved to lecture B → lecture A deleted forever → the photo is not removed', async () => {
    answer('media', { data: [{ id: 'm1', lecture_id: 'lecture-b' }] });
    await moveMediaToLecture(photo, { id: 'lecture-b', title: 'Lecture B' });

    // Lecture A still has one photo of its own; the database answers A's rows.
    answer('audio_chunks', { data: [{ storage_path: 'user-1/lecture-a/0000.m4a' }] });
    answer('media', { data: [{ kind: 'photo', storage_path: 'user-1/lecture-a/own.jpg' }] }, { data: [] });
    await permanentlyDelete({ id: 'lecture-a', type: 'session' });

    // Paths come from A's rows (by lecture_id), never from a path prefix.
    expect(callsOn('media', 'in')).toContainEqual(['lecture_id', ['lecture-a']]);
    const removed = jest.mocked(removeFiles).mock.calls.flatMap(([, paths]) => paths);
    expect(removed).toEqual(expect.arrayContaining(['user-1/lecture-a/0000.m4a', 'user-1/lecture-a/own.jpg']));
    expect(removed).not.toContain('user-1/lecture-a/m1.png');
    expect(storageCalls.filter(([, method]) => method === 'list')).toEqual([]);
  });
});

describe('retention never removes photos, PDFs or library files', () => {
  it('"Delete now" removes only the lecture\'s audio chunks', async () => {
    answer('audio_chunks', { data: [{ id: 'c0', storage_path: 'user-1/lecture-a/0000.m4a' }] });
    await bulkApplyRetention('lecture-a', 'delete_now');
    expect(removeFiles).toHaveBeenCalledTimes(1);
    expect(removeFiles).toHaveBeenCalledWith('audio-chunks', ['user-1/lecture-a/0000.m4a']);
    // Never even looks at media (lecture photos/PDFs, or a copy saved to the library).
    expect(chains.some((c) => c.table === 'media' || c.table === 'files')).toBe(false);
  });

  it('"Delete after 3 days" removes nothing now', async () => {
    await bulkApplyRetention('lecture-a', 'delete_3_days');
    expect(removeFiles).not.toHaveBeenCalled();
    expect(callsOn('lectures', 'update')[0][0]).toMatchObject({ audio_retention: 'delete_3_days' });
  });
});
