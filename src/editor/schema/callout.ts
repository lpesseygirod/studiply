import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { leaveBoxOnEmptyLast } from './boxKeys';
import { chipLabel } from './timestampChip';

/**
 * Callouts (SUMMARY-SPEC "Callouts"): a box in the document with a
 * small label, so meaning never depends on colour: Definition, Example, Exam
 * signal, Warning (a common mistake), From your notes, You were confused here
 * (its level and time) and Added context (not from the lecture). The summary
 * writes them; the student types in them and edits them like any
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

export type CalloutKind =
  | 'definition'
  | 'example'
  | 'exam'
  | 'warning'
  | 'fromNotes'
  | 'confused'
  | 'addedContext'
  | 'fromAssistant'
  | 'takeaways'
  | 'notesCheck'
  | 'answer'
  | 'update';

/** Each kind: its name in menus, and the label the box shows. */
export const CALLOUT_KINDS: { kind: CalloutKind; name: string; label: string }[] = [
  { kind: 'definition', name: 'Definition', label: 'Definition' },
  { kind: 'example', name: 'Example', label: 'Example' },
  { kind: 'exam', name: 'Exam signal', label: 'Exam signal' },
  { kind: 'warning', name: 'Common mistake', label: 'Common mistake' },
  { kind: 'fromNotes', name: 'From your notes', label: 'From your notes' },
  { kind: 'confused', name: 'You were confused here', label: 'You were confused here' },
  { kind: 'addedContext', name: 'Added context', label: 'Added context · not from the lecture' },
  // An answer added to My notes, or a suggestion put below its text; only the assistant makes it.
  { kind: 'fromAssistant', name: 'From the study assistant', label: 'From the study assistant' },
  // The summary written into the Summary tab: Key takeaways, the notes check line (its label
  // a sentence, not small capitals) and a self-test answer, hidden until tapped.
  { kind: 'takeaways', name: 'Key takeaways', label: 'Key takeaways' },
  { kind: 'notesCheck', name: 'Notes check', label: 'All your notes are in this summary' },
  { kind: 'answer', name: 'Answer', label: 'Answer' },
  // The professor corrected an earlier lecture ("last week I said X, actually…"): "UPDATE · LECTURE 4 · 18:30".
  { kind: 'update', name: 'Update', label: 'Update' },
];

/** Only the summary makes these (the assistant's box, the notes check line, a hidden answer, an update): not in the Callout menus. */
const SUMMARY_ONLY: readonly CalloutKind[] = ['fromAssistant', 'notesCheck', 'answer', 'update'];

/** The kinds a student can choose in the Callout menus. */
export const MENU_CALLOUT_KINDS = CALLOUT_KINDS.filter((k) => !SUMMARY_ONLY.includes(k.kind));

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

/** A mark on the notes of a From your notes box ("FROM YOUR NOTES · 06:40 · EXAM 9/10"). */
const MARK_NAMES: Record<string, string> = { important: 'Important', confused: 'Confused', exam: 'Exam' };
const cleanMark = (v: unknown): string | null => (typeof v === 'string' && v in MARK_NAMES ? v : null);
/** An Update's lecture number, or null. */
const cleanLecture = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

/** "YOU WERE CONFUSED HERE · 7/10 · 18:30", "FROM YOUR NOTES · 06:40 · EXAM 9/10" (shown in capitals by CSS). */
export function calloutLabel(attrs: { kind?: unknown; level?: unknown; ms?: unknown; mark?: unknown; lecture?: unknown }): string {
  const kind = isKind(attrs.kind) ? attrs.kind : 'definition';
  const parts = [CALLOUT_KINDS.find((k) => k.kind === kind)!.label];
  const level = cleanLevel(attrs.level);
  const ms = cleanMs(attrs.ms);
  const mark = cleanMark(attrs.mark);
  if (kind === 'update') {
    const lecture = cleanLecture(attrs.lecture);
    if (lecture !== null) parts.push(`Lecture ${lecture}`);
    if (ms !== null) parts.push(chipLabel(ms));
    return parts.join(' · ');
  }
  if (kind === 'confused' && level !== null) parts.push(`${level}/10`);
  if ((kind === 'confused' || kind === 'fromNotes' || kind === 'fromAssistant') && ms !== null) parts.push(chipLabel(ms));
  if (kind === 'fromNotes' && mark) parts.push(level === null ? MARK_NAMES[mark] : `${MARK_NAMES[mark]} ${level}/10`);
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

/** What a callout holds: text blocks, lists, formulas (and formula cards), graphs, photos, tables; not another callout, a title or a page break. */
const INSIDE = '(paragraph | heading | bulletList | orderedList | taskList | blockquote | blockMath | formulaCard | graph | image | table)+';

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
      // The student's mark on the notes of a From your notes box (its label shows it).
      mark: {
        default: null,
        parseHTML: (el) => cleanMark(el.getAttribute('data-mark')),
        renderHTML: (attrs) => (cleanMark(attrs.mark) ? { 'data-mark': cleanMark(attrs.mark) } : {}),
      },
      // The note lines a From your notes box copies (My notes' block ids, comma-separated),
      // so a summary written again leaves out the lines a box she edited already has.
      noteIds: { default: null, rendered: false },
      // An Update's lecture number (its label: "UPDATE · LECTURE 4 · 18:30").
      lecture: {
        default: null,
        parseHTML: (el) => cleanLecture(el.getAttribute('data-lecture')),
        renderHTML: (attrs) => (cleanLecture(attrs.lecture) === null ? {} : { 'data-lecture': String(cleanLecture(attrs.lecture)) }),
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
              if (!label || !box) return false;
              const pos = view.posAtDOM(box, 0) - 1;
              // A self-test answer's label shows or hides it, also in a read-only view.
              const node = view.state.doc.nodeAt(pos);
              if (node?.type.name === CALLOUT && node.attrs.kind === 'answer') {
                event.preventDefault();
                view.dispatch(view.state.tr.setMeta(answerKey, { toggle: answerId(node, pos) }));
                return true;
              }
              if (!view.editable) return false;
              event.preventDefault();
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
      answerReveal(),
    ];
  },
});

/** The answers shown: by block id, the view's own state, never the document. */
export const answerKey = new PluginKey<Set<string>>('studiplyAnswers');
export const ANSWER_SHOWN_CLASS = 'shown';

/** An answer box's key: its block id (stable through edits and the other device's changes), else its place. */
const answerId = (node: PMNode, pos: number) => (typeof node.attrs.blockId === 'string' ? node.attrs.blockId : `@${pos}`);

/**
 * Self-test answers hidden until their label is tapped (SUMMARY-SPEC: "answers hidden in the app"):
 * which ones are shown is kept here, as decorations, so showing one is never an edit (the block stays
 * untouched for "regenerating never overwrites what she edited") and isn't saved.
 */
function answerReveal(): Plugin<Set<string>> {
  return new Plugin<Set<string>>({
    key: answerKey,
    state: {
      init: () => new Set(),
      apply: (tr, shown) => {
        const meta = tr.getMeta(answerKey) as { toggle: string } | undefined;
        if (!meta) return shown;
        const next = new Set(shown);
        if (next.has(meta.toggle)) next.delete(meta.toggle);
        else next.add(meta.toggle);
        return next;
      },
    },
    props: {
      decorations: (state) => {
        const shown = answerKey.getState(state);
        if (!shown?.size) return null;
        const marks: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name === CALLOUT && node.attrs.kind === 'answer' && shown.has(answerId(node, pos))) marks.push(Decoration.node(pos, pos + node.nodeSize, { class: ANSWER_SHOWN_CLASS }));
          return node.type.name !== CALLOUT;
        });
        return DecorationSet.create(state.doc, marks);
      },
    },
  });
}

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
