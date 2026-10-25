// One item menu for the grid, the sidebar and the Library, and the
// empty-space menu (Lea, step 3.2 feedback).
import { emptySpaceActions, itemActions, itemNoun, movableItem, SPACE_LABELS, starTarget } from '../itemMenu';
import type { ShelfItem } from '../shelf';

const item = (over: Partial<ShelfItem>): ShelfItem => ({
  id: 'i',
  type: 'folder',
  title: 'Tema 1',
  courseId: 'c',
  folderId: 'parent',
  updatedAt: '2026-10-25T10:00:00Z',
  starredAt: null,
  ...over,
});

describe('itemActions', () => {
  it('gives folders, lectures and files the full menu, lectures also Export PDF', () => {
    expect(itemActions('folder')).toEqual(['open', 'rename', 'move', 'star', 'delete']);
    expect(itemActions('lecture')).toEqual(['open', 'rename', 'move', 'star', 'export', 'delete']);
    expect(itemActions('pdf')).toEqual(['open', 'rename', 'move', 'star', 'delete']);
    expect(itemActions('image')).toEqual(itemActions('pdf'));
  });

  it('a course has no Move to… (courses are the top level)', () => {
    expect(itemActions('course')).toEqual(['open', 'rename', 'star', 'delete']);
  });

  it('kinds without their own actions yet keep Open and Favorites', () => {
    expect(itemActions('exam_pack')).toEqual(['open', 'star']);
    expect(itemActions('lecture_photo')).toEqual(['open', 'star']);
  });
});

describe('starTarget', () => {
  it('stars each kind in its own table', () => {
    expect(starTarget(item({ type: 'course' }))).toEqual({ type: 'course', id: 'i' });
    expect(starTarget(item({ type: 'folder' }))).toEqual({ type: 'folder', id: 'i' });
    expect(starTarget(item({ type: 'lecture' }))).toEqual({ type: 'file', id: 'i' });
    expect(starTarget(item({ type: 'lecture_pdf' }))).toEqual({ type: 'media', id: 'i' });
  });
});

describe('movableItem', () => {
  it('a folder moves with its parent, a lecture or file with its folder', () => {
    expect(movableItem(item({ type: 'folder' }))).toEqual({ type: 'folder', id: 'i', title: 'Tema 1', courseId: 'c', parentId: 'parent' });
    expect(movableItem(item({ type: 'lecture' }))).toEqual({ type: 'lecture', id: 'i', title: 'Tema 1', courseId: 'c', folderId: 'parent' });
    expect(movableItem(item({ type: 'image' }))?.type).toBe('file');
  });

  it('courses and other kinds cannot be moved', () => {
    expect(movableItem(item({ type: 'course' }))).toBeNull();
    expect(movableItem(item({ type: 'exam_pack' }))).toBeNull();
  });
});

describe('itemNoun', () => {
  it('names the kind in the confirmation', () => {
    expect([itemNoun('course'), itemNoun('folder'), itemNoun('lecture'), itemNoun('pdf')]).toEqual(['Course', 'Folder', 'Lecture', 'File']);
  });
});

describe('emptySpaceActions', () => {
  it('iPhone: Take photo between Upload and Record', () => {
    expect(emptySpaceActions(true).map((a) => SPACE_LABELS[a])).toEqual([
      'New folder',
      'Upload photo or PDF',
      'Take photo',
      'Record lecture here',
      'Sort by…',
    ]);
  });

  it('laptop: no Take photo', () => {
    expect(emptySpaceActions(false)).toEqual(['newFolder', 'upload', 'record', 'sort']);
  });
});
