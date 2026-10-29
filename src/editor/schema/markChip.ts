import { mergeAttributes, Node } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';

import { cleanLevel } from './callout';

/**
 * Mark chips (step 4.6; DESIGN, SUMMARY-SPEC): "Important 8/10",
 * "Confused 7/10", "Exam 9/10" in the text, the student's marks from a
 * recording (Phase 5 links `markId`; the summary puts them on their
 * sections). An inline chip; a click or tap on it asks the device for its
 * menu (the kind, the level 1–10, remove), as callouts and the table bar do.
 * Shared by both editors.
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
const isMarkKind = (v: unknown): v is MarkKind => MARK_KINDS.some((k) => k.kind === v);

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
}
/** The selected mark chip, if the selection is one. */
export function selectedMarkChip(state: EditorState): MarkChipInfo | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== MARK_CHIP) return null;
  return { kind: selection.node.attrs.kind, level: cleanLevel(selection.node.attrs.level), pos: selection.from };
}

export interface MarkChipRequest {
  id: number;
}
export const markChipKey = new PluginKey<MarkChipRequest | null>('studiplyMarkChip');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    markChip: {
      insertMarkChip: (options: { kind: MarkKind; level: number | null }) => ReturnType;
      /** The selected chip's kind or level. */
      updateMarkChip: (options: { kind?: MarkKind; level?: number | null }) => ReturnType;
      deleteMarkChip: () => ReturnType;
    };
  }
}

export const MarkChip = Node.create({
  name: MARK_CHIP,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

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
        ({ kind, level }) =>
        ({ state, tr, dispatch }) => {
          const chip = selectedMarkChip(state);
          if (!chip) return false;
          if (dispatch) {
            const attrs = state.doc.nodeAt(chip.pos)!.attrs;
            tr.setNodeMarkup(chip.pos, undefined, { ...attrs, ...(kind ? { kind } : {}), ...(level !== undefined ? { level: cleanLevel(level) } : {}) });
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
