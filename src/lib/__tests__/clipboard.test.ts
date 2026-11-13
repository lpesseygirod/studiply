// The app's clipboard for Cut / Copy / Paste.
import { forgetClip, getClip, setClip } from '../clipboard';
import type { ShelfItem } from '../../utils/shelf';

const item = (id: string): ShelfItem => ({ id, type: 'pdf', title: 'Notas.pdf', courseId: 'c', folderId: null, updatedAt: 'x', starredAt: null });

beforeEach(() => setClip(null));

describe('clipboard', () => {
  it('holds one item: a newer Cut or Copy replaces it', () => {
    setClip({ mode: 'cut', item: item('a') });
    setClip({ mode: 'copy', item: item('b') });
    expect(getClip()).toEqual({ mode: 'copy', item: item('b') });
  });

  it('forgets an item that was deleted or moved elsewhere, and only that one', () => {
    setClip({ mode: 'cut', item: item('a') });
    forgetClip('b');
    expect(getClip()?.item.id).toBe('a');
    forgetClip('a');
    expect(getClip()).toBeNull();
  });
});
