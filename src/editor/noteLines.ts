import { TIMESTAMP_CHIP, chipMs } from './schema/timestampChip';
import type { DocJSON } from './types';

/**
 * A lecture's My notes as `note_lines` rows: every line that has
 * something in it, in order, with the recording time of its leading chip
 * (null for a line written before or after the recording), its text without
 * the chip, and the line itself as ProseMirror JSON, so its formatting is
 * kept. The summary's coverage check reads them (SUMMARY-SPEC: every note
 * line must be in the summary).
 *
 * A line is what LiveStamps stamps: a paragraph or heading of the page, or
 * the first paragraph of a list or checklist item. A page block has its own
 * id; the n-th item of a list is `<list id>#n` (`#n.m` in a nested list).
 * Only the editor writes the notes; these rows follow them on every save.
 */

export interface NoteLine {
  block_id: string;
  t_ms: number | null;
  text: string;
  content: Record<string, unknown>;
  position: number;
}

interface Node {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
}

const PAGE_LINES = new Set(['paragraph', 'heading']);
const LISTS = new Set(['bulletList', 'orderedList', 'taskList']);

function textOf(node: Node): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

export function noteLinesOf(doc: DocJSON): NoteLine[] {
  const lines: NoteLine[] = [];
  const add = (block: Node, id: string) => {
    const content = block.content ?? [];
    const chip = content[0]?.type === TIMESTAMP_CHIP ? content[0] : null;
    const text = textOf({ content: chip ? content.slice(1) : content }).trim();
    if (!text) return;
    lines.push({ block_id: id, t_ms: chip ? chipMs(chip.attrs?.ms) : null, text, content: block as Record<string, unknown>, position: lines.length });
  };
  const items = (list: Node, prefix: string, sep: '#' | '.') => {
    (list.content ?? []).forEach((item, i) => {
      const itemId = `${prefix}${sep}${i}`;
      (item.content ?? []).forEach((child, j) => {
        if (j === 0 && child.type === 'paragraph') add(child, itemId);
        else if (child.type && LISTS.has(child.type)) items(child, itemId, '.');
      });
    });
  };
  for (const block of (doc.content ?? []) as Node[]) {
    const id = typeof block.attrs?.blockId === 'string' ? block.attrs.blockId : null;
    if (!id || !block.type) continue;
    if (PAGE_LINES.has(block.type)) add(block, id);
    else if (LISTS.has(block.type)) items(block, id, '#');
  }
  return lines;
}
