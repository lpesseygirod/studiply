import { NetworkError } from '../../cloudRows';
import { reportFailure, reportReachable, resetConnectivityForTests } from '../../connectivity';
import { readThrough, setCacheSession } from '..';

// The cache switched on, as on iPhone (jestSetup switches it off elsewhere).
jest.mock('../store', () => ({ ...jest.requireActual('../store.web'), cacheEnabled: true }));
jest.mock('../library', () => ({ setPullsEnabled: jest.fn() }));

beforeEach(() => {
  resetConnectivityForTests();
  reportReachable();
  setCacheSession('u', true);
});

describe('readThrough', () => {
  it('online: Supabase answers, the cache is not read', async () => {
    const local = jest.fn(async () => 'cached');
    await expect(readThrough(async () => 'server', local)).resolves.toBe('server');
    expect(local).not.toHaveBeenCalled();
  });

  it('a dropped connection falls back to the cache', async () => {
    await expect(
      readThrough(async () => {
        throw new NetworkError();
      }, async () => 'cached'),
    ).resolves.toBe('cached');
  });

  it('shows the offline message when the cache has nothing', async () => {
    await expect(
      readThrough(async () => {
        throw new NetworkError();
      }, async () => null),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('other errors are not hidden by the cache', async () => {
    const local = jest.fn(async () => 'cached');
    await expect(
      readThrough(async () => {
        throw new Error('Could not load the folder.');
      }, local),
    ).rejects.toThrow('Could not load the folder.');
    expect(local).not.toHaveBeenCalled();
  });

  it('known offline: Supabase is not asked at all', async () => {
    reportFailure();
    const remote = jest.fn(async () => 'server');
    await expect(readThrough(remote, async () => 'cached')).resolves.toBe('cached');
    expect(remote).not.toHaveBeenCalled();
  });

  it('signed in offline (session not refreshed yet): the cache answers', async () => {
    setCacheSession('u', false);
    const remote = jest.fn(async () => 'server');
    await expect(readThrough(remote, async () => 'cached')).resolves.toBe('cached');
    expect(remote).not.toHaveBeenCalled();
  });

  it('on a cold start it waits for the first probe', async () => {
    resetConnectivityForTests();
    const answer = readThrough(async () => 'server', async () => 'cached');
    reportFailure();
    await expect(answer).resolves.toBe('cached');
  });
});
