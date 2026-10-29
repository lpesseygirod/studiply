import { mergeAttributes, Node, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

import type { FormulaEntry } from '../formulas/library';
import { boxAround, leaveBoxOnEmptyLast } from './boxKeys';
import { placeBlock } from './placeBlock';

/**
 * Formula cards (step 4.7c; SUMMARY-SPEC "Formula card": a boxed formula with
 * its legend underneath): what the formula library puts in, and the block the
 * summary's formula cards use later (8.2). A small title (drawn, not text),
 * the formula on its own line, and under it the legend: each symbol a small
 * formula, then what it means ("PV present value · r rate per period").
 *
 * All of it stays editable: a click on the formula opens the formula editor
 * as for any formula; the legend is ordinary text. A top-level block with its
 * own id and origin (blockMeta), like a callout; it can also sit in one.
 */

export const FORMULA_CARD = 'formulaCard';
export const FORMULA_CARD_CLASS = 'studiply-formula-card';

/** The card's content for a library entry: its formula, then the legend line. */
export function formulaCardContent(entry: Pick<FormulaEntry, 'name' | 'latex' | 'legend'>): JSONContent {
  const legend: JSONContent[] = [];
  entry.legend.forEach((item, i) => {
    legend.push({ type: 'inlineMath', attrs: { latex: item.symbol } });
    legend.push({ type: 'text', text: ` ${item.meaning}${i < entry.legend.length - 1 ? ' · ' : ''}` });
  });
  return {
    type: FORMULA_CARD,
    attrs: { title: entry.name },
    content: [
      { type: 'blockMath', attrs: { latex: entry.latex } },
      { type: 'paragraph', content: legend },
    ],
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formulaCard: {
      /** A card after the cursor's line (in place of an empty one), at the top level or in a callout. */
      insertFormulaCard: (entry: Pick<FormulaEntry, 'name' | 'latex' | 'legend'>) => ReturnType;
    };
  }
}

export const FormulaCard = Node.create({
  name: FORMULA_CARD,
  group: 'block',
  content: 'blockMath paragraph+',
  defining: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => ({ 'data-title': String(attrs.title ?? '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-formula-card]', contentElement: `.${FORMULA_CARD_CLASS}-body` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: FORMULA_CARD_CLASS, 'data-formula-card': '' }),
      ['div', { class: `${FORMULA_CARD_CLASS}-title`, contenteditable: 'false' }, String(node.attrs.title || 'Formula')],
      ['div', { class: `${FORMULA_CARD_CLASS}-body` }, 0],
    ];
  },

  addCommands() {
    return {
      insertFormulaCard:
        (entry) =>
        ({ state, tr, dispatch }) => {
          const card = state.schema.nodeFromJSON(formulaCardContent(entry));
          if (!dispatch) return true;
          // The cursor goes after the card, on a line of its own.
          const { end } = placeBlock(state, tr, card);
          tr.setSelection(TextSelection.create(tr.doc, end + 1));
          tr.scrollIntoView();
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    return {
      // Enter on an empty last legend line leaves the card (it keeps its formula and one line).
      Enter: () => leaveBoxOnEmptyLast(editor, FORMULA_CARD, { keep: 2, leaveFull: true }),
      // Backspace at the start of an empty card (no formula, no legend) takes it away.
      Backspace: () => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        const box = boxAround(state, FORMULA_CARD);
        if (!box || !empty || $from.parentOffset !== 0) return false;
        const math = box.node.firstChild;
        if (box.node.textContent.length > 0 || String(math?.attrs.latex ?? '').trim() !== '' || box.node.childCount > 2) return false;
        const tr = state.tr.replaceWith(box.pos, box.pos + box.node.nodeSize, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, box.pos + 1));
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
