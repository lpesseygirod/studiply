import type { Session } from '@supabase/supabase-js';

import {
  authStorageKey,
  parseStoredSession,
  readStoredSession,
  removeStoredSession,
  startupState,
} from '../offlineSession';
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

const LOCAL = 'http://192.168.1.23:54321';
const stored = {
  access_token: 'expired',
  refresh_token: 'refresh-1',
  expires_at: 1,
  user: { id: 'user-1' },
};

beforeEach(() => mockStore.clear());

describe('authStorageKey', () => {
  // supabase-js: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  it('matches the key supabase-js uses', () => {
    expect(authStorageKey(LOCAL)).toBe('sb-192-auth-token');
    expect(authStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
    expect(authStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
    expect(authStorageKey('https://ABC.supabase.co/')).toBe('sb-abc-auth-token');
    expect(authStorageKey('http://localhost:54321')).toBe('sb-localhost-auth-token');
  });
});

describe('parseStoredSession', () => {
  it('accepts an expired session that can still be refreshed', () => {
    expect(parseStoredSession(JSON.stringify(stored))?.refresh_token).toBe('refresh-1');
  });

  it('rejects missing, broken or unusable values', () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession('{not json')).toBeNull();
    expect(parseStoredSession('null')).toBeNull();
    expect(parseStoredSession(JSON.stringify({ ...stored, refresh_token: '' }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ ...stored, user: undefined }))).toBeNull();
  });
});

describe('readStoredSession / removeStoredSession', () => {
  it('reads what supabase-js wrote through secureStorage, and removes it', async () => {
    await secureStorage.setItem('sb-192-auth-token', JSON.stringify(stored));
    expect((await readStoredSession(LOCAL))?.user.id).toBe('user-1');
    await removeStoredSession(LOCAL);
    expect(await readStoredSession(LOCAL)).toBeNull();
  });
});

describe('startupState', () => {
  const session = stored as unknown as Session;

  it('uses the reported session when Supabase has one', () => {
    expect(startupState(session, session)).toBe('signed_in');
  });

  it('stays signed in offline when only the stored session is left', () => {
    expect(startupState(null, session)).toBe('offline');
  });

  it('signs out when the stored session is gone (refresh token refused)', () => {
    expect(startupState(null, null)).toBe('signed_out');
  });
});
