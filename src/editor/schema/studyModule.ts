import { mergeAttributes, Node } from '@tiptap/core';

import { leaveBoxOnEmptyLast } from './boxKeys';

/**
 * The summary's text modules (SUMMARY-SPEC "Module library"): timeline, cause → effect chain,
 * key figures, comparison table, process steps, framework grid, theory card, case card, argument map,
 * code, vocabulary table and worked example. One block for all twelve: a box with a small label (drawn,
 * not text, as a callout's), holding ordinary editor content (paragraphs, lists, a table) that the
 * editor's CSS lays out by its kind (editorCss.ts): a timeline's line and dots, cause → effect's boxes
 * and arrows, numbered process stages, tables with thin horizontal rules only, monospace code.
 *
 * Every word stays text: edited in place, found by Find, commented on, asked about (Ask Claude), with
 * no form (unlike a graph's data). If the student changes its structure, the box still shows its
 * content as plain lists and paragraphs. A top-level block with its own id, origin and edit time
 * (blockMeta), so a summary written again never replaces one she edited. Written by the summary
 * (src/lib/summaryDoc.ts); not in the Insert menu (the editor only renders them). Shared by both editors.
 */

export const STUDY_MODULE = 'studyModule';
export const STUDY_MODULE_CLASS = 'studiply-module';

export type ModuleKind =
  | 'timeline'
  | 'causeEffect'
  | 'keyFigures'
  | 'comparison'
  | 'process'
  | 'framework'
  | 'theoryCard'
  | 'caseCard'
  | 'argument'
  | 'code'
  | 'vocabulary'
  | 'workedExample';

/** Each kind and the label its box shows (shown in small capitals). */
export const MODULE_KINDS: { kind: ModuleKind; label: string; aria: string }[] = [
  { kind: 'timeline', label: 'Timeline', aria: 'Timeline' },
  { kind: 'causeEffect', label: 'Cause → effect', aria: 'Cause and effect' },
  { kind: 'keyFigures', label: 'Key figures', aria: 'Key figures' },
  { kind: 'comparison', label: 'Comparison', aria: 'Comparison table' },
  { kind: 'process', label: 'Process', aria: 'Process steps' },
  { kind: 'framework', label: 'Framework', aria: 'Framework grid' },
  { kind: 'theoryCard', label: 'Theory', aria: 'Theory card' },
  { kind: 'caseCard', label: 'Case', aria: 'Case card' },
  { kind: 'argument', label: 'Argument', aria: 'Argument map' },
  { kind: 'code', label: 'Code', aria: 'Code' },
  { kind: 'vocabulary', label: 'Vocabulary', aria: 'Vocabulary table' },
  { kind: 'workedExample', label: 'Worked example', aria: 'Worked example' },
];

export const isModuleKind = (v: unknown): v is ModuleKind => MODULE_KINDS.some((k) => k.kind === v);
const cleanTitle = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 80) : '');

/** "Framework · SWOT", "Code · C", "Timeline" (in capitals by CSS). */
export function moduleLabel(attrs: { kind?: unknown; title?: unknown }): string {
  const kind = isModuleKind(attrs.kind) ? attrs.kind : 'timeline';
  const label = MODULE_KINDS.find((k) => k.kind === kind)!.label;
  const title = cleanTitle(attrs.title);
  return title ? `${label} · ${title}` : label;
}

/** What a module holds: text, lists, a table, formulas; not a callout, another module, a title or a page break. */
const INSIDE = '(paragraph | heading | bulletList | orderedList | blockquote | blockMath | table)+';

export const StudyModule = Node.create({
  name: STUDY_MODULE,
  group: 'block',
  content: INSIDE,
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'timeline',
        parseHTML: (el) => (isModuleKind(el.getAttribute('data-module')) ? el.getAttribute('data-module') : 'timeline'),
        renderHTML: (attrs) => ({ 'data-module': isModuleKind(attrs.kind) ? attrs.kind : 'timeline' }),
      },
      // A framework's name (SWOT), a code block's language (C): shown in the label.
      title: {
        default: '',
        parseHTML: (el) => cleanTitle(el.getAttribute('data-title')),
        renderHTML: (attrs) => (cleanTitle(attrs.title) ? { 'data-title': cleanTitle(attrs.title) } : {}),
      },
    };
  },

  parseHTML() {
    return [
      // Code keeps its spaces (indentation) when pasted or sent to the other device.
      { tag: 'div[data-module="code"]', contentElement: `.${STUDY_MODULE_CLASS}-body`, preserveWhitespace: 'full' as const, priority: 60 },
      { tag: 'div[data-module]', contentElement: `.${STUDY_MODULE_CLASS}-body` },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = isModuleKind(node.attrs.kind) ? node.attrs.kind : 'timeline';
    const aria = MODULE_KINDS.find((k) => k.kind === kind)!.aria;
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: STUDY_MODULE_CLASS, role: 'group', 'aria-label': cleanTitle(node.attrs.title) ? `${aria}: ${cleanTitle(node.attrs.title)}` : aria }),
      ['div', { class: `${STUDY_MODULE_CLASS}-label`, contenteditable: 'false', 'aria-hidden': 'true' }, moduleLabel(node.attrs)],
      ['div', { class: `${STUDY_MODULE_CLASS}-body` }, 0],
    ];
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    // Enter on an empty last line leaves the box (as in a callout or a list).
    return { Enter: () => leaveBoxOnEmptyLast(editor, STUDY_MODULE) };
  },
});
