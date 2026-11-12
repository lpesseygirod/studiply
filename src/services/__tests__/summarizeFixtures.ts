// The My notes fixture of the summarize tests (src/test-utils/summarizeFixtures)
// reads as they expect: two lines with text, their times, one Important 8 mark.

import { noteLinesOf } from '../../editor/noteLines';
import type { DocJSON } from '../../editor/types';
import { MY_NOTES } from '../../test-utils/summarizeFixtures';
import { marksOf } from '../marks.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);

it('the summarize tests’ My notes: 2 lines with text, 1 mark', () => {
  expect(noteLinesOf(MY_NOTES as DocJSON).map((l) => [l.block_id, l.t_ms])).toEqual([
    ['n1', 252_000],
    ['n2', 1_865_000],
  ]);
  expect(marksOf(MY_NOTES as DocJSON).map((m) => [m.id, m.type, m.level])).toEqual([['m1', 'important', 8]]);
});
