/**
 * sheetHistory.ts
 * Undo and Redo for a spreadsheet tab (step 4.7e, checkpoint 2b): one step
 * per thing the student did (a cell typed, Delete, bold, a fill, a paste,
 * an insert or delete of rows or columns), holding the cells it changed
 * before and after. Undo writes the "before" cells back, Redo the "after"
 * ones, as ordinary changes (saved and merged like any other). Kept while
 * the tab is open, as the text editor's; a new action clears Redo.
 */

export interface CellState {
  input: string;
  bold: boolean;
}

export interface HistoryStep {
  before: Record<string, CellState>;
  after: Record<string, CellState>;
}

/** The most steps kept. */
export const HISTORY_STEPS = 100;

export class SheetHistory {
  private undos: HistoryStep[] = [];
  private redos: HistoryStep[] = [];

  constructor(private readonly limit = HISTORY_STEPS) {}

  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  /** A new action: one step; Redo is gone. A step that changed nothing isn't kept. */
  record(step: HistoryStep): void {
    if (Object.keys(step.before).length === 0) return;
    this.undos.push(step);
    if (this.undos.length > this.limit) this.undos.shift();
    this.redos = [];
  }

  /** The step to undo (write its `before`), or null. */
  undo(): HistoryStep | null {
    const step = this.undos.pop() ?? null;
    if (step) this.redos.push(step);
    return step;
  }

  /** The step to redo (write its `after`), or null. */
  redo(): HistoryStep | null {
    const step = this.redos.pop() ?? null;
    if (step) this.undos.push(step);
    return step;
  }

  /** Another sheet was loaded (the tab opened, a version restored): nothing to undo in it. */
  clear(): void {
    this.undos = [];
    this.redos = [];
  }
}

/** The cells of a step side as inputs and bold, for writing them back. */
export function writesOf(cells: Record<string, CellState>): { inputs: Record<string, string>; bold: Record<string, boolean> } {
  const inputs: Record<string, string> = {};
  const bold: Record<string, boolean> = {};
  for (const [key, cell] of Object.entries(cells)) {
    inputs[key] = cell.input;
    bold[key] = cell.bold;
  }
  return { inputs, bold };
}
