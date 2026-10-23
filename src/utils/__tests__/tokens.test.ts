import { estimateTokens } from '../tokens';

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('counts ~4 characters per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('rounds up partial tokens', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
