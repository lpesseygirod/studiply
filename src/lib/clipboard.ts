/**
 * clipboard.ts
 * Cut and Copy for library items (Lea): one item at a time until
 * multi-select. Paste moves a cut item (the clipboard then empties) or
 * copies a copied PDF or photo (it stays, to paste again). Kept in memory
 * only: it is this app's clipboard, not the system's.
 */

import { useEffect, useState } from 'react';

import type { ShelfItem } from '../utils/shelf';

export interface Clip {
  mode: 'cut' | 'copy';
  item: ShelfItem;
}

let clip: Clip | null = null;
const listeners = new Set<() => void>();

export function getClip(): Clip | null {
  return clip;
}

export function setClip(next: Clip | null): void {
  clip = next;
  listeners.forEach((l) => l());
}

/** After a move or delete elsewhere: a cut item that no longer exists can't be pasted. */
export function forgetClip(itemId: string): void {
  if (clip?.item.id === itemId) setClip(null);
}

export function useClip(): Clip | null {
  const [value, setValue] = useState(clip);
  useEffect(() => {
    const listener = () => setValue(clip);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}
