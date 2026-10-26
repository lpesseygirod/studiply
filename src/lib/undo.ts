/**
 * undo.ts
 * The last action that offered Undo (a move, a delete, a favourite), so
 * ⌘Z / Ctrl+Z on the web can undo it after its toast has gone, like
 * Finder. One level: a newer action replaces it, and it runs once.
 */

interface Offer {
  id: number;
  message: string;
  run: () => void;
}

let last: Offer | null = null;
let nextId = 1;
const undoneListeners = new Set<(id: number) => void>();

/** Called by every Undo toast. Returns the offer's id. */
export function offerUndo(message: string, run: () => void): number {
  last = { id: nextId++, message, run };
  return last.id;
}

/** The toast's own Undo button used it: ⌘Z must not run it again. */
export function settleUndo(id: number): void {
  if (last?.id === id) last = null;
}

/** ⌘Z: runs the last offer once. Returns its message, or null when there is nothing to undo. */
export function undoLast(): string | null {
  const offer = last;
  if (!offer) return null;
  last = null;
  offer.run();
  undoneListeners.forEach((listener) => listener(offer.id));
  return offer.message;
}

/** A toast hides itself when ⌘Z used its offer. */
export function onUndone(listener: (id: number) => void): () => void {
  undoneListeners.add(listener);
  return () => undoneListeners.delete(listener);
}

export function resetUndoForTests(): void {
  last = null;
  undoneListeners.clear();
}
