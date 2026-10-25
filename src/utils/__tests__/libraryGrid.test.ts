import { cleanName } from '../names';
import { editedLabel, formatLength, sortEntries, tileMeta } from '../libraryGrid';
import type { ShelfItem } from '../shelf';

const now = new Date('2026-10-25T18:00:00');
const item = (title: string, type: ShelfItem['type'], updatedAt: string, over: Partial<ShelfItem> = {}): ShelfItem => ({
  id: title,
  title,
  type,
  courseId: 'c',
  folderId: null,
  updatedAt,
  starredAt: null,
  ...over,
});

describe('cleanName', () => {
  it('trims and collapses spaces; refuses empty or over 200 characters', () => {
    expect(cleanName('  Tema   1 ')).toBe('Tema 1');
    expect(() => cleanName('   ')).toThrow('Enter a name.');
    expect(() => cleanName('x'.repeat(201))).toThrow('Use at most 200 characters.');
    expect(cleanName('x'.repeat(200))).toHaveLength(200);
  });
});

describe('sortEntries', () => {
  const items = [
    item('Tema 10', 'lecture', '2026-10-20'),
    item('slides.pdf', 'pdf', '2026-10-24'),
    item('Tema 2', 'lecture', '2026-10-21'),
    item('Exámenes', 'folder', '2026-10-01'),
    item('board.jpg', 'image', '2026-10-25'),
    item('Apuntes', 'folder', '2026-10-23'),
  ];
  it('Kind: folders, lectures, PDFs, images; each in natural name order', () => {
    expect(sortEntries(items, 'kind').map((i) => i.title)).toEqual(['Apuntes', 'Exámenes', 'Tema 2', 'Tema 10', 'slides.pdf', 'board.jpg']);
  });
  it('Name: folders first, then natural order ignoring case', () => {
    expect(sortEntries(items, 'name').map((i) => i.title)).toEqual(['Apuntes', 'Exámenes', 'board.jpg', 'slides.pdf', 'Tema 2', 'Tema 10']);
  });
  it('Date edited: folders first, then newest first', () => {
    expect(sortEntries(items, 'edited').map((i) => i.title)).toEqual(['Apuntes', 'Exámenes', 'board.jpg', 'slides.pdf', 'Tema 2', 'Tema 10']);
  });
  it('does not change the list it is given', () => {
    const copy = [...items];
    sortEntries(items, 'name');
    expect(items).toEqual(copy);
  });
});

describe('tile meta', () => {
  it('folders count what they hold', () => {
    expect(tileMeta(item('A', 'folder', '2026-10-25', { childCount: 0 }), now)).toBe('Empty');
    expect(tileMeta(item('A', 'folder', '2026-10-25', { childCount: 1 }), now)).toBe('1 item');
    expect(tileMeta(item('A', 'folder', '2026-10-25', { childCount: 7 }), now)).toBe('7 items');
  });
  it('lectures show their length once ready, their state before', () => {
    expect(tileMeta(item('L', 'lecture', '2026-10-25', { status: 'completed', durationSeconds: 5520 }), now)).toBe('1 h 32 min');
    expect(tileMeta(item('L', 'lecture', '2026-10-25', { status: 'transcribing', durationSeconds: 30 }), now)).toBe('Processing');
    expect(tileMeta(item('L', 'lecture', '2026-10-25', { status: 'draft' }), now)).toBe('Not processed yet');
    expect(tileMeta(item('L', 'lecture', '2026-10-25', { status: 'failed' }), now)).toBe('Needs attention');
  });
  it('documents and files say when they were edited', () => {
    expect(tileMeta(item('P', 'pdf', '2026-10-25T09:00:00'), now)).toBe('Edited today');
    expect(tileMeta(item('P', 'pdf', '2026-10-24T09:00:00'), now)).toBe('Edited yesterday');
    // Added on the iPhone, not uploaded yet (step 3.4)
    expect(tileMeta(item('P', 'image', '2026-10-25T09:00:00', { pending: true }), now)).toBe('Waiting to upload');
    expect(editedLabel('2026-10-22T09:00:00', now)).toBe('Edited 3 days ago');
    expect(editedLabel('2026-10-02T09:00:00', now)).toBe('Edited 2 Oct');
    expect(tileMeta(item('E', 'exam_pack', '2026-10-25'), now)).toBe('Exam pack');
  });
  it('formats lengths', () => {
    expect(formatLength(45)).toBe('45 s');
    expect(formatLength(32 * 60)).toBe('32 min');
    expect(formatLength(3600)).toBe('1 h');
  });
});
