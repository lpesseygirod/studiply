/**
 * The schema's attribute defaults that aren't null, per node or mark type.
 * A block written without them (pasted before they existed, made by the
 * AI, an older app) is the same block as the editor's copy that has them:
 * `sameBlock` leaves them out, so a copy open on another device doesn't take
 * every such block for "typed here" (and, say, bring back a deleted table).
 *
 * Checked against the real schema by `__tests__/defaults.test.ts`.
 */
export const ATTR_DEFAULTS: Record<string, Record<string, unknown>> = {
  paragraph: { indent: 0, origin: 'student' },
  heading: { indent: 0, origin: 'student', level: 1 },
  title: { indent: 0, origin: 'student' },
  blockquote: { indent: 0, origin: 'student' },
  orderedList: { origin: 'student', start: 1 },
  bulletList: { origin: 'student' },
  taskList: { origin: 'student' },
  taskItem: { checked: false },
  image: { origin: 'student', wrap: 'break', align: 'left' },
  table: { origin: 'student' },
  tableCell: { colspan: 1, rowspan: 1 },
  tableHeader: { colspan: 1, rowspan: 1 },
  pageBreak: { origin: 'student' },
  blockMath: { origin: 'student', latex: '' },
  inlineMath: { latex: '' },
  timestampChip: { ms: 0 },
  callout: { origin: 'student', kind: 'definition' },
  formulaCard: { origin: 'student', title: '' },
  graph: { origin: 'student', kind: 'bar', title: '', xLabel: '', yLabel: '', series: ['Series 1'], rows: [['Item 1', '3'], ['Item 2', '5'], ['Item 3', '2']] },
  studyModule: { origin: 'student', kind: 'timeline', title: '' },
  markChip: { kind: 'important' },
  link: { target: '_blank', rel: 'noopener noreferrer nofollow' },
  comment: { text: '', createdAt: 0, resolved: false },
};
