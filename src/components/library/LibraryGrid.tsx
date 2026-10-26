import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { DraggableView, GestureDropTarget } from '../../lib/dnd/GestureDrag';
import type { Dragged, DropTarget } from '../../lib/dnd/rules';
import { useDragSource, useDropZone, type DropHandlers } from '../../lib/dnd/useHtml5Drag';
import { isEditable } from '../../lib/shortcuts';
import { movableItem } from '../../utils/itemMenu';
import { tileMeta } from '../../utils/libraryGrid';
import type { ShelfItem } from '../../utils/shelf';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { isDialogOpen, menuTriggerProps, type Anchor } from '../dialogs/dialogs';
import { InlineName } from './InlineName';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type NameEditing = { mode: 'new' } | { mode: 'rename'; id: string } | null;

/** The id of the placeholder tile of a folder being created. */
export const NEW_FOLDER_ID = '__new-folder__';

/**
 * One level of a course as tiles (or rows on the iPhone, list view), like
 * docs/design desktop-04. On the iPhone a tap opens and a long-press shows
 * the menu. On the web a click selects, a double-click or Enter opens, Esc
 * clears the selection and a right-click shows the menu. Items can be
 * dragged (step 3.3); folders take drops, with a dashed highlight.
 */
export function LibraryGrid({
  items,
  view,
  selectedId,
  onSelect,
  onOpen,
  onMenu,
  editing,
  onSaveName,
  onCancelName,
  thumbnailFor,
  dnd,
}: {
  items: ShelfItem[];
  view: 'grid' | 'list';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (item: ShelfItem) => void;
  onMenu: (item: ShelfItem, anchor?: Anchor) => void;
  editing: NameEditing;
  onSaveName: (name: string) => Promise<boolean>;
  onCancelName: () => void;
  thumbnailFor?: (item: ShelfItem) => string | undefined;
  /** Drag and drop (useLibraryDrop). */
  dnd: DropHandlers;
}) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const web = Platform.OS === 'web';

  // Enter opens the selected item, Esc clears the selection (web).
  const latest = useRef({ items, selectedId, onOpen, onSelect, editing });
  latest.current = { items, selectedId, onOpen, onSelect, editing };
  useEffect(() => {
    if (!web || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const { items: list, selectedId: sel, editing: ed } = latest.current;
      if (ed || isDialogOpen() || isEditable(document.activeElement) || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Escape' && sel) latest.current.onSelect(null);
      if (e.key === 'Enter' && sel) {
        const item = list.find((i) => i.id === sel);
        if (item) {
          e.preventDefault();
          latest.current.onOpen(item);
        }
      }
    };
    // Capture phase: the focused tile (a button) handles Enter itself and stops it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [web]);

  const newTile: ShelfItem | null =
    editing?.mode === 'new'
      ? { id: NEW_FOLDER_ID, type: 'folder', title: 'Untitled folder', courseId: null, folderId: null, updatedAt: '', starredAt: null, childCount: 0 }
      : null;
  const shown = newTile ? [newTile, ...items] : items;

  const gap = 12;
  const min = web ? 140 : 100;
  const columns = Math.max(2, Math.floor((width + gap) / (min + gap)));
  const tileWidth = width ? (width - gap * (columns - 1)) / columns : min;

  return (
    <View
      style={view === 'grid' ? [styles.grid, { gap }] : styles.list}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      testID="library-grid"
    >
      {shown.map((item, i) => {
        const nameEditing =
          item.id === NEW_FOLDER_ID || (editing?.mode === 'rename' && editing.id === item.id) ? (
            <InlineName
              initial={item.id === NEW_FOLDER_ID ? 'Untitled folder' : item.title}
              onSave={onSaveName}
              onCancel={onCancelName}
            />
          ) : null;
        const real = item.id !== NEW_FOLDER_ID;
        const movable = real && !nameEditing ? movableItem(item) : null;
        return (
          <Entry
            key={item.id}
            item={item}
            dragged={movable && { kind: 'item', item: movable }}
            dropTarget={real && item.type === 'folder' ? folderTarget(item) : null}
            dnd={dnd}
            view={view}
            last={i === shown.length - 1}
            width={tileWidth}
            selected={selectedId === item.id}
            nameEditing={nameEditing}
            thumbnail={thumbnailFor?.(item)}
            onPress={() => {
              if (nameEditing) return;
              if (web) onSelect(item.id);
              else onOpen(item);
            }}
            onDoubleClick={() => !nameEditing && onOpen(item)}
            onMenu={(anchor) => item.id !== NEW_FOLDER_ID && onMenu(item, anchor)}
          />
        );
      })}
    </View>
  );
}

function folderTarget(folder: ShelfItem): DropTarget {
  return { id: folder.id, kind: 'place', place: { courseId: folder.courseId, folderId: folder.id, label: folder.title } };
}

function iconFor(item: ShelfItem, c: ThemeColors): { name: IconName; color: string } {
  switch (item.type) {
    case 'folder':
      return { name: 'folder', color: c.accent };
    case 'lecture':
      return item.status === 'completed'
        ? { name: 'document-text-outline', color: c.accent }
        : { name: 'mic', color: c.recording };
    case 'pdf':
      return { name: 'document-outline', color: c.recording };
    case 'image':
      return { name: 'image-outline', color: c.accent };
    case 'exam_pack':
      return { name: 'school-outline', color: c.accent };
    case 'unit_summary':
      return { name: 'albums-outline', color: c.accent };
    default:
      return { name: 'create-outline', color: c.accent };
  }
}

function Entry({
  item,
  view,
  last,
  width,
  selected,
  nameEditing,
  thumbnail,
  onPress,
  onDoubleClick,
  onMenu,
  dragged,
  dropTarget,
  dnd,
}: {
  item: ShelfItem;
  dragged: Dragged | null;
  dropTarget: DropTarget | null;
  dnd: DropHandlers;
  view: 'grid' | 'list';
  last: boolean;
  width: number;
  selected: boolean;
  nameEditing: React.ReactNode;
  thumbnail?: string;
  onPress: () => void;
  onDoubleClick: () => void;
  onMenu: (anchor?: Anchor) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const icon = iconFor(item, c);
  const menu = menuTriggerProps(onMenu);
  const dbl = useRef(onDoubleClick);
  dbl.current = onDoubleClick;
  const cleanup = useRef<(() => void) | null>(null);
  const dragRef = useDragSource(dragged);
  const drop = useDropZone(dropTarget, dnd);

  // Web: the right-click menu, the double-click and drag and drop all need the DOM node.
  const ref = (node: unknown) => {
    menu.ref?.(node);
    dragRef(node);
    drop.ref(node);
    cleanup.current?.();
    cleanup.current = null;
    const el = node as HTMLElement | null;
    if (Platform.OS !== 'web' || !el || typeof el.addEventListener !== 'function') return;
    const handler = () => dbl.current();
    el.addEventListener('dblclick', handler);
    cleanup.current = () => el.removeEventListener('dblclick', handler);
  };

  const meta = item.id === '__new-folder__' ? '' : tileMeta(item);
  const label = `${item.title}, ${meta}`;

  const content =
    view === 'list' ? (
      <>
        <View style={styles.rowIcon}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>
        <View style={styles.rowText}>
          {nameEditing ?? (
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
          )}
          {!!meta && <Text style={styles.meta}>{meta}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
      </>
    ) : (
      <>
        <View style={styles.tileIcon}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <Ionicons name={icon.name} size={44} color={icon.color} />
          )}
          {item.type === 'pdf' && <Text style={styles.pdfBadge}>PDF</Text>}
        </View>
        {nameEditing ?? (
          <Text style={styles.tileTitle} numberOfLines={2}>
            {item.title}
          </Text>
        )}
        {!!meta && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </>
    );
  const box = view === 'list' ? [styles.row, !last && styles.rowDivider] : [styles.tile, { width }];
  const testID = view === 'grid' && selected ? `entry-selected-${item.id}` : `entry-${item.id}`;

  // iPhone: hold to drag (step 3.3), tap opens, hold and release shows the menu.
  if (Platform.OS !== 'web' && dragged) {
    const draggable = (hoverOk: boolean) => (
      <DraggableView
        dragged={dragged}
        onOpen={onPress}
        onMenu={() => onMenu()}
        style={[box, hoverOk && styles.dropOk]}
        accessibilityLabel={label}
        testID={testID}
      >
        {content}
      </DraggableView>
    );
    return dropTarget ? (
      <GestureDropTarget target={dropTarget}>{(hover) => draggable(!!hover?.ok)}</GestureDropTarget>
    ) : (
      draggable(false)
    );
  }

  return (
    <Pressable
      ref={ref as never}
      onPress={onPress}
      onLongPress={menu.onLongPress}
      delayLongPress={menu.delayLongPress}
      style={[box, selected && styles.selected, drop.hover === 'ok' && styles.dropOk]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={view === 'grid' ? { selected } : undefined}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    list: { backgroundColor: c.card, borderRadius: 18, overflow: 'hidden' },
    tile: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 2,
      borderColor: c.card,
      minHeight: 132,
    },
    selected: { borderColor: c.accent, backgroundColor: c.accentLight },
    // A drag over a folder that takes it (docs/DESIGN.md: dashed purple).
    dropOk: { borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.accentLight },
    tileIcon: { width: 64, height: 56, alignItems: 'center', justifyContent: 'center' },
    thumb: { width: 64, height: 56, borderRadius: 8 },
    pdfBadge: {
      position: 'absolute',
      bottom: 4,
      fontSize: Typography.size.xxs,
      fontWeight: Typography.weight.bold,
      color: c.recording,
    },
    tileTitle: {
      textAlign: 'center',
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    meta: { fontSize: Typography.size.xs, color: c.text.secondary, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderWidth: 2, borderColor: 'transparent' },
    rowDivider: { borderBottomColor: c.surfaceMuted },
    rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.cardMuted, alignItems: 'center', justifyContent: 'center' },
    rowText: { flex: 1, gap: 2, alignItems: 'flex-start' },
    rowTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
