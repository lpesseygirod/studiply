import { countSlice, emptyCounts, pasteLosses, pasteReportLine, pasteSource } from '../pasteReport';

describe('pasteSource', () => {
  it('recognises Google Docs and Word', () => {
    expect(pasteSource('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b"><p>x</p></b>')).toBe('Google Docs');
    expect(pasteSource('<html xmlns:o="urn:schemas-microsoft-com:office:office"><p class=MsoNormal>x</p>')).toBe('Word');
    expect(pasteSource('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">x</p>')).toBe('Word');
    expect(pasteSource('<p>x</p>')).toBe('other');
  });
});

describe('countSlice', () => {
  it('counts blocks and formatted characters', () => {
    const counts = countSlice([
      { type: 'heading', content: [{ type: 'text', text: 'Tema 3' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'parentesco', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: ' rojo', marks: [{ type: 'textStyle', attrs: { color: '#C23B3B' } }] },
          { type: 'text', text: 'negro', marks: [{ type: 'textStyle', attrs: { color: '#000000' } }] },
          { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x' } }] },
        ],
      },
      { type: 'bulletList', content: [{ type: 'listItem', content: [] }, { type: 'listItem', content: [] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader' }, { type: 'tableCell' }] }] },
    ]);
    expect(counts).toEqual({
      ...emptyCounts(),
      headings: 1, listItems: 2, tables: 1, cells: 2,
      bold: 10, italic: 10, colour: 4, links: 4,
    });
  });
});

describe('the report line', () => {
  const had = { ...emptyCounts(), headings: 3, bold: 120, colour: 40 };
  const kept = { ...emptyCounts(), headings: 3, bold: 120 };

  it('lists only what the paste had or kept', () => {
    expect(pasteReportLine({ source: 'Google Docs', had, kept })).toBe('Google Docs: Headings 3 → 3 · Bold 120 → 120 ch · Colour 40 → 0 ch');
    expect(pasteReportLine({ source: 'other', had: emptyCounts(), kept: emptyCounts() })).toBe('other: plain text');
  });

  it('names what was lost', () => {
    expect(pasteLosses({ had, kept })).toEqual(['colour']);
  });
});
