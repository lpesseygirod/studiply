import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

import type { DocJSON } from '../types';
import { newBlockId } from './blockMeta';
import { cleanLevel } from './callout';
import { TIMESTAMP_CHIP, chipMs } from './timestampChip';

/**
 * Mark chips (step 4.6; DESIGN, SUMMARY-SPEC): "Important 8/10",
 * "Confused 7/10", "Exam 9/10" in the text. An inline chip; a click or tap
 * on it asks the device for its menu (the kind, the level 1–10, remove), as
 * callouts and the table bar do. Shared by both editors.
 *
 * Step 5.5: a mark made while recording is a *linked* chip: `markId` (its
 * row in `marks`), `ms` (the recording time it was made at) and an optional
 * `note`. A lecture's My notes is what its marks are: after each save the
 * rows follow the linked chips (services/marks.service), so a chip deleted
 * by typing deletes its mark and Undo brings it back. `placeMark` puts one
 * in: at the end of the line the student was writing, or on a new last line
 * stamped with its time; or back where it was (Undo of Remove).
 */

export const MARK_CHIP = 'markChip';
export const MARK_CHIP_CLASS = 'studiply-mark-chip';
/** Laptop: `detail` is { x, y } (where to open the chip's menu). */
export const MARK_CHIP_EVENT = 'studiply-mark-chip';

export type MarkKind = 'important' | 'confused' | 'exam';
export const MARK_KINDS: { kind: MarkKind; name: string }[] = [
  { kind: 'important', name: 'Important' },
  { kind: 'confused', name: 'Confused' },
  { kind: 'exam', name: 'Exam' },
];
export const isMarkKind = (v: unknown): v is MarkKind => MARK_KINDS.some((k) => k.kind === v);

/** A mark's note: at most this many characters (step 5.5). */
export const MARK_NOTE_MAX = 500;
export function cleanNote(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, MARK_NOTE_MAX);
  return t ? t : null;
}
const cleanMs = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** A mark made while recording (step 5.5). */
export interface LinkedMark {
  markId: string;
  kind: MarkKind;
  level: number;
  ms: number;
  note: string | null;
}

/** Where a chip is: its block's id and how far into it (puts it back after Remove). */
export interface MarkPlace {
  blockId: string | null;
  offset: number;
}

/** "Confused 7/10". */
export function markChipLabel(attrs: { kind?: unknown; level?: unknown }): string {
  const kind = isMarkKind(attrs.kind) ? attrs.kind : 'important';
  const name = MARK_KINDS.find((k) => k.kind === kind)!.name;
  const level = cleanLevel(attrs.level);
  return level === null ? name : `${name} ${level}/10`;
}

export interface MarkChipInfo {
  kind: MarkKind;
  level: number | null;
  pos: number;
  /** A linked chip's mark (step 5.5); null for a chip put in by hand (Insert → Mark). */
  markId: string | null;
  ms: number | null;
  note: string | null;
  at: MarkPlace;
}

/** The block (with an id) the position is in, nearest first, and the position's offset in it. */
function placeOf(state: EditorState, pos: number): MarkPlace {
  const $pos = state.doc.resolve(pos);
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (typeof node.attrs.blockId === 'string') return { blockId: node.attrs.blockId, offset: pos - $pos.start(d) };
  }
  return { blockId: null, offset: 0 };
}

/** The selected mark chip, if the selection is one. */
export function selectedMarkChip(state: EditorState): MarkChipInfo | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== MARK_CHIP) return null;
  const a = selection.node.attrs;
  return {
    kind: a.kind,
    level: cleanLevel(a.level),
    pos: selection.from,
    markId: typeof a.markId === 'string' && a.markId ? a.markId : null,
    ms: cleanMs(a.ms),
    note: cleanNote(a.note),
    at: placeOf(state, selection.from),
  };
}

export interface MarkChipRequest {
  id: number;
}
export const markChipKey = new PluginKey<MarkChipRequest | null>('studiplyMarkChip');

interface MarkChipStorage {
  /** The student has been in this document since it opened (marks then go on their line). */
  touched: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    markChip: {
      insertMarkChip: (options: { kind: MarkKind; level: number | null }) => ReturnType;
      /** The selected chip's kind, level or note. */
      updateMarkChip: (options: { kind?: MarkKind; level?: number | null; note?: string | null }) => ReturnType;
      deleteMarkChip: () => ReturnType;
      /** A mark made while recording (step 5.5); `at`: back where it was. */
      placeMark: (mark: LinkedMark, at?: MarkPlace) => ReturnType;
    };
  }
}

function linkedChip(schema: Schema, mark: LinkedMark): PMNode {
  return schema.nodes[MARK_CHIP].create({
    kind: mark.kind,
    level: cleanLevel(mark.level),
    markId: mark.markId,
    ms: cleanMs(mark.ms),
    note: cleanNote(mark.note),
  });
}

/** A line's stamp: the timestamp chip and a space (as live notes put it, step 5.4). */
const stampOf = (schema: Schema, ms: number) => [schema.nodes[TIMESTAMP_CHIP].create({ ms: chipMs(ms) }), schema.text(' ')];

/** Puts the chip at `pos` (an inline position): after a space if the line has text, after a stamp if it's empty. */
function putInLine(tr: Transaction, pos: number, chip: PMNode, mark: LinkedMark): void {
  const $pos = tr.doc.resolve(pos);
  const schema = tr.doc.type.schema;
  if ($pos.parent.content.size === 0) tr.insert(pos, [...stampOf(schema, mark.ms), chip]);
  else {
    const before = $pos.nodeBefore;
    const needsSpace = !!before && !(before.isText && /\s$/.test(before.text ?? ''));
    tr.insert(pos, needsSpace ? [schema.text(' '), chip] : [chip]);
  }
}

export const MarkChip = Node.create<Record<string, never>, MarkChipStorage>({
  name: MARK_CHIP,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return { touched: false };
  },

  onFocus() {
    this.storage.touched = true;
  },

  addAttributes() {
    return {
      kind: {
        default: 'important',
        parseHTML: (el) => (isMarkKind(el.getAttribute('data-mark')) ? el.getAttribute('data-mark') : 'important'),
        renderHTML: (attrs) => ({ 'data-mark': isMarkKind(attrs.kind) ? attrs.kind : 'important' }),
      },
      level: {
        default: null,
        parseHTML: (el) => cleanLevel(el.getAttribute('data-level')),
        renderHTML: (attrs) => (cleanLevel(attrs.level) === null ? {} : { 'data-level': String(cleanLevel(attrs.level)) }),
      },
      markId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-mark-id'),
        renderHTML: (attrs) => (attrs.markId ? { 'data-mark-id': String(attrs.markId) } : {}),
      },
      ms: {
        default: null,
        parseHTML: (el) => cleanMs(Number(el.getAttribute('data-mark-ms') ?? NaN)),
        renderHTML: (attrs) => (cleanMs(attrs.ms) === null ? {} : { 'data-mark-ms': String(cleanMs(attrs.ms)) }),
      },
      note: {
        default: null,
        parseHTML: (el) => cleanNote(el.getAttribute('data-mark-note')),
        renderHTML: (attrs) => (cleanNote(attrs.note) === null ? {} : { 'data-mark-note': cleanNote(attrs.note)! }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mark]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: MARK_CHIP_CLASS, contenteditable: 'false' }), markChipLabel(node.attrs)];
  },

  addCommands() {
    return {
      insertMarkChip:
        ({ kind, level }) =>
        ({ state, tr, dispatch }) => {
          const chip = state.schema.nodes[MARK_CHIP].create({ kind, level: cleanLevel(level) });
          if (!dispatch) return true;
          const { selection } = state;
          // Selected words stay: the chip goes right after them (the selection bar's Mark ▸).
          if (selection instanceof TextSelection && !selection.empty) {
            tr.insert(selection.to, chip);
            tr.setSelection(TextSelection.create(tr.doc, selection.to + chip.nodeSize));
          } else tr.replaceSelectionWith(chip, false);
          return true;
        },
      updateMarkChip:
        ({ kind, level, note }) =>
        ({ state, tr, dispatch }) => {
          const chip = selectedMarkChip(state);
          if (!chip) return false;
          if (dispatch) {
            const attrs = state.doc.nodeAt(chip.pos)!.attrs;
            tr.setNodeMarkup(chip.pos, undefined, {
              ...attrs,
              ...(kind ? { kind } : {}),
              ...(level !== undefined ? { level: cleanLevel(level) } : {}),
              ...(note !== undefined ? { note: cleanNote(note) } : {}),
            });
            tr.setSelection(NodeSelection.create(tr.doc, chip.pos));
          }
          return true;
        },
      deleteMarkChip:
        () =>
        ({ state, tr, dispatch }) => {
          const chip = selectedMarkChip(state);
          if (!chip) return false;
          if (dispatch) tr.delete(chip.pos, chip.pos + 1);
          return true;
        },
      placeMark:
        (mark, at) =>
        ({ state, tr, dispatch }) => {
          if (!dispatch) return true;
          const chip = linkedChip(state.schema, mark);
          // Back where it was: its block, at its offset, if that is still a place in a line.
          if (at?.blockId) {
            let found: number | null = null;
            state.doc.descendants((node, pos) => {
              if (found !== null) return false;
              if (node.attrs.blockId === at.blockId) found = pos;
              return found === null;
            });
            if (found !== null) {
              const block = state.doc.nodeAt(found)!;
              const pos = found + 1 + Math.min(at.offset, block.content.size);
              if (tr.doc.resolve(pos).parent.inlineContent) {
                tr.insert(pos, chip);
                return true;
              }
            }
          }
          // The line the student was writing: at its end.
          const { $from } = state.selection;
          if (this.storage.touched && $from.parent.inlineContent) {
            putInLine(tr, $from.end(), chip, mark);
            return true;
          }
          // Otherwise a new last line with its time (an empty last line is used).
          const last = state.doc.lastChild;
          if (last?.type.name === 'paragraph' && last.content.size === 0) {
            putInLine(tr, state.doc.content.size - 1, chip, mark);
          } else {
            const line = state.schema.nodes.paragraph.create(null, [...stampOf(state.schema, mark.ms), chip]);
            tr.insert(state.doc.content.size, line);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<MarkChipRequest | null>({
        key: markChipKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(markChipKey) ?? value,
        },
        props: {
          // A click on a chip selects it and asks for its menu.
          handleClickOn: (view, _pos, node, nodePos, event, direct) => {
            if (!direct || node.type.name !== MARK_CHIP || !view.editable) return false;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)).setMeta(markChipKey, { id: Date.now() }));
            const el = view.nodeDOM(nodePos) as HTMLElement | null;
            const r = el?.getBoundingClientRect();
            view.dom.dispatchEvent(new CustomEvent(MARK_CHIP_EVENT, { bubbles: true, detail: { x: r?.left ?? event.clientX, y: (r?.bottom ?? event.clientY) + 4 } }));
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * My notes as JSON with a new last line for `mark` (its time, then the chip),
 * for a mark made while the lecture's My notes isn't open (the laptop's strip
 * is on every screen). An empty last line is used.
 */
export function withMarkLine(doc: DocJSON, mark: LinkedMark, now = Date.now()): DocJSON {
  const content = [...(doc.content ?? [])];
  const inline = [
    { type: TIMESTAMP_CHIP, attrs: { ms: chipMs(mark.ms) } },
    { type: 'text', text: ' ' },
    { type: MARK_CHIP, attrs: { kind: mark.kind, level: cleanLevel(mark.level), markId: mark.markId, ms: cleanMs(mark.ms), note: cleanNote(mark.note) } },
  ];
  const last = content[content.length - 1];
  if (last?.type === 'paragraph' && !last.content?.length) content[content.length - 1] = { ...last, content: inline };
  else content.push({ type: 'paragraph', attrs: { blockId: newBlockId(), origin: 'student', editedAt: now }, content: inline });
  return { ...doc, content };
}
