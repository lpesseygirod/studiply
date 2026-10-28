import type { CommandProps, Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

import { DEFAULT_LINE_SPACING, TITLE } from '../schema/blocks';
import { DEFAULT_SIZE, fontOf, FONTS, sizeOf, stepSize, type FontChoice } from '../schema/fonts';

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
  { key: 'center', label: 'Center', shortcut: '⌘⇧E' },
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
  | { type: 'insertText'; text: string };

/** The first text block of the selection (with everything selected, the document's first). */
function blockOf(editor: Editor) {
  const { $from, from, to } = editor.state.selection;
  if ($from.parent.isTextblock) return $from.parent;
  let found: typeof $from.parent | null = null;
  editor.state.doc.nodesBetween(from, Math.max(to, from + 1), (node) => {
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
  }
}
