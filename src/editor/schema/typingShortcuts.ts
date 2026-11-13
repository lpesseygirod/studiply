import {
  CommandManager,
  Extension,
  InputRule,
  createChainableState,
  markInputRule,
  textblockTypeInputRule,
  wrappingInputRule,
  type Editor,
} from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { DocColors } from '../../constants/colors';
import { BLOCK_MATH, INLINE_MATH } from './formula';
import { DOLLAR_MATH } from './mathSuggest';
import { TIMESTAMP_CHIP } from './timestampChip';

/**
 * Typing shortcuts (after test C, Lea): "- ", "1. ", "[] ", "# ", "> ",
 * `$…$`, `$$…$$` and the Markdown marks, the same on both devices.
 *
 * Studiply runs them itself. Tiptap 3.32 puts the typed character in first
 * and gives up when another plugin then changes the document, which the
 * block plugin (blockMeta.ts) always does, as it stamps the edit. Here the
 * character goes in and the shortcut applies in one change, so the stamp
 * comes after both. Tiptap's rule helpers make the changes, and Backspace
 * right after gives back what was typed (Tiptap's `undoInputRule` reads the
 * record this plugin keeps). Tiptap's own runner stays on underneath: this
 * one goes first and takes every match; Tiptap's still serves text that
 * comes from an IME composition (which isn't affected).
 *
 * An explicit list: not Tiptap's `![](url)` (a picture from the web without
 * the photo flow), backticks (no code style) or `_x_` (x_1, snake_case).
 */

/** Text before the cursor that a shortcut can see (Tiptap's limit). */
const LOOK_BACK = 500;

// Tiptap's patterns (their extensions), copied so the list is all here.
const BULLET = /^\s*([-+*])\s$/;
const ORDERED = /^(\d+)\.\s$/;
const TASK = /^\s*(\[([( |x])?\])\s$/;
const HEADING = /^(#{1,3})\s$/;
const QUOTE = /^\s*>\s$/;
const BOLD = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/;
const ITALIC = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/;
const STRIKE = /(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/;
const HIGHLIGHT = /(?:^|\s)(==(?!\s+==)((?:[^=]+))==(?!\s+==))$/;
/** `$$…$$`: a display formula alone on a line, an inline one in a sentence. */
const DOUBLE_DOLLAR_MATH = /(?:^|[^$\\])\$\$([^$]*[^\s$][^$]*)\$\$$/;

/** What Backspace right after a shortcut needs to put the typed text back (Tiptap's shape). */
interface Undoable {
  transform: Transaction;
  from: number;
  to: number;
  text: string;
}

const key = new PluginKey<Undoable | null>('studiplyTypingShortcuts');

/** `$x^2$` (Pandoc's rule, so "$5 and $10" stays text) → an inline formula. */
function dollarRule(schema: Schema): InputRule | null {
  const type = schema.nodes[INLINE_MATH];
  if (!type) return null;
  return new InputRule({
    find: DOLLAR_MATH,
    handler: ({ state, range, match }) => {
      const latex = match[1];
      if (!latex || latex.includes('￼')) return null;
      state.tr.replaceWith(range.to - latex.length - 2, range.to, type.create({ latex }));
    },
  });
}

/** `$$x$$`: alone in a paragraph of the page, a display formula with a new line after it; in a sentence, inline. */
function doubleDollarRule(schema: Schema): InputRule | null {
  const inline = schema.nodes[INLINE_MATH];
  const display = schema.nodes[BLOCK_MATH];
  const { paragraph } = schema.nodes;
  if (!inline || !display || !paragraph) return null;
  return new InputRule({
    find: DOUBLE_DOLLAR_MATH,
    handler: ({ state, range, match }) => {
      const latex = match[1].trim();
      if (!latex || latex.includes('￼')) return null;
      const { tr } = state;
      const start = range.to - match[1].length - 4;
      const $start = tr.doc.resolve(start);
      const block = $start.parent;
      const alone = $start.depth === 1 && block.type === paragraph && start === $start.start() && range.to === $start.end();
      if (!alone) {
        tr.replaceWith(start, range.to, inline.create({ latex }));
        return;
      }
      const before = $start.before();
      tr.replaceWith(before, $start.after(), [display.create({ latex }), paragraph.create()]);
      tr.setSelection(TextSelection.create(tr.doc, before + tr.doc.nodeAt(before)!.nodeSize + 1));
    },
  });
}

/** The shortcuts this document's schema has room for, in the order they're tried. */
export function typingShortcutRules(schema: Schema): InputRule[] {
  const { nodes, marks } = schema;
  const rules: (InputRule | null)[] = [
    nodes.bulletList ? wrappingInputRule({ find: BULLET, type: nodes.bulletList }) : null,
    nodes.orderedList
      ? wrappingInputRule({
          find: ORDERED,
          type: nodes.orderedList,
          getAttributes: (match) => ({ start: +match[1] }),
          // "3. " right after a list of two goes on with it.
          joinPredicate: (match, node: PMNode) => node.childCount + node.attrs.start === +match[1],
        })
      : null,
    nodes.taskItem ? wrappingInputRule({ find: TASK, type: nodes.taskItem, getAttributes: (match) => ({ checked: match[match.length - 1] === 'x' }) }) : null,
    // Heading 1, Heading 2, Subheading: the three Studiply has.
    nodes.heading ? textblockTypeInputRule({ find: HEADING, type: nodes.heading, getAttributes: (match) => ({ level: match[1].length }) }) : null,
    nodes.blockquote ? wrappingInputRule({ find: QUOTE, type: nodes.blockquote }) : null,
    doubleDollarRule(schema),
    dollarRule(schema),
    // Bold before italic: "**" is two stars.
    marks.bold ? markInputRule({ find: BOLD, type: marks.bold }) : null,
    marks.italic ? markInputRule({ find: ITALIC, type: marks.italic }) : null,
    marks.strike ? markInputRule({ find: STRIKE, type: marks.strike }) : null,
    marks.highlight ? markInputRule({ find: HIGHLIGHT, type: marks.highlight, getAttributes: { color: DocColors.highlight[0].value } }) : null,
  ];
  return rules.filter((r): r is InputRule => !!r);
}

/** Where a leading timestamp chip (and the space after it) ends in the line; 0 without one. */
function leadingStampEnd(block: PMNode): number {
  const chip = block.firstChild;
  if (chip?.type.name !== TIMESTAMP_CHIP) return 0;
  const next = block.maybeChild(1);
  return chip.nodeSize + (next?.isText && next.text?.startsWith(' ') ? 1 : 0);
}

/** Applies the first shortcut the typed `text` completes, in one change. */
function runShortcut(editor: Editor, view: EditorView, rules: InputRule[], from: number, to: number, text: string): boolean {
  if (view.composing || !view.editable) return false;
  const $from = view.state.doc.resolve(from);
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  // A line stamped with the recording time (a timestamp chip and a space first) still
  // starts after its stamp: "- " makes a list, "# " a heading, and the chip stays in the line.
  const stampEnd = leadingStampEnd($from.parent);
  if (stampEnd > $from.parentOffset) return false;
  // One character for each inline leaf (a formula, a chip), so the text's places are the document's.
  const before = $from.parent.textBetween(Math.max(stampEnd, $from.parentOffset - LOOK_BACK), $from.parentOffset, undefined, '￼') + text;
  for (const rule of rules) {
    if (!(rule.find instanceof RegExp)) continue;
    const match = rule.find.exec(before);
    if (!match) continue;
    const tr = view.state.tr.insertText(text, from, to);
    const typed = tr.steps.length;
    const state = createChainableState({ state: view.state, transaction: tr });
    const { commands, chain, can } = new CommandManager({ editor, state });
    const range = { from: from - (match[0].length - text.length), to: from + text.length };
    const result = rule.handler({ state, range, match, commands, chain, can });
    if (result === null || tr.steps.length === typed) continue;
    // Its own Undo step, apart from the typing before it.
    closeHistory(tr);
    tr.setMeta('inputRule', true);
    tr.setMeta(key, { transform: tr, from, to, text });
    view.dispatch(tr.scrollIntoView());
    return true;
  }
  return false;
}

export const TypingShortcuts = Extension.create({
  name: 'typingShortcuts',
  // Before Tiptap's own rules (and the other text handlers).
  priority: 10000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    const rules = typingShortcutRules(editor.schema);
    return [
      new Plugin<Undoable | null>({
        key,
        // Tiptap's Backspace (`undoInputRule`) looks for this.
        isInputRules: true,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const stored = tr.getMeta(key) as Undoable | undefined;
            if (stored) return stored;
            // The block plugin's stamp right after a shortcut keeps it undoable.
            if (tr.getMeta('appendedTransaction')) return value;
            return tr.docChanged || tr.selectionSet ? null : value;
          },
        },
        props: {
          handleTextInput: (view, from, to, text) => runShortcut(editor, view, rules, from, to, text),
        },
      }),
    ];
  },
});
