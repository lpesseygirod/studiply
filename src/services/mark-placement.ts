/**
 * Where a mark made while recording goes (step 5.5): into the lecture's My
 * notes. When that document is open on this device, through its editor (the
 * document screen registers itself), at the end of the line being written
 * or on a new stamped last line. Otherwise (the laptop's strip is on every
 * screen) a new last line is saved into My notes directly. Either way the
 * `marks` row follows the save (marks.service).
 */

import { withMarkLine, type LinkedMark } from '../editor/schema/markChip';
import { openDocument, saveDocument } from './document.service';

export interface MarkTarget {
  place: (mark: LinkedMark) => void;
}

const targets = new Map<string, MarkTarget>();

/** The document screen showing a lecture's My notes; returns the way to let go. */
export function registerMarkTarget(lectureId: string, target: MarkTarget): () => void {
  targets.set(lectureId, target);
  return () => {
    if (targets.get(lectureId) === target) targets.delete(lectureId);
  };
}

export async function placeMark(lectureId: string, mark: LinkedMark): Promise<void> {
  const target = targets.get(lectureId);
  if (target) {
    target.place(mark);
    return;
  }
  const opened = await openDocument(lectureId, 'notes');
  await saveDocument({ fileId: lectureId, tab: 'notes', base: opened.content, next: withMarkLine(opened.content, mark) });
}
