import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';

import { leaveBoxOnEmptyLast } from './boxKeys';
import { chipLabel } from './timestampChip';

/**
 * Callouts (step 4.6; SUMMARY-SPEC "Callouts"): a box in the document with a
 * small label, so meaning never depends on colour: Definition, Example, Exam
 * signal, Warning (a common mistake), From your notes, You were confused here
 * (its level and time) and Added context (not from the lecture). The summary
 * (Phase 7) writes them; the student types in them and edits them like any
 * text (paragraphs, lists, formulas, photos inside).
 *
 * A top-level block with its own id, origin and edit time (blockMeta), so the
 * merge between devices and "student edits are never overwritten" work as for
 * any block. The label isn't text: a click on it asks the device for the
 * callout's menu (change the kind, its level, remove the box), as the table
 * bar asks for its menus: a DOM event on the laptop, a request in the editor
 * state on the iPhone. Shared by both editors.
 */

export const CALLOUT = 'callout';
export const CALLOUT_CLASS = 'studiply-callout';
/** Laptop: `detail` is { x, y } (where to open the callout's menu). */
export const CALLOUT_EVENT = 'studiply-callout';

export type CalloutKind = 'definition' | 'example' | 'exam' | 'warning' | 'fromNotes' | 'confused' | 'addedContext';

/** Each kind: its name in menus, and the label the box shows. */
export const CALLOUT_KINDS: { kind: CalloutKind; name: string; label: string }[] = [
  { kind: 'definition', name: 'Definition', label: 'Definition' },
  { kind: 'example', name: 'Example', label: 'Example' },
  { kind: 'exam', name: 'Exam signal', label: 'Exam signal' },
  { kind: 'warning', name: 'Common mistake', label: 'Common mistake' },
  { kind: 'fromNotes', name: 'From your notes', label: 'From your notes' },
  { kind: 'confused', name: 'You were confused here', label: 'You were confused here' },
  { kind: 'addedContext', name: 'Added context', label: 'Added context · not from the lecture' },
];

const isKind = (v: unknown): v is CalloutKind => CALLOUT_KINDS.some((k) => k.kind === v);
/** A level 1–10, or null. */
export const cleanLevel = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : null;
};
const cleanMs = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** "YOU WERE CONFUSED HERE · 7/10 · 18:30" (shown in capitals by CSS). */
export function calloutLabel(attrs: { kind?: unknown; level?: unknown; ms?: unknown }): string {
  const kind = isKind(attrs.kind) ? attrs.kind : 'definition';
  const parts = [CALLOUT_KINDS.find((k) => k.kind === kind)!.label];
  const level = cleanLevel(attrs.level);
  const ms = cleanMs(attrs.ms);
  if (kind === 'confused' && level !== null) parts.push(`${level}/10`);
  if ((kind === 'confused' || kind === 'fromNotes') && ms !== null) parts.push(chipLabel(ms));
  return parts.join(' · ');
}

export interface CalloutInfo {
  kind: CalloutKind;
  level: number | null;
  ms: number | null;
  pos: number;
}

/** The callout the cursor is in, if any. */
export function calloutAt(state: EditorState): CalloutInfo | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === CALLOUT) return { kind: node.attrs.kind, level: cleanLevel(node.attrs.level), ms: cleanMs(node.attrs.ms), pos: $from.before(d) };
  }
  return null;
}

export interface CalloutRequest {
  id: number;
  pos: number;
}
export const calloutKey = new PluginKey<CalloutRequest | null>('studiplyCallout');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** In a callout: change it. Otherwise the selected blocks (or the line) go into a new one. */
      setCallout: (kind: CalloutKind, extra?: { level?: number | null; ms?: number | null }) => ReturnType;
      /** The callout's level (You were confused here). */
      setCalloutLevel: (level: number | null) => ReturnType;
      /** Takes the box away and keeps the text. */
      removeCallout: () => ReturnType;
    };
  }
}

/** What a callout holds: text blocks, lists, formulas (and formula cards, 4.7c), photos, tables; not another callout, a title or a page break. */
const INSIDE = '(paragraph | heading | bulletList | orderedList | taskList | blockquote | blockMath | formulaCard | image | table)+';

export const Callout = Node.create({
  name: CALLOUT,
  group: 'block',
  content: INSIDE,
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'definition',
        parseHTML: (el) => (isKind(el.getAttribute('data-callout')) ? el.getAttribute('data-callout') : 'definition'),
        renderHTML: (attrs) => ({ 'data-callout': isKind(attrs.kind) ? attrs.kind : 'definition' }),
      },
      level: {
        default: null,
        parseHTML: (el) => cleanLevel(el.getAttribute('data-level')),
        renderHTML: (attrs) => (cleanLevel(attrs.level) === null ? {} : { 'data-level': String(cleanLevel(attrs.level)) }),
      },
      ms: {
        default: null,
        parseHTML: (el) => cleanMs(el.getAttribute('data-ms')),
        renderHTML: (attrs) => (cleanMs(attrs.ms) === null ? {} : { 'data-ms': String(cleanMs(attrs.ms)) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: `.${CALLOUT_CLASS}-body` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: CALLOUT_CLASS }),
      ['div', { class: `${CALLOUT_CLASS}-label`, contenteditable: 'false' }, calloutLabel(node.attrs)],
      ['div', { class: `${CALLOUT_CLASS}-body` }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (kind, extra = {}) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[CALLOUT];
          const at = calloutAt(state);
          const attrs = { kind, level: kind === 'confused' ? cleanLevel(extra.level ?? null) : null, ms: cleanMs(extra.ms ?? null) };
          if (at) {
            if (dispatch) tr.setNodeMarkup(at.pos, undefined, { ...state.doc.nodeAt(at.pos)!.attrs, ...attrs, ms: extra.ms !== undefined ? attrs.ms : at.ms });
            return true;
          }
          // The top-level blocks the selection covers go in, as they are.
          const { $from, $to } = state.selection;
          const range = $from.blockRange($to, (n) => n.type.name === 'doc');
          if (!range) return false;
          const blocks: PMNode[] = [];
          for (let i = range.startIndex; i < range.endIndex; i++) blocks.push(state.doc.child(i));
          if (!type.validContent(Fragment.from(blocks))) return false;
          if (dispatch) {
            tr.wrap(range, [{ type, attrs }]);
            tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(state.selection.from))));
          }
          return true;
        },
      setCalloutLevel:
        (level) =>
        ({ state, tr, dispatch }) => {
          const at = calloutAt(state);
          if (!at) return false;
          if (dispatch) tr.setNodeMarkup(at.pos, undefined, { ...state.doc.nodeAt(at.pos)!.attrs, level: cleanLevel(level) });
          return true;
        },
      removeCallout:
        () =>
        ({ state, tr, dispatch }) => {
          const at = calloutAt(state);
          if (!at) return false;
          const node = state.doc.nodeAt(at.pos)!;
          if (dispatch) {
            tr.replaceWith(at.pos, at.pos + node.nodeSize, node.content);
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(state.selection.from), tr.doc.content.size))));
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    return {
      // Enter on an empty last line leaves the box (as in a list).
      Enter: () => leaveBoxOnEmptyLast(editor, CALLOUT),
      // Backspace at the start of an empty box takes it away.
      Backspace: () => removeIfEmpty(editor),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CalloutRequest | null>({
        key: calloutKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(calloutKey) ?? value,
        },
        props: {
          handleDOMEvents: {
            // The label is the callout's handle: its menu, never the cursor.
            mousedown: (view, event) => {
              const label = (event.target as HTMLElement | null)?.closest?.(`.${CALLOUT_CLASS}-label`);
              const box = label?.parentElement;
              if (!label || !box || !view.editable) return false;
              event.preventDefault();
              const pos = view.posAtDOM(box, 0) - 1;
              const inside = TextSelection.near(view.state.doc.resolve(pos + 2));
              const r = label.getBoundingClientRect();
              view.dispatch(view.state.tr.setSelection(inside).setMeta(calloutKey, { id: Date.now(), pos }));
              view.focus();
              view.dom.dispatchEvent(new CustomEvent(CALLOUT_EVENT, { bubbles: true, detail: { x: r.left, y: r.bottom + 4 } }));
              return true;
            },
          },
        },
      }),
    ];
  },
});

function removeIfEmpty(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  const at = calloutAt(state);
  if (!at || !empty || $from.parentOffset !== 0) return false;
  const callout = state.doc.nodeAt(at.pos)!;
  if (callout.textContent.length > 0 || callout.childCount > 1) return false;
  return editor.commands.removeCallout();
}

/** For the format layer: the callout at the cursor, for the iPhone's menu and the toolbar. */
export const calloutRequestOf = (state: EditorState): CalloutRequest | null => calloutKey.getState(state) ?? null;
