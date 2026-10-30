import type { CommandProps, Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

import { DEFAULT_LINE_SPACING, TITLE } from '../schema/blocks';
import { selectedPhoto, type PhotoAlign, type PhotoInfo, type PhotoWrap } from '../schema/photo';
import { formulaRequest, mathSuggestion, selectedFormula, type FormulaRequest } from '../schema/formula';
import { canComment, commentsAt, listComments, type CommentInfo } from '../schema/comments';
import { selectionBarKey, type SelectionBarRequest } from './selectionBar';
import { clampCols, clampRows, filledLines, resizeTable, tableSize } from '../table/resize';
import { selectedTable } from '../table/selection';
import { tableBarKey, type TableBarRequest } from '../table/tableBar';
import { pageViewOf } from '../page/pageView';
import { photoBarKey, type PhotoBarRequest } from '../photoBar';
import { calloutAt, calloutKey, type CalloutKind, type CalloutRequest } from '../schema/callout';
import { formulaEntry } from '../formulas/library';
import type { GraphData } from '../graph/data';
import { graphRequestOf, selectedGraph, type GraphRequest } from '../schema/graph';
import { markChipKey, selectedMarkChip, type MarkChipRequest, type MarkKind as ChipKind } from '../schema/markChip';
import type { PageSetup } from '../page/pageSetup';
import { DEFAULT_SIZE, fontOf, FONTS, sizeOf, stepSize, type FontChoice } from '../schema/fonts';
import { TextSelection } from '@tiptap/pm/state';
import { findState, runFind, type FindCommand, type FindState } from '../writing/find';
import { counts, type Counts } from '../writing/counts';
import { outline, type Outline } from '../writing/outline';

export { cleanUrl } from './links';

/**
 * The formatting tools (step 4.4) as one set of commands and one state, for
 * both devices: the laptop's toolbar calls them on its editor; the iPhone's
 * keyboard toolbar and Aa panel send them through the FormatBridge to the
 * WebView, which reports `formatState` back. Runs in a browser or the
 * WebView, so it imports nothing from React Native.
 */

export type TextStyleKey = 'title' | 'h1' | 'h2' | 'subheading' | 'normal' | 'quote';
export type Align = 'left' | 'center' | 'right' | 'justify';
export type ListKind = 'bullet' | 'ordered' | 'task';
export type MarkKind = 'bold' | 'italic' | 'underline' | 'strike';

export const TEXT_STYLES: readonly { key: TextStyleKey; label: string; shortcut?: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'h1', label: 'Heading 1', shortcut: '⌘⌥1' },
  { key: 'h2', label: 'Heading 2', shortcut: '⌘⌥2' },
  { key: 'subheading', label: 'Subheading', shortcut: '⌘⌥3' },
  { key: 'normal', label: 'Normal text', shortcut: '⌘⌥0' },
  { key: 'quote', label: 'Quote' },
];

export const ALIGNS: readonly { key: Align; label: string; shortcut: string }[] = [
  { key: 'left', label: 'Left', shortcut: '⌘⇧L' },
  { key: 'center', label: 'Centre', shortcut: '⌘⇧E' },
  { key: 'right', label: 'Right', shortcut: '⌘⇧R' },
  { key: 'justify', label: 'Justify', shortcut: '⌘⇧J' },
];

/** How big each style's text is (for the size box when no size is set): em of Normal. */
const STYLE_EM: Record<TextStyleKey, number> = { title: 2.1, h1: 1.75, h2: 1.4, subheading: 1.15, normal: 1, quote: 1 };

export interface FormatState {
  style: TextStyleKey;
  font: FontChoice['key'];
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  highlight: string | null;
  list: ListKind | null;
  align: Align;
  lineSpacing: number;
  indent: number;
  canUndo: boolean;
  canRedo: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  /** The link the selection is on, if any. */
  link: string | null;
  /** The cursor is in a table; whether it has a header row; the cell's colour. */
  inTable: boolean;
  headerRow: boolean;
  cellColor: string | null;
  /** The table's size, and whether the selected cells can be merged or the cell split. */
  tableRows: number;
  tableCols: number;
  /** The rows and columns that have text (the iPhone asks before a resize removes any). */
  filledRows: number[];
  filledCols: number[];
  canMerge: boolean;
  canSplit: boolean;
  /** The last press on the floating table bar that asks for a menu (the iPhone opens it). */
  tableRequest: TableBarRequest | null;
  /** A selected photo: its width in % of the page (null: its own size) and layout; null when none is selected. */
  photo: PhotoInfo | null;
  /** The selected formula (its LaTeX, display or inline); null when none is selected. */
  formula: { latex: string; display: boolean } | null;
  /** The last click or tap on a formula (the iPhone opens its sheet on a new one). */
  formulaRequest: FormulaRequest | null;
  /** The comment on the text at the cursor (an open one first), if any. */
  comment: CommentInfo | null;
  /** Words are selected that a comment could be about. */
  canComment: boolean;
  /** Every comment, in the order of the text (the iPhone's Comments sheet). */
  comments: CommentInfo[];
  /** The last press on the selection bar's Comment or Link (the iPhone asks with its prompts). */
  selectionRequest: SelectionBarRequest | null;
  /** Maths typed as text before the cursor, offered as a formula (its LaTeX); null when none. */
  mathSuggestion: { latex: string } | null;
  /** The last press on the photo bar's Layout… (a phone: the iPhone opens its layout sheet). */
  photoRequest: PhotoBarRequest | null;
  /** The callout the cursor is in (step 4.6), and the last click on a callout's label (the iPhone opens its menu). */
  callout: { kind: CalloutKind; level: number | null; ms: number | null } | null;
  calloutRequest: CalloutRequest | null;
  /** The selected mark chip (step 4.6), and the last tap on one (the iPhone opens its menu). */
  markChip: { kind: ChipKind; level: number | null } | null;
  markChipRequest: MarkChipRequest | null;
  /** The selected graph's data (step 4.7d), only while one is selected: the rest of the time nothing big crosses to the iPhone. */
  graph: GraphData | null;
  /** A click (tap) on a graph: its form (the iPhone's sheet). */
  graphRequest: GraphRequest | null;
  /** Pages or Pageless, the zoom chosen (a pinch on the iPhone changes it) and the page count (step 4.5b). */
  view: { pages: boolean; zoom: number; pageCount: number };
  /** Writing tools (step 4.7): what is searched and how many matches; the word and character count; the outline. */
  find: FindState | null;
  counts: Counts;
  outline: Outline;
}

export type FormatCommand =
  | { type: 'style'; style: TextStyleKey }
  | { type: 'font'; font: FontChoice['key'] }
  | { type: 'size'; size: number }
  | { type: 'sizeStep'; direction: 1 | -1 }
  | { type: 'mark'; mark: MarkKind }
  | { type: 'color'; color: string | null }
  | { type: 'highlight'; color: string | null }
  | { type: 'list'; list: ListKind }
  | { type: 'align'; align: Align }
  | { type: 'lineSpacing'; spacing: number | null }
  | { type: 'indent' }
  | { type: 'outdent' }
  | { type: 'pageBreak' }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Paste without formatting (iPhone: the clipboard read natively). */
  | { type: 'insertText'; text: string }
  /** Links (step 4.5): href already cleaned (cleanUrl); null removes the link. `text` when nothing is selected. */
  | { type: 'link'; href: string | null; text?: string }
  /** Tables (step 4.5). `rows` / `cols` for insert and resize (clamped to MAX_TABLE). */
  | { type: 'table'; action: TableAction; rows?: number; cols?: number; color?: string | null }
  /** The selected photo's width in % of the page (step 4.5); null: its own size. */
  | { type: 'photoWidth'; width: number | null }
  /** The selected photo's layout (in line, wrapped, on lines of its own) and alignment; or delete it. */
  | { type: 'photoLayout'; wrap?: PhotoWrap; align?: PhotoAlign }
  | { type: 'photoDelete' }
  /** Callouts (step 4.6): put one in (or change the one at the cursor), its level, or take the box away keeping the text. */
  | { type: 'callout'; action: 'set'; kind: CalloutKind; level?: number | null; ms?: number | null }
  | { type: 'callout'; action: 'level'; level: number | null }
  | { type: 'callout'; action: 'remove' }
  /** Mark chips (step 4.6): put one in, or change or remove the selected one. */
  | { type: 'markChip'; action: 'insert'; kind: ChipKind; level: number | null }
  | { type: 'markChip'; action: 'update'; kind?: ChipKind; level?: number | null }
  | { type: 'markChip'; action: 'delete' }
  /** Graphs (step 4.7d): a new one (selected, its form asked for), the selected one's data, or delete it. */
  | { type: 'graph'; action: 'insert' }
  | { type: 'graph'; action: 'set'; graph: GraphData }
  | { type: 'graph'; action: 'delete' }
  /** A timestamp chip (step 4.6), by hand. */
  | { type: 'timestamp'; ms: number }
  /**
   * Pages or Pageless and the zoom (step 4.5b); `fit`: the iPhone's Print
   * layout (the sheet fits the screen); `setup`: the document's page setup.
   */
  | { type: 'view'; pages?: boolean; zoom?: number; fit?: boolean; setup?: PageSetup }
  /**
   * Formulas (step 4.5): put one in, or change the selected one (it stays
   * selected while its editor is open); `remove` deletes it; `done` closes
   * it (an empty one goes) and puts the cursor after it.
   */
  | { type: 'formula'; action: 'set'; latex: string; display: boolean }
  | { type: 'formula'; action: 'remove' | 'done' }
  /** The "Make formula" suggestion: take it, or not this one. */
  | { type: 'formula'; action: 'acceptSuggestion' | 'dismissSuggestion' }
  /** A formula card from the library (step 4.7c), by the entry's id (the editor has the library). */
  | { type: 'formulaCard'; id: string }
  /** Comments (step 4.5): on the selected words (`add`), or one by id. */
  | { type: 'comment'; action: 'add'; id: string; text: string }
  | { type: 'comment'; action: 'edit'; id: string; text: string }
  | { type: 'comment'; action: 'resolve'; id: string; resolved: boolean }
  | { type: 'comment'; action: 'delete' | 'select'; id: string }
  /** Find & replace (step 4.7, writing/find.ts). */
  | FindCommand
  /** The outline (step 4.7): jump to the heading starting at `pos`. */
  | { type: 'outline'; pos: number };

export type TableAction =
  | 'insert'
  | 'rowAbove'
  | 'rowBelow'
  | 'columnLeft'
  | 'columnRight'
  | 'deleteRow'
  | 'deleteColumn'
  | 'deleteTable'
  | 'headerRow'
  | 'cellColor'
  | 'merge'
  | 'split'
  | 'resize';

export { MAX_TABLE } from '../table/resize';

/** The first text block of the selection (with everything selected, the document's first). */
function blockOf(editor: Editor) {
  const { $from, from, to } = editor.state.selection;
  if ($from.parent.isTextblock) return $from.parent;
  let found: typeof $from.parent | null = null;
  const size = editor.state.doc.content.size;
  // Not past the end (a cursor after the last block).
  editor.state.doc.nodesBetween(Math.min(from, size), Math.min(size, Math.max(to, from + 1)), (node) => {
    if (!found && node.isTextblock) found = node;
    return !found;
  });
  return found ?? $from.parent;
}

function styleOf(editor: Editor): TextStyleKey {
  const block = blockOf(editor);
  if (block.type.name === TITLE) return 'title';
  if (block.type.name === 'heading') {
    const level = Number(block.attrs.level);
    return level === 1 ? 'h1' : level === 2 ? 'h2' : 'subheading';
  }
  return editor.isActive('blockquote') ? 'quote' : 'normal';
}

export function formatState(editor: Editor): FormatState {
  const style = styleOf(editor);
  const text = editor.getAttributes('textStyle');
  const block = blockOf(editor);
  const can = editor.can();
  return {
    style,
    font: fontOf(text.fontFamily).key,
    size: sizeOf(text.fontSize) ?? Math.round(DEFAULT_SIZE * STYLE_EM[style]),
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    color: typeof text.color === 'string' ? text.color : null,
    highlight: (editor.getAttributes('highlight').color as string | undefined) ?? (editor.isActive('highlight') ? 'default' : null),
    list: editor.isActive('taskList') ? 'task' : editor.isActive('orderedList') ? 'ordered' : editor.isActive('bulletList') ? 'bullet' : null,
    align: (['left', 'center', 'right', 'justify'] as Align[]).find((a) => a === block.attrs.textAlign) ?? 'left',
    lineSpacing: typeof block.attrs.lineSpacing === 'number' ? block.attrs.lineSpacing : DEFAULT_LINE_SPACING,
    indent: Number(block.attrs.indent) || 0,
    canUndo: can.undo(),
    canRedo: can.redo(),
    canIndent: can.indent(),
    canOutdent: can.outdent(),
    link: (editor.getAttributes('link').href as string | undefined) ?? null,
    ...tableState(editor),
    photo: selectedPhoto(editor),
    formula: formulaOf(editor),
    formulaRequest: formulaRequest(editor),
    ...commentState(editor),
    selectionRequest: selectionBarKey.getState(editor.state) ?? null,
    mathSuggestion: mathSuggestionOf(editor),
    photoRequest: photoBarKey.getState(editor.state) ?? null,
    callout: calloutOf(editor),
    calloutRequest: calloutKey.getState(editor.state) ?? null,
    markChip: markChipOf(editor),
    markChipRequest: markChipKey.getState(editor.state) ?? null,
    graph: selectedGraph(editor.state)?.data ?? null,
    graphRequest: graphRequestOf(editor.state),
    view: viewOf(editor),
    find: findState(editor.state),
    counts: counts(editor.state),
    outline: outline(editor.state),
  };
}

function calloutOf(editor: Editor): FormatState['callout'] {
  const c = calloutAt(editor.state);
  return c && { kind: c.kind, level: c.level, ms: c.ms };
}

function markChipOf(editor: Editor): FormatState['markChip'] {
  const c = selectedMarkChip(editor.state);
  return c && { kind: c.kind, level: c.level };
}

function viewOf(editor: Editor): FormatState['view'] {
  const v = pageViewOf(editor.state);
  return { pages: !!v?.pages, zoom: v?.zoom ?? 1, pageCount: v?.layout?.pages ?? 1 };
}

function mathSuggestionOf(editor: Editor): FormatState['mathSuggestion'] {
  const s = mathSuggestion(editor.state);
  return s && { latex: s.latex };
}

function commentState(editor: Editor): Pick<FormatState, 'comment' | 'canComment' | 'comments'> {
  const comments = listComments(editor.state.doc);
  const [at] = commentsAt(editor.state);
  return { comment: comments.find((c) => c.id === at) ?? null, canComment: canComment(editor.state), comments };
}

function formulaOf(editor: Editor): FormatState['formula'] {
  const f = selectedFormula(editor.state);
  return f && { latex: f.latex, display: f.display };
}

/** Where the cursor is in a table, for the table bar, menus and panel. */
type TableState = Pick<
  FormatState,
  'inTable' | 'headerRow' | 'cellColor' | 'tableRows' | 'tableCols' | 'filledRows' | 'filledCols' | 'canMerge' | 'canSplit' | 'tableRequest'
>;

function tableState(editor: Editor): TableState {
  const tableRequest = tableBarKey.getState(editor.state) ?? null;
  const found = selectedTable(editor.state);
  if (!found) return { inTable: false, headerRow: false, cellColor: null, tableRows: 0, tableCols: 0, filledRows: [], filledCols: [], canMerge: false, canSplit: false, tableRequest };
  const firstRow = found.table.firstChild;
  const headerRow = !!firstRow && firstRow.childCount > 0 && Array.from({ length: firstRow.childCount }, (_, i) => firstRow.child(i)).every((c) => c.type.name === 'tableHeader');
  const { rows, cols } = tableSize(found.table);
  const filled = filledLines(found.table);
  return {
    inTable: true,
    headerRow,
    cellColor: (found.cell?.attrs.backgroundColor as string | null) ?? null,
    tableRows: rows,
    tableCols: cols,
    filledRows: filled.rows,
    filledCols: filled.cols,
    canMerge: editor.can().mergeCells(),
    canSplit: editor.can().splitCell(),
    tableRequest,
  };
}

/** Plain text as paragraphs (one per line; empty lines kept). */
export function plainParagraphs(text: string): JSONContent[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }));
}

/** Takes the quotes the selection touches apart (their paragraphs stay), whatever the selection. */
const unwrapQuotes = ({ tr }: CommandProps): boolean => {
  const { from, to } = tr.selection;
  const quotes: { node: PMNode; pos: number }[] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'blockquote') return true;
    quotes.push({ node, pos });
    return false;
  });
  for (const { node, pos } of quotes.reverse()) tr.replaceWith(pos, pos + node.nodeSize, node.content);
  return quotes.length > 0;
};

/** Runs a formatting command; false when it couldn't apply. */
export function runFormat(editor: Editor, cmd: FormatCommand): boolean {
  const chain = () => editor.chain().focus();
  switch (cmd.type) {
    case 'style': {
      const inQuote = editor.isActive('blockquote');
      switch (cmd.style) {
        case 'title':
          return chain().setNode(TITLE).run();
        case 'h1':
          return chain().setHeading({ level: 1 }).run();
        case 'h2':
          return chain().setHeading({ level: 2 }).run();
        case 'subheading':
          return chain().setHeading({ level: 3 }).run();
        case 'normal':
          return inQuote ? chain().setParagraph().command(unwrapQuotes).run() : chain().setParagraph().run();
        case 'quote':
          return inQuote ? true : chain().setParagraph().setBlockquote().run();
      }
      return false;
    }
    case 'font': {
      const css = FONTS.find((f) => f.key === cmd.font)?.css ?? null;
      return css ? chain().setFontFamily(css).run() : chain().unsetFontFamily().run();
    }
    case 'size':
      return cmd.size === DEFAULT_SIZE && styleOf(editor) === 'normal'
        ? chain().unsetFontSize().run()
        : chain().setFontSize(`${cmd.size}px`).run();
    case 'sizeStep':
      return runFormat(editor, { type: 'size', size: stepSize(formatState(editor).size, cmd.direction) });
    case 'mark': {
      const c = chain();
      return (cmd.mark === 'bold' ? c.toggleBold() : cmd.mark === 'italic' ? c.toggleItalic() : cmd.mark === 'underline' ? c.toggleUnderline() : c.toggleStrike()).run();
    }
    case 'color':
      return cmd.color ? chain().setColor(cmd.color).run() : chain().unsetColor().run();
    case 'highlight':
      return cmd.color ? chain().setHighlight({ color: cmd.color }).run() : chain().unsetHighlight().run();
    case 'list':
      return cmd.list === 'bullet' ? chain().toggleBulletList().run() : cmd.list === 'ordered' ? chain().toggleOrderedList().run() : chain().toggleTaskList().run();
    case 'align':
      return cmd.align === 'left' ? chain().unsetTextAlign().run() : chain().setTextAlign(cmd.align).run();
    case 'lineSpacing':
      return chain().setLineSpacing(cmd.spacing === DEFAULT_LINE_SPACING ? null : cmd.spacing).run();
    case 'indent':
      return chain().indent().run();
    case 'outdent':
      return chain().outdent().run();
    case 'pageBreak':
      return chain().setPageBreak().run();
    case 'clear': {
      // Text formatting and the paragraph's align, spacing and indent; links
      // and the block's style (a heading stays a heading) stay, as in Google Docs.
      const marks = Object.keys(editor.schema.marks).filter((m) => m !== 'link');
      let c = chain();
      for (const m of marks) c = c.unsetMark(m, { extendEmptyMarkRange: true });
      return c.unsetTextAlign().setLineSpacing(null).updateAttributes('paragraph', { indent: 0 }).updateAttributes('heading', { indent: 0 }).run();
    }
    case 'undo':
      return chain().undo().run();
    case 'redo':
      return chain().redo().run();
    case 'insertText':
      return cmd.text ? chain().insertContent(plainParagraphs(cmd.text)).run() : false;
    case 'table': {
      switch (cmd.action) {
        case 'insert':
          return chain().insertTable({ rows: clampRows(cmd.rows ?? 3), cols: clampCols(cmd.cols ?? 3), withHeaderRow: false }).run();
        case 'rowAbove':
          return chain().addRowBefore().run();
        case 'rowBelow':
          return chain().addRowAfter().run();
        case 'columnLeft':
          return chain().addColumnBefore().run();
        case 'columnRight':
          return chain().addColumnAfter().run();
        case 'deleteRow':
          return chain().deleteRow().run();
        case 'deleteColumn':
          return chain().deleteColumn().run();
        case 'deleteTable':
          return chain().deleteTable().run();
        case 'headerRow':
          return chain().toggleHeaderRow().run();
        case 'cellColor':
          return chain().setCellAttribute('backgroundColor', cmd.color ?? null).run();
        case 'merge':
          return chain().mergeCells().run();
        case 'split':
          return chain().splitCell().run();
        case 'resize': {
          const found = selectedTable(editor.state);
          if (!found) return false;
          const current = tableSize(found.table);
          const rows = clampRows(cmd.rows ?? current.rows);
          const cols = clampCols(cmd.cols ?? current.cols);
          return chain()
            .command(({ tr }) => {
              resizeTable(tr, found.pos, rows, cols);
              return true;
            })
            .run();
        }
      }
      return false;
    }
    case 'link': {
      if (!cmd.href) return chain().extendMarkRange('link').unsetLink().run();
      const { empty } = editor.state.selection;
      if (empty && !editor.isActive('link')) {
        // Nothing selected: the text (or the address itself) goes in, linked.
        const text = cmd.text?.trim() || cmd.href.replace(/^mailto:/, '');
        // The cursor then leaves the link, so what is typed next isn't linked.
        return chain().insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: cmd.href } }] }).unsetMark('link').run();
      }
      return chain().extendMarkRange('link').setLink({ href: cmd.href }).run();
    }
    case 'photoWidth':
      return chain().setPhotoWidth(cmd.width).run();
    case 'photoLayout':
      return chain().setPhotoLayout({ wrap: cmd.wrap, align: cmd.align }).run();
    case 'callout':
      if (cmd.action === 'set') return chain().setCallout(cmd.kind, { level: cmd.level, ms: cmd.ms }).run();
      if (cmd.action === 'level') return chain().setCalloutLevel(cmd.level).run();
      return chain().removeCallout().run();
    case 'graph':
      // Not focusing the text: the student is typing in the graph's form.
      if (cmd.action === 'insert') return chain().insertGraph().run();
      if (cmd.action === 'set') return editor.chain().setGraph(cmd.graph).run();
      return chain().deleteGraph().run();
    case 'markChip':
      if (cmd.action === 'insert') return chain().insertMarkChip({ kind: cmd.kind, level: cmd.level }).run();
      if (cmd.action === 'update') return chain().updateMarkChip({ kind: cmd.kind, level: cmd.level }).run();
      return chain().deleteMarkChip().run();
    case 'timestamp':
      return chain().insertTimestampChip(cmd.ms).run();
    case 'view': {
      // Not focusing the text: it only changes how the document is shown.
      let c = editor.chain();
      if (cmd.fit !== undefined) c = c.setPageFit(cmd.fit);
      if (cmd.pages !== undefined) c = c.setPageView(cmd.pages);
      if (cmd.zoom !== undefined) c = c.setPageZoom(cmd.zoom);
      if (cmd.setup) c = c.setPageSetup(cmd.setup);
      return c.run();
    }
    case 'photoDelete':
      return editor.isActive('image') || editor.isActive('inlineImage') ? chain().deleteSelection().run() : false;
    case 'formula':
      // Not focusing the text: the student is typing in the formula's editor.
      if (cmd.action === 'set') return editor.chain().setFormula({ latex: cmd.latex, display: cmd.display }).run();
      if (cmd.action === 'remove') return chain().removeFormula().run();
      if (cmd.action === 'acceptSuggestion') return chain().acceptMathSuggestion().run();
      if (cmd.action === 'dismissSuggestion') return chain().dismissMathSuggestion().run();
      if (!selectedFormula(editor.state)?.latex.trim()) return chain().removeFormula().run();
      return chain().leaveFormula().run();
    case 'formulaCard': {
      const entry = formulaEntry(cmd.id);
      return !!entry && chain().insertFormulaCard(entry).run();
    }
    case 'comment':
      switch (cmd.action) {
        case 'add':
          return chain().addComment({ id: cmd.id, text: cmd.text }).run();
        case 'edit':
          return editor.chain().updateComment(cmd.id, { text: cmd.text }).run();
        case 'resolve':
          return editor.chain().updateComment(cmd.id, { resolved: cmd.resolved }).run();
        case 'delete':
          return editor.chain().deleteComment(cmd.id).run();
        case 'select':
          return chain().selectComment(cmd.id).run();
      }
    // Find & replace (step 4.7): the find box keeps the keyboard focus (no focusing the text).
    case 'find':
      return runFind(editor, cmd);
    // The outline (step 4.7): the cursor at the start of the heading, scrolled into view.
    case 'outline': {
      const pos = Math.min(cmd.pos + 1, editor.state.doc.content.size);
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))).scrollIntoView());
      return true;
    }
  }
}
