import { Extension, type Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode, type ResolvedPos, type Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { TIMESTAMP_CHIP, chipMs } from './timestampChip';

/**
 * Live notes: while the lecture records, each new line of My
 * notes starts with the recording time as a timestamp chip, put there when
 * the line's first character is typed (Lea, 30 Oct). Only lines that were
 * empty: lines written before Start, lines already stamped and empty lines
 * get none, and editing a line never changes its time. A paste of several
 * lines stamps each new one with the paste's time. Undo takes the chip away
 * with the typing.
 *
 * A line: a paragraph or heading of the page, or the first paragraph of a
 * list or checklist item (not table cells or the inside of boxes).
 *
 * The time comes from `clock` (the recorder's timeline, pauses left out;
 * null when nothing records), set by the screen: on the laptop a function,
 * on the iPhone through the bridge (./bridges/liveStamps). Shared by both
 * editors, so it imports nothing from React Native.
 */

export type RecordingClock = () => number | null;

interface LiveStampsStorage {
  clock: RecordingClock | null;
}

const key = new PluginKey('studiplyLiveStamps');
const ITEMS = new Set(['listItem', 'taskItem']);
const PAGE_LINES = new Set(['paragraph', 'heading']);

/** The line the cursor is in can carry a stamp (see above). */
function isLine($pos: ResolvedPos): boolean {
  const block = $pos.parent;
  if (!block.isTextblock || $pos.depth < 1) return false;
  const holder = $pos.node($pos.depth - 1);
  if (holder.type.name === 'doc') return PAGE_LINES.has(block.type.name);
  return ITEMS.has(holder.type.name) && block.type.name === 'paragraph' && $pos.index($pos.depth - 1) === 0;
}

/** The chip and the space after it, as inline content. */
function stamp(schema: Schema, ms: number): PMNode[] {
  return [schema.nodes[TIMESTAMP_CHIP].create({ ms: chipMs(ms) }), schema.text(' ')];
}

const startsWithChip = (block: PMNode) => block.firstChild?.type.name === TIMESTAMP_CHIP;

/** The pasted lines with a stamp each (not the first when it joins a line that has text). */
function stampSlice(slice: Slice, schema: Schema, ms: number, joinsText: boolean): Slice {
  let first = true;
  const stampBlock = (block: PMNode): PMNode => {
    const skip = first && joinsText && slice.openStart > 0;
    first = false;
    if (skip || !block.textContent.trim() || startsWithChip(block)) return block;
    return block.copy(Fragment.from(stamp(schema, ms)).append(block.content));
  };
  const walk = (fragment: Fragment, inItem: boolean): Fragment => {
    const out: PMNode[] = [];
    fragment.forEach((node, _offset, index) => {
      if (node.isTextblock && (inItem ? index === 0 && node.type.name === 'paragraph' : PAGE_LINES.has(node.type.name))) out.push(stampBlock(node));
      else if (ITEMS.has(node.type.name)) out.push(node.copy(walk(node.content, true)));
      else if (node.type.name.endsWith('List')) out.push(node.copy(walk(node.content, false)));
      else {
        if (node.isTextblock) first = false;
        out.push(node);
      }
    });
    return Fragment.from(out);
  };
  return new Slice(walk(slice.content, false), slice.openStart, slice.openEnd);
}

export const LiveStamps = Extension.create<Record<string, never>, LiveStampsStorage>({
  name: 'liveStamps',

  addStorage() {
    return { clock: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key,
        props: {
          // The first character of an empty line: the chip, a space, then the character (one change, one Undo).
          handleTextInput(view, from, to, text) {
            const ms = storage.clock?.() ?? null;
            if (ms === null || view.composing || !view.editable) return false;
            const { state } = view;
            const $from = state.doc.resolve(from);
            if (from !== to || !isLine($from) || $from.parent.content.size !== 0) return false;
            const marks = state.storedMarks ?? $from.marks();
            const tr = state.tr.insert(from, [...stamp(state.schema, ms), state.schema.text(text, marks)]);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          transformPasted(slice, view) {
            const ms = storage.clock?.() ?? null;
            if (ms === null) return slice;
            const $from = view.state.selection.$from;
            return stampSlice(slice, view.state.schema, ms, $from.parent.content.size > 0);
          },
        },
      }),
    ];
  },
});

/** The screen sets (or clears) the recording clock. */
export function setRecordingClock(editor: Pick<Editor, 'storage'>, clock: RecordingClock | null): void {
  const storage = (editor.storage as unknown as Record<string, LiveStampsStorage | undefined>).liveStamps;
  if (storage) storage.clock = clock;
}
