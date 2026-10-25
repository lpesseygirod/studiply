/**
 * GestureDrag.tsx — Option A of the step 3.1 spike: one drag and drop for
 * the iPhone and the web, built on react-native-gesture-handler.
 *
 * iPhone: a long-press (350 ms) lifts the item; releasing without moving
 * opens its menu, moving drags it. Web: the drag starts after the mouse
 * moves 5 px, so a click still opens and a right-click still shows the menu.
 * Drop targets measure themselves when a drag starts; the target under the
 * pointer is found with hitTest (rules.ts).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, MouseButton } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { draggedId, draggedTitle, hitTest, type DropCheck, type Dragged, type DropTarget, type MeasuredTarget, type Rect } from './rules';

export interface Hover {
  id: string;
  ok: boolean;
  reason?: string;
}

interface Registration {
  target: DropTarget;
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
}: {
  children: ReactNode;
  /** Whether the item may go onto the target (canDrop). */
  check: (item: Dragged, target: DropTarget) => DropCheck;
  /** A valid drop. */
  onDrop: (item: Dragged, target: DropTarget) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const registry = useRef(new Map<string, Registration>());
  const rects = useRef<MeasuredTarget[]>([]);
  const rootRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const ghost = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [item, setItem] = useState<Dragged | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const current = useRef<{ item: Dragged | null; hover: Hover | null }>({ item: null, hover: null });
  const checkRef = useRef(check);
  checkRef.current = check;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const placeGhost = useCallback(
    (x: number, y: number) => ghost.setValue({ x: x - origin.current.x - 70, y: y - origin.current.y - 22 }),
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
  }, []);

  const actions = useMemo<DragActions>(
    () => ({
      register: (id, reg) => {
        registry.current.set(id, reg);
        return () => registry.current.delete(id);
      },
      start: (dragged, x, y) => {
        current.current = { item: dragged, hover: null };
        setItem(dragged);
        lightHaptic();
        placeGhost(x, y);
        // Where everything is now (the list may have scrolled since it was drawn).
        measureView(rootRef.current).then((r) => {
          if (r) origin.current = { x: r.x, y: r.y };
          placeGhost(x, y);
        });
        Promise.all(
          [...registry.current.values()].map(async (reg) => {
            const rect = await reg.measure();
            return rect ? { ...reg.target, rect } : null;
          }),
        ).then((list) => {
          rects.current = list.filter((t): t is MeasuredTarget => t !== null);
        });
      },
      move: (x, y) => {
        placeGhost(x, y);
        setHoverIfChanged(hoverAt(x, y));
      },
      end: (x, y) => {
        const dragged = current.current.item;
        const target = dragged ? hitTest({ x, y }, rects.current) : null;
        current.current = { item: null, hover: null };
        setItem(null);
        setHover(null);
        if (dragged && target && checkRef.current(dragged, target).ok) {
          lightHaptic();
          onDropRef.current(dragged, target);
        }
      },
      cancel: () => {
        current.current = { item: null, hover: null };
        setItem(null);
        setHover(null);
      },
    }),
    [placeGhost, hoverAt, setHoverIfChanged],
  );
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

/** Something that can be dragged (Option A). */
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
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().runOnJS(true).mouseButton(MouseButton.LEFT);
    if (Platform.OS === 'web') pan.minDistance(5);
    else pan.activateAfterLongPress(350);
    pan
      .onStart((e) => drag.start(item, e.absoluteX, e.absoluteY))
      .onUpdate((e) => drag.move(e.absoluteX, e.absoluteY))
      .onEnd((e) => {
        // iPhone: long-press and release without moving = the menu (DESIGN.md)
        if (Platform.OS !== 'web' && Math.hypot(e.translationX, e.translationY) < 8) {
          drag.cancel();
          onMenuRef.current();
          return;
        }
        drag.end(e.absoluteX, e.absoluteY);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .mouseButton(MouseButton.LEFT)
      .onEnd((_e, success) => {
        if (success) onOpenRef.current();
      });
    return Gesture.Exclusive(pan, tap);
  }, [drag, item]);

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={dragging && draggedId(dragging) === draggedId(item) && localStyles.lifted}>
        {children}
      </View>
    </GestureDetector>
  );
}

/** A drop target (Option A): registers itself and knows when it is hovered. */
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
  useEffect(
    () => register(target.id, { target, measure: () => measureView(ref.current) }),
    [register, target.id, target.kind], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hover = hovered?.id === target.id ? hovered : null;
  return (
    <View ref={ref} collapsable={false}>
      {children(hover)}
    </View>
  );
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
