import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

import { PAGE_COLORS } from '../../editor/editorCss';
import { Typography } from '../../constants/typography';
import type { DocJSON } from '../../editor/types';
import { cellKey, formulaContext, FUNCTION_HELP, helpParts, Sheet, suggestFunctions } from '../../lib/sheets';
import { cellsOf, inputsOf, MAX_CELL_INPUT, sheetDocOf, type SheetCells } from '../../lib/sheetDoc';
import type { DocumentPort } from '../../hooks/useDocumentSync';
import { FormulaBar } from './FormulaBar';
import { FunctionHints } from './FunctionHints';
import { cellFits } from './measure';
import { FontProbe } from './FontProbe';
import { CELL_INSET, GRID_SIZES, SheetGrid, type GridCell, type PointerInfo, type PointerPhase, type SheetGridHandle } from './SheetGrid';
import { readSystemClipboard, writeSystemClipboard } from './systemClipboard';
import {
  boxOf,
  displayOf,
  explainError,
  moveSelection,
  selectionCells,
  selectionName,
  single,
  type Box,
  type CellAt,
  type Move,
  type Selection,
} from './sheetDisplay';
import { acceptFunction, boxOfRef, fillTarget, fillWrites, pointedRef, splice, union } from './sheetEditing';
import { makeClip, pasteClip, pasteText, type Clip } from './sheetClipboard';
import { SheetHistory, writesOf, type CellState } from './sheetHistory';
import { cellChanges, changeLines, linesLabel, type Lines, type LinesChange } from './sheetStructure';
import { showActionSheet, showAlert } from '../dialogs/dialogs';
import { cellPosition, SHEET_COLS, SHEET_ROWS } from '../../lib/sheetDoc';
import { useSheetKeys, type SheetKey } from './useSheetKeys';

export type SheetHandle = DocumentPort;

/** A second press on the same cell within this long edits it (laptop: a double-click). */
const DOUBLE_MS = 400;
const web = Platform.OS === 'web';
/** The function list's width when the grid has room for it. */
const HINTS_WIDTH = 440;
/** How long after a press inside the sheet a blur of the formula puts the focus back (a touch's late focus change). */
const FOCUS_HOLD_MS = 800;

interface Editing {
  draft: string;
  /** Where it is typed: in the cell (laptop) or the formula bar. */
  where: 'cell' | 'bar';
}

/**
 * A spreadsheet tab (step 4.7e): the formula bar and the grid. It holds
 * the tab's cells (what was typed and bold, src/lib/sheetDoc) and a Sheet
 * from the formula engine (src/lib/sheets) that calculates the values on
 * the device.
 *
 * For the autosave (useDocumentSync) it is the editor: getJSON gives the
 * cells as the tab's content, loadDoc and applyBlocks take them (another
 * device's cells come in through applyBlocks; a cell being typed in keeps
 * its draft until it is committed).
 *
 * Laptop: click a cell, drag or Shift-click a range; type to replace, Enter
 * / Tab / arrows to move, a double-click or F2 to edit what is there, Esc
 * to drop, Delete to empty, ⌘B for bold. The formula bar shows the active
 * cell's input (the formula, not its result) and edits it too.
 *
 * Checkpoint 2a: while a formula is typed, clicking a cell adds its
 * reference at the cursor (or replaces the one just before it) and
 * dragging makes a range; the functions starting with the letters typed
 * are offered, and the help line shows the current argument in bold; the
 * fill handle at the selection's corner copies it down or across
 * (sheetEditing.ts).
 */
export const SheetTab = forwardRef<SheetHandle, {
  compact: boolean;
  /** Above the formula bar: the document's title and meta line. */
  header?: ReactNode;
  /** False: read only (a version's preview); `doc` is what it shows. */
  editable?: boolean;
  doc?: DocJSON | null;
  onReady?: () => void;
  onChange?: () => void;
}>(function SheetTab({ compact, header, editable = true, doc, onReady, onChange }, ref) {
  const sheet = useRef(new Sheet());
  const cells = useRef<SheetCells>(new Map());
  const lastDoc = useRef<DocJSON | null>(null);
  const rowRevs = useRef(new Map<number, number>());
  /** Undo / Redo of what the student did in this tab while it is open (step 4.7e 2b). */
  const history = useRef(new SheetHistory());
  /** How many times the whole sheet was loaded (a version restored, the tab opened). */
  const loads = useRef(0);
  const [tick, setTick] = useState(0);
  const [selection, setSelection] = useState<Selection>(single({ row: 0, col: 0 }));
  const [editing, setEditingState] = useState<Editing | null>(null);
  // Read synchronously by the pointer and key handlers (state lags a render).
  const editingRef = useRef<Editing | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const setEditing = (next: Editing | null) => {
    editingRef.current = next;
    setEditingState(next);
  };
  // Where the cursor is in the formula being typed (the help line, pointing and autocomplete read it).
  const [caret, setCaretState] = useState(0);
  const caretRef = useRef(0);
  const setCaret = (at: number) => {
    caretRef.current = at;
    setCaretState(at);
  };
  /** A cursor position to put in the input once the new draft is in it (after pointing or autocomplete). */
  const pendingCaret = useRef<number | null>(null);
  /** A reference being pointed at: where it starts in the draft, how long it is, and the cell the drag started on. */
  const pointing = useRef<{ anchor: CellAt; from: number; length: number } | null>(null);
  /** A fill being dragged from the selection's corner, and where it would go. */
  const filling = useRef<{ source: Box } | null>(null);
  const [fillBox, setFillBox] = useState<Box | null>(null);
  // Autocomplete: the function chosen with ↑ ↓, and a list closed with Esc (by where its letters start).
  const [hintIndex, setHintIndex] = useState(0);
  const [hintsClosedAt, setHintsClosedAt] = useState<number | null>(null);
  const gridRef = useRef<SheetGridHandle>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  /** The function list's or help line's height when drawn (phone: the edited cell stays above it). */
  const [hintsHeight, setHintsHeight] = useState(0);
  const container = useRef<View>(null);
  const cellInput = useRef<TextInput>(null);
  const barInput = useRef<TextInput>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** Touch rules (the iPhone, and the phone layout in a browser), as the grid's. */
  const usesTouch = compact || !web;
  /** Every row drawn again (the iPhone measured its font: numbers are rounded anew). */
  const redrawAll = () => {
    loads.current += 1;
    setTick((t) => t + 1);
  };

  /** Rows to draw again: those with a recalculated or changed cell. */
  const touch = (keys: Iterable<string>) => {
    for (const key of keys) {
      const row = Number(key.replace(/^[A-Z]+/, '')) - 1;
      rowRevs.current.set(row, (rowRevs.current.get(row) ?? 0) + 1);
    }
    setTick((t) => t + 1);
  };

  const load = (next: DocJSON) => {
    lastDoc.current = next;
    cells.current = cellsOf(next);
    sheet.current = Sheet.fromJSON(inputsOf(cells.current));
    // Every row is drawn again (a row's revision includes the load).
    rowRevs.current.clear();
    loads.current += 1;
    // Another sheet (the tab opened, a version restored): nothing in it to undo.
    history.current.clear();
    setTick((t) => t + 1);
  };

  useImperativeHandle(
    ref,
    () => ({
      getJSON: async () => {
        const next = sheetDocOf(cells.current, lastDoc.current, Date.now());
        lastDoc.current = next;
        return next;
      },
      loadDoc: load,
      // Another device's cells (or the merge of a save): only the cells that differ change.
      applyBlocks: (next: DocJSON) => {
        const incoming = cellsOf(next);
        const changed: Record<string, string> = {};
        const keys = new Set([...cells.current.keys(), ...incoming.keys()]);
        const touched: string[] = [];
        for (const key of keys) {
          const a = cells.current.get(key);
          const b = incoming.get(key);
          if ((a?.input ?? '') !== (b?.input ?? '')) changed[key] = b?.input ?? '';
          if ((a?.input ?? '') !== (b?.input ?? '') || !!a?.bold !== !!b?.bold) touched.push(key);
        }
        cells.current = incoming;
        lastDoc.current = next;
        touch([...touched, ...sheet.current.setMany(changed)]);
      },
    }),
    [],
  );

  // A version's preview shows `doc`; the open tab is loaded by the autosave once ready.
  useEffect(() => {
    if (doc) load(doc);
  }, [doc]);
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // In development, the Chrome checks read the cells (as window.studiplyEditor for text).
  useEffect(() => {
    if (!__DEV__ || !web || !editable) return;
    const w = window as unknown as { studiplySheet?: unknown };
    w.studiplySheet = {
      input: (a: string) => sheet.current.input(a),
      value: (a: string) => {
        const v = sheet.current.value(a);
        return v !== null && typeof v === 'object' ? String(v) : v;
      },
      bold: (a: string) => !!cells.current.get(a)?.bold,
      selection: () => selectionName(selectionRef.current),
    };
    return () => {
      delete w.studiplySheet;
    };
  }, [editable]);

  // A number is rounded to what fits the cell, measured in its font (bold too).
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const valueAt = useCallback((row: number, col: number): GridCell => {
    const key = cellKey(row, col);
    const bold = !!cells.current.get(key)?.bold;
    const g = compactRef.current ? GRID_SIZES.compact : GRID_SIZES.wide;
    return { ...displayOf(sheet.current.value(key), cellFits(g.cellW - CELL_INSET, g.font, bold)), bold };
  }, []);
  const rowRev = useCallback((row: number) => loads.current * 1_000_000 + (rowRevs.current.get(row) ?? 0), []);

  const activeKey = cellKey(selection.anchor.row, selection.anchor.col);

  /**
   * Writes inputs (and bold) into cells, recalculates and saves. One call is
   * one thing the student did, so it is one Undo step (`record` false: the
   * Undo or Redo itself).
   */
  const write = (inputs: Record<string, string>, bold: Record<string, boolean> = {}, record = true) => {
    const before: Record<string, CellState> = {};
    const after: Record<string, CellState> = {};
    const changed: Record<string, string> = {};
    for (const key of new Set([...Object.keys(inputs), ...Object.keys(bold)])) {
      const old = cells.current.get(key);
      const was = { input: old?.input ?? '', bold: !!old?.bold };
      const next = { input: key in inputs ? inputs[key].slice(0, MAX_CELL_INPUT) : was.input, bold: key in bold ? bold[key] : was.bold };
      if (next.input === was.input && next.bold === was.bold) continue;
      before[key] = was;
      after[key] = next;
      if (next.input !== was.input) changed[key] = next.input;
      if (next.input === '' && !next.bold) cells.current.delete(key);
      else cells.current.set(key, next);
    }
    const touched = Object.keys(after);
    if (touched.length === 0) return;
    if (record) history.current.record({ before, after });
    touch([...touched, ...sheet.current.setMany(changed)]);
    onChangeRef.current?.();
  };

  /** Selects the cells a step changed (after Undo / Redo, as Excel shows what came back). */
  const selectKeys = (keys: string[]) => {
    const at = keys.map(cellPosition).filter((p): p is CellAt => !!p);
    if (at.length === 0) return;
    const top = Math.min(...at.map((p) => p.row));
    const left = Math.min(...at.map((p) => p.col));
    setSelection({ anchor: { row: top, col: left }, focus: { row: Math.max(...at.map((p) => p.row)), col: Math.max(...at.map((p) => p.col)) } });
  };

  const undo = () => {
    if (!editable) return;
    if (editingRef.current) commit();
    const step = history.current.undo();
    if (!step) return;
    const w = writesOf(step.before);
    write(w.inputs, w.bold, false);
    selectKeys(Object.keys(step.before));
    focusGrid();
  };
  const redo = () => {
    if (!editable) return;
    const step = history.current.redo();
    if (!step) return;
    const w = writesOf(step.after);
    write(w.inputs, w.bold, false);
    selectKeys(Object.keys(step.after));
    focusGrid();
  };

  /** Whole rows (or columns) from one line to another, selected. */
  const selectLines = (lines: Lines, from: number, to: number) =>
    setSelection(
      lines === 'rows'
        ? { anchor: { row: from, col: 0 }, focus: { row: to, col: SHEET_COLS - 1 } }
        : { anchor: { row: 0, col: from }, focus: { row: SHEET_ROWS - 1, col: to } },
    );
  const wholeLines = (s: Selection): Lines | null => {
    const b = boxOf(s);
    if (b.left === 0 && b.right === SHEET_COLS - 1) return 'rows';
    if (b.top === 0 && b.bottom === SHEET_ROWS - 1) return 'cols';
    return null;
  };

  /** Inserts or deletes rows or columns: the cells after them move, and every formula's references with them (one Undo step). */
  const changeLinesNow = (change: LinesChange) => {
    if (!editable) return;
    if (editingRef.current) commit();
    const next = changeLines(cells.current, change);
    if (!next) {
      showAlert(
        change.lines === 'rows' ? 'The last row isn’t empty' : 'Column Z isn’t empty',
        `The sheet ends at ${change.lines === 'rows' ? `row ${SHEET_ROWS}` : 'column Z'}. Empty or delete what is there before inserting.`,
      );
      return;
    }
    const { inputs, bold } = cellChanges(cells.current, next);
    write(inputs, bold);
    const lastLine = change.lines === 'rows' ? SHEET_ROWS - 1 : SHEET_COLS - 1;
    if (change.kind === 'insert') selectLines(change.lines, change.at, change.at + change.count - 1);
    else selectLines(change.lines, Math.min(change.at, lastLine), Math.min(change.at, lastLine));
    focusGrid();
  };

  // Right-click on a row number or column letter: Insert above / below (left / right), Delete.
  const onLinesMenu = (lines: Lines, line: number, anchor: { x: number; y: number } | undefined) => {
    if (!editable) return;
    const s = selectionRef.current;
    const b = boxOf(s);
    const [from, to] = lines === 'rows' ? [b.top, b.bottom] : [b.left, b.right];
    // The lines selected, when the clicked one is among them; else just that one (selected).
    const among = wholeLines(s) === lines && line >= from && line <= to;
    const start = among ? from : line;
    const count = among ? to - from + 1 : 1;
    if (!among) selectLines(lines, line, line);
    showActionSheet(
      undefined,
      [
        { text: linesLabel(lines === 'rows' ? 'above' : 'left', lines, count), onPress: () => changeLinesNow({ kind: 'insert', lines, at: start, count }) },
        { text: linesLabel(lines === 'rows' ? 'below' : 'right', lines, count), onPress: () => changeLinesNow({ kind: 'insert', lines, at: start + count, count }) },
        { text: linesLabel('delete', lines, count), style: 'destructive', onPress: () => changeLinesNow({ kind: 'delete', lines, at: start, count }) },
      ],
      { anchor },
    );
  };

  // Copy, cut and paste (laptop: the browser's own events, while the grid has the focus).
  const clip = useRef<Clip | null>(null);
  const [copied, setCopied] = useState<Box | null>(null);
  const pasteNow = (text: string) => {
    if (!editable || !text) return;
    const at = selectionRef.current.anchor;
    const mine = clip.current && clip.current.text === text ? clip.current : null;
    if (mine) {
      const { inputs, bold, box } = pasteClip(mine, at);
      write(inputs, bold);
      setSelection({ anchor: { row: box.top, col: box.left }, focus: { row: box.bottom, col: box.right } });
      // A cut is pasted once; a copy can be pasted again.
      if (mine.cut) {
        clip.current = null;
        setCopied(null);
      }
    } else {
      const { inputs, box } = pasteText(text, at);
      write(inputs);
      setSelection({ anchor: { row: box.top, col: box.left }, focus: { row: box.bottom, col: box.right } });
    }
  };
  useEffect(() => {
    const el = container.current as unknown as HTMLElement | null;
    if (!web || !el || !editable) return;
    // With no text selected, the browser sends these to the page: they are the grid's when it has the focus.
    const ours = () => document.activeElement === el && !editingRef.current;
    const copy = (cut: boolean) => (e: ClipboardEvent) => {
      if (!ours()) return;
      const made = makeClip(boxOf(selectionRef.current), (a) => cells.current.get(a), (a) => sheet.current.value(a), cut);
      e.clipboardData?.setData('text/plain', made.text);
      e.preventDefault();
      clip.current = made;
      setCopied(made.source);
    };
    const onCopy = copy(false);
    const onCut = copy(true);
    const onPaste = (e: ClipboardEvent) => {
      if (!ours()) return;
      e.preventDefault();
      pasteNow(e.clipboardData?.getData('text/plain') ?? '');
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
    // pasteNow reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const focusGrid = () => {
    if (web) (container.current as unknown as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
  };

  const startEditing = (draft: string, where: Editing['where']) => {
    if (!editable) return;
    setEditing({ draft, where: compact ? 'bar' : where });
    setCaret(draft.length);
    setHintsClosedAt(null);
    // Typing takes the copy marks away, as in Excel (the copy can still be pasted).
    setCopied(null);
  };

  /** A new draft from pointing or autocomplete, with the cursor put where it belongs. */
  const setDraft = (next: { draft: string; caret: number }) => {
    const e = editingRef.current;
    if (!e) return;
    setEditing({ ...e, draft: next.draft.slice(0, MAX_CELL_INPUT) });
    pendingCaret.current = next.caret;
    setCaret(next.caret);
  };

  /**
   * Keeps what was typed (Enter, Tab, a click elsewhere) and moves on. On the
   * iPhone the keyboard goes away, unless typing goes on in the next cell
   * (`keepKeyboard`: Return).
   */
  const commit = (move?: Move, keepKeyboard = false) => {
    const e = editingRef.current;
    if (!e) return;
    setEditing(null);
    write({ [cellKey(selectionRef.current.anchor.row, selectionRef.current.anchor.col)]: e.draft });
    if (move) setSelection((s) => moveSelection(s, move));
    focusGrid();
    if (!web && !keepKeyboard) barInput.current?.blur();
  };

  const cancel = () => {
    setEditing(null);
    focusGrid();
    if (!web) barInput.current?.blur();
  };

  /** iPhone: Return keeps what was typed and goes on typing in the cell below, the keyboard up (a column of numbers). */
  const commitAndContinue = () => {
    const next = moveSelection(selectionRef.current, 'down').anchor;
    commit('down', true);
    startEditing(sheet.current.input(cellKey(next.row, next.col)), 'bar');
  };

  /**
   * A press inside the sheet that must not end the formula being typed (a
   * cell pointed at, a handle, a function in the list): a blur that comes
   * with it puts the focus back instead (on the web a touch moves the focus).
   */
  const focusHold = useRef(0);
  const holdFocus = () => {
    focusHold.current = Date.now();
  };

  const toggleBold = () => {
    if (!editable) return;
    // Whole rows or columns: the cells in them that have something (not a thousand empty bold cells).
    const all = selectionCells(selectionRef.current);
    const keys = wholeLines(selectionRef.current) ? all.filter((k) => cells.current.get(k)?.input) : all;
    if (keys.length === 0) return;
    const allBold = keys.every((k) => cells.current.get(k)?.bold);
    write({}, Object.fromEntries(keys.map((k) => [k, !allBold])));
  };

  const clear = () => {
    if (!editable) return;
    write(Object.fromEntries(selectionCells(selectionRef.current).filter((k) => cells.current.has(k)).map((k) => [k, ''])));
  };

  // Presses on the grid.
  const lastDown = useRef<{ key: string; at: number } | null>(null);
  const shift = useRef(false);
  const dragging = useRef(false);
  const headerFrom = useRef<number | null>(null);
  const onPointer = (cell: CellAt, phase: PointerPhase, info: PointerInfo): boolean | void => {
    // A row number or column letter: the whole line; a drag along them, several (Shift: from the selection's).
    if (info.header) {
      const line = info.header === 'rows' ? cell.row : cell.col;
      if (phase === 'down') {
        if (editingRef.current) commit();
        const a = selectionRef.current.anchor;
        headerFrom.current = shift.current && wholeLines(selectionRef.current) === info.header ? (info.header === 'rows' ? a.row : a.col) : line;
        selectLines(info.header, headerFrom.current, line);
        focusGrid();
      } else if (phase === 'move' && headerFrom.current !== null) selectLines(info.header, headerFrom.current, line);
      else headerFrom.current = null;
      return;
    }
    // The fill handle: drag the selection's corner, release to copy.
    if (info.fill && editable) {
      if (phase === 'down') {
        if (editingRef.current) commit();
        filling.current = { source: boxOf(selectionRef.current) };
        setFillBox(null);
      } else if (filling.current) {
        const { source } = filling.current;
        const target = fillTarget(source, cell);
        if (phase === 'move') setFillBox(target);
        else {
          filling.current = null;
          setFillBox(null);
          if (target) {
            const { inputs, bold } = fillWrites(source, target, (a) => sheet.current.input(a), (a) => !!cells.current.get(a)?.bold);
            write(inputs, bold);
            const all = union(source, target);
            setSelection({ anchor: { row: source.top, col: source.left }, focus: { row: all.bottom, col: all.right } });
          }
          focusGrid();
        }
      }
      // A finger on the handle: the grid doesn't scroll (and on the web the touch keeps its focus).
      return phase === 'down' ? true : undefined;
    }

    const e = editingRef.current;
    // Touch: the reference handle (the dot on the reference just added) drags it into a range.
    if (info.refHandle) {
      if (phase === 'down' && e) {
        const ctx = formulaContext(e.draft, caretRef.current);
        const range = ctx?.ref ? boxOfRef(e.draft.slice(ctx.ref.start, ctx.ref.end).replace(/\$/g, '')) : null;
        if (ctx?.ref && range) pointing.current = { anchor: { row: range.top, col: range.left }, from: ctx.ref.start, length: ctx.ref.end - ctx.ref.start };
        holdFocus();
        return true;
      }
    }

    // Pointing while a formula is typed: the cell's reference goes into it, and the input keeps the focus.
    // The laptop puts it in on the press (a drag then makes a range); touch on the tap (a drag scrolls).
    const pointable = (at: CellAt) => {
      if (!e || !e.draft.startsWith('=')) return null;
      const s = selectionRef.current;
      const own = e.where === 'cell' && s.anchor.row === at.row && s.anchor.col === at.col;
      const ctx = own ? null : formulaContext(e.draft, caretRef.current);
      return ctx?.canInsertRef ? ctx : null;
    };
    /** The cell's reference at the cursor (or in place of the one just before it); where it went. */
    const putRef = (at: CellAt, ctx: NonNullable<ReturnType<typeof pointable>>) => {
      const from = ctx.ref ? ctx.ref.start : caretRef.current;
      const to = ctx.ref ? ctx.ref.end : caretRef.current;
      const text = pointedRef(at, at);
      setDraft(splice(e!.draft, from, to, text));
      holdFocus();
      return { from, length: text.length };
    };
    if (phase === 'down' && !pointing.current) {
      const ctx = pointable(cell);
      if (ctx) {
        if (usesTouch) holdFocus();
        else pointing.current = { anchor: cell, ...putRef(cell, ctx) };
        return true;
      }
    }
    if (pointing.current) {
      const p = pointing.current;
      if (phase === 'move' && e) {
        const text = pointedRef(p.anchor, cell);
        if (text.length !== p.length || e.draft.slice(p.from, p.from + p.length) !== text) {
          setDraft(splice(e.draft, p.from, p.from + p.length, text));
          pointing.current = { ...p, length: text.length };
        }
      } else if (phase === 'up') pointing.current = null;
      return;
    }

    // Touch: only a tap counts (a drag scrolled). It puts a reference into a formula being typed,
    // selects a cell, or edits the selected one (in the bar).
    if (usesTouch) {
      if (phase !== 'up') return;
      const ctx = pointable(cell);
      if (ctx) {
        putRef(cell, ctx);
        return;
      }
      const s = selectionRef.current;
      const same = s.anchor.row === cell.row && s.anchor.col === cell.col && s.focus.row === cell.row && s.focus.col === cell.col;
      if (editingRef.current) commit();
      if (same && editable) {
        // The bar takes the focus; the touch's own late focus change mustn't end the typing at once (web).
        holdFocus();
        startEditing(sheet.current.input(cellKey(cell.row, cell.col)), 'bar');
      } else setSelection(single(cell));
      return;
    }

    if (phase === 'down') {
      const s = selectionRef.current;
      // A press in the cell being typed in is the input's (moving the caret).
      if (editingRef.current?.where === 'cell' && s.anchor.row === cell.row && s.anchor.col === cell.col) return;
      if (editingRef.current) commit();
      const key = cellKey(cell.row, cell.col);
      const now = Date.now();
      const again = lastDown.current?.key === key && now - lastDown.current.at < DOUBLE_MS;
      lastDown.current = { key, at: now };
      dragging.current = true;
      setSelection((s) => (shift.current ? { anchor: s.anchor, focus: cell } : single(cell)));
      focusGrid();
      if (again) startEditing(sheet.current.input(key), 'cell');
    } else if (phase === 'move') {
      if (dragging.current) setSelection((s) => (s.focus.row === cell.row && s.focus.col === cell.col ? s : { anchor: s.anchor, focus: cell }));
    } else {
      dragging.current = false;
    }
  };

  // Touch: a long-press on a cell: Copy, Cut, Paste (selected first when outside the selection).
  const onCellMenu = (cell: CellAt) => {
    if (!editable) return;
    if (editingRef.current) commit();
    const b = boxOf(selectionRef.current);
    if (cell.row < b.top || cell.row > b.bottom || cell.col < b.left || cell.col > b.right) setSelection(single(cell));
    const copyNow = (cut: boolean) => {
      const made = makeClip(boxOf(selectionRef.current), (a) => cells.current.get(a), (a) => sheet.current.value(a), cut);
      clip.current = made;
      setCopied(made.source);
      void writeSystemClipboard(made.text);
    };
    // After the selection above has been drawn.
    setTimeout(
      () =>
        showActionSheet(undefined, [
          { text: 'Copy', onPress: () => copyNow(false) },
          { text: 'Cut', onPress: () => copyNow(true) },
          {
            text: 'Paste',
            onPress: async () => {
              // The system's clipboard (another app's text, or this sheet's copy); this sheet's own when it can't be read.
              const text = (await readSystemClipboard()) || clip.current?.text || '';
              pasteNow(text);
            },
          },
        ]),
      0,
    );
  };

  // Keys on the laptop (the grid has the focus; typing in a cell is the input's).
  const onKey = (key: SheetKey): boolean => {
    if (key.type === 'shift') {
      shift.current = key.down;
      return false;
    }
    if (editingRef.current || (!editable && key.type !== 'move')) return false;
    switch (key.type) {
      case 'undo':
        undo();
        return true;
      case 'redo':
        redo();
        return true;
      case 'escape':
        // Esc takes the copy marks away (the copy can still be pasted, as in Excel).
        setCopied(null);
        return true;
      case 'move':
        setSelection((s) => moveSelection(s, key.move, key.extend));
        return true;
      case 'edit':
        startEditing(sheet.current.input(cellKey(selectionRef.current.anchor.row, selectionRef.current.anchor.col)), 'cell');
        return true;
      case 'type':
        startEditing(key.text, 'cell');
        return true;
      case 'clear':
        clear();
        return true;
      case 'bold':
        toggleBold();
        return true;
    }
    return false;
  };
  useSheetKeys(container, onKey);

  // What the formula being typed is at the cursor: the function and argument (help line), the letters for autocomplete.
  const context = editing ? formulaContext(editing.draft, caret) : null;
  const partial = context?.partial && hintsClosedAt !== context.partial.start ? context.partial : null;
  const suggestions = partial ? suggestFunctions(partial.text) : [];
  const chosen = Math.min(hintIndex, Math.max(0, suggestions.length - 1));
  useEffect(() => setHintIndex(0), [partial?.text]);
  const pickFunction = (name: string) => {
    const e = editingRef.current;
    if (!e || !partial) return;
    setDraft(acceptFunction(e.draft, partial.start, caretRef.current, name));
  };

  // Typing in the cell or the bar.
  const onInputKey = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const ev = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean };
    const stop = () => (e as unknown as { preventDefault?: () => void }).preventDefault?.();
    // The function list, while it is open: ↑ ↓ choose, Tab or Enter take one, Esc closes it.
    if (suggestions.length > 0) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        stop();
        const step = ev.key === 'ArrowDown' ? 1 : -1;
        setHintIndex((chosen + step + suggestions.length) % suggestions.length);
        return;
      }
      if (ev.key === 'Tab' || ev.key === 'Enter') {
        stop();
        pickFunction(suggestions[chosen].name);
        return;
      }
      if (ev.key === 'Escape' && partial) {
        stop();
        setHintsClosedAt(partial.start);
        return;
      }
    }
    if (ev.key === 'Enter') {
      stop();
      commit(ev.shiftKey ? 'up' : 'down');
    } else if (ev.key === 'Tab') {
      stop();
      commit(ev.shiftKey ? 'left' : 'right');
    } else if (ev.key === 'Escape') {
      stop();
      cancel();
    } else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'b') {
      stop();
      toggleBold();
    }
  };
  const onDraft = (draft: string) => {
    if (!editingRef.current) return;
    setEditing({ ...editingRef.current, draft });
    // The laptop's input already has the new text and its cursor.
    const active = web ? (document.activeElement as HTMLInputElement | null) : null;
    setCaret(active && typeof active.selectionStart === 'number' ? active.selectionStart : draft.length);
  };
  const onSelection = (e: NativeSyntheticEvent<{ selection: { start: number; end: number } }>) => setCaret(e.nativeEvent.selection.end);
  // Laptop: the cursor moved by a click or an arrow inside the input.
  useEffect(() => {
    if (!web || !editing) return;
    const moved = () => {
      const active = document.activeElement as HTMLInputElement | null;
      const ours = [cellInput.current, barInput.current] as unknown as (Element | null)[];
      if (active && ours.includes(active) && typeof active.selectionStart === 'number') setCaret(active.selectionStart);
    };
    document.addEventListener('selectionchange', moved);
    return () => document.removeEventListener('selectionchange', moved);
  }, [editing === null]); // eslint-disable-line react-hooks/exhaustive-deps
  // After pointing or autocomplete, the cursor goes after what was put in (the iPhone: the input's selection, once).
  const [nativeCaret, setNativeCaret] = useState<{ start: number; end: number } | undefined>(undefined);
  useEffect(() => {
    const at = pendingCaret.current;
    if (at === null || !editing) return;
    pendingCaret.current = null;
    if (!web) {
      setNativeCaret({ start: at, end: at });
      return;
    }
    const input = (editing.where === 'cell' ? cellInput.current : barInput.current) as unknown as HTMLInputElement | null;
    input?.setSelectionRange(at, at);
  }, [editing]);
  const onBarSelection = (e: NativeSyntheticEvent<{ selection: { start: number; end: number } }>) => {
    onSelection(e);
    // The student moved the cursor: the input is theirs again.
    if (nativeCaret && (e.nativeEvent.selection.start !== nativeCaret.start || e.nativeEvent.selection.end !== nativeCaret.end)) setNativeCaret(undefined);
  };
  // iPhone: editing starts in the bar, the keyboard up.
  useEffect(() => {
    if (web || !editing) return;
    barInput.current?.focus();
    // Only when editing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing === null]);
  // Leaving both inputs (a click outside the sheet) keeps what was typed. A press inside the sheet
  // that belongs to the formula (pointing, a handle, the function list) puts the focus back instead.
  const onInputBlur = () => {
    setTimeout(() => {
      const e = editingRef.current;
      if (!e) return;
      const active = web ? document.activeElement : null;
      const ours = [cellInput.current, barInput.current] as unknown as (Element | null)[];
      if (web && active && ours.includes(active)) return;
      if (Date.now() - focusHold.current < FOCUS_HOLD_MS) {
        (e.where === 'cell' ? cellInput.current : barInput.current)?.focus();
        return;
      }
      commit();
    }, 0);
  };

  // The caret at the end when editing starts.
  useEffect(() => {
    if (!editing || !web) return;
    const input = (editing.where === 'cell' ? cellInput.current : barInput.current) as unknown as HTMLInputElement | null;
    if (!input || document.activeElement === input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    // Only when editing starts or moves between the cell and the bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.where, editing === null]);

  const cellEditor =
    editing && editing.where === 'cell' && !compact ? (
      <TextInput
        ref={cellInput}
        value={editing.draft}
        onChangeText={onDraft}
        onSelectionChange={onSelection}
        onKeyPress={onInputKey}
        onBlur={onInputBlur}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        maxLength={MAX_CELL_INPUT}
        style={styles.cellInput}
        accessibilityLabel={`Edit ${activeKey}`}
      />
    ) : null;

  const value = sheet.current.value(activeKey);
  // Dashed outline: where a fill would go, else the reference just pointed at (before the cursor), else what was copied.
  const mark = fillBox && filling.current
    ? union(filling.current.source, fillBox)
    : editing && context?.ref
      ? boxOfRef(editing.draft.slice(context.ref.start, context.ref.end).replace(/\$/g, ''))
      : !editing
        ? copied
        : null;
  const help = context?.fn && !context.inString ? helpParts(context.fn, context.arg) : null;
  // The hints go under the cell being edited (above it in the lower half of the grid), always inside
  // the grid's visible area: as wide as fits, from the cell's left edge, or ending at its right edge
  // when there's no room to the right. They never widen or scroll the sheet.
  const rect = editing ? gridRef.current?.cellRect(selection.anchor) : undefined;
  const hintsWidth = Math.max(0, Math.min(HINTS_WIDTH, area.width - 8));
  const hintsLeft = !rect
    ? 4
    : Math.min(Math.max(4, rect.x + hintsWidth <= area.width - 4 ? rect.x : rect.x + rect.width - hintsWidth), Math.max(4, area.width - 4 - hintsWidth));
  // On a phone the bar is above the keyboard, and the hints just above the bar, the grid's whole width.
  const hintsAt = compact
    ? { bottom: 4, left: 4, width: Math.max(0, area.width - 8) }
    : !rect
      ? { top: 4, left: hintsLeft, width: hintsWidth }
      : rect.y + rect.height / 2 > area.height / 2
        ? { bottom: Math.max(0, area.height - rect.y + 2), left: hintsLeft, width: hintsWidth }
        : { top: Math.max(0, rect.y + rect.height + 2), left: hintsLeft, width: hintsWidth };
  const bar = (
    <FormulaBar
      ref={barInput}
      name={selectionName(selection)}
      input={editing ? editing.draft : sheet.current.input(activeKey)}
      editing={editing?.where === 'bar'}
      editable={editable}
      bold={!!cells.current.get(activeKey)?.bold}
      error={editing ? null : explainError(value)}
      compact={compact}
      below={compact}
      selection={nativeCaret}
      onFocus={() => {
        if (!editingRef.current) startEditing(sheet.current.input(activeKey), 'bar');
        else if (editingRef.current.where !== 'bar') setEditing({ ...editingRef.current, where: 'bar' });
      }}
      onChangeText={onDraft}
      onSelectionChange={onBarSelection}
      onKeyPress={onInputKey}
      // iPhone: Return goes on to the cell below with the keyboard up; ✓ (Done) ends typing.
      onSubmit={() => (!web && compact ? commitAndContinue() : commit('down'))}
      onDone={() => commit()}
      onBlur={onInputBlur}
      onBold={toggleBold}
      canUndo={history.current.canUndo}
      canRedo={history.current.canRedo}
      onUndo={undo}
      onRedo={redo}
    />
  );
  // Phone: the edited cell stays whole above the hints and the bar (as Numbers does): the grid scrolls it
  // up when the list or the help line opens over it, or the keyboard makes the grid shorter.
  const hintsShown = !!editing && (suggestions.length > 0 || !!help);
  const coveredBelow = compact && hintsShown ? hintsHeight + 8 : 0;
  const editedRow = editing ? selection.anchor.row : -1;
  const editedCol = editing ? selection.anchor.col : -1;
  useEffect(() => {
    if (!compact || editedRow < 0) return;
    gridRef.current?.reveal({ row: editedRow, col: editedCol }, coveredBelow);
  }, [compact, editedRow, editedCol, coveredBelow, area.height]);

  // iPhone: the bar sits on the keyboard (the sheet makes room for it); the title steps aside while
  // typing, as in the text editor (a browser has no keyboard on screen: it stays).
  const Wrap = !web && Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  return (
    <Wrap style={styles.wrap} {...(Wrap === KeyboardAvoidingView ? { behavior: 'padding' as const } : {})}>
      {!(!web && compact && editing) && header}
      {!compact && bar}
      {!web && editable && <FontProbe fontSize={(compact ? GRID_SIZES.compact : GRID_SIZES.wide).font} onMeasured={redrawAll} />}
      <View style={styles.gridArea} onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <View
          ref={container}
          style={styles.grid}
          {...(web ? { tabIndex: 0, accessibilityLabel: 'Spreadsheet', dataSet: { sheet: 'grid' } } : {})}
        >
          <SheetGrid
            ref={gridRef}
            compact={compact}
            tick={tick}
            rowRev={rowRev}
            valueAt={valueAt}
            selection={editable ? selection : null}
            editing={cellEditor ? { row: selection.anchor.row, col: selection.anchor.col, node: cellEditor } : null}
            mark={mark}
            showHandle={editable && !editing}
            // Touch: the reference just added carries a dot that drags it into a range.
            refHandle={usesTouch && editing && context?.ref ? mark : null}
            interactive={editable}
            onPointer={onPointer}
            onLinesMenu={onLinesMenu}
            onCellMenu={onCellMenu}
          />
        </View>
        {editing && (
          <FunctionHints
            suggestions={suggestions}
            index={chosen}
            onPick={pickFunction}
            onPressIn={holdFocus}
            help={help}
            summary={context?.fn ? FUNCTION_HELP[context.fn]?.summary ?? null : null}
            at={hintsAt}
            onHeight={setHintsHeight}
          />
        )}
      </View>
      {compact && bar}
    </Wrap>
  );
});

const C = PAGE_COLORS;

const styles = StyleSheet.create({
  // Nothing inside may widen the card or scroll it sideways (the grid scrolls inside itself).
  wrap: { flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: C.card },
  gridArea: { flex: 1, minWidth: 0, overflow: 'hidden' },
  grid: { flex: 1, outlineStyle: 'none' } as never,
  cellInput: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    fontSize: Typography.size.sm,
    color: C.text.primary,
    backgroundColor: C.card,
    outlineStyle: 'none',
  } as never,
});
