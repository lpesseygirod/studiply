import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { TABLE_BAR_CLASS } from '../table/tableBar';
import { mathCandidate } from './mathSuggest';

/**
 * Formulas (step 4.5): Tiptap's `inlineMath` and `blockMath` (KaTeX), with
 * Studiply's way of editing them, the same on both devices:
 * - `setFormula` puts a formula where the cursor is, or changes the selected
 *   one (its LaTeX, or inline ↔ display), and leaves it selected, so the
 *   popover (laptop) or sheet (iPhone) can keep changing it as the student
 *   types: the formula in the text is the preview;
 * - clicking or tapping a formula selects it and asks the device to open its
 *   editor: a DOM event on the laptop (where it is, for the popover), a
 *   request in the editor state on the iPhone (`formulaRequest`, published
 *   to the app on every transaction), as the table bar does.
 */

export const INLINE_MATH = 'inlineMath';
export const BLOCK_MATH = 'blockMath';
/** Laptop: `detail` is { x, y } (the window position to open the popover at). */
export const FORMULA_EVENT = 'studiply-formula';

export interface FormulaRequest {
  id: number;
}
export const formulaKey = new PluginKey<FormulaRequest | null>('studiplyFormula');

/** Maths typed as text just before the cursor, offered as a formula ("Make formula"). */
export interface MathSuggestion {
  from: number;
  to: number;
  latex: string;
}
interface SuggestState {
  suggestion: MathSuggestion | null;
  /** The one Escape dismissed (`from:latex`), not offered again. */
  dismissed: string | null;
}
export const mathSuggestKey = new PluginKey<SuggestState>('studiplyMathSuggest');
export const MATH_CHIP_CLASS = 'studiply-math-chip';

/** The suggestion for the cursor in `state`, if any. */
function suggestionIn(state: EditorState): MathSuggestion | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const found = mathCandidate(text);
  if (!found) return null;
  const start = $from.start();
  return { from: start + found.start, to: start + found.end, latex: found.latex };
}

/** The suggestion to show now (null when none, or the student dismissed it). */
export const mathSuggestion = (state: EditorState): MathSuggestion | null => mathSuggestKey.getState(state)?.suggestion ?? null;

/** Starters for the editor's buttons (Lea's list): what each puts in. */
export const FORMULA_STARTERS: { label: string; latex: string }[] = [
  { label: 'Fraction', latex: '\\frac{a}{b}' },
  { label: 'Power', latex: 'x^{n}' },
  { label: 'Root', latex: '\\sqrt{x}' },
  { label: 'Sum', latex: '\\sum_{i=1}^{n}' },
  { label: 'Integral', latex: '\\int_{a}^{b}' },
];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formula: {
      /** A formula where the cursor is, or the selected one changed; it stays selected. */
      setFormula: (options: { latex: string; display: boolean }) => ReturnType;
      /** Removes the selected formula. */
      removeFormula: () => ReturnType;
      /** Puts the cursor just after the selected formula (done editing it). */
      leaveFormula: () => ReturnType;
      /** Turns the suggested maths before the cursor into a formula. */
      acceptMathSuggestion: () => ReturnType;
      /** Not this one (Escape). */
      dismissMathSuggestion: () => ReturnType;
    };
  }
}

const isMath = (node: PMNode | null | undefined) => !!node && (node.type.name === INLINE_MATH || node.type.name === BLOCK_MATH);

/** The selected formula, if the selection is one. */
export function selectedFormula(state: EditorState): { latex: string; display: boolean; pos: number } | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || !isMath(selection.node)) return null;
  return { latex: String(selection.node.attrs.latex ?? ''), display: selection.node.type.name === BLOCK_MATH, pos: selection.from };
}

/** Selects the formula `tr` just put in around `near` (its exact place depends on how it fitted). */
function selectInserted(tr: Transaction, near: number, node: PMNode) {
  const from = Math.max(0, near - node.nodeSize - 2);
  const to = Math.min(tr.doc.content.size, near + node.nodeSize + 2);
  let found = -1;
  tr.doc.nodesBetween(from, to, (n, pos) => {
    if (found < 0 && n.type === node.type && n.attrs.latex === node.attrs.latex) found = pos;
    return found < 0;
  });
  if (found >= 0) tr.setSelection(NodeSelection.create(tr.doc, found));
}

export const Formulas = Extension.create({
  name: 'formulas',
  // Tab takes a suggestion before lists and tables use it.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Tab: () => !!mathSuggestion(this.editor.state) && this.editor.commands.acceptMathSuggestion(),
      Escape: () => !!mathSuggestion(this.editor.state) && this.editor.commands.dismissMathSuggestion(),
    };
  },

  addCommands() {
    return {
      setFormula:
        ({ latex, display }) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[display ? BLOCK_MATH : INLINE_MATH];
          if (!type) return false;
          const current = selectedFormula(state);
          if (!dispatch) return true;
          if (current && (current.display === display)) {
            tr.setNodeMarkup(current.pos, undefined, { ...state.doc.nodeAt(current.pos)!.attrs, latex });
            tr.setSelection(NodeSelection.create(tr.doc, current.pos));
            return true;
          }
          const node = type.create({ latex });
          const at = tr.selection.from;
          tr.replaceSelectionWith(node, false);
          selectInserted(tr, tr.mapping.map(at), node);
          return true;
        },
      removeFormula:
        () =>
        ({ state, tr, dispatch }) => {
          const current = selectedFormula(state);
          if (!current) return false;
          if (dispatch) tr.delete(current.pos, current.pos + state.doc.nodeAt(current.pos)!.nodeSize);
          return true;
        },
      acceptMathSuggestion:
        () =>
        ({ state, tr, dispatch }) => {
          const s = mathSuggestion(state);
          const type = state.schema.nodes[INLINE_MATH];
          if (!s || !type) return false;
          if (dispatch) tr.replaceWith(s.from, s.to, type.create({ latex: s.latex }));
          return true;
        },
      dismissMathSuggestion:
        () =>
        ({ state, tr, dispatch }) => {
          const s = mathSuggestion(state);
          if (!s) return false;
          if (dispatch) tr.setMeta(mathSuggestKey, { dismiss: `${s.from}:${s.latex}` });
          return true;
        },
      leaveFormula:
        () =>
        ({ state, tr, dispatch }) => {
          const current = selectedFormula(state);
          if (!current) return false;
          // Right after it, or (a display formula) the nearest place to type after it.
          const after = current.pos + state.doc.nodeAt(current.pos)!.nodeSize;
          if (dispatch) tr.setSelection(Selection.near(tr.doc.resolve(after), 1));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<SuggestState>({
        key: mathSuggestKey,
        state: {
          init: (_config, state) => ({ suggestion: suggestionIn(state), dismissed: null }),
          apply: (tr, value, _old, state) => {
            const dismiss = (tr.getMeta(mathSuggestKey) as { dismiss?: string } | undefined)?.dismiss;
            const dismissed = dismiss ?? value.dismissed;
            const found = tr.docChanged || tr.selectionSet ? suggestionIn(state) : value.suggestion;
            const shown = found && `${found.from}:${found.latex}` === dismissed ? null : found;
            return { suggestion: shown, dismissed };
          },
        },
        // `$…$` and `$$…$$` as they're typed: typingShortcuts.ts.
        view: (view) => new MathChipView(view, editor),
      }),
      new Plugin<FormulaRequest | null>({
        key: formulaKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(formulaKey) ?? value,
        },
        props: {
          // A click on a formula selects it and asks for its editor (only when the text can be edited).
          handleClickOn: (view, _pos, node, nodePos, event, direct) => {
            if (!direct || !isMath(node) || !view.editable) return false;
            const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos));
            // A time, so a tap after the editor reloaded is still new to the app.
            view.dispatch(tr.setMeta(formulaKey, { id: Date.now() }));
            const box = (view.nodeDOM(nodePos) as HTMLElement | null)?.getBoundingClientRect();
            view.dom.dispatchEvent(new CustomEvent(FORMULA_EVENT, { bubbles: true, detail: { x: box?.left ?? event.clientX, y: (box?.bottom ?? event.clientY) + 6 } }));
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * The laptop's "Make formula" chip, by the cursor (a mouse: the iPhone shows
 * it first in its keyboard toolbar instead). A click or Tab takes it.
 */
class MathChipView {
  private chip = document.createElement('button');
  private fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

  constructor(
    private view: EditorView,
    private editor: Editor,
  ) {
    this.chip.type = 'button';
    this.chip.className = `${TABLE_BAR_CLASS} ${MATH_CHIP_CLASS}`;
    this.chip.style.display = 'none';
    this.chip.addEventListener('mousedown', (e) => e.preventDefault());
    this.chip.addEventListener('click', () => this.editor.chain().focus().acceptMathSuggestion().run());
  }

  update(view: EditorView) {
    this.view = view;
    const parent = view.dom.parentElement;
    const s = this.fine && this.editor.isEditable && view.hasFocus() ? mathSuggestion(view.state) : null;
    if (!parent || !s) {
      this.chip.style.display = 'none';
      return;
    }
    if (this.chip.parentElement !== parent) {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(this.chip);
    }
    this.chip.textContent = 'Make formula  ⇥';
    this.chip.setAttribute('aria-label', `Make formula: ${s.latex} (Tab)`);
    this.chip.style.display = 'flex';
    const at = view.coordsAtPos(s.to);
    const box = parent.getBoundingClientRect();
    this.chip.style.top = `${at.bottom - box.top + 4}px`;
    this.chip.style.left = `${Math.max(0, Math.min(at.left - box.left, box.width - this.chip.offsetWidth))}px`;
  }

  destroy() {
    this.chip.remove();
  }
}

/** The formula request in the editor state (the iPhone opens the sheet on a new one). */
export const formulaRequest = (editor: Editor): FormulaRequest | null => formulaKey.getState(editor.state) ?? null;
