// One item menu for the grid, the sidebar and the Library, and the
// empty-space menu (Lea, step 3.2 feedback).
import { actionHint, emptySpaceActions, itemActions, itemNoun, movableItem, pasteLabel, SPACE_LABELS, starTarget } from '../itemMenu';
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
  const inFolder = (type: ShelfItem['type']) => itemActions(item({ type, folderId: 'parent' }));
  const atTop = (type: ShelfItem['type']) => itemActions(item({ type, folderId: null }));

  it('the full menu in order (step 3.4); lectures also Summarize, Extend (7.9), Study reminders (9.2) and Export PDF', () => {
    expect(inFolder('folder')).toEqual(['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'merge', 'examPack', 'delete']);
    expect(inFolder('lecture')).toEqual(['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'summarize', 'extend', 'reminders', 'export', 'delete']);
    expect(actionHint('reminders', 'lecture')).toBeNull();
    expect(inFolder('pdf')).toEqual(['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'delete']);
    expect(inFolder('image')).toEqual(inFolder('pdf'));
    // Documents (step 4.3): as a PDF, without Copy for now.
    expect(inFolder('document')).toEqual(['open', 'rename', 'move', 'moveOut', 'cut', 'star', 'delete']);
    expect(itemNoun('document')).toBe('Document');
    expect(movableItem(item({ type: 'document', folderId: 'f' }))).toMatchObject({ type: 'file', folderId: 'f' });
  });

  it('Move out only for an item inside a folder', () => {
    expect(atTop('pdf')).toEqual(['open', 'rename', 'move', 'cut', 'copy', 'star', 'delete']);
    expect(atTop('folder')).not.toContain('moveOut');
  });

  it('a course: no Move to…, Move out, Cut or Copy (courses are the top level); Course settings… (9.2-2) before Delete', () => {
    expect(atTop('course')).toEqual(['open', 'rename', 'star', 'merge', 'examPack', 'courseSettings', 'delete']);
    expect(actionHint('courseSettings', 'course')).toBeNull();
  });

  it('a Unit summary and an Exam pack have a document’s menu (7.9); they move as files and are named by kind', () => {
    for (const kind of ['unit_summary', 'exam_pack'] as const) {
      expect(inFolder(kind)).toEqual(inFolder('document'));
      expect(atTop(kind)).toEqual(['open', 'rename', 'move', 'cut', 'star', 'delete']);
      expect(movableItem(item({ type: kind, folderId: 'f' }))).toMatchObject({ type: 'file', folderId: 'f' });
    }
    expect([itemNoun('unit_summary'), itemNoun('exam_pack')]).toEqual(['Unit summary', 'Exam pack']);
  });

  it('a lecture’s own photos and PDFs keep Open and Favorites', () => {
    expect(atTop('lecture_photo')).toEqual(['open', 'star']);
  });
});

describe('actionHint (greyed out, with why)', () => {
  it('Copy works for PDFs and photos; lectures and folders: coming soon', () => {
    expect(actionHint('copy', 'pdf')).toBeNull();
    expect(actionHint('copy', 'image')).toBeNull();
    expect(actionHint('copy', 'lecture')).toBe('Coming soon');
    expect(actionHint('copy', 'folder')).toBe('Coming soon');
  });

  it('Summarize (7.3), Extend, Merge and Make exam pack (7.9) work, as does the rest', () => {
    expect(actionHint('summarize', 'lecture')).toBeNull();
    expect(actionHint('extend', 'lecture')).toBeNull();
    expect(actionHint('merge', 'folder')).toBeNull();
    expect(actionHint('examPack', 'course')).toBeNull();
    expect(actionHint('cut', 'folder')).toBeNull();
    expect(actionHint('moveOut', 'lecture')).toBeNull();
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
    expect(movableItem(item({ type: 'lecture_photo' }))).toBeNull();
  });
});

describe('itemNoun', () => {
  it('names the kind in the confirmation', () => {
    expect([itemNoun('course'), itemNoun('folder'), itemNoun('lecture'), itemNoun('pdf')]).toEqual(['Course', 'Folder', 'Lecture', 'File']);
  });
});

describe('emptySpaceActions', () => {
  it('iPhone: New folder, New document, Record, Upload, Take photo, Paste, Sort', () => {
    expect(emptySpaceActions(true).map((a) => SPACE_LABELS[a])).toEqual([
      'New folder',
      'New document',
      'Record',
      'Upload document',
      'Take photo',
      'Paste',
      'Sort by…',
    ]);
  });

  it('laptop: no Take photo', () => {
    expect(emptySpaceActions(false)).toEqual(['newFolder', 'newDocument', 'record', 'upload', 'paste', 'sort']);
  });
});

describe('pasteLabel', () => {
  it("names what it pastes, or says there's nothing to paste", () => {
    expect(pasteLabel(null)).toEqual({ text: 'Paste', hint: 'Nothing to paste' });
    expect(pasteLabel({ mode: 'cut', title: 'Notas.pdf' })).toEqual({ text: "Paste 'Notas.pdf'", hint: null });
    expect(pasteLabel({ mode: 'copy', title: 'Tema 1' })).toEqual({ text: "Paste 'Tema 1'", hint: null });
  });
});
