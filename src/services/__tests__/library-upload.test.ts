// Uploads into a course or folder as library files: which files
// are taken, their names, and on the laptop the order of the steps and the
// clean-up when one fails.
import { NetworkError } from '../../lib/cloudRows';
import { reportFailure, reportReachable, resetConnectivityForTests } from '../../lib/connectivity';
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { removeFiles, uploadFile } from '../cloud-storage.service';
import { cameraPhotoName, checkUpload, libraryTitle, MAX_PDF_BYTES, uploadKindOf, uploadLibraryFile } from '../library-upload.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { newId: () => `id-${++n}` };
});
jest.mock('../../utils/toJpeg', () => ({
  toJpeg: jest.fn(async () => ({ uri: 'blob:converted', mimeType: 'image/jpeg' })),
}));
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => ({ path: `user-1/${path}` })),
  removeFiles: jest.fn(async () => {}),
}));

const at = new Date(2026, 9, 26, 10, 42);
const pdf = { uri: 'blob:pdf', name: 'Tema 1.pdf', mimeType: 'application/pdf', sizeBytes: 1200 };
const png = { uri: 'blob:png', name: 'Pizarra.png', mimeType: 'image/png', sizeBytes: 5000, size: { width: 4000, height: 3000 } };
const here = { courseId: 'math', folderId: 'tema-a' };

beforeEach(() => {
  resetSupabaseMock();
  resetConnectivityForTests();
  reportReachable();
  jest.mocked(uploadFile).mockClear();
  jest.mocked(removeFiles).mockClear();
});

describe('which files are taken', () => {
  it('PDFs and images, by type or by name when the type is missing', () => {
    expect(uploadKindOf({ name: 'a.pdf', mimeType: 'application/pdf' })).toBe('pdf');
    expect(uploadKindOf({ name: 'a.PDF', mimeType: null })).toBe('pdf');
    expect(uploadKindOf({ name: 'shot.png', mimeType: 'image/png' })).toBe('photo');
    expect(uploadKindOf({ name: 'IMG_1.HEIC', mimeType: '' })).toBe('photo');
    expect(uploadKindOf({ name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBeNull();
  });

  it('refuses other files and PDFs over 50 MB, with a message', () => {
    expect(checkUpload({ name: 'a.zip', mimeType: 'application/zip', sizeBytes: 10 })).toEqual({ ok: false, reason: 'Only PDFs, photos and Word files (.docx) for now.' });
    expect(checkUpload({ ...pdf, sizeBytes: MAX_PDF_BYTES + 1 })).toEqual({ ok: false, reason: 'PDFs can be at most 50 MB.' });
    expect(checkUpload(pdf)).toEqual({ ok: true, kind: 'pdf' });
  });
});

describe('names', () => {
  it('keeps the file name; photos end in .jpg (they are stored as JPEG)', () => {
    expect(libraryTitle('pdf', 'Tema 1.pdf', at)).toBe('Tema 1.pdf');
    expect(libraryTitle('photo', 'Pizarra.png', at)).toBe('Pizarra.jpg');
  });

  it('a camera photo without a name: "Photo 26 Oct 10.42.jpg"', () => {
    expect(cameraPhotoName(at)).toBe('Photo 26 Oct 10.42');
    expect(libraryTitle('photo', null, at)).toBe('Photo 26 Oct 10.42.jpg');
    expect(libraryTitle('pdf', '  ', at)).toBe('Document.pdf');
  });
});

describe('uploadLibraryFile on the laptop', () => {
  it('file row in the place, then Storage at {fileId}/{mediaId}, then the media row', async () => {
    const id = await uploadLibraryFile(here, pdf, { now: at });
    expect(callsOn('files', 'insert')[0][0]).toEqual({ id, kind: 'pdf', title: 'Tema 1.pdf', course_id: 'math', folder_id: 'tema-a' });
    const upload = jest.mocked(uploadFile).mock.calls[0][0];
    expect(upload).toMatchObject({ bucket: 'slides', contentType: 'application/pdf', uri: 'blob:pdf' });
    expect(upload.path).toMatch(new RegExp(`^${id}/id-\\d+\\.pdf$`));
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({
      file_id: id, lecture_id: null, kind: 'slides', storage_path: `user-1/${upload.path}`, size_bytes: 1200, caption: 'Tema 1.pdf',
    });
  });

  it('a photo is converted to JPEG and goes to the photos bucket', async () => {
    await uploadLibraryFile(here, png, { now: at });
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'photos', uri: 'blob:converted', contentType: 'image/jpeg' });
    expect(callsOn('files', 'insert')[0][0]).toMatchObject({ kind: 'image', title: 'Pizarra.jpg' });
  });

  it('Storage fails → the file row is deleted again', async () => {
    jest.mocked(uploadFile).mockRejectedValueOnce(new Error('upload failed'));
    await expect(uploadLibraryFile(here, pdf)).rejects.toThrow('upload failed');
    expect(callsOn('files', 'delete')).toHaveLength(1);
    expect(callsOn('media', 'insert')).toEqual([]);
  });

  it('the media row fails → the Storage object and the file row are removed', async () => {
    answer('media', { error: { code: '42501', message: 'denied' } });
    await expect(uploadLibraryFile(here, pdf)).rejects.toThrow('Could not add the file.');
    expect(removeFiles).toHaveBeenCalledWith('slides', [expect.stringMatching(/\.pdf$/)]);
    expect(callsOn('files', 'delete')).toHaveLength(1);
  });

  it('nothing is sent for a refused file, without a place, or offline', async () => {
    await expect(uploadLibraryFile(here, { ...pdf, name: 'a.zip', mimeType: 'application/zip' })).rejects.toThrow('Only PDFs, photos and Word files');
    await expect(uploadLibraryFile({ courseId: null, folderId: null }, pdf)).rejects.toThrow('Open a course or folder first.');
    reportFailure();
    reportFailure();
    reportFailure();
    await expect(uploadLibraryFile(here, pdf)).rejects.toThrow(NetworkError);
    expect(chains).toHaveLength(0);
  });
});
