// Star / Unstar from an item's menu (pulled forward from step 3.4 into 2.2).
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
  it('stars an unstarred item, and Undo clears it again', async () => {
    const showUndo = jest.fn();
    expect(await toggleStar({ type: 'course', id: 'math' }, 'Math', null, showUndo)).toBe(true);
    const [target, value] = mockSetStarredAt.mock.calls[0];
    expect(target).toEqual({ type: 'course', id: 'math' });
    expect(typeof value).toBe('string');
    expect(showUndo.mock.calls[0][0]).toBe('Starred "Math"');
    showUndo.mock.calls[0][1]();
    expect(mockSetStarredAt).toHaveBeenLastCalledWith({ type: 'course', id: 'math' }, null);
  });

  it('unstars, and Undo puts the old star time back', async () => {
    const showUndo = jest.fn();
    await toggleStar({ type: 'file', id: 'l1' }, 'Lecture 1', OLD, showUndo);
    expect(mockSetStarredAt).toHaveBeenCalledWith({ type: 'file', id: 'l1' }, null);
    expect(showUndo.mock.calls[0][0]).toBe('Unstarred "Lecture 1"');
    showUndo.mock.calls[0][1]();
    expect(mockSetStarredAt).toHaveBeenLastCalledWith({ type: 'file', id: 'l1' }, OLD);
  });

  it('offline: says so, changes nothing, offers no Undo', async () => {
    mockSetStarredAt.mockRejectedValue(new NetworkError());
    const showUndo = jest.fn();
    expect(await toggleStar({ type: 'folder', id: 'f' }, 'Funcions', null, showUndo)).toBe(false);
    expect(mockShowAlert).toHaveBeenCalledWith('Could not star', OFFLINE_MESSAGE);
    expect(showUndo).not.toHaveBeenCalled();
  });
});

describe('starButton', () => {
  it('says Star or Unstar', () => {
    expect(starButton({ type: 'file', id: 'x' }, 'X', null, jest.fn()).text).toBe('Star');
    expect(starButton({ type: 'file', id: 'x' }, 'X', OLD, jest.fn()).text).toBe('Unstar');
  });
});
