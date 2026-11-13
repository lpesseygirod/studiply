import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

import { MARK_CHIP, cleanNote, markChipLabel } from './schema/markChip';
import { TIMESTAMP_CHIP, chipMs } from './schema/timestampChip';
import type { DocJSON } from './types';

/**
 * Cancel recording (Lea, 6 Nov), recorded inside a document: My notes keeps every word, and
 * only what pointed at the discarded audio changes (the notes are saved first as the version "Before
 * discarding the recording", services/discard-recording):
 *  - a line's leading time chip at or after `fromMs` is taken off (with the space after it);
 *  - a linked mark chip made at or after `fromMs` becomes its words in the text ("Exam 9/10",
 *    "· its note" after it): her judgement stays, and its `marks` row follows the save (marks.service).
 * Earlier chips (an earlier recording's) stay. `unstampDoc` changes saved JSON (the notes not open
 * here); `unstampTransaction` the open editor (both editors: format/index's `unstamp`).
 */

type JSONNode = { type?: string; attrs?: Record<string, unknown>; content?: JSONNode[]; text?: string; marks?: unknown[] };

const linkedAfter = (attrs: Record<string, unknown> | undefined, fromMs: number) => {
  const a = attrs ?? {};
  return typeof a.markId === 'string' && !!a.markId && typeof a.ms === 'number' && Number.isFinite(a.ms) && a.ms >= fromMs;
};

/** A mark chip's words: "Exam 9/10", or "Exam 9/10 · its note". */
export function markWords(attrs: Record<string, unknown>): string {
  const note = cleanNote(attrs.note);
  return note ? `${markChipLabel(attrs)} · ${note}` : markChipLabel(attrs);
}

const TEXTBLOCKS = new Set(['paragraph', 'heading']);

function unstampNode(node: JSONNode, fromMs: number): { node: JSONNode; changed: boolean } {
  if (!node.content) return { node, changed: false };
  let changed = false;
  const out: JSONNode[] = [];
  const kids = node.content;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (i === 0 && TEXTBLOCKS.has(node.type ?? '') && child.type === TIMESTAMP_CHIP && chipMs(child.attrs?.ms) >= fromMs) {
      changed = true;
      // The space the stamp was followed by goes with it.
      const next = kids[i + 1];
      if (next?.type === 'text' && next.text?.startsWith(' ')) {
        const rest = next.text.slice(1);
        if (rest) out.push({ ...next, text: rest });
        i += 1;
      }
      continue;
    }
    if (child.type === MARK_CHIP && linkedAfter(child.attrs, fromMs)) {
      changed = true;
      out.push({ type: 'text', text: markWords(child.attrs ?? {}) });
      continue;
    }
    const inner = unstampNode(child, fromMs);
    if (inner.changed) changed = true;
    out.push(inner.node);
  }
  return changed ? { node: { ...node, content: out }, changed } : { node, changed };
}

/** My notes as saved, without this recording's stamps, its mark chips as words; the same object when nothing changes. */
export function unstampDoc(doc: DocJSON, fromMs: number): DocJSON {
  const { node, changed } = unstampNode(doc as JSONNode, fromMs);
  return changed ? (node as DocJSON) : doc;
}

/** The same in an open editor (one step; Undo takes it back). Null when nothing changes. */
export function unstampTransaction(state: EditorState, fromMs: number): Transaction | null {
  const edits: { from: number; to: number; text: string | null }[] = [];
  state.doc.descendants((node: PMNode, pos: number, parent: PMNode | null, index: number) => {
    if (node.type.name === TIMESTAMP_CHIP && index === 0 && parent?.isTextblock && chipMs(node.attrs.ms) >= fromMs) {
      const next = parent.maybeChild(1);
      edits.push({ from: pos, to: pos + node.nodeSize + (next?.isText && next.text?.startsWith(' ') ? 1 : 0), text: null });
      return false;
    }
    if (node.type.name === MARK_CHIP && linkedAfter(node.attrs, fromMs)) {
      edits.push({ from: pos, to: pos + node.nodeSize, text: markWords(node.attrs) });
      return false;
    }
    return true;
  });
  if (!edits.length) return null;
  const tr = state.tr;
  // From the end, so the earlier positions stay right.
  for (const e of edits.sort((a, b) => b.from - a.from)) {
    if (e.text) tr.replaceWith(e.from, e.to, state.schema.text(e.text));
    else tr.delete(e.from, e.to);
  }
  return tr;
}
