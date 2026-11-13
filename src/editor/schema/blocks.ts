import { Extension, mergeAttributes, Node, type CommandProps } from '@tiptap/core';

/**
 * Block formatting, shared by both editors:
 *
 * - `title`: the Title style (Google Docs' "Title"), above Heading 1. The
 *   document's name above the page is separate.
 * - `pageBreak`: a line marked "Page break"; PDF and Word export start
 *   a new page there.
 * - `lineSpacing` (1, 1.15, 1.5, 2) and `indent` (0–8) on paragraphs,
 *   headings, Title and quotes. In a list, indent nests the item instead.
 */

export const TITLE = 'title';
export const PAGE_BREAK = 'pageBreak';
export const LINE_SPACINGS = [1, 1.15, 1.5, 2] as const;
export type LineSpacing = (typeof LINE_SPACINGS)[number];
/** What the page uses when a block has none. */
export const DEFAULT_LINE_SPACING: LineSpacing = 1.5;
export const MAX_INDENT = 8;
/** One indent step on the page. */
export const INDENT_EM = 2;

const SPACED = ['paragraph', 'heading', TITLE];
const INDENTED = ['paragraph', 'heading', TITLE, 'blockquote'];
const LIST_ITEMS = ['listItem', 'taskItem'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    studiplyBlocks: {
      setTitle: () => ReturnType;
      setPageBreak: () => ReturnType;
      /** null: the page's default. */
      setLineSpacing: (spacing: number | null) => ReturnType;
      /** In a list: nests the item; elsewhere one indent step more. */
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const Title = Node.create({
  name: TITLE,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    // Higher than the paragraph's <p>, so a marked title stays a title.
    return [{ tag: 'p[data-type="title"]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { 'data-type': 'title', class: 'doc-title' }), 0];
  },

  addCommands() {
    return { setTitle: () => ({ commands }) => commands.setNode(this.name) };
  },
});

export const PageBreak = Node.create({
  name: PAGE_BREAK,
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break', contenteditable: 'false' }), ['span', 'Page break']];
  },

  renderText() {
    return '\n';
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain, state }) => {
          const atEnd = state.selection.$to.after(1) === state.doc.content.size;
          // Something to write in after the break when it is the last block.
          return chain()
            .insertContent(atEnd ? [{ type: this.name }, { type: 'paragraph' }] : { type: this.name })
            .run();
        },
    };
  },
});

const clampIndent = (n: unknown) => Math.max(0, Math.min(MAX_INDENT, Math.round(Number(n) || 0)));
const spacingOf = (v: unknown): number | null => {
  const n = Number(v);
  return (LINE_SPACINGS as readonly number[]).includes(n) ? n : null;
};

/** Changes `attr` on every block of the selection that has it. */
function updateBlocks({ tr, state, dispatch }: CommandProps, types: string[], attr: string, next: (value: unknown) => unknown): boolean {
  const { from, to } = state.selection;
  let changed = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!types.includes(node.type.name)) return true;
    const value = next(node.attrs[attr]);
    if (value !== node.attrs[attr]) {
      if (dispatch) tr.setNodeAttribute(pos, attr, value);
      changed = true;
    }
    // A quote is indented as a whole, not its paragraphs again.
    return false;
  });
  return changed;
}

const inList = (props: CommandProps) => LIST_ITEMS.some((t) => props.editor.isActive(t));

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: SPACED,
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (el) => spacingOf(el.getAttribute('data-line-spacing')),
            renderHTML: (attrs) =>
              spacingOf(attrs.lineSpacing) ? { 'data-line-spacing': String(attrs.lineSpacing), style: `line-height: ${attrs.lineSpacing}` } : {},
          },
        },
      },
      {
        types: INDENTED,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => clampIndent(el.getAttribute('data-indent')),
            renderHTML: (attrs) =>
              clampIndent(attrs.indent) ? { 'data-indent': String(attrs.indent), style: `margin-left: ${clampIndent(attrs.indent) * INDENT_EM}em` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing: (spacing) => (props) => updateBlocks(props, SPACED, 'lineSpacing', () => spacingOf(spacing)),
      indent: () => (props) => {
        if (inList(props)) return LIST_ITEMS.some((t) => props.editor.isActive(t) && props.commands.sinkListItem(t));
        return updateBlocks(props, INDENTED, 'indent', (v) => clampIndent(Number(v) + 1));
      },
      outdent: () => (props) => {
        if (inList(props)) return LIST_ITEMS.some((t) => props.editor.isActive(t) && props.commands.liftListItem(t));
        return updateBlocks(props, INDENTED, 'indent', (v) => clampIndent(Number(v) - 1));
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Lists keep their own Tab (nest / un-nest).
      Tab: () => (LIST_ITEMS.some((t) => this.editor.isActive(t)) ? false : this.editor.commands.indent()),
      'Shift-Tab': () => (LIST_ITEMS.some((t) => this.editor.isActive(t)) ? false : this.editor.commands.outdent()),
      'Mod-]': () => this.editor.commands.indent(),
      'Mod-[': () => this.editor.commands.outdent(),
      'Mod-Enter': () => this.editor.commands.setPageBreak(),
    };
  },
});
