/** My notes for the summarize tests: two stamped lines with text (one with an Important 8 chip) and an empty line. */
export const MY_NOTES = {
  type: 'doc',
  content: [
    { type: 'paragraph', attrs: { blockId: 'n1' }, content: [{ type: 'timestampChip', attrs: { ms: 252_000 } }, { type: 'text', text: 'Def: estudia la conducta' }] },
    {
      type: 'paragraph',
      attrs: { blockId: 'n2' },
      content: [
        { type: 'timestampChip', attrs: { ms: 1_865_000 } },
        { type: 'text', text: '5 preguntas ' },
        { type: 'markChip', attrs: { markId: 'm1', kind: 'important', level: 8, ms: 1_865_000, note: null } },
      ],
    },
    { type: 'paragraph', attrs: { blockId: 'n3' } },
  ],
};
