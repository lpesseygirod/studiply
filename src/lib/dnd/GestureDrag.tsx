/**
 * GestureDrag.tsx — the iPhone's drag and drop (step 3.1, Option A; used
 * in the library from step 3.3), built on react-native-gesture-handler.
 *
 * A long-press (350 ms) lifts the item with a light haptic; releasing
 * without moving opens its menu, moving drags it. A tap opens. Drop
 * targets measure themselves when a drag starts; the target under the
 * finger is found with hitTest (rules.ts). Near the top or bottom edge
 * the list scrolls (`scroller`), and the measured targets move with it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, MouseButton } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { dragDebugSet, dragLog } from './dragDebug';
import { draggedId, draggedTitle, hitTest, type DropCheck, type Dragged, type DropTarget, type MeasuredTarget, type Rect } from './rules';

export interface Hover {
  id: string;
  ok: boolean;
  reason?: string;
}

/** Scrolls the list under the drag; returns how far it really moved. */
export interface Scroller {
  scrollBy: (dy: number) => number;
}

interface Registration {
  /** Read when a drag starts (a folder may have been renamed since it registered). */
  target: () => DropTarget;
  measure: () => Promise<Rect | null>;
}

/** Stable for the whole drag (a gesture built from them is never rebuilt mid-drag). */
interface DragActions {
  start: (item: Dragged, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (x: number, y: number) => void;
  cancel: () => void;
  register: (id: string, reg: Registration) => () => void;
}

/** Changes as the drag moves. */
interface DragView {
  item: Dragged | null;
  hover: Hover | null;
}

const ActionsContext = createContext<DragActions | null>(null);
const ViewContext = createContext<DragView>({ item: null, hover: null });

/** How close to the top or bottom edge (pt) the list starts scrolling, and how fast at the edge. */
const EDGE = 80;
const MAX_SPEED = 14;

/**
 * How far the list scrolls per frame with the finger at `y` in a drag area
 * starting at `top`, `height` tall: up near the top, down near the bottom,
 * faster closer to the edge. 0 until the area has been measured (height 0),
 * or the list would run away at the start of every drag.
 */
export function edgeSpeed(y: number, top: number, height: number): number {
  if (height <= 0) return 0;
  const bottom = top + height;
  if (y < top + EDGE) return -MAX_SPEED * (1 - Math.max(0, y - top) / EDGE);
  if (y > bottom - EDGE) return MAX_SPEED * (1 - Math.max(0, bottom - y) / EDGE);
  return 0;
}

// When an item's long-press last started a drag or its menu: the empty
// space around it has a long-press menu too, and must not open as well.
let lastItemGesture = 0;
export function lastItemGestureAt(): number {
  return lastItemGesture;
}

function useDragActions(): DragActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('Drag targets need a <GestureDragProvider>.');
  return ctx;
}

function lightHaptic(): void {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function measureView(view: View | null): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

export function GestureDragProvider({
  children,
  check,
  onDrop,
  scroller,
}: {
  children: ReactNode;
  /** Whether the item may go onto the target (canDrop). */
  check: (item: Dragged, target: DropTarget) => DropCheck;
  /** A valid drop. */
  onDrop: (item: Dragged, target: DropTarget) => void;
  /** The list to scroll near the edges. */
  scroller?: Scroller;
}) {
  const styles = useThemedStyles(makeStyles);
  const registry = useRef(new Map<string, Registration>());
  const rects = useRef<MeasuredTarget[]>([]);
  const rootRef = useRef<View>(null);
  const root = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  // Settles when the targets measured at the start of the current drag are known.
  const measuredAll = useRef<Promise<void>>(Promise.resolve());
  const ghost = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [item, setItem] = useState<Dragged | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const current = useRef<{ item: Dragged | null; hover: Hover | null }>({ item: null, hover: null });
  const checkRef = useRef(check);
  checkRef.current = check;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const scrollerRef = useRef(scroller);
  scrollerRef.current = scroller;

  const placeGhost = useCallback(
    (x: number, y: number) => ghost.setValue({ x: x - root.current.x - 70, y: y - root.current.y - 22 }),
    [ghost],
  );

  const hoverAt = useCallback((x: number, y: number): Hover | null => {
    const dragged = current.current.item;
    const target = dragged ? hitTest({ x, y }, rects.current) : null;
    if (!dragged || !target) return null;
    const result = checkRef.current(dragged, target);
    return result.ok ? { id: target.id, ok: true } : { id: target.id, ok: false, reason: result.reason };
  }, []);

  const setHoverIfChanged = useCallback((next: Hover | null) => {
    const prev = current.current.hover;
    if (prev?.id === next?.id && prev?.ok === next?.ok) return;
    current.current.hover = next;
    setHover(next);
    dragDebugSet({ hover: next ? `${labelOf(next.id, rects.current)} ${next.ok ? '✓' : `✗ ${next.reason}`}` : null });
  }, []);

  const stopScrolling = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  // Near an edge: scroll a little every frame, faster closer to the edge.
  const scrollStep = useCallback(() => {
    frame.current = null;
    const s = scrollerRef.current;
    if (!s || !current.current.item) return;
    const { y } = pointer.current;
    const speed = edgeSpeed(y, root.current.y, root.current.height);
    if (speed === 0) return;
    const moved = s.scrollBy(speed);
    if (moved !== 0) {
      dragLog(`auto-scroll ${Math.round(moved)}`);
      // Everything in the list moved up by `moved` on screen.
      rects.current = rects.current.map((t) => ({ ...t, rect: { ...t.rect, y: t.rect.y - moved } }));
      setHoverIfChanged(hoverAt(pointer.current.x, y));
    }
    frame.current = requestAnimationFrame(scrollStep);
  }, [hoverAt, setHoverIfChanged]);

  const actions = useMemo<DragActions>(
    () => ({
      register: (id, reg) => {
        registry.current.set(id, reg);
        return () => registry.current.delete(id);
      },
      start: (dragged, x, y) => {
        current.current = { item: dragged, hover: null };
        pointer.current = { x, y };
        // Not measured yet: no auto-scroll until it is (edgeSpeed).
        root.current = { x: 0, y: 0, width: 0, height: 0 };
        rects.current = [];
        setItem(dragged);
        lightHaptic();
        placeGhost(x, y);
        dragLog(`drag start: ${draggedTitle(dragged)}`);
        // Where everything is now (the list may have scrolled since it was drawn).
        const measured = measureView(rootRef.current).then((r) => {
          if (r) root.current = r;
          placeGhost(pointer.current.x, pointer.current.y);
        });
        const targets = Promise.all(
          [...registry.current.values()].map(async (reg) => {
            const rect = await reg.measure();
            return rect ? { ...reg.target(), rect } : null;
          }),
        ).then((list) => {
          rects.current = list.filter((t): t is MeasuredTarget => t !== null);
        });
        measuredAll.current = Promise.all([measured, targets]).then(() => {
          const r = root.current;
          dragDebugSet({
            targets: `${rects.current.length} of ${registry.current.size} measured · area y ${Math.round(r.y)} h ${Math.round(r.height)}`,
          });
        });
      },
      move: (x, y) => {
        dragDebugSet({ finger: { x, y } });
        pointer.current = { x, y };
        placeGhost(x, y);
        setHoverIfChanged(hoverAt(x, y));
        if (frame.current === null) frame.current = requestAnimationFrame(scrollStep);
      },
      end: (x, y) => {
        stopScrolling();
        const dragged = current.current.item;
        current.current = { item: null, hover: null };
        setItem(null);
        setHover(null);
        if (!dragged) {
          dragLog('drop: nothing was being dragged');
          return;
        }
        // A quick drag can end before the targets are measured: wait for them.
        measuredAll.current.then(() => {
          const target = hitTest({ x, y }, rects.current);
          const verdict = target ? checkRef.current(dragged, target) : null;
          dragLog(
            !target
              ? `drop at ${Math.round(x)}, ${Math.round(y)}: no target there`
              : verdict?.ok
                ? `drop on ${labelOf(target.id, [target])}`
                : `drop refused: ${verdict && !verdict.ok ? verdict.reason : ''}`,
          );
          if (target && verdict?.ok) {
            lightHaptic();
            onDropRef.current(dragged, target);
          }
        });
      },
      cancel: () => {
        if (current.current.item) dragLog('drag cancelled');
        stopScrolling();
        current.current = { item: null, hover: null };
        setItem(null);
        setHover(null);
      },
    }),
    [placeGhost, hoverAt, setHoverIfChanged, scrollStep, stopScrolling],
  );
  useEffect(() => stopScrolling, [stopScrolling]);
  const view = useMemo(() => ({ item, hover }), [item, hover]);

  return (
    <ActionsContext.Provider value={actions}>
      <ViewContext.Provider value={view}>
        <View ref={rootRef} style={styles.root} collapsable={false}>
          {children}
          {item && (
            <Animated.View pointerEvents="none" style={[styles.ghost, { transform: ghost.getTranslateTransform() }]}>
              <Text style={styles.ghostText} numberOfLines={1}>
                {draggedTitle(item)}
              </Text>
              {hover && !hover.ok && <Text style={styles.ghostReason}>{hover.reason}</Text>}
            </Animated.View>
          )}
        </View>
      </ViewContext.Provider>
    </ActionsContext.Provider>
  );
}

/** Something that can be dragged: tap opens, hold and release shows the menu, hold and move drags. */
export function GestureDraggable({
  item,
  onOpen,
  onMenu,
  children,
}: {
  item: Dragged;
  onOpen: () => void;
  onMenu: () => void;
  children: ReactNode;
}) {
  const drag = useDragActions();
  const { item: dragging } = useContext(ViewContext);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onMenuRef = useRef(onMenu);
  onMenuRef.current = onMenu;
  const itemRef = useRef(item);
  itemRef.current = item;
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().runOnJS(true).mouseButton(MouseButton.LEFT);
    if (Platform.OS === 'web') pan.minDistance(5);
    else pan.activateAfterLongPress(350);
    const id = draggedId(itemRef.current);
    pan
      .withTestId(`drag-${id}`)
      .onBegin((e) => {
        dragLog(`touch on ${draggedTitle(itemRef.current)}`, { touchStart: true });
        dragDebugSet({ finger: { x: e.absoluteX, y: e.absoluteY }, hover: null });
      })
      .onStart((e) => {
        lastItemGesture = Date.now();
        dragLog('pan active (lifted)');
        drag.start(itemRef.current, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => drag.move(e.absoluteX, e.absoluteY))
      .onEnd((e, success) => {
        dragLog(`pan end ${success ? 'ok' : 'failed'}, moved ${Math.round(Math.hypot(e.translationX, e.translationY))}`);
        // iPhone: long-press and release without moving = the menu (DESIGN.md)
        if (Platform.OS !== 'web' && Math.hypot(e.translationX, e.translationY) < 8) {
          drag.cancel();
          lastItemGesture = Date.now();
          onMenuRef.current();
          return;
        }
        drag.end(e.absoluteX, e.absoluteY);
      })
      .onFinalize((_e, success) => {
        if (!success) {
          dragLog('pan stopped before it was active (moved too soon, or another gesture took the touch)');
          drag.cancel();
        }
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .mouseButton(MouseButton.LEFT)
      .withTestId(`tap-${id}`)
      .onEnd((_e, success) => {
        dragLog(`tap ${success ? 'ok → open' : 'failed'}`);
        if (success) onOpenRef.current();
      });
    return Gesture.Exclusive(pan, tap);
  }, [drag]);

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={dragging && draggedId(dragging) === draggedId(item) && localStyles.lifted}>
        {children}
      </View>
    </GestureDetector>
  );
}

/**
 * A draggable button-like view: VoiceOver can still open it (activate) and
 * show its menu (the "Actions" rotor: Move to… is the drag's alternative).
 */
export function DraggableView({
  dragged,
  onOpen,
  onMenu,
  style,
  accessibilityLabel,
  testID,
  children,
}: {
  dragged: Dragged;
  onOpen: () => void;
  onMenu: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <GestureDraggable item={dragged} onOpen={onOpen} onMenu={onMenu}>
      <View
        style={style}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Show menu' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? onMenu() : onOpen())}
        testID={testID}
      >
        {children}
      </View>
    </GestureDraggable>
  );
}

/** A drop target: registers itself and knows when it is hovered. */
export function GestureDropTarget({
  target,
  children,
}: {
  target: DropTarget;
  children: (hover: Hover | null) => ReactNode;
}) {
  const { register } = useDragActions();
  const { hover: hovered } = useContext(ViewContext);
  const ref = useRef<View>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(
    () => register(target.id, { target: () => targetRef.current, measure: () => measureView(ref.current) }),
    [register, target.id],
  );
  const hover = hovered?.id === target.id ? hovered : null;
  return (
    <View ref={ref} collapsable={false} testID={`drop-${target.id}`}>
      {children(hover)}
    </View>
  );
}

/** A target's name for the debug overlay. */
function labelOf(id: string, targets: MeasuredTarget[]): string {
  const t = targets.find((x) => x.id === id);
  if (!t) return id;
  return t.kind === 'trash' ? 'Trash' : t.place.label;
}

const localStyles = StyleSheet.create({
  lifted: { opacity: 0.4, transform: [{ scale: 1.04 }] },
});

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    ghost: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: 140,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.accent,
      shadowColor: c.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    ghostText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    ghostReason: { marginTop: 2, fontSize: Typography.size.xs, color: c.status.error.text },
  });
