import {
  formatHitTime,
  highlightParts,
  highlightRanges,
  matches,
  normalize,
  resultCountLine,
  searchQuery,
  snippetAround,
} from '../searchText';

describe('normalize (same as search.norm in the database)', () => {
  it('drops case and accents', () => {
    expect(normalize('Filogenético ÀÈÌÒÙ àèìòù ç ñ ü')).toBe('filogenetico aeiou aeiou c n u');
  });

  it('drops the Catalan middle dot', () => {
    expect(normalize('Col·legi')).toBe('collegi');
  });

  it('spells out the letters unaccent spells out', () => {
    expect(normalize('Straße Æther Øre Łódź')).toBe('strasse aether ore lodz');
  });
});

describe('matching', () => {
  it('needs 2 letters', () => {
    expect(searchQuery(' f ')).toBeNull();
    expect(searchQuery(' Fi ')).toBe('fi');
  });

  it('finds without accents or case, both ways', () => {
    expect(matches('Parentesco FILOGENÉTICO', 'filogenetico')).toBe(true);
    expect(matches('parentesco filogenetico', 'Filogenético')).toBe(true);
    expect(matches('col·legi', 'collegi')).toBe(true);
    expect(matches('Clase 4', 'filo')).toBe(false);
    expect(matches(null, 'filo')).toBe(false);
  });
});

describe('highlightRanges', () => {
  it('marks the original characters, accents included', () => {
    const text = 'El parentesco filogenético.';
    const [r] = highlightRanges(text, 'filogenetico');
    expect(text.slice(r.start, r.end)).toBe('filogenético');
  });

  it('maps across a removed middle dot and a decomposed accent', () => {
    const text = 'El col·legi i el café del col·legi';
    const ranges = highlightRanges(text, 'collegi');
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['col·legi', 'col·legi']);
    const [cafe] = highlightRanges(text, 'café');
    expect(text.slice(cafe.start, cafe.end)).toBe('café');
  });

  it('maps across ß → ss', () => {
    const text = 'Die Straße';
    const [r] = highlightRanges(text, 'strasse');
    expect(text.slice(r.start, r.end)).toBe('Straße');
  });

  it('finds every match, joining touching ones', () => {
    expect(highlightRanges('aaaa', 'aa')).toEqual([{ start: 0, end: 4 }]);
    expect(highlightRanges('ab ab', 'ab')).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });

  it('splits text into parts for rendering', () => {
    expect(highlightParts('Árbol filogenético', 'arbol')).toEqual([
      { text: 'Árbol', hit: true },
      { text: ' filogenético', hit: false },
    ]);
    expect(highlightParts('nothing here', 'filo')).toEqual([{ text: 'nothing here', hit: false }]);
  });
});

describe('snippetAround', () => {
  const words = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');

  it('returns short text whole, on one line', () => {
    expect(snippetAround('Hoy hablamos\nde filogenia.', 'filo')).toBe('Hoy hablamos de filogenia.');
  });

  it('keeps a match at the start, cut at the end between words', () => {
    const text = `filogenético ${words(60, 'w')}`;
    const s = snippetAround(text, 'filogenetico');
    expect(s.startsWith('filogenético')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(121);
    expect(text).toContain(s.slice(0, -1));
  });

  it('centres a match in the middle, cut between words on both sides', () => {
    const text = `${words(40, 'a')} parentesco filogenético ${words(40, 'b')}`;
    const s = snippetAround(text, 'filogenetico');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('parentesco filogenético');
    expect(text).toContain(s.slice(1, -1));
  });

  it('keeps a match at the end', () => {
    const text = `${words(60, 'w')} filogenético`;
    const s = snippetAround(text, 'filogenetico');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('filogenético')).toBe(true);
  });
});

describe('lines', () => {
  it('counts results and courses', () => {
    expect(resultCountLine([{ courseId: 'a' }, { courseId: 'a' }, { courseId: 'b' }, { courseId: null }, { courseId: 'b' }])).toBe(
      '5 results in 2 courses',
    );
    expect(resultCountLine([{ courseId: 'a' }])).toBe('1 result in 1 course');
    expect(resultCountLine([{ courseId: null }])).toBe('1 result');
    expect(resultCountLine([])).toBe('0 results');
  });

  it('formats a transcript time', () => {
    expect(formatHitTime(1102000)).toBe('18:22');
    expect(formatHitTime(5000)).toBe('0:05');
    expect(formatHitTime(3725000)).toBe('1:02:05');
  });
});
