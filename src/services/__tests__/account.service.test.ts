/**
 * @jest-environment node
 */
// Delete account (account.service). Online only; the delete-account function called with her
// confirmation only (never an id); with Sign in with Apple, Apple asked once more for the revocation
// code (cancelled: deleted anyway); a refusal thrown with its message.
import { confirmsDeletion, deleteAccount } from '../account.service';

jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../../lib/functions', () => ({ callFunction: jest.fn(async () => ({ deleted: true, files: 3 })) }));
jest.mock('../apple-auth', () => ({ hasAppleIdentity: jest.fn(async () => false), appleCodeForDeletion: jest.fn(async () => ({ code: 'apple-code', client: 'ios' })) }));

const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };
const functions = jest.requireMock('../../lib/functions') as { callFunction: jest.Mock };
const apple = jest.requireMock('../apple-auth') as { hasAppleIdentity: jest.Mock; appleCodeForDeletion: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  connectivity.isOffline.mockReturnValue(false);
  apple.hasAppleIdentity.mockResolvedValue(false);
});

it('the word: DELETE (case and spaces forgiven), nothing else', () => {
  expect(confirmsDeletion('DELETE')).toBe(true);
  expect(confirmsDeletion(' delete ')).toBe(true);
  expect(confirmsDeletion('DELET')).toBe(false);
  expect(confirmsDeletion('')).toBe(false);
});

it('an email account: the function with her confirmation only; the files counted', async () => {
  expect(await deleteAccount()).toEqual({ files: 3 });
  expect(functions.callFunction).toHaveBeenCalledWith('delete-account', { confirm: 'DELETE' });
  expect(apple.appleCodeForDeletion).not.toHaveBeenCalled();
});

it('Sign in with Apple: a fresh code for the revocation; cancelled at Apple: deleted without it', async () => {
  apple.hasAppleIdentity.mockResolvedValue(true);
  await deleteAccount();
  expect(functions.callFunction).toHaveBeenLastCalledWith('delete-account', { confirm: 'DELETE', appleCode: 'apple-code', appleClient: 'ios' });
  apple.appleCodeForDeletion.mockResolvedValueOnce(null);
  await deleteAccount();
  expect(functions.callFunction).toHaveBeenLastCalledWith('delete-account', { confirm: 'DELETE' });
});

it('offline: nothing sent (needs a connection); a refusal is thrown', async () => {
  connectivity.isOffline.mockReturnValue(true);
  await expect(deleteAccount()).rejects.toThrow();
  expect(functions.callFunction).not.toHaveBeenCalled();
  connectivity.isOffline.mockReturnValue(false);
  functions.callFunction.mockRejectedValueOnce(new Error('Your files couldn’t all be deleted.'));
  await expect(deleteAccount()).rejects.toThrow('Your files couldn’t all be deleted.');
});
