// Accepting the Terms and the Privacy Policy (16+). The sign-up metadata carries the
// texts' version; the gate is asked only when the server says there is no acceptance; accepting
// adds her row (never the time: the server's); boxes ticked before Continue with Apple count.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { LEGAL_VERSION } from '../../legal/texts.generated';
import { acceptTerms, checkTerms, rememberTicked, signUpAcceptance, termsStatus, UNDER_AGE_MESSAGE } from '../terms.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

beforeEach(async () => {
  resetSupabaseMock();
  rememberTicked(false);
  await AsyncStorage.clear();
});

it('sign-up sends the texts’ version and 16+ in the metadata', () => {
  expect(signUpAcceptance()).toEqual({ terms_version: LEGAL_VERSION, age_16: true });
  expect(UNDER_AGE_MESSAGE).toBe('Studiply is for people aged 16 or older.');
});

describe('termsStatus', () => {
  it('missing only when the server has no acceptance for her', async () => {
    answer('terms_acceptances', { data: [] });
    expect(await termsStatus('user-1')).toBe('missing');
    expect(callsOn('terms_acceptances', 'eq')[0]).toEqual(['user_id', 'user-1']);
  });

  it('accepted when there is one, then remembered on this device (no second request)', async () => {
    answer('terms_acceptances', { data: [{ id: 'a' }] });
    expect(await termsStatus('user-1')).toBe('accepted');
    expect(await termsStatus('user-1')).toBe('accepted');
    expect(callsOn('terms_acceptances', 'select')).toHaveLength(1);
  });

  it('unknown when the server can’t be asked (offline): nothing is blocked', async () => {
    answer('terms_acceptances', { error: { message: 'Failed to fetch' } });
    expect(await termsStatus('user-1')).toBe('unknown');
  });

  it('per account: another account on this device is asked of the server', async () => {
    answer('terms_acceptances', { data: [{ id: 'a' }] }, { data: [] });
    expect(await termsStatus('user-1')).toBe('accepted');
    expect(await termsStatus('user-2')).toBe('missing');
  });
});

describe('acceptTerms', () => {
  it('adds her acceptance of the current version, 16+, with its source, and no time (the server’s)', async () => {
    answer('terms_acceptances', { data: null });
    await acceptTerms('user-1', 'gate');
    expect(callsOn('terms_acceptances', 'insert')[0][0]).toEqual({ terms_version: LEGAL_VERSION, age_confirmed: true, source: 'gate' });
    // Remembered: no request for the status afterwards.
    expect(await termsStatus('user-1')).toBe('accepted');
    expect(callsOn('terms_acceptances', 'select')).toHaveLength(0);
  });

  it('a version already accepted (another device, a second tap) is not an error', async () => {
    answer('terms_acceptances', { error: { code: '23505', message: 'duplicate key' } });
    await expect(acceptTerms('user-1', 'gate')).resolves.toBeUndefined();
  });

  it('any other refusal is an error, and nothing is remembered', async () => {
    answer('terms_acceptances', { error: { code: '42501', message: 'permission denied' } }, { data: [] });
    await expect(acceptTerms('user-1', 'gate')).rejects.toThrow();
    expect(await termsStatus('user-1')).toBe('missing');
  });
});

describe('checkTerms (after sign-in)', () => {
  it('missing: the gate asks', async () => {
    answer('terms_acceptances', { data: [] });
    expect(await checkTerms('user-1')).toBe('missing');
    expect(callsOn('terms_acceptances', 'insert')).toHaveLength(0);
  });

  it('boxes ticked before Continue with Apple: saved at once (at sign-up), no gate', async () => {
    rememberTicked(true);
    answer('terms_acceptances', { data: [] }, { data: null });
    expect(await checkTerms('user-1')).toBe('accepted');
    expect(callsOn('terms_acceptances', 'insert')[0][0]).toEqual({ terms_version: LEGAL_VERSION, age_confirmed: true, source: 'sign_up' });
  });

  it('the ticks count once: a later account on this device is asked', async () => {
    rememberTicked(true);
    answer('terms_acceptances', { data: [] }, { data: null }, { data: [] });
    expect(await checkTerms('user-1')).toBe('accepted');
    expect(await checkTerms('user-2')).toBe('missing');
  });

  it('an account that already accepted is never written again', async () => {
    rememberTicked(true);
    answer('terms_acceptances', { data: [{ id: 'a' }] });
    expect(await checkTerms('user-1')).toBe('accepted');
    expect(callsOn('terms_acceptances', 'insert')).toHaveLength(0);
  });
});
