import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

import { formatHitTime } from '../../utils/searchText';

/**
 * The timestamp chip (first made in the spike; the real chip has playback):
 * an inline, atomic node holding a recording time in milliseconds,
 * shown as "4:12". Its HTML (`<span data-timestamp-ms>`) is what copy and
 * paste inside the editor carries, so a pasted chip stays a chip.
 *
 * Shared by both editors: the iPhone's WebView bundle (editor-web/) and the
 * laptop's Tiptap. Runs in a browser or the WebView, so it imports nothing
 * from React Native.
 */

export const TIMESTAMP_CHIP = 'timestampChip';
export const CHIP_CLASS = 'ts-chip';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    timestampChip: {
      insertTimestampChip: (ms: number) => ReturnType;
    };
  }
}

/** "4:12" or "1:04:12". */
export function chipLabel(ms: number): string {
  return formatHitTime(ms);
}

/** "4:12", "1:04:12" or "75" (seconds) typed by hand → ms; null when it isn't a time. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n > 59)) return null;
  const seconds = nums.reduce((total, n) => total * 60 + n, 0);
  return seconds * 1000;
}

/** A whole, non-negative number of milliseconds; anything else is 0. */
export function chipMs(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

/**
 * A tap on a chip: its time and a running count, so a tap on the
 * chip that is already selected (the same one again, after the player was
 * closed) still plays. Selecting alone missed it: nothing changes then.
 */
export type ChipTap = { ms: number; n: number };
export const CHIP_TAP = 'studiplyChipTap';
const chipTapKey = new PluginKey(CHIP_TAP);

export const TimestampChip = Node.create<Record<string, never>, { tap: ChipTap | null }>({
  name: TIMESTAMP_CHIP,

  addStorage() {
    return { tap: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: chipTapKey,
        props: {
          // Before the click selects it; a transaction of its own (no change) carries the tap to the screen.
          handleClickOn(view, _pos, node, _nodePos, _event, direct) {
            if (!direct || node.type.name !== TIMESTAMP_CHIP) return false;
            storage.tap = { ms: chipMs(node.attrs.ms), n: (storage.tap?.n ?? 0) + 1 };
            view.dispatch(view.state.tr.setMeta(CHIP_TAP, storage.tap));
            return false;
          },
        },
      }),
    ];
  },
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      ms: {
        default: 0,
        parseHTML: (element) => chipMs(element.getAttribute('data-timestamp-ms')),
        renderHTML: (attributes) => ({ 'data-timestamp-ms': String(chipMs(attributes.ms)) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-timestamp-ms]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: CHIP_CLASS, contenteditable: 'false' }), chipLabel(node.attrs.ms)];
  },

  renderText({ node }) {
    return chipLabel(node.attrs.ms);
  },

  addCommands() {
    return {
      insertTimestampChip:
        (ms) =>
        ({ state, commands }) => {
          const chip = { type: this.name, attrs: { ms: chipMs(ms) } };
          const { selection } = state;
          // Selected words stay: the chip goes right after them (the selection bar's Time ▸).
          return selection instanceof TextSelection && !selection.empty ? commands.insertContentAt(selection.to, chip) : commands.insertContent(chip);
        },
    };
  },
});

/**
 * The chip the selection is on, or null. Tapping an atomic node selects it,
 * so both editors report a tap through this: the laptop on every selection
 * update, the iPhone through the bridge state.
 */
/** The last tap on a chip in this editor (for the iPhone's bridge state). */
export function lastChipTap(editor: Pick<Editor, 'storage'>): ChipTap | null {
  return (editor.storage as unknown as Record<string, { tap?: ChipTap | null } | undefined>)[TIMESTAMP_CHIP]?.tap ?? null;
}

export function selectedChipMs(editor: Pick<Editor, 'state'>): number | null {
  const { selection } = editor.state;
  const node = 'node' in selection ? (selection.node as { type: { name: string }; attrs: { ms?: unknown } } | undefined) : undefined;
  return node?.type.name === TIMESTAMP_CHIP ? chipMs(node.attrs.ms) : null;
}
