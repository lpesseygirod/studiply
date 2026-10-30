import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';

import type { Move } from './sheetDisplay';
import type { SheetKey } from './useSheetKeys';

export type { SheetKey } from './useSheetKeys';

const ARROWS: Record<string, Move> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** A key on the grid as a spreadsheet action, or null when it isn't one. */
function sheetKeyOf(e: KeyboardEvent): SheetKey | null {
  const command = e.metaKey || e.ctrlKey;
  if (ARROWS[e.key] && !command) return { type: 'move', move: ARROWS[e.key], extend: e.shiftKey };
  if (e.key === 'Enter') return { type: 'move', move: e.shiftKey ? 'up' : 'down', extend: false };
  if (e.key === 'Tab') return { type: 'move', move: e.shiftKey ? 'left' : 'right', extend: false };
  if (e.key === 'F2') return { type: 'edit' };
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'clear' };
  if (command && e.key.toLowerCase() === 'b') return { type: 'bold' };
  // ⌘Z / ⌘⇧Z (and Ctrl+Y, as Windows has it); ⌘C, ⌘X and ⌘V come as the browser's copy, cut and paste.
  if (command && e.key.toLowerCase() === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
  if (e.ctrlKey && e.key.toLowerCase() === 'y') return { type: 'redo' };
  if (e.key === 'Escape') return { type: 'escape' };
  if (e.key.length === 1 && !command && !e.altKey) return { type: 'type', text: e.key };
  return null;
}

/**
 * Laptop: the keys a spreadsheet answers while its grid has the focus
 * (arrows, Enter, Tab, F2, Delete, ⌘B, ⌘Z / ⌘⇧Z, Esc, typing), and whether Shift is down
 * (Shift-click extends the selection). Keys typed into a cell or the
 * formula bar are the inputs' own.
 */
export function useSheetKeys(container: RefObject<View | null>, onKey: (key: SheetKey) => boolean): void {
  const handler = useRef(onKey);
  handler.current = onKey;

  useEffect(() => {
    const el = container.current as unknown as HTMLElement | null;
    if (!el) return;
    const down = (e: KeyboardEvent) => {
      if (e.target !== el) return;
      const key = sheetKeyOf(e);
      if (key && handler.current(key)) e.preventDefault();
    };
    const shift = (e: KeyboardEvent | MouseEvent) => handler.current({ type: 'shift', down: e.shiftKey });
    el.addEventListener('keydown', down);
    // Before the grid sees the press: Shift-click.
    window.addEventListener('mousedown', shift, true);
    window.addEventListener('keydown', shift, true);
    window.addEventListener('keyup', shift, true);
    return () => {
      el.removeEventListener('keydown', down);
      window.removeEventListener('mousedown', shift, true);
      window.removeEventListener('keydown', shift, true);
      window.removeEventListener('keyup', shift, true);
    };
  }, [container]);
}
