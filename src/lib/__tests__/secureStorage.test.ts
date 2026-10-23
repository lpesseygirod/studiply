import { secureStorage } from '../secureStorage';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const KEY = 'sb-127-auth-token';

beforeEach(() => mockStore.clear());

describe('secureStorage', () => {
  it('returns null when nothing is stored', async () => {
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });

  it('round-trips a value larger than one chunk', async () => {
    const value = 'x'.repeat(5000) + 'end';
    await secureStorage.setItem(KEY, value);
    expect(mockStore.get(`${KEY}.n`)).toBe('3');
    for (const v of mockStore.values()) expect(v.length).toBeLessThanOrEqual(1800);
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
