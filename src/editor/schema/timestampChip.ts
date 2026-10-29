import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

import { formatHitTime } from '../../utils/searchText';

/**
 * The timestamp chip (step 4.2 spike; the real chip with playback is 4.6 /
 * 5.4): an inline, atomic node holding a recording time in milliseconds,
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

export const TimestampChip = Node.create({
  name: TIMESTAMP_CHIP,
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
export function selectedChipMs(editor: Pick<Editor, 'state'>): number | null {
  const { selection } = editor.state;
  const node = 'node' in selection ? (selection.node as { type: { name: string }; attrs: { ms?: unknown } } | undefined) : undefined;
  return node?.type.name === TIMESTAMP_CHIP ? chipMs(node.attrs.ms) : null;
}
