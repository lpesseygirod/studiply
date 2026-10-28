/**
 * The schema's attribute defaults that aren't null, per node or mark type
 * (step 4.5). A block written without them (pasted before 4.5, made by the
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
  image: { origin: 'student' },
  table: { origin: 'student' },
  tableCell: { colspan: 1, rowspan: 1 },
  tableHeader: { colspan: 1, rowspan: 1 },
  pageBreak: { origin: 'student' },
  timestampChip: { ms: 0 },
  link: { target: '_blank', rel: 'noopener noreferrer nofollow' },
};
