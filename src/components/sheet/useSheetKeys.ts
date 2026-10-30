import type { RefObject } from 'react';
import type { View } from 'react-native';

import type { Move } from './sheetDisplay';

/** A key pressed on a spreadsheet's grid (laptop), as SheetTab handles it. */
export type SheetKey =
  | { type: 'move'; move: Move; extend: boolean }
  | { type: 'edit' }
  | { type: 'type'; text: string }
  | { type: 'clear' }
  | { type: 'bold' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'escape' }
  | { type: 'shift'; down: boolean };

/** iPhone: no hardware keys to read (the laptop's is useSheetKeys.web.ts). */
export function useSheetKeys(_container: RefObject<View | null>, _onKey: (key: SheetKey) => boolean): void {}
