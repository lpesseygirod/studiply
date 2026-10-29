import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { DocTab } from '../../services/document.service';
import type { TabInfo } from '../../services/document-tabs.service';
import { MAX_TABS } from '../../services/document-tabs.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { menuTriggerProps, showActionSheet, type Anchor, type DialogButton } from '../dialogs/dialogs';

/** A second click on the open tab within this long renames it (laptop: a double-click). */
const DOUBLE_MS = 400;
/** A press that moves farther than this is a drag (laptop). */
const DRAG_PX = 6;

/**
 * A document's tabs (step 4.7b; laptop docs/design desktop-01, iPhone
 * iphone-06): a lecture's My notes · Summary · Transcript first and fixed,
 * then the added tabs, and "+" at the end. A plain document with one tab
 * shows only "+ Add tab".
 * - Laptop: a click opens a tab, a second click on the open one renames it,
 *   right-click → Rename · Delete, drag along the row to move it.
 * - iPhone (and a narrow window): the row scrolls sideways; long-press →
 *   Rename · Move left · Move right · Delete.
 * A lecture's fixed tabs have no menu and don't move.
 */
export function DocumentTabs({
  tabs,
  current,
  compact = false,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: {
  tabs: TabInfo[];
  current: DocTab;
  /** iPhone layout: a row that scrolls sideways under the title. */
  compact?: boolean;
  onSelect: (tab: DocTab) => void;
  onAdd: () => void;
  onRename: (tab: TabInfo) => void;
  onDelete: (tab: TabInfo) => void;
  /** To this place in `tabs` (a lecture's fixed tabs stay first). */
  onMove: (tab: TabInfo, toIndex: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const lastPress = useRef<{ tab: DocTab; at: number } | null>(null);
  const drag = useTabDrag(!compact && Platform.OS === 'web', tabs, onMove);
  const full = tabs.length >= MAX_TABS;

  const press = (t: TabInfo) => {
    if (drag.justDragged()) return;
    const now = Date.now();
    const again = lastPress.current?.tab === t.tab && now - lastPress.current.at < DOUBLE_MS;
    lastPress.current = { tab: t.tab, at: now };
    if (t.tab !== current) onSelect(t.tab);
    else if (again && !t.fixed) onRename(t);
  };

  const menu = (t: TabInfo, index: number) => (anchor?: Anchor) => {
    const movable = tabs.filter((x) => !x.fixed);
    const at = movable.findIndex((x) => x.tab === t.tab);
    const offset = tabs.length - movable.length;
    const buttons: DialogButton[] = [{ text: 'Rename', onPress: () => onRename(t) }];
    if (compact) {
      if (at > 0) buttons.push({ text: 'Move left', onPress: () => onMove(t, index - 1) });
      if (at >= 0 && at < movable.length - 1) buttons.push({ text: 'Move right', onPress: () => onMove(t, offset + at + 1) });
    }
    if (tabs.length > 1) buttons.push({ text: 'Delete', style: 'destructive', onPress: () => onDelete(t) });
    showActionSheet(t.title, buttons, { anchor });
  };

  const addButton =
    tabs.length === 1 && !tabs[0].fixed ? (
      <Pressable onPress={onAdd} style={styles.addText} accessibilityRole="button" accessibilityLabel="Add tab">
        <Ionicons name="add" size={16} color={c.accentDark} />
        <Text style={styles.addTextLabel}>Add tab</Text>
      </Pressable>
    ) : (
      <Pressable
        onPress={onAdd}
        disabled={full}
        style={({ hovered }: { hovered?: boolean }) => [styles.add, hovered && !full && styles.addHover, full && styles.off]}
        accessibilityRole="button"
        accessibilityLabel={full ? `Add tab (at most ${MAX_TABS} tabs)` : 'Add tab'}
      >
        <Ionicons name="add" size={18} color={full ? c.text.placeholder : c.accentDark} />
      </Pressable>
    );

  // One tab (a plain document): no row yet, only the way to add one.
  if (tabs.length === 1 && !tabs[0].fixed) return <View style={compact ? styles.compactAlone : styles.alone}>{addButton}</View>;

  const row = tabs.map((t, i) => {
    const selected = t.tab === current;
    const trigger = t.fixed ? null : menuTriggerProps(menu(t, i));
    return (
      <View key={t.tab} ref={drag.refFor(t)} collapsable={false} style={drag.dragging === t.tab && styles.dragged}>
        {drag.target === i && drag.dragging !== null && <View style={styles.dropBefore} />}
        <Pressable
          {...(trigger ?? {})}
          onPress={() => press(t)}
          style={({ hovered }: { hovered?: boolean }) => [styles.tab, compact && styles.tabCompact, selected ? styles.selected : hovered && styles.hover]}
          accessibilityRole="tab"
          // react-native-web 0.21 reads aria-selected, not accessibilityState.
          aria-selected={selected}
          accessibilityState={{ selected }}
          accessibilityLabel={t.title}
          accessibilityHint={t.fixed ? undefined : compact ? 'Long-press for Rename, Move and Delete' : 'Right-click for Rename and Delete; drag to move'}
        >
          <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
            {t.title}
          </Text>
        </Pressable>
        {drag.target === tabs.length && i === tabs.length - 1 && drag.dragging !== null && <View style={styles.dropAfter} />}
      </View>
    );
  });

  return (
    // Not selectable: a double-click or a drag would select the names (and on the web a press that selected text is cancelled).
    <View style={[styles.wrap, compact && styles.wrapCompact, styles.noSelect]}>
      {/* The tabs scroll; "+" stays outside the scrolling part, so no tab sits under it. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={compact ? styles.scrollCompact : styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.bar, compact && styles.barCompact]} accessibilityRole="tablist">
          {row}
        </View>
      </ScrollView>
      {addButton}
    </View>
  );
}

/**
 * Laptop: drag a tab along the row to move it (the mouse; web only). The
 * place it would go shows as a thin accent line. Fixed tabs neither move
 * nor take a tab before them.
 */
function useTabDrag(enabled: boolean, tabs: TabInfo[], onMove: (tab: TabInfo, toIndex: number) => void) {
  const nodes = useRef(new Map<DocTab, HTMLElement>());
  const [dragging, setDragging] = useState<DocTab | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const dropped = useRef(0);
  const state = useRef<{ tab: TabInfo; x: number; moved: boolean } | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    if (!enabled) return;
    const firstMovable = () => Math.max(0, tabsRef.current.findIndex((t) => !t.fixed));
    const indexAt = (x: number) => {
      const list = tabsRef.current;
      for (let i = 0; i < list.length; i++) {
        const r = nodes.current.get(list[i].tab)?.getBoundingClientRect();
        if (r && x < r.left + r.width / 2) return Math.max(i, firstMovable());
      }
      return list.length;
    };
    const move = (e: MouseEvent) => {
      const s = state.current;
      if (!s) return;
      if (!s.moved && Math.abs(e.clientX - s.x) < DRAG_PX) return;
      s.moved = true;
      setDragging(s.tab.tab);
      setTarget(indexAt(e.clientX));
    };
    const up = (e: MouseEvent) => {
      const s = state.current;
      state.current = null;
      if (!s?.moved) return;
      dropped.current = Date.now();
      const list = tabsRef.current;
      const from = list.findIndex((t) => t.tab === s.tab.tab);
      let to = indexAt(e.clientX);
      // The place among the other tabs (the dragged one leaves its own).
      if (to > from) to -= 1;
      setDragging(null);
      setTarget(null);
      if (to !== from) onMove(s.tab, to);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [enabled, onMove]);

  const refFor = (t: TabInfo) => (node: unknown) => {
    const el = node as HTMLElement | null;
    const old = nodes.current.get(t.tab);
    if (old && old !== el) old.onmousedown = null;
    if (!enabled || !el || typeof el.addEventListener !== 'function') {
      nodes.current.delete(t.tab);
      return;
    }
    nodes.current.set(t.tab, el);
    el.onmousedown = t.fixed
      ? null
      : (e: MouseEvent) => {
          if (e.button === 0) state.current = { tab: t, x: e.clientX, moved: false };
        };
  };

  return {
    dragging,
    target,
    refFor,
    /** A drag just ended: its mouse-up isn't a click. */
    justDragged: () => Date.now() - dropped.current < 250,
  };
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
    wrapCompact: { alignSelf: 'stretch' },
    noSelect: { userSelect: 'none' } as never,
    scroll: { flexShrink: 1, flexGrow: 0, minWidth: 0 },
    scrollCompact: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
    scrollContent: { flexGrow: 0 },
    bar: { flexDirection: 'row', padding: 4, gap: 2, borderRadius: 12, backgroundColor: c.card },
    barCompact: { backgroundColor: c.cardMuted },
    tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, maxWidth: 200 },
    tabCompact: { paddingHorizontal: 12, maxWidth: 160 },
    hover: { backgroundColor: c.cardMuted },
    selected: { backgroundColor: c.accentLight },
    label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.secondary, userSelect: 'none' },
    labelSelected: { color: c.accentDark, fontWeight: Typography.weight.semibold },
    add: { width: 34, height: 34, borderRadius: 17, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    addHover: { backgroundColor: c.accentLight },
    off: { opacity: 0.6 },
    alone: { flexDirection: 'row' },
    compactAlone: { flexDirection: 'row', alignSelf: 'flex-start' },
    addText: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: c.card },
    addTextLabel: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.accentDark },
    dragged: { opacity: 0.5 },
    dropBefore: { position: 'absolute', left: -2, top: 6, bottom: 6, width: 2, borderRadius: 1, backgroundColor: c.accent },
    dropAfter: { position: 'absolute', right: -2, top: 6, bottom: 6, width: 2, borderRadius: 1, backgroundColor: c.accent },
  });
