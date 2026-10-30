import { secureStorage } from '../secureStorage';

/**
 * The Keychain as expo-secure-store uses it: an item keeps the setting it was
 * added with (a write to an existing item only changes its value), and while
 * the phone is locked an item saved "when unlocked" can't be read.
 */
const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
const mockStore = new Map<string, { value: string; access: string }>();
const mockPhone = { locked: false };
const lockedError = () =>
  new Error("Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: User interaction is not allowed.");

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: jest.fn(async (key: string) => {
    const item = mockStore.get(key);
    if (item && mockPhone.locked && item.access === 'WHEN_UNLOCKED') throw lockedError();
    return item?.value ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string, options?: { keychainAccessible?: string }) => {
    const item = mockStore.get(key);
    if (item && mockPhone.locked && item.access === 'WHEN_UNLOCKED') throw lockedError();
    mockStore.set(key, { value, access: item?.access ?? options?.keychainAccessible ?? 'WHEN_UNLOCKED' });
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const KEY = 'sb-127-auth-token';
const values = () => new Map([...mockStore].map(([k, v]) => [k, v.value]));

/** What an older app left: the session saved with SecureStore's default ("when unlocked"). */
function savedByOlderApp(name: string, value: string) {
  const pieces = value.match(/[\s\S]{1,1800}/g) ?? [''];
  pieces.forEach((p, i) => mockStore.set(`${name}.${i}`, { value: p, access: WHEN_UNLOCKED }));
  mockStore.set(`${name}.n`, { value: String(pieces.length), access: WHEN_UNLOCKED });
}

beforeEach(() => {
  mockStore.clear();
  mockPhone.locked = false;
});

describe('secureStorage', () => {
  it('returns null when nothing is stored', async () => {
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });

  it('round-trips a value larger than one chunk', async () => {
    const value = 'x'.repeat(5000) + 'end';
    await secureStorage.setItem(KEY, value);
    expect(values().get(`${KEY}.n`)).toBe('3');
    for (const v of values().values()) expect(v.length).toBeLessThanOrEqual(1800);
    expect(await secureStorage.getItem(KEY)).toBe(value);
  });

  it('drops leftover chunks when overwritten with a shorter value', async () => {
    await secureStorage.setItem(KEY, 'a'.repeat(5000));
    await secureStorage.setItem(KEY, 'short');
    expect(await secureStorage.getItem(KEY)).toBe('short');
    expect([...mockStore.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.n`]);
  });

  it('removes every chunk', async () => {
    await secureStorage.setItem(KEY, 'b'.repeat(4000));
    await secureStorage.removeItem(KEY);
    expect(mockStore.size).toBe(0);
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });

  it('treats a missing chunk as no session', async () => {
    await secureStorage.setItem(KEY, 'c'.repeat(4000));
    mockStore.delete(`${KEY}.1`);
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });
});

describe('the session while the phone is locked', () => {
  it('saves new values readable after the first unlock', async () => {
    await secureStorage.setItem(KEY, 'd'.repeat(4000));
    expect([...mockStore.values()].every((item) => item.access === AFTER_FIRST_UNLOCK)).toBe(true);
    mockPhone.locked = true;
    expect(await secureStorage.getItem(KEY)).toBe('d'.repeat(4000));
  });

  it('re-saves an older app’s session in the foreground, so it reads while locked (no new sign-in)', async () => {
    const session = 'session-' + 'e'.repeat(4000);
    savedByOlderApp(KEY, session);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Locked: the Keychain refuses, as on Lea's phone (30 Oct).
      mockPhone.locked = true;
      await expect(secureStorage.getItem(KEY)).rejects.toThrow('User interaction is not allowed');

      // The app in the foreground: read, then written back with the new setting.
      mockPhone.locked = false;
      expect(await secureStorage.getItem(KEY)).toBe(session);
      await secureStorage.upgradeAll();
      expect(mockStore.get(`${KEY}.a`)?.value).toBe('after-first-unlock');
      for (const [k, item] of mockStore) expect([k, item.access]).toEqual([k, AFTER_FIRST_UNLOCK]);

      // Locked again: readable now.
      mockPhone.locked = true;
      expect(await secureStorage.getItem(KEY)).toBe(session);

      // The values never reach the logs.
      const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
      expect(logged).not.toContain('eeee');
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it('upgrades once: the next foreground leaves the Keychain alone', async () => {
    savedByOlderApp(KEY, 'f'.repeat(100));
    await secureStorage.getItem(KEY);
    await secureStorage.upgradeAll();
    const { deleteItemAsync } = jest.requireMock('expo-secure-store') as { deleteItemAsync: jest.Mock };
    deleteItemAsync.mockClear();
    await secureStorage.upgradeAll();
    expect(deleteItemAsync).not.toHaveBeenCalled();
  });

  it('never writes an older token over a newer one saved during the upgrade', async () => {
    savedByOlderApp(KEY, 'old-token');
    await secureStorage.getItem(KEY);
    // A token refresh lands while the upgrade runs.
    await Promise.all([secureStorage.upgradeAll(), secureStorage.setItem(KEY, 'new-token')]);
    expect(await secureStorage.getItem(KEY)).toBe('new-token');
    mockPhone.locked = true;
    expect(await secureStorage.getItem(KEY)).toBe('new-token');
  });

  it('says when the session is readable again after a locked read failed', async () => {
    savedByOlderApp(KEY, 'g'.repeat(10));
    const readable = jest.fn();
    const stop = secureStorage.onReadable(readable);
    try {
      await secureStorage.getItem(KEY);
      expect(readable).not.toHaveBeenCalled();
      mockPhone.locked = true;
      await expect(secureStorage.getItem(KEY)).rejects.toThrow();
      mockPhone.locked = false;
      await secureStorage.getItem(KEY);
      await secureStorage.getItem(KEY);
      expect(readable).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
});
