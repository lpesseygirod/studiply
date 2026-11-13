// Drag and drop rules: the target under the pointer,
// and where a dragged item may go.
import type { SourceFile } from '../../../types/database';
import { canDrop, draggedId, draggedTitle, hitTest, type Dragged, type DropTarget } from '../rules';

const box = (id: string, x: number, y: number, w: number, h: number) => ({ id, rect: { x, y, width: w, height: h } });

describe('hitTest', () => {
  const targets = [box('page', 0, 0, 400, 800), box('A', 20, 20, 100, 100), box('trash', 0, 700, 400, 100)];
  it('finds the innermost target under the pointer', () => {
    expect(hitTest({ x: 50, y: 50 }, targets)?.id).toBe('A');
    expect(hitTest({ x: 300, y: 300 }, targets)?.id).toBe('page');
    expect(hitTest({ x: 10, y: 750 }, targets)?.id).toBe('trash');
    expect(hitTest({ x: 500, y: 50 }, targets)).toBeNull();
  });
  it('counts the edges as inside', () => {
    expect(hitTest({ x: 120, y: 120 }, targets)?.id).toBe('A');
  });
});

describe('canDrop', () => {
  // Math: A ─ A1 ─ A1a ; B.   Science: S
  const folders = [
    { id: 'A', parent_id: null },
    { id: 'A1', parent_id: 'A' },
    { id: 'A1a', parent_id: 'A1' },
    { id: 'B', parent_id: null },
    { id: 'S', parent_id: null },
  ];
  const into = (folderId: string | null, courseId = 'math'): DropTarget => ({
    id: folderId ?? courseId,
    kind: 'place',
    place: { courseId, folderId, label: folderId ?? courseId },
  });
  const trash: DropTarget = { id: 'trash', kind: 'trash' };
  const file = (folderId: string | null): Dragged => ({
    kind: 'item',
    item: { type: 'lecture', id: 'f', title: 'Lecture 1', courseId: 'math', folderId },
  });
  const folder = (id: string, parentId: string | null): Dragged => ({
    kind: 'item',
    item: { type: 'folder', id, title: id, courseId: 'math', parentId },
  });
  const photo: Dragged = { kind: 'media', file: { id: 'm1', session_id: 'l1' } as SourceFile, name: 'Photo 1' };

  it('a file goes down three levels and back up one level at a time', () => {
    expect(canDrop(file(null), into('A'), folders)).toEqual({ ok: true });
    expect(canDrop(file('A'), into('A1'), folders)).toEqual({ ok: true });
    expect(canDrop(file('A1'), into('A1a'), folders)).toEqual({ ok: true });
    expect(canDrop(file('A1a'), into('A1'), folders)).toEqual({ ok: true });
    expect(canDrop(file('A1'), into('A'), folders)).toEqual({ ok: true });
    expect(canDrop(file('A'), into(null), folders)).toEqual({ ok: true });
  });

  it('not where it already is', () => {
    expect(canDrop(file(null), into(null), folders)).toEqual({ ok: false, reason: 'Already here' });
    expect(canDrop(file('B'), into('B'), folders)).toEqual({ ok: false, reason: 'Already here' });
  });

  it('a folder never into itself or anything inside it', () => {
    expect(canDrop(folder('A', null), into('A'), folders)).toEqual({ ok: false, reason: "Can't move a folder into itself" });
    expect(canDrop(folder('A', null), into('A1'), folders)).toEqual({
      ok: false,
      reason: "Can't move a folder into one of its own folders",
    });
    expect(canDrop(folder('A', null), into('A1a'), folders).ok).toBe(false);
    expect(canDrop(folder('A', null), into('B'), folders)).toEqual({ ok: true });
    expect(canDrop(folder('A1', 'A'), into(null), folders)).toEqual({ ok: true });
  });

  it('to another course (its top level or a folder in it)', () => {
    expect(canDrop(file(null), into(null, 'science'), folders)).toEqual({ ok: true });
    expect(canDrop(folder('A', null), into('S', 'science'), folders)).toEqual({ ok: true });
  });

  it('Trash takes library items, not a lecture photo (deleting one is permanent)', () => {
    expect(canDrop(folder('A', null), trash, folders)).toEqual({ ok: true });
    expect(canDrop(file('A1'), trash, folders)).toEqual({ ok: true });
    expect(canDrop(photo, trash, folders)).toEqual({ ok: false, reason: 'Delete it from its menu' });
  });

  it('a lecture photo can go to any course or folder (it leaves its lecture)', () => {
    expect(canDrop(photo, into('A1a'), folders)).toEqual({ ok: true });
    expect(canDrop(photo, into(null, 'science'), folders)).toEqual({ ok: true });
  });

  it('names what is dragged', () => {
    expect([draggedId(file(null)), draggedTitle(file(null))]).toEqual(['f', 'Lecture 1']);
    expect([draggedId(photo), draggedTitle(photo)]).toEqual(['m1', 'Photo 1']);
  });
});
