import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { PAGE_COLORS } from '../../editor/editorCss';
import { Typography } from '../../constants/typography';
import { cellKey, columnName, type Lines } from '../../lib/sheets';
import { SHEET_COLS, SHEET_ROWS } from '../../lib/sheetDoc';
import { boxOf, type Align, type Box, type CellAt, type Selection } from './sheetDisplay';

/** Cell sizes: the laptop's, and a finger's on the iPhone. Every column has the same width (no column widths in 4.7e). */
export const GRID_SIZES = {
  wide: { cellW: 100, cellH: 26, headW: 46, headH: 24, font: Typography.size.sm },
  compact: { cellW: 88, cellH: 36, headW: 38, headH: 26, font: Typography.size.base },
} as const;

/** A cell's width minus what text can't use: its padding (5 px each side), its border and 1 px to spare. */
export const CELL_INSET = 12;

export interface GridCell {
  text: string;
  align: Align;
  error: boolean;
  bold: boolean;
}

export type PointerPhase = 'down' | 'move' | 'up';
export interface PointerInfo {
  fill: boolean;
  header?: Lines;
  refHandle?: boolean;
}

const ROWS = Array.from({ length: SHEET_ROWS }, (_, i) => i);
const COLS = Array.from({ length: SHEET_COLS }, (_, i) => i);
const web = Platform.OS === 'web';

export interface SheetGridHandle {
  /** Where a cell is drawn now, in the grid's own box (scrolling included). */
  cellRect: (cell: CellAt) => { x: number; y: number; width: number; height: number };
  /** Scrolls so the cell is whole on screen, clear of `bottomInset` px at the bottom (what lies over the grid there). */
  reveal: (cell: CellAt, bottomInset: number) => void;
}

interface SheetGridProps {
  compact: boolean;
  /** Changes whenever anything shown changed. */
  tick: number;
  /** A row's revision: changes when one of its cells changed. */
  rowRev: (row: number) => number;
  valueAt: (row: number, col: number) => GridCell;
  selection: Selection | null;
  /** The cell being edited in place, and its input. */
  editing: { row: number; col: number; node: ReactNode } | null;
  mark?: Box | null;
  /** The fill handle at the selection's corner. */
  showHandle?: boolean;
  interactive?: boolean;
  /**
   * `header`: the press started on the row numbers or column letters (whole
   * lines); `refHandle`: on the reference handle (touch). Touch sends "down"
   * then "up" for a tap ("move" only while a handle is dragged).
   */
  onPointer?: (cell: CellAt, phase: PointerPhase, info: PointerInfo) => boolean | void;
  /** A right-click (laptop) or a long-press (touch) on a row number or column letter: its line, and where the menu goes. */
  onLinesMenu?: (lines: Lines, line: number, anchor: { x: number; y: number } | undefined) => void;
  /** Touch: a long-press on a cell (its Copy, Cut, Paste). */
  onCellMenu?: (cell: CellAt) => void;
  /** Touch, while a formula is typed: the reference just added, with a handle at its corner that drags it into a range. */
  refHandle?: Box | null;
}

/** How long a finger stays down for a long-press. */
const LONG_PRESS_MS = 450;

/**
 * A spreadsheet tab's grid (step 4.7e), the same component on the laptop
 * and the iPhone: column letters A–Z across the top and row numbers 1–1,000
 * down the left, both staying in view while the cells scroll. Rows are
 * virtualised (only those on screen are drawn), and a row is drawn again
 * only when one of its cells, or the selection on it, changed.
 *
 * The grid scrolls inside itself both ways; the page never scrolls sideways.
 * Presses are reported by cell (the grid works out which from where the
 * pointer is): on the laptop down, move (a drag) and up; on a touch screen
 * a tap (up), while a drag scrolls. A press on the selection's corner (the
 * fill handle, step 4.7e 2a) says so; `onPointer` answering true on "down"
 * keeps the focus where it is (a formula being typed, while pointing).
 * `mark` outlines cells with a dashed line: the reference being pointed at,
 * or where a fill will go.
 */
export const SheetGrid = forwardRef<SheetGridHandle, SheetGridProps>(function SheetGrid(
  { compact, tick, rowRev, valueAt, selection, editing, mark = null, showHandle = false, interactive = true, onPointer, onLinesMenu, onCellMenu, refHandle = null },
  ref,
) {
  const g = compact ? GRID_SIZES.compact : GRID_SIZES.wide;
  /** Touch rules (the iPhone, and the phone layout in a browser): a drag scrolls, a tap selects, a long-press opens a menu. */
  const touch = !web || compact;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const viewport = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const scrollXValue = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(0);
  const scrollY = useRef(0);
  const horizontal = useRef<ScrollViewLike>(null);
  const list = useRef<FlatList<number>>(null);
  const totalW = g.headW + SHEET_COLS * g.cellW;
  const listH = Math.max(0, size.h - g.headH);

  /**
   * How far the cells are scrolled now. On the laptop it is read from the
   * page itself: the scroll events that keep `scrollX` / `scrollY` arrive a
   * moment after the scroll, and a click straight after scrolling (or a
   * cell brought into view) must not land on the cell that was there before.
   */
  const offsets = useCallback((): { x: number; y: number } => {
    if (web) {
      const h = (horizontal.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      const v = (list.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      return { x: h ? h.scrollLeft : scrollX.current, y: v ? v.scrollTop : scrollY.current };
    }
    return { x: scrollX.current, y: scrollY.current };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      cellRect: (cell) => {
        const o = offsets();
        return { x: g.headW + cell.col * g.cellW - o.x, y: g.headH + cell.row * g.cellH - o.y, width: g.cellW, height: g.cellH };
      },
      reveal: (cell, bottomInset) => {
        const o = offsets();
        const room = Math.max(g.cellH, listH - bottomInset);
        const top = cell.row * g.cellH;
        if (top + g.cellH > o.y + room) list.current?.scrollToOffset({ offset: top + g.cellH - room, animated: false });
        else if (top < o.y) list.current?.scrollToOffset({ offset: top, animated: false });
        const left = cell.col * g.cellW;
        const visibleW = size.w - g.headW;
        if (left < o.x) horizontal.current?.scrollTo({ x: left, animated: false });
        else if (left + g.cellW > o.x + visibleW) horizontal.current?.scrollTo({ x: left + g.cellW - visibleW, animated: false });
      },
    }),
    [g, offsets, listH, size.w],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
    if (!web) viewport.current?.measureInWindow((x, y) => (origin.current = { x, y }));
  };

  /**
   * What is under a point on the screen: a cell, a row number (`header:
   * 'rows'`, its row) or a column letter (`'cols'`, its column); null on the
   * corner or past the grid. Over the numbers or letters the cell is still
   * worked out, so a drag that starts on a header can go on along it.
   */
  const pointAt = useCallback(
    (pageX: number, pageY: number): { cell: CellAt; header?: Lines } | null => {
      if (web) {
        const rect = (viewport.current as unknown as HTMLElement | null)?.getBoundingClientRect();
        if (rect) origin.current = { x: rect.left, y: rect.top };
      }
      const vx = pageX - origin.current.x;
      const vy = pageY - origin.current.y;
      if (vx < g.headW && vy < g.headH) return null;
      const o = offsets();
      const col = Math.min(SHEET_COLS - 1, Math.max(0, Math.floor((vx - g.headW + o.x) / g.cellW)));
      const row = Math.min(SHEET_ROWS - 1, Math.max(0, Math.floor((vy - g.headH + o.y) / g.cellH)));
      if (vx < g.headW) return { cell: { row, col: 0 }, header: 'rows' };
      if (vy < g.headH) return { cell: { row: 0, col }, header: 'cols' };
      if (vx - g.headW + o.x >= SHEET_COLS * g.cellW || vy - g.headH + o.y >= SHEET_ROWS * g.cellH) return null;
      return { cell: { row, col } };
    },
    [g, offsets],
  );
  const cellAt = (pageX: number, pageY: number): CellAt | null => {
    const p = pointAt(pageX, pageY);
    return p && !p.header ? p.cell : null;
  };

  // Laptop: right-click on a row number or a column letter opens its menu (Insert, Delete).
  useEffect(() => {
    const el = viewport.current as unknown as HTMLElement | null;
    if (!web || !el || !interactive || !onLinesMenu) return;
    const open = (e: MouseEvent) => {
      const p = pointAt(e.clientX, e.clientY);
      if (!p?.header) return;
      e.preventDefault();
      // The phone layout opens it with a long-press (the browser's own long-touch menu is kept away).
      if (touch) return;
      onLinesMenu(p.header, p.header === 'rows' ? p.cell.row : p.cell.col, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('contextmenu', open);
    return () => el.removeEventListener('contextmenu', open);
  }, [interactive, onLinesMenu, pointAt, touch]);

  const box = selection ? boxOf(selection) : null;

  /** Whether a point is on a box's bottom-right corner (a handle), within a finger's reach on touch. */
  const onCorner = (target: Box | null, pageX: number, pageY: number): boolean => {
    if (!target) return false;
    const o = offsets();
    const x = g.headW + (target.right + 1) * g.cellW - o.x;
    const y = g.headH + (target.bottom + 1) * g.cellH - o.y;
    const reach = touch ? 16 : 6;
    return Math.abs(pageX - origin.current.x - x) <= reach && Math.abs(pageY - origin.current.y - y) <= reach;
  };

  // Pressing and dragging over the cells (or along the row numbers and column letters: whole lines).
  // Laptop (a mouse): down, a drag selects, up. Touch: a tap selects, a long-press opens a menu, a drag
  // scrolls, except from a handle (the fill handle, or the reference handle while a formula is typed),
  // which drags while the grid stays still.
  const press = useRef<{
    start: { x: number; y: number };
    cell: CellAt | null;
    fill: boolean;
    refHandle: boolean;
    header?: Lines;
    moved: boolean;
    long: boolean;
  } | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A long-press opened a menu during this touch. */
  const longOpened = useRef(false);
  const [locked, setLocked] = useState(false);
  // Touch in a browser: while a handle is dragged, nothing may scroll (the browser would, and a scroll
  // around the grid ends the press); and after a long-press opened its menu, the finger's lift must not
  // become a click on that menu (it would close it at once). React Native's own touch listeners are
  // passive, so these two are added here.
  useEffect(() => {
    const el = viewport.current as unknown as HTMLElement | null;
    if (!web || !el) return;
    const move = (e: TouchEvent) => {
      const p = press.current;
      if (p && (p.fill || p.refHandle)) e.preventDefault();
    };
    const end = (e: TouchEvent) => {
      if (!longOpened.current) return;
      longOpened.current = false;
      e.preventDefault();
    };
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    return () => {
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
    };
  }, []);
  const endPress = () => {
    if (longTimer.current) clearTimeout(longTimer.current);
    longTimer.current = null;
    press.current = null;
    setLocked(false);
  };
  const responder = interactive
    ? {
        onStartShouldSetResponder: () => true,
        // Laptop: a drag selects; nothing else may take it. Touch: a drag scrolls (unless a handle is held).
        onResponderTerminationRequest: () => !(press.current && (!touch || press.current.fill || press.current.refHandle)),
        onResponderGrant: (e: GestureResponderEvent) => {
          const { pageX, pageY } = e.nativeEvent;
          if (!web) viewport.current?.measureInWindow((x, y) => (origin.current = { x, y }));
          const point = pointAt(pageX, pageY);
          const refHandleHit = !point?.header && onCorner(refHandle, pageX, pageY);
          const fill = !refHandleHit && !point?.header && showHandle && onCorner(box, pageX, pageY);
          const start = refHandleHit && refHandle ? { row: refHandle.bottom, col: refHandle.right } : fill && box ? { row: box.bottom, col: box.right } : point?.cell ?? null;
          const header = fill || refHandleHit ? undefined : point?.header;
          press.current = { start: { x: pageX, y: pageY }, cell: start, fill, refHandle: refHandleHit, header, moved: false, long: false };
          longOpened.current = false;
          if (touch && (fill || refHandleHit)) setLocked(true);
          // Touch: a long press opens the menu of a row number or column letter (Insert, Delete), or of a cell (Copy, Cut, Paste).
          if (touch && start && !fill && !refHandleHit) {
            longTimer.current = setTimeout(() => {
              const p = press.current;
              if (!p || p.moved) return;
              p.long = true;
              longOpened.current = true;
              if (header) onLinesMenu?.(header, header === 'rows' ? start.row : start.col, undefined);
              else onCellMenu?.(start);
            }, LONG_PRESS_MS);
          }
          // Pointing at a cell while typing a formula (and a handle on touch): the input keeps the focus.
          if (start && onPointer?.(start, 'down', { fill, header, refHandle: refHandleHit }) === true && web) e.preventDefault();
        },
        onResponderMove: (e: GestureResponderEvent) => {
          const p = press.current;
          if (!p) return;
          if (Math.abs(e.nativeEvent.pageX - p.start.x) + Math.abs(e.nativeEvent.pageY - p.start.y) >= 10) {
            p.moved = true;
            if (longTimer.current) clearTimeout(longTimer.current);
          }
          if (touch && !p.fill && !p.refHandle) return; // the grid scrolls
          const point = pointAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
          const cell = p.header ? point?.cell : point && !point.header ? point.cell : null;
          if (cell) onPointer?.(cell, 'move', { fill: p.fill, header: p.header, refHandle: p.refHandle });
        },
        onResponderRelease: (e: GestureResponderEvent) => {
          const p = press.current;
          endPress();
          if (!p || p.long) return;
          if (!touch || p.fill || p.refHandle) {
            const point = pointAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
            const cell = (p.header ? point?.cell : cellAt(e.nativeEvent.pageX, e.nativeEvent.pageY)) ?? p.cell;
            if (cell) onPointer?.(cell, 'up', { fill: p.fill, header: p.header, refHandle: p.refHandle });
            return;
          }
          // Touch: a tap, not the end of a scroll.
          if (p.cell && !p.moved) onPointer?.(p.cell, 'up', { fill: false, header: p.header });
        },
        onResponderTerminate: endPress,
      }
    : {};

  // The selection's far corner stays in view (arrows, Enter, Tab); not along a whole row or column selected.
  const focus = selection?.focus;
  const wholeRows = !!box && box.left === 0 && box.right === SHEET_COLS - 1;
  const wholeCols = !!box && box.top === 0 && box.bottom === SHEET_ROWS - 1;
  useEffect(() => {
    if (!focus || size.w === 0) return;
    const o = offsets();
    if (!wholeCols) {
      const top = focus.row * g.cellH;
      if (top < o.y) list.current?.scrollToOffset({ offset: top, animated: false });
      else if (top + g.cellH > o.y + listH) list.current?.scrollToOffset({ offset: top + g.cellH - listH, animated: false });
    }
    if (!wholeRows) {
      const left = focus.col * g.cellW;
      const visibleW = size.w - g.headW;
      if (left < o.x) horizontal.current?.scrollTo({ x: left, animated: false });
      else if (left + g.cellW > o.x + visibleW) horizontal.current?.scrollTo({ x: left + g.cellW - visibleW, animated: false });
    }
  }, [focus, size.w, listH, g, wholeRows, wholeCols, offsets]);

  const renderRow = ({ item: row }: { item: number }) => {
    const inBox = !!box && row >= box.top && row <= box.bottom;
    const inMark = !!mark && row >= mark.top && row <= mark.bottom;
    return (
      <Row
        row={row}
        rev={rowRev(row)}
        compact={compact}
        selLeft={inBox ? box!.left : -1}
        selRight={inBox ? box!.right : -1}
        markLeft={inMark ? mark!.left : -1}
        markRight={inMark ? mark!.right : -1}
        markTop={inMark && row === mark!.top}
        markBottom={inMark && row === mark!.bottom}
        handleCol={showHandle && box && row === box.bottom ? box.right : -1}
        refHandleCol={refHandle && row === refHandle.bottom ? refHandle.right : -1}
        activeCol={selection && selection.anchor.row === row ? selection.anchor.col : -1}
        editCol={editing?.row === row ? editing.col : -1}
        editNode={editing?.row === row ? editing.node : null}
        valueAt={valueAt}
        scrollX={scrollXValue}
      />
    );
  };

  const onScrollX = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollXValue } } }], {
        useNativeDriver: !web,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => (scrollX.current = e.nativeEvent.contentOffset.x),
      }),
    [scrollXValue],
  );

  return (
    <View ref={viewport} style={styles.viewport} onLayout={onLayout} {...responder}>
      <Animated.ScrollView
        ref={horizontal as never}
        horizontal
        bounces={false}
        // Still while a handle is dragged with a finger.
        scrollEnabled={!locked}
        onScroll={onScrollX}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="always"
        style={styles.fill}
      >
        <View style={{ width: totalW, height: size.h }}>
          <View style={[styles.headerRow, { height: g.headH }]}>
            <Animated.View style={[styles.corner, { width: g.headW, height: g.headH, transform: [{ translateX: scrollXValue }] }]} />
            {COLS.map((col) => (
              <View
                key={col}
                {...(web ? { dataSet: { colHead: columnName(col) } } : {})}
                style={[styles.colHead, { width: g.cellW, height: g.headH }, box && col >= box.left && col <= box.right && styles.headOn]}
              >
                <Text style={styles.headText}>{columnName(col)}</Text>
              </View>
            ))}
          </View>
          {listH > 0 && (
            <FlatList
              ref={list}
              data={ROWS}
              keyExtractor={(row) => String(row)}
              renderItem={renderRow}
              extraData={`${tick}:${selection ? `${selection.anchor.row},${selection.anchor.col},${selection.focus.row},${selection.focus.col}` : ''}:${editing ? `${editing.row},${editing.col}` : ''}:${mark ? `${mark.top},${mark.left},${mark.bottom},${mark.right}` : ''}:${showHandle}:${refHandle ? `${refHandle.bottom},${refHandle.right}` : ''}`}
              getItemLayout={(_, index) => ({ length: g.cellH, offset: g.cellH * index, index })}
              initialNumToRender={Math.ceil(listH / g.cellH) + 4}
              maxToRenderPerBatch={20}
              windowSize={3}
              scrollEnabled={!locked}
              onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="always"
              style={{ width: totalW, height: listH }}
            />
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
});

type ScrollViewLike = { scrollTo: (o: { x: number; animated?: boolean }) => void; getScrollableNode?: () => unknown };

const Row = memo(function Row({
  row,
  compact,
  selLeft,
  selRight,
  markLeft,
  markRight,
  markTop,
  markBottom,
  handleCol,
  refHandleCol,
  activeCol,
  editCol,
  editNode,
  valueAt,
  scrollX,
}: {
  row: number;
  rev: number;
  compact: boolean;
  selLeft: number;
  selRight: number;
  /** The dashed outline's columns on this row (-1: none), and whether its top or bottom edge is here. */
  markLeft: number;
  markRight: number;
  markTop: boolean;
  markBottom: boolean;
  /** The column whose cell carries the fill handle (-1: none on this row). */
  handleCol: number;
  /** The column whose cell carries the reference handle (touch, while a formula is typed). */
  refHandleCol: number;
  activeCol: number;
  editCol: number;
  editNode: ReactNode;
  valueAt: (row: number, col: number) => GridCell;
  scrollX: Animated.Value;
}) {
  const g = compact ? GRID_SIZES.compact : GRID_SIZES.wide;
  const rowOn = selLeft >= 0;
  return (
    <View style={[styles.row, { height: g.cellH }]}>
      <Animated.View
        {...(web ? { dataSet: { rowHead: String(row + 1) } } : {})}
        style={[styles.rowHead, { width: g.headW, height: g.cellH, transform: [{ translateX: scrollX }] }, rowOn && styles.headOn]}
      >
        <Text style={styles.headText}>{row + 1}</Text>
      </Animated.View>
      {COLS.map((col) => {
        const v = valueAt(row, col);
        const key = cellKey(row, col);
        const inSel = rowOn && col >= selLeft && col <= selRight;
        return (
          <View
            key={col}
            {...(web ? { dataSet: { cell: key } } : {})}
            accessibilityLabel={v.text ? `${key} ${v.text}` : undefined}
            style={[styles.cell, { width: g.cellW, height: g.cellH }, inSel && styles.cellInSel]}
          >
            {col === editCol ? (
              editNode
            ) : (
              <Text
                numberOfLines={1}
                style={[
                  styles.cellText,
                  { fontSize: g.font, textAlign: v.align },
                  v.bold && styles.bold,
                  v.error && styles.errorText,
                ]}
              >
                {v.text}
              </Text>
            )}
            {col === activeCol && <View pointerEvents="none" style={styles.active} />}
            {markLeft >= 0 && col >= markLeft && col <= markRight && (
              <View
                pointerEvents="none"
                {...(web ? { dataSet: { mark: key } } : {})}
                style={[
                  styles.mark,
                  {
                    borderTopWidth: markTop ? 2 : 0,
                    borderBottomWidth: markBottom ? 2 : 0,
                    borderLeftWidth: col === markLeft ? 2 : 0,
                    borderRightWidth: col === markRight ? 2 : 0,
                  },
                ]}
              />
            )}
            {col === handleCol && <View pointerEvents="none" {...(web ? { dataSet: { fillHandle: key } } : {})} style={[styles.handle, compact && styles.handleCompact]} />}
            {col === refHandleCol && <View pointerEvents="none" {...(web ? { dataSet: { refHandle: key } } : {})} style={styles.refHandle} />}
          </View>
        );
      })}
    </View>
  );
});

const C = PAGE_COLORS;

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: C.card, userSelect: 'none' } as never,
  fill: { flex: 1 },
  headerRow: { flexDirection: 'row', zIndex: 3 },
  corner: { zIndex: 4, backgroundColor: C.cardMuted, borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border },
  colHead: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardMuted,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  headOn: { backgroundColor: C.accentLight },
  headText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.medium, color: C.text.secondary },
  row: { flexDirection: 'row' },
  rowHead: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardMuted,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  cell: { justifyContent: 'center', paddingHorizontal: 5, borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card },
  cellInSel: { backgroundColor: C.accentLight },
  cellText: { color: C.text.primary },
  bold: { fontWeight: Typography.weight.bold },
  errorText: { color: C.status.error.text },
  active: { position: 'absolute', left: -1, top: -1, right: -1, bottom: -1, borderWidth: 2, borderColor: C.accent },
  mark: { position: 'absolute', left: -1, top: -1, right: -1, bottom: -1, borderStyle: 'dashed', borderColor: C.accentDark },
  // The fill handle, in the corner of the selection's last cell (inside it: a cell can't draw over the next one).
  handle: { position: 'absolute', right: -1, bottom: -1, width: 7, height: 7, backgroundColor: C.accent, borderWidth: 1, borderColor: C.card },
  handleCompact: { width: 12, height: 12 },
  // The reference handle (touch): a dot in the corner of the reference being pointed at, dragged into a range.
  refHandle: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: C.accentDark, borderWidth: 2, borderColor: C.card },
});
