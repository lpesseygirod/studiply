import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';

import { studiplyExtensions } from '../bridges';
import { chipCount, sameDocument, SPIKE_CHIPS, twentyPages, wordCount } from '../spikeSample';

describe('the 20-page sample', () => {
  const doc = twentyPages();

  it('is a valid document in the shared schema', () => {
    expect(() => PMNode.fromJSON(getSchema(studiplyExtensions()), doc).check()).not.toThrow();
  });

  it('has about 10,000 words and 50 chips', () => {
    expect(wordCount(doc)).toBeGreaterThan(9500);
    expect(wordCount(doc)).toBeLessThan(12000);
    expect(chipCount(doc)).toBe(SPIKE_CHIPS);
  });

  it('is the same every time', () => {
    expect(sameDocument(twentyPages(), doc)).toBe(true);
  });
});

describe('sameDocument', () => {
  it('ignores key order but not content', () => {
    expect(sameDocument({ type: 'doc', attrs: { a: 1, b: 2 } }, { attrs: { b: 2, a: 1 }, type: 'doc' })).toBe(true);
    expect(sameDocument({ type: 'timestampChip', attrs: { ms: 1000 } }, { type: 'timestampChip', attrs: { ms: 2000 } })).toBe(false);
    expect(sameDocument({ type: 'text', text: 'a', marks: undefined }, { type: 'text', text: 'a' })).toBe(true);
  });
});
