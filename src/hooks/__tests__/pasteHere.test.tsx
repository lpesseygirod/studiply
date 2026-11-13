// Paste: a cut item moves here (the clipboard empties), a copied
// PDF or photo is copied here (the clipboard stays), refusals say why and
// change nothing.
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { showAlert } from '../../components/dialogs/dialogs';
import { getClip, setClip } from '../../lib/clipboard';
import { moveItem, saveMediaToLibrary } from '../../services/move.service';
import type { SourceFile } from '../../types/database';
import type { ShelfItem } from '../../utils/shelf';
import { useLibraryDrop } from '../useLibraryDrop';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../services/trash.service', () => ({ trashFolder: jest.fn(), trashSession: jest.fn(), restoreItem: jest.fn() }));
jest.mock('../../components/dialogs/dialogs', () => ({ showAlert: jest.fn() }));
jest.mock('../../services/folder.service', () => ({
  getFolderLinks: jest.fn(async () => [
    { id: 'tema-a', parent_id: null },
    { id: 'tema-b', parent_id: 'tema-a' },
  ]),
}));
jest.mock('../../services/move.service', () => ({
  MoveError: class MoveError extends Error {},
  moveItem: jest.fn(async (_item: unknown, to: unknown) => ({ to, undo: jest.fn(async () => {}) })),
  moveMediaToLibrary: jest.fn(),
  saveMediaToLibrary: jest.fn(async (_file: unknown, name: string, to: unknown) => ({ to, title: `${name}.pdf`, fileId: 'copy', undo: jest.fn(async () => {}) })),
}));
jest.mock('../useItemMenu', () => ({
  libraryFile: jest.fn(async (item: ShelfItem) => ({
    id: item.id,
    title: item.title,
    kind: 'pdf',
    courseId: item.courseId,
    folderId: item.folderId,
    createdAt: 'x',
    starredAt: null,
    media: { id: 'm1', storage_path: 'u/f1/m1.pdf', is_uploaded: true } as SourceFile,
  })),
}));
jest.mock('../useLibraryUpload', () => ({ useLibraryUpload: () => ({ upload: jest.fn(), progress: null }) }));

const showUndo = jest.fn();
const here = { courseId: 'math', folderId: 'tema-b', label: 'Tema B' };
const pdf: ShelfItem = { id: 'f1', type: 'pdf', title: 'Notas.pdf', courseId: 'math', folderId: null, updatedAt: 'x', starredAt: null };
const folderA: ShelfItem = { id: 'tema-a', type: 'folder', title: 'Tema A', courseId: 'math', folderId: null, updatedAt: 'x', starredAt: null };

let api!: ReturnType<typeof useLibraryDrop>;
let mounted: ReactTestRenderer | null = null;
function Harness() {
  api = useLibraryDrop({ showUndo });
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  setClip(null);
  await act(async () => {
    mounted = create(<Harness />);
  });
});
afterEach(() => {
  act(() => mounted?.unmount());
});

describe('pasteHere', () => {
  it('Cut, then Paste: moves it here with Undo; the clipboard empties', async () => {
    setClip({ mode: 'cut', item: pdf });
    await act(() => api.pasteHere(here));
    expect(moveItem).toHaveBeenCalledWith({ type: 'file', id: 'f1', title: 'Notas.pdf', courseId: 'math', folderId: null }, here);
    expect(showUndo).toHaveBeenCalledWith("Moved 'Notas.pdf' to Tema B", expect.any(Function));
    expect(getClip()).toBeNull();
  });

  it('a cut folder pasted into its own subfolder is refused, says why, and stays on the clipboard', async () => {
    setClip({ mode: 'cut', item: folderA });
    await act(() => api.pasteHere(here));
    expect(moveItem).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith("Can't paste 'Tema A' here", "Can't move a folder into one of its own folders");
    expect(getClip()?.item.id).toBe('tema-a');
  });

  it('Copy, then Paste: a copy named "… copy" here, with Undo; the clipboard stays (paste again)', async () => {
    setClip({ mode: 'copy', item: pdf });
    await act(() => api.pasteHere(here));
    expect(saveMediaToLibrary).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'Notas copy', here);
    expect(showUndo).toHaveBeenCalledWith("Copied 'Notas.pdf' to Tema B", expect.any(Function));
    expect(getClip()?.mode).toBe('copy');
  });

  it('nothing on the clipboard: nothing happens', async () => {
    await act(() => api.pasteHere(here));
    expect(moveItem).not.toHaveBeenCalled();
    expect(saveMediaToLibrary).not.toHaveBeenCalled();
  });
});
