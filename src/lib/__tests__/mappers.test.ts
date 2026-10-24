import { escapeLike, newId, now } from '../mappers';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

// -------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------

describe('newId', () => {
  it('returns the UUID from expo-crypto', () => {
    expect(newId()).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('now', () => {
  it('returns an ISO-8601 UTC timestamp', () => {
    const value = now();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(value).toISOString()).toBe(value);
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('Cell division')).toBe('Cell division');
  });
});
