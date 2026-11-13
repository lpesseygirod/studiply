// Add to / Remove from Favorites in an item's menu (starred_at).
import { NetworkError, OFFLINE_MESSAGE } from '../../lib/cloudRows';
import { starButton, toggleStar } from '../star';

const mockSetStarredAt = jest.fn();
const mockShowAlert = jest.fn();
jest.mock('../../services/shelf.service', () => ({ setStarredAt: (...a: unknown[]) => mockSetStarredAt(...a) }));
jest.mock('../../components/dialogs/dialogs', () => ({ showAlert: (...a: unknown[]) => mockShowAlert(...a) }));

const OLD = '2026-10-20T10:00:00.000Z';

beforeEach(() => {
  mockSetStarredAt.mockReset().mockResolvedValue(undefined);
  mockShowAlert.mockReset();
});

describe('toggleStar', () => {
  it('adds an item to Favorites, and Undo removes it again', async () => {
    const showUndo = jest.fn();
    expect(await toggleStar({ type: 'course', id: 'math' }, 'Math', null, showUndo)).toBe(true);
    const [target, value] = mockSetStarredAt.mock.calls[0];
    expect(target).toEqual({ type: 'course', id: 'math' });
    expect(typeof value).toBe('string');
    expect(showUndo.mock.calls[0][0]).toBe('Added to Favorites');
    showUndo.mock.calls[0][1]();
    expect(mockSetStarredAt).toHaveBeenLastCalledWith({ type: 'course', id: 'math' }, null);
  });

  it('removes it, and Undo puts the old time back', async () => {
    const showUndo = jest.fn();
    await toggleStar({ type: 'file', id: 'l1' }, 'Lecture 1', OLD, showUndo);
    expect(mockSetStarredAt).toHaveBeenCalledWith({ type: 'file', id: 'l1' }, null);
    expect(showUndo.mock.calls[0][0]).toBe('Removed from Favorites');
    showUndo.mock.calls[0][1]();
    expect(mockSetStarredAt).toHaveBeenLastCalledWith({ type: 'file', id: 'l1' }, OLD);
  });

  it('offline: says so, changes nothing, offers no Undo', async () => {
    mockSetStarredAt.mockRejectedValue(new NetworkError());
    const showUndo = jest.fn();
    expect(await toggleStar({ type: 'folder', id: 'f' }, 'Funcions', null, showUndo)).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith('Could not add to Favorites', OFFLINE_MESSAGE);
    expect(showUndo).not.toHaveBeenCalled();
  });
});

describe('lecture photos and PDFs (media)', () => {
  it('writes the media row and tells the screen the new value, also after Undo', async () => {
    const showUndo = jest.fn();
    const onChanged = jest.fn();
    await toggleStar({ type: 'media', id: 'm1' }, 'Photo 2', null, showUndo, onChanged);
    expect(mockSetStarredAt.mock.calls[0][0]).toEqual({ type: 'media', id: 'm1' });
    expect(typeof onChanged.mock.calls[0][0]).toBe('string');
    showUndo.mock.calls[0][1]();
    await new Promise((r) => setTimeout(r, 0));
    expect(onChanged).toHaveBeenLastCalledWith(null);
  });
});

describe('starButton', () => {
  it('says Add to Favorites or Remove from Favorites', () => {
    expect(starButton({ type: 'file', id: 'x' }, 'X', null, jest.fn()).text).toBe('Add to Favorites');
    expect(starButton({ type: 'file', id: 'x' }, 'X', OLD, jest.fn()).text).toBe('Remove from Favorites');
  });
});
