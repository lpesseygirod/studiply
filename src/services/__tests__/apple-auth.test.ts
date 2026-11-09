/**
 * @jest-environment node
 */
// Step 10.1, Sign in with Apple's shared part (apple-auth-core): Apple gets the SHA-256 of a fresh
// nonce, Supabase the nonce itself; the name Apple sends only the first time is kept (only when none is set).
import { createHash } from 'node:crypto';

import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { finishAppleSignIn, fullNameOf, makeNonce } from '../apple-auth-core';

jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomBytes: (n: number) => new Uint8Array(crypto.randomBytes(n)),
    digestStringAsync: async (_alg: string, value: string) => crypto.createHash('sha256').update(value).digest('hex'),
  };
});

const mockSignInWithIdToken = jest.fn();
const mockUpdateUser = jest.fn(async (..._a: unknown[]) => ({ data: {}, error: null }));
const signInWithIdToken = mockSignInWithIdToken;
const updateUser = mockUpdateUser;
jest.mock('../../lib/supabase', () => {
  const mock = jest.requireActual('../../test-utils/supabaseMock').module;
  return {
    ...mock,
    supabase: {
      ...mock.supabase,
      auth: { ...mock.supabase.auth, signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a), updateUser: (...a: unknown[]) => mockUpdateUser(...a) },
    },
  };
});

beforeEach(() => {
  resetSupabaseMock();
  jest.clearAllMocks();
});

it('a fresh nonce each time; Apple gets its SHA-256 (hex)', async () => {
  const a = await makeNonce();
  const b = await makeNonce();
  expect(a.raw).toMatch(/^[0-9a-f]{64}$/);
  expect(a.raw).not.toBe(b.raw);
  expect(a.hashed).toBe(createHash('sha256').update(a.raw).digest('hex'));
});

it('the name from Apple’s parts; none (every later sign-in): null', () => {
  expect(fullNameOf({ givenName: 'Lea', familyName: 'Pessey' })).toBe('Lea Pessey');
  expect(fullNameOf({ givenName: 'Lea', familyName: null })).toBe('Lea');
  expect(fullNameOf({ givenName: null, familyName: null })).toBeNull();
  expect(fullNameOf(null)).toBeNull();
});

it('Supabase gets the token and the raw nonce; the first name kept when she has none', async () => {
  signInWithIdToken.mockResolvedValueOnce({ data: { user: { id: 'u1', user_metadata: {} } }, error: null });
  answer('profiles', { data: null });
  await finishAppleSignIn('id-token', 'raw-nonce', 'Lea Pessey');
  expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'id-token', nonce: 'raw-nonce' });
  expect(updateUser).toHaveBeenCalledWith({ data: { display_name: 'Lea Pessey' } });
  expect(callsOn('profiles', 'update')[0][0]).toEqual({ display_name: 'Lea Pessey' });
});

it('a name already set is kept; a refused token throws', async () => {
  signInWithIdToken.mockResolvedValueOnce({ data: { user: { id: 'u1', user_metadata: { display_name: 'Lea' } } }, error: null });
  await finishAppleSignIn('id-token', 'raw', 'Someone Else');
  expect(updateUser).not.toHaveBeenCalled();
  signInWithIdToken.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Invalid nonce' } });
  await expect(finishAppleSignIn('bad', 'raw', null)).rejects.toThrow('Invalid nonce');
});
