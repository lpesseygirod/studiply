// Free-credit codes (part A): the code's form, the answers in her words, the dashboard's checks, the
// history row, and the admin menu's paths.
import { CODE_PATTERN, codeRowLine, expiresAt, newCodeProblem, normalizeCode, redeemAnswer, suggestCode } from '../credits/codes';
import { historyText, type CreditRow } from '../credits/format';
import { adminSectionForPath } from '../../utils/adminSections';

describe('a code', () => {
  it('compared as the server does: no spaces, upper-case', () => {
    expect(normalizeCode(' study 10 ')).toBe('STUDY10');
    expect(CODE_PATTERN.test('STUDY10')).toBe(true);
    expect(CODE_PATTERN.test('A!')).toBe(false);
  });

  it('the answers to Redeem', () => {
    expect(redeemAnswer('redeemed', 40)).toEqual({ text: 'Added 10 lectures to your credits.', ok: true });
    expect(redeemAnswer('redeemed', 2).text).toBe('Added ½ lecture to your credits.');
    expect(redeemAnswer('already', 0)).toEqual({ text: 'You’ve already used this code.', ok: false });
    expect(redeemAnswer('full', 0).text).toBe('This code has been fully used.');
    expect(redeemAnswer('too_many', 0).text).toBe('Too many tries. Try again in an hour.');
    // Unknown, switched off and expired answer alike (nothing tells a guesser a code exists).
    expect(redeemAnswer('invalid', 0).text).toBe('That code isn’t valid.');
    expect(redeemAnswer('anything', 0).text).toBe('That code isn’t valid.');
  });

  it('its history row: “+10 · Code STUDY10”', () => {
    const row: CreditRow = { id: 'r', units: 40, kind: 'grant_code', label: 'STUDY10', lecture_id: null, ref_id: 'c', created_at: '2026-11-12T10:00:00Z', what: null, block: null };
    expect(historyText(row)).toBe('Code STUDY10');
  });
});

describe('the dashboard’s New code', () => {
  const ok = { code: 'STUDY10', lectures: 10, uses: 50, expires: '' };
  it('checks the form before the server does', () => {
    expect(newCodeProblem(ok)).toBeNull();
    expect(newCodeProblem({ ...ok, code: 'ab' })).toMatch(/4 to 24/);
    expect(newCodeProblem({ ...ok, lectures: 0.3 })).toMatch(/quarters/);
    expect(newCodeProblem({ ...ok, lectures: 0.25 })).toBeNull();
    expect(newCodeProblem({ ...ok, lectures: 26 })).toMatch(/quarters/);
    expect(newCodeProblem({ ...ok, uses: 0 })).toMatch(/Uses/);
    expect(newCodeProblem({ ...ok, expires: '31/12/2026' })).toMatch(/YYYY-MM-DD/);
    expect(newCodeProblem({ ...ok, expires: '2026-12-31' })).toBeNull();
  });

  it('an expiry is the end of that day; a date that doesn’t exist is refused', () => {
    expect(expiresAt('2026-12-31')).toBe('2026-12-31T23:59:59.000Z');
    expect(expiresAt('2026-02-30')).toBeNull();
  });

  it('Suggest: 8 characters, none that look alike', () => {
    const code = suggestCode(() => 0.5);
    expect(code).toHaveLength(8);
    expect(CODE_PATTERN.test(code)).toBe(true);
    expect(/[O0I1]/.test(suggestCode())).toBe(false);
  });

  it('a row: uses, lectures, expiry', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(codeRowLine({ used: 4, max_redemptions: 50, units: 40, expires_at: null }, now)).toBe('4 of 50 used · 10 lectures · No expiry');
    expect(codeRowLine({ used: 0, max_redemptions: 5, units: 4, expires_at: '2026-12-31T23:59:59Z' }, now)).toBe('0 of 5 used · 1 lecture · Expires 2026-12-31');
    expect(codeRowLine({ used: 0, max_redemptions: 5, units: 4, expires_at: '2026-01-01T00:00:00Z' }, now)).toBe('0 of 5 used · 1 lecture · Expired');
  });

  it('the menu knows its sections', () => {
    expect(adminSectionForPath('/admin')).toBe('codes');
    expect(adminSectionForPath('/admin/codes')).toBe('codes');
    expect(adminSectionForPath('/admin/nope')).toBeNull();
    expect(adminSectionForPath('/settings')).toBeNull();
  });
});
