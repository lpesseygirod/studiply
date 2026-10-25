// Renaming lectures, photos and PDFs (after step 1.8). A lecture's title is
// stored on its file and in its note; renaming must keep them equal or say so.

import { LEGACY_NOTE_FORMAT, NetworkError } from '../../lib/cloudRows';
import { reportFailure, reportReachable, resetConnectivityForTests } from '../../lib/connectivity';
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import type { Note, Session, SourceFile } from '../../types/database';
import { followNoteTitle, RenameIncompleteError, renameLecture, renameSession, type RenameDeps } from '../session.service';
import { fileExtension, fileLabel, renameLibraryFile, renameSourceFile, type LibraryFile } from '../source-file.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'laptop' }));

const T = '2026-10-25T10:00:00.000Z';

function fakes(opts: { noteFails?: number; revertFails?: boolean; lectureFails?: boolean; hasNote?: boolean } = {}) {
  let titleOnFile = 'Old';
  let titleOnNote = 'Old';
  let noteFailures = opts.noteFails ?? 0;
  let lectureCalls = 0;
  const deps: RenameDeps = {
    online: () => true,
    getSession: async () => ({ id: 'l1', title: titleOnFile }) as Session,
    getNote: async () => (opts.hasNote === false ? null : ({ id: 'n1', title: titleOnNote } as Note)),
    setLectureTitle: async (_id, title) => {
      lectureCalls++;
      if (opts.lectureFails || (opts.revertFails && lectureCalls > 1)) throw new Error('db');
      titleOnFile = title;
      return { id: 'l1', title } as Session;
    },
    setNoteTitle: async (_note, title) => {
      if (noteFailures > 0) {
        noteFailures--;
        throw new Error('db');
      }
      titleOnNote = title;
    },
  };
  return { deps, titles: () => ({ file: titleOnFile, note: titleOnNote }) };
}

describe('renameLecture: one title for the lecture and its note', () => {
  it('renames both, trimmed', async () => {
    const { deps, titles } = fakes();
    expect((await renameLecture(deps, 'l1', '  Tema   2 ')).title).toBe('Tema 2');
    expect(titles()).toEqual({ file: 'Tema 2', note: 'Tema 2' });
  });

  it('refuses an empty or too long name, and offline sends nothing', async () => {
    const { deps, titles } = fakes();
    await expect(renameLecture(deps, 'l1', '   ')).rejects.toThrow('Enter a name.');
    await expect(renameLecture(deps, 'l1', 'x'.repeat(201))).rejects.toThrow('Use at most 200 characters.');
    await expect(renameLecture({ ...deps, online: () => false }, 'l1', 'New')).rejects.toBeInstanceOf(NetworkError);
    expect(titles()).toEqual({ file: 'Old', note: 'Old' });
  });

  it('a lecture without a note: only its file', async () => {
    const { deps, titles } = fakes({ hasNote: false });
    await renameLecture(deps, 'l1', 'New');
    expect(titles().file).toBe('New');
  });

  it('the note fails once: the second try makes them equal', async () => {
    const { deps, titles } = fakes({ noteFails: 1 });
    await renameLecture(deps, 'l1', 'New');
    expect(titles()).toEqual({ file: 'New', note: 'New' });
  });

  it('the note fails twice: the lecture gets its old title back, and nothing changed', async () => {
    const { deps, titles } = fakes({ noteFails: 2 });
    await expect(renameLecture(deps, 'l1', 'New')).rejects.toThrow('Could not rename the lecture. Nothing was changed.');
    expect(titles()).toEqual({ file: 'Old', note: 'Old' });
  });

  it("the note fails and the old title can't be put back: says exactly what is where", async () => {
    const { deps, titles } = fakes({ noteFails: 2, revertFails: true });
    const err = await renameLecture(deps, 'l1', 'New').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RenameIncompleteError);
    expect((err as Error).message).toBe(
      'The lecture is now called “New”, but its note still says “Old”. Rename it again to fix this.',
    );
    expect(titles()).toEqual({ file: 'New', note: 'Old' });
  });

  it('the lecture itself fails: nothing changed, the note is not touched', async () => {
    const { deps, titles } = fakes({ lectureFails: true });
    await expect(renameLecture(deps, 'l1', 'New')).rejects.toThrow('db');
    expect(titles()).toEqual({ file: 'Old', note: 'Old' });
  });
});

describe('renameSession through Supabase (web)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    resetConnectivityForTests();
    reportReachable();
  });

  it("writes files.title and the note's title block", async () => {
    const result = { format: LEGACY_NOTE_FORMAT, title: 'Old', summaryLevel: 'standard', recordingMode: 'lecture', summary: 'S', keyConcepts: [], formulas: [], definitions: [], tags: [], unclearParts: [], manualAnnotations: null, isConfirmed: true };
    const summary = { id: 'n1', user_id: 'u', file_id: 'l1', result, created_at: T, updated_at: T };
    const file = { id: 'l1', user_id: 'u', kind: 'lecture', title: 'Old', course_id: null, folder_id: null, deleted_at: null, created_at: T, updated_at: T, lectures: null, summaries: [] };
    answer('files', { data: file }, {}, { data: { ...file, title: 'New' } });
    answer('summaries', { data: [summary] }, { data: summary }, { data: summary }, { data: [{ ...summary, result: { ...result, title: 'New' } }] });

    const session = await renameSession('l1', 'New');
    expect(session.title).toBe('New');
    expect(callsOn('files', 'update')[0][0]).toEqual({ title: 'New', course_id: undefined, folder_id: undefined });
    const written = callsOn('summaries', 'update')[0][0] as { result: { title: string; blocks: { title: { origin: string } } } };
    expect(written.result.title).toBe('New');
    expect(written.result.blocks.title.origin).toBe('student');
  });

  it('offline: refused before anything is sent', async () => {
    reportFailure();
    await expect(renameSession('l1', 'New')).rejects.toBeInstanceOf(NetworkError);
    expect(callsOn('files', 'update')).toEqual([]);
  });
});

describe("saving the note's title renames the lecture too", () => {
  beforeEach(() => {
    resetSupabaseMock();
    resetConnectivityForTests();
    reportReachable();
  });

  it('writes files.title', async () => {
    answer('files', {}, { data: { id: 'l1', kind: 'lecture', title: 'New', lectures: null, summaries: [] } });
    await followNoteTitle('l1', 'New', 'Old');
    expect(callsOn('files', 'update')[0][0]).toMatchObject({ title: 'New' });
  });

  it('if the lecture fails twice, says the library still shows the old name', async () => {
    answer('files', { error: { code: '42501', message: 'denied' } }, { error: { code: '42501', message: 'denied' } });
    await expect(followNoteTitle('l1', 'New', 'Old')).rejects.toThrow(
      'The note is now called “New”, but the lecture in your library is still “Old”. Rename the lecture to fix this.',
    );
    expect(callsOn('files', 'update')).toHaveLength(2);
  });
});

describe('renaming photos and PDFs', () => {
  const pdf = { id: 'm1', file_type: 'pdf', storage_path: 'u/l1/m1.pdf', mime_type: 'application/pdf', display_name: 'Tema 1.pdf' } as SourceFile;
  const jpeg = { id: 'm2', file_type: 'photo', storage_path: 'u/l1/m2.jpg', mime_type: 'image/jpeg', display_name: null } as SourceFile;
  const png = { id: 'm3', file_type: 'photo', storage_path: 'u/l1/m3.png', mime_type: 'image/png', display_name: null } as SourceFile;
  const heic = { id: 'm4', file_type: 'photo', storage_path: null, mime_type: 'image/heic', display_name: null } as SourceFile;
  const audio = { id: 'c1', file_type: 'audio', storage_path: 'u/l1/0000.m4a', display_name: null } as SourceFile;

  beforeEach(() => {
    resetSupabaseMock();
    resetConnectivityForTests();
    reportReachable();
  });

  it('a PDF keeps ".pdf", even when the student types it', async () => {
    answer('media', { data: [{ id: 'm1' }] }, { data: [{ id: 'm1' }] });
    expect((await renameSourceFile(pdf, 'Tema 2')).display_name).toBe('Tema 2.pdf');
    expect((await renameSourceFile(pdf, 'Tema 2.pdf')).display_name).toBe('Tema 2.pdf');
    expect(callsOn('media', 'update').map(([u]) => u)).toEqual([{ caption: 'Tema 2.pdf' }, { caption: 'Tema 2.pdf' }]);
  });

  it('a photo keeps its real extension: .jpg, .png, or .heic from its type', async () => {
    answer('media', { data: [{ id: 'm2' }] }, { data: [{ id: 'm3' }] }, { data: [{ id: 'm4' }] });
    expect((await renameSourceFile(jpeg, 'Board')).display_name).toBe('Board.jpg');
    expect((await renameSourceFile(png, 'Board')).display_name).toBe('Board.png');
    expect((await renameSourceFile(heic, 'Board')).display_name).toBe('Board.heic');
    expect(fileExtension(png)).toBe('png');
  });

  it('a recording has no name; a file still uploading says so', async () => {
    await expect(renameSourceFile(audio, 'x')).rejects.toThrow('A recording has no name to change.');
    answer('media', { data: [] });
    await expect(renameSourceFile(jpeg, 'Board')).rejects.toThrow('This file is still uploading. Try again in a moment.');
  });

  it('labels: a name once it has one, else Photo N / Document / Recording', () => {
    const files = [audio, jpeg, png, pdf];
    expect(files.map((f) => fileLabel(f, files))).toEqual(['Recording', 'Photo 1', 'Photo 2', 'Tema 1.pdf']);
    expect(fileLabel({ ...png, display_name: 'Board.png' }, files)).toBe('Board.png');
    expect(fileLabel({ ...pdf, display_name: null }, files)).toBe('Document');
  });
});

describe('renaming a file saved to the library', () => {
  beforeEach(() => {
    resetSupabaseMock();
    resetConnectivityForTests();
    reportReachable();
  });

  it('sets the file title and its media caption, keeping the real extension', async () => {
    const file: LibraryFile = {
      id: 'f1', title: 'Board.png', kind: 'image', courseId: 'c', folderId: null, createdAt: T, starredAt: null,
      media: { id: 'm1', file_type: 'photo', storage_path: 'u/f1/m1.png', mime_type: 'image/png', display_name: 'Board.png' } as SourceFile,
    };
    answer('files', { data: [{ id: 'f1' }] });
    answer('media', { data: [{ id: 'm1' }] });
    const renamed = await renameLibraryFile(file, 'Whiteboard');
    expect(renamed.title).toBe('Whiteboard.png');
    expect(callsOn('files', 'update')[0][0]).toEqual({ title: 'Whiteboard.png' });
    expect(callsOn('media', 'update')[0][0]).toEqual({ caption: 'Whiteboard.png' });
  });
});
