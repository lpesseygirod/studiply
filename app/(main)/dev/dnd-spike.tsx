/**
 * The drag-and-drop spike (step 3.1, throwaway): 3 folders and 5 files kept
 * in memory, nothing saved. Option A (gesture, both devices) and, on the
 * web, Option B (the browser's own drag and drop, which also takes files
 * from Finder). Development only: Settings → General → DEVELOPMENT.
 * Removed in step 3.3, once the real library has drag and drop.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import { menuTriggerProps, showActionSheet, type Anchor } from '../../../src/components/dialogs/dialogs';
import { useUndoToast } from '../../../src/hooks/useUndoToast';
import { GestureDraggable, GestureDragProvider, GestureDropTarget, type Hover } from '../../../src/lib/dnd/GestureDrag';
import { attachDraggable, attachDropTarget, html5Supported } from '../../../src/lib/dnd/html5';
import { canDrop, type DragItem, type DropTarget } from '../../../src/lib/dnd/rules';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';

interface Node {
  id: string;
  kind: 'file' | 'folder';
  title: string;
  parentId: string | null;
  trashed?: boolean;
}

const INITIAL: Node[] = [
  { id: 'A', kind: 'folder', title: 'Folder A', parentId: null },
  { id: 'B', kind: 'folder', title: 'Folder B', parentId: null },
  { id: 'C', kind: 'folder', title: 'Folder C', parentId: 'A' },
  { id: 'f1', kind: 'file', title: 'File 1', parentId: null },
  { id: 'f2', kind: 'file', title: 'File 2', parentId: null },
  { id: 'f3', kind: 'file', title: 'File 3', parentId: 'A' },
  { id: 'f4', kind: 'file', title: 'File 4', parentId: 'B' },
  { id: 'f5', kind: 'file', title: 'File 5', parentId: null },
];

type Target = Omit<DropTarget, 'rect'>;
const ROOT: Target = { id: 'root', kind: 'root', title: 'My library (top level)' };
const TRASH: Target = { id: 'trash', kind: 'trash', title: 'Trash' };

const asItem = (n: Node): DragItem => ({ id: n.id, kind: n.kind, title: n.title, parentId: n.parentId });

export default function DndSpikeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [nodes, setNodes] = useState<Node[]>(INITIAL);
  const [mode, setMode] = useState<'gesture' | 'browser'>('gesture');
  const [log, setLog] = useState<string[]>([]);
  const { showUndo, toast } = useUndoToast();

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const say = (line: string) => setLog((prev) => [line, ...prev].slice(0, 6));
  const nameOf = (id: string | null) => (id === null ? 'top level' : (nodes.find((n) => n.id === id)?.title ?? id));

  const folders = useMemo(
    () => nodes.filter((n) => n.kind === 'folder' && !n.trashed).map((n) => ({ id: n.id, parent_id: n.parentId })),
    [nodes],
  );
  const check = useCallback((item: DragItem, target: Target) => canDrop(item, target, folders), [folders]);

  const drop = useCallback(
    (item: DragItem, target: Target) => {
      const before = nodesRef.current;
      const message =
        target.kind === 'trash'
          ? `Moved '${item.title}' to Trash`
          : `Moved '${item.title}' into ${target.kind === 'root' ? 'the top level' : `'${target.title}'`}`;
      setNodes((prev) =>
        prev.map((n) =>
          n.id !== item.id
            ? n
            : target.kind === 'trash'
              ? { ...n, trashed: true }
              : { ...n, parentId: target.kind === 'root' ? null : target.id },
        ),
      );
      setLog((prev) => [message, ...prev].slice(0, 6));
      showUndo(message, () => setNodes(before));
    },
    [showUndo],
  );

  const open = (n: Node) => say(`Opened '${n.title}'`);
  const menu = (n: Node, anchor?: Anchor) =>
    showActionSheet(n.title, [{ text: 'Open', onPress: () => open(n) }], { anchor });

  const visible = nodes.filter((n) => !n.trashed);
  const browser = Platform.OS === 'web' && mode === 'browser';

  const grid = (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
      <Text style={styles.help}>
        {Platform.OS === 'web'
          ? browser
            ? 'Option B: the browser’s drag and drop. Drag a tile onto a folder, the top-level bar or Trash; you can also drop a file from Finder onto a folder.'
            : 'Option A: gesture drag. Drag a tile onto a folder, the top-level bar or Trash. Click opens, right-click shows the menu.'
          : 'Long-press a tile and move it onto a folder, the top-level bar or Trash. Long-press and release without moving shows the menu.'}
      </Text>

      {Platform.OS === 'web' && html5Supported && (
        <View style={styles.switch} accessibilityRole="radiogroup">
          {(['gesture', 'browser'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.switchItem, mode === m && styles.switchItemOn]}
              onPress={() => setMode(m)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === m }}
            >
              <Text style={[styles.switchText, mode === m && styles.switchTextOn]}>
                {m === 'gesture' ? 'Option A · gesture' : 'Option B · browser drag'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Zone target={ROOT} browser={browser} check={check} onDrop={drop} onFiles={(f) => say(`Dropped from the computer: ${f} (top level)`)}>
        {(hover) => (
          <View style={[styles.bar, hoverStyle(styles, hover)]} testID="zone-root">
            <Ionicons name="library-outline" size={16} color={c.text.primary} />
            <Text style={styles.barText}>{ROOT.title}</Text>
          </View>
        )}
      </Zone>

      <View style={styles.grid}>
        {visible.map((n) => {
          const tile = (hover: Hover | null) => (
            <View style={[styles.tile, hoverStyle(styles, hover)]} testID={`tile-${n.id}`}>
              <Ionicons
                name={n.kind === 'folder' ? 'folder-outline' : 'document-text-outline'}
                size={26}
                color={n.kind === 'folder' ? c.accent : c.text.secondary}
              />
              <Text style={styles.tileTitle} numberOfLines={1}>
                {n.title}
              </Text>
              <Text style={styles.tileMeta} numberOfLines={1}>
                in {nameOf(n.parentId)}
              </Text>
              {hover && !hover.ok && <Text style={styles.refused}>{hover.reason}</Text>}
            </View>
          );
          const target: Target = { id: n.id, kind: 'folder', title: n.title };
          if (browser) {
            return (
              <BrowserTile
                key={n.id}
                item={asItem(n)}
                target={n.kind === 'folder' ? target : null}
                check={check}
                onDrop={drop}
                onFiles={(f) => say(`Dropped from the computer: ${f} into '${n.title}'`)}
                onOpen={() => open(n)}
                onMenu={(anchor) => menu(n, anchor)}
              >
                {tile}
              </BrowserTile>
            );
          }
          return (
            <GestureDraggable key={n.id} item={asItem(n)} onOpen={() => open(n)} onMenu={() => menu(n)}>
              <WebContextMenu onMenu={(anchor) => menu(n, anchor)}>
                {n.kind === 'folder' ? <GestureDropTarget target={target}>{tile}</GestureDropTarget> : tile(null)}
              </WebContextMenu>
            </GestureDraggable>
          );
        })}
      </View>

      <Zone target={TRASH} browser={browser} check={check} onDrop={drop} onFiles={() => say('Files from the computer can’t go to Trash')}>
        {(hover) => (
          <View style={[styles.bar, styles.trash, hoverStyle(styles, hover)]} testID="zone-trash">
            <Ionicons name="trash-outline" size={16} color={c.text.primary} />
            <Text style={styles.barText}>Trash</Text>
          </View>
        )}
      </Zone>

      <View style={styles.log} testID="spike-log">
        {log.length === 0 ? <Text style={styles.logLine}>Moves and opens show here.</Text> : null}
        {log.map((line, i) => (
          <Text key={`${i}-${line}`} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} color={c.text.onGradientStrong} />
        <Text style={styles.title}>Drag-and-drop spike</Text>
      </View>
      {browser ? grid : (
        <GestureDragProvider check={check} onDrop={drop}>
          {grid}
        </GestureDragProvider>
      )}
      {toast}
    </View>
  );
}

function hoverStyle(styles: ReturnType<typeof makeStyles>, hover: Hover | null) {
  if (!hover) return null;
  return hover.ok ? styles.hoverOk : styles.hoverRefused;
}

/** Right-click on the web (gesture mode): the item's menu at the pointer. */
function WebContextMenu({ onMenu, children }: { onMenu: (anchor?: Anchor) => void; children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return <View ref={menuTriggerProps(onMenu).ref as never}>{children}</View>;
}

/** A drop zone in either mode. */
function Zone({
  target,
  browser,
  check,
  onDrop,
  onFiles,
  children,
}: {
  target: Target;
  browser: boolean;
  check: (item: DragItem, target: Target) => ReturnType<typeof canDrop>;
  onDrop: (item: DragItem, target: Target) => void;
  onFiles: (names: string) => void;
  children: (hover: Hover | null) => React.ReactNode;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  if (!browser) return <GestureDropTarget target={target}>{children}</GestureDropTarget>;
  return (
    <View
      ref={(node) => {
        cleanup.current?.();
        cleanup.current = node
          ? attachDropTarget(node, {
              onHover: (item, fromComputer) => {
                if (fromComputer) return setHover({ id: target.id, ok: true });
                if (!item) return;
                const result = check(item, target);
                setHover(result.ok ? { id: target.id, ok: true } : { id: target.id, ok: false, reason: result.reason });
              },
              onLeave: () => setHover(null),
              onDrop: (item, files) => {
                if (item && check(item, target).ok) onDrop(item, target);
                else if (files.length) onFiles(files.map((f) => f.name).join(', '));
              },
            })
          : null;
      }}
    >
      {children(hover)}
    </View>
  );
}

/** Option B (web): a tile the browser drags; folders also take drops. */
function BrowserTile({
  item,
  target,
  check,
  onDrop,
  onFiles,
  onOpen,
  onMenu,
  children,
}: {
  item: DragItem;
  target: Target | null;
  check: (item: DragItem, target: Target) => ReturnType<typeof canDrop>;
  onDrop: (item: DragItem, target: Target) => void;
  onFiles: (names: string) => void;
  onOpen: () => void;
  onMenu: (anchor?: Anchor) => void;
  children: (hover: Hover | null) => React.ReactNode;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const cleanups = useRef<(() => void)[]>([]);
  const menuRef = menuTriggerProps(onMenu).ref;
  return (
    <Pressable
      onPress={onOpen}
      ref={(node) => {
        cleanups.current.forEach((f) => f());
        cleanups.current = [];
        menuRef?.(node);
        if (!node) return;
        cleanups.current.push(attachDraggable(node, item));
        if (target) {
          cleanups.current.push(
            attachDropTarget(node, {
              onHover: (dragged, fromComputer) => {
                if (fromComputer) return setHover({ id: target.id, ok: true });
                if (!dragged) return;
                const result = check(dragged, target);
                setHover(result.ok ? { id: target.id, ok: true } : { id: target.id, ok: false, reason: result.reason });
              },
              onLeave: () => setHover(null),
              onDrop: (dragged, files) => {
                if (dragged && check(dragged, target).ok) onDrop(dragged, target);
                else if (files.length) onFiles(files.map((f) => f.name).join(', '));
              },
            }),
          );
        }
      }}
    >
      {children(hover)}
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 4 },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.onGradientStrong },
    content: { padding: 16, gap: 14, maxWidth: 820, width: '100%', alignSelf: 'center' },
    help: { fontSize: Typography.size.sm, color: c.text.onGradient },
    switch: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 12, padding: 4, gap: 4 },
    switchItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    switchItemOn: { backgroundColor: c.accentDark },
    switchText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.primary },
    switchTextOn: { color: c.accentOn },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 2,
      borderColor: c.card,
    },
    trash: { backgroundColor: c.cardMuted, borderColor: c.cardMuted },
    barText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: {
      width: 150,
      minHeight: 104,
      padding: 12,
      gap: 4,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 2,
      borderColor: c.card,
    },
    tileTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    tileMeta: { fontSize: Typography.size.xs, color: c.text.secondary },
    refused: { fontSize: Typography.size.xs, color: c.status.error.text },
    // The design's dashed purple highlight on the folder under the pointer
    hoverOk: { borderColor: c.accent, borderStyle: 'dashed', backgroundColor: c.accentLight },
    hoverRefused: { borderColor: c.status.error.text, borderStyle: 'dashed', backgroundColor: c.status.error.bg },
    log: { padding: 12, borderRadius: 12, backgroundColor: c.card, gap: 4 },
    logLine: { fontSize: Typography.size.sm, color: c.text.primary },
  });
