import { canDrop, hitTest, type DragItem, type DropTarget } from '../rules';

const target = (id: string, kind: DropTarget['kind'], x: number, y: number, w: number, h: number): DropTarget => ({
  id,
  kind,
  title: id,
  rect: { x, y, width: w, height: h },
});

describe('hitTest', () => {
  const targets = [target('page', 'root', 0, 0, 400, 800), target('A', 'folder', 20, 20, 100, 100), target('trash', 'trash', 0, 700, 400, 100)];
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
  // A ─ A1 ─ A1a ; B
  const folders = [
    { id: 'A', parent_id: null },
    { id: 'A1', parent_id: 'A' },
    { id: 'A1a', parent_id: 'A1' },
    { id: 'B', parent_id: null },
  ];
  const file: DragItem = { id: 'f', kind: 'file', title: 'File 1', parentId: null };
  const folderA: DragItem = { id: 'A', kind: 'folder', title: 'A', parentId: null };

  it('a file into any folder, onto Trash, or up to the top level', () => {
    expect(canDrop(file, { id: 'A1a', kind: 'folder' }, folders)).toEqual({ ok: true });
    expect(canDrop(file, { id: 'trash', kind: 'trash' }, folders)).toEqual({ ok: true });
    expect(canDrop({ ...file, parentId: 'A' }, { id: 'root', kind: 'root' }, folders)).toEqual({ ok: true });
  });

  it('not where it already is', () => {
    expect(canDrop(file, { id: 'root', kind: 'root' }, folders)).toEqual({ ok: false, reason: 'Already here' });
    expect(canDrop({ ...file, parentId: 'B' }, { id: 'B', kind: 'folder' }, folders).ok).toBe(false);
  });

  it('a folder never into itself or anything inside it', () => {
    expect(canDrop(folderA, { id: 'A', kind: 'folder' }, folders)).toEqual({ ok: false, reason: "Can't move a folder into itself" });
    expect(canDrop(folderA, { id: 'A1a', kind: 'folder' }, folders)).toEqual({
      ok: false,
      reason: "Can't move a folder into one of its own folders",
    });
    expect(canDrop(folderA, { id: 'B', kind: 'folder' }, folders)).toEqual({ ok: true });
  });
});
