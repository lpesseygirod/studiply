// Fitting the toolbars' tools (step 4.5): the first that fit stay in the row, in order; the rest go to the second row.
import { splitRow } from '../toolbarFit';

const tools = (n: number, width = 44) => Array.from({ length: n }, (_, i) => ({ key: `t${i}`, width }));

describe('splitRow', () => {
  it('everything fits: no second row', () => {
    expect(splitRow(tools(5), 300)).toEqual({ fits: tools(5), overflow: [] });
  });

  it('an iPhone row (about 300 px for tools): 6 of 16 tools, the rest in order in the second row', () => {
    const { fits, overflow } = splitRow(tools(16), 300);
    expect(fits.map((t) => t.key)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5']);
    expect(overflow[0].key).toBe('t6');
    expect(overflow).toHaveLength(10);
  });

  it('a wider tool counts its own width; nothing at all when there is no room', () => {
    expect(splitRow([{ width: 48 }, { width: 44 }], 90).fits).toHaveLength(1);
    expect(splitRow(tools(3), 0).fits).toEqual([]);
  });
});
