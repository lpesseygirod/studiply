import { Fragment, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { GestureDropTarget } from '../../lib/dnd/GestureDrag';
import type { DropTarget } from '../../lib/dnd/rules';
import { mergeRefs, useDropZone, type DropHandlers } from '../../lib/dnd/useHtml5Drag';
import { SORT_LABELS, type LibrarySort } from '../../utils/libraryGrid';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { anchorBelow, menuTriggerProps, showActionSheet, type Anchor } from '../dialogs/dialogs';
import { IconButton } from '../IconButton';

/** Sort by Kind / Name / Date edited, the current one ticked (the header and the empty-space menu). */
export function showSortMenu(sort: LibrarySort, onSort: (sort: LibrarySort) => void, anchor?: Anchor): void {
  showActionSheet(
    'Sort by',
    (Object.keys(SORT_LABELS) as LibrarySort[]).map((s) => ({
      text: s === sort ? `✓ ${SORT_LABELS[s]}` : SORT_LABELS[s],
      onPress: () => onSort(s),
    })),
    { anchor },
  );
}

/**
 * "My library › Course › Folder · 7 items", Sort, and on the iPhone the
 * grid/list toggle (docs/design desktop-04).
 */
export function LibraryHeader({
  crumbs,
  onLibrary,
  onCrumb,
  count,
  sort,
  onSort,
  view,
  onToggleView,
  showViewToggle,
  onBack,
  crumbTargets,
  dnd,
  onTitleMenu,
}: {
  crumbs: string[];
  onLibrary: () => void;
  onCrumb: (index: number) => void;
  count: number;
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
  view: 'grid' | 'list';
  onToggleView: () => void;
  showViewToggle: boolean;
  onBack: () => void;
  /** Where a drop on each crumb moves things (step 3.3); null = not a target. */
  crumbTargets: (DropTarget | null)[];
  dnd: DropHandlers;
  /** The menu of the course or folder you're in (tap or click its title; right-click on the laptop). */
  onTitleMenu?: (anchor?: Anchor) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const last = crumbs.length - 1;

  const chooseSort = () => showSortMenu(sort, onSort);

  return (
    <View style={styles.wrap}>
      <View style={styles.crumbRow}>
        <IconButton icon="chevron-back" label="Back" onPress={onBack} color={c.text.onGradientStrong} />
        <View style={styles.crumbs} accessibilityRole="header">
          <Pressable onPress={onLibrary} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.crumbMuted}>My library</Text>
          </Pressable>
          {crumbs.map((name, i) => (
            <Fragment key={`${i}-${name}`}>
              <Ionicons name="chevron-forward" size={16} color={c.text.onGradient} />
              {i === last ? (
                onTitleMenu ? (
                  <Title name={name} kind={crumbs.length > 1 ? 'folder' : 'course'} onMenu={onTitleMenu} />
                ) : (
                  <Text style={styles.crumbCurrent} numberOfLines={1} testID="crumb-current">
                    {name}
                  </Text>
                )
              ) : (
                <Crumb name={name} onPress={() => onCrumb(i)} target={crumbTargets[i] ?? null} dnd={dnd} />
              )}
            </Fragment>
          ))}
          <Text style={styles.count}>
            {count === 1 ? '1 item' : `${count} items`}
          </Text>
        </View>
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.sortButton} onPress={chooseSort} accessibilityRole="button" accessibilityLabel={`Sort by ${SORT_LABELS[sort]}`}>
          <Text style={styles.sortLabel}>Sort</Text>
          <Text style={styles.sortValue}>{SORT_LABELS[sort]}</Text>
          <Ionicons name="chevron-down" size={14} color={c.text.secondary} />
        </Pressable>
        {showViewToggle && (
          <IconButton
            icon={view === 'grid' ? 'list-outline' : 'grid-outline'}
            label={view === 'grid' ? 'Show as list' : 'Show as grid'}
            onPress={onToggleView}
            color={c.text.onGradientStrong}
          />
        )}
      </View>
    </View>
  );
}

/** The title (the course or folder you're in) with ⌄: its menu. */
function Title({ name, kind, onMenu }: { name: string; kind: 'course' | 'folder'; onMenu: (anchor?: Anchor) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const ref = useRef<View | null>(null);
  const menu = menuTriggerProps(onMenu);
  return (
    <Pressable
      ref={mergeRefs(menu.ref, (node) => (ref.current = node as View | null)) as never}
      onPress={() => anchorBelow(ref).then(onMenu)}
      onLongPress={menu.onLongPress}
      delayLongPress={menu.delayLongPress}
      style={styles.title}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${kind} menu`}
      accessibilityHint="Rename, move, add to Favorites or delete"
      hitSlop={6}
      testID="crumb-title"
    >
      <Text style={styles.crumbCurrent} numberOfLines={1} testID="crumb-current">
        {name}
      </Text>
      <Ionicons name="chevron-down" size={16} color={c.text.onGradientStrong} />
    </Pressable>
  );
}

/** A crumb above the current level: opens it, and takes drops to move things up to it. */
function Crumb({ name, onPress, target, dnd }: { name: string; onPress: () => void; target: DropTarget | null; dnd: DropHandlers }) {
  const styles = useThemedStyles(makeStyles);
  const drop = useDropZone(target, dnd);
  const crumb = (hoverOk: boolean) => (
    <Pressable
      ref={drop.ref as never}
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={6}
      style={[styles.crumb, hoverOk && styles.crumbDropOk]}
    >
      <Text style={styles.crumbMuted} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
  // iPhone: the gesture drag's target (the laptop's is the browser drag above).
  if (Platform.OS !== 'web' && target) {
    return <GestureDropTarget target={target}>{(hover) => crumb(!!hover?.ok)}</GestureDropTarget>;
  }
  return crumb(drop.hover === 'ok');
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    crumbRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -10 },
    crumbs: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 2 },
    crumb: { paddingHorizontal: 4, marginHorizontal: -6, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
    crumbDropOk: { borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.accentLight },
    crumbMuted: { fontSize: Typography.size.lg, fontWeight: Typography.weight.medium, color: c.text.onGradient },
    title: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
    crumbCurrent: {
      flexShrink: 1,
      fontSize: Typography.size.lg,
      fontWeight: Typography.weight.bold,
      color: c.text.onGradientStrong,
    },
    count: { fontSize: Typography.size.sm, color: c.text.onGradient, marginLeft: 4 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.card,
    },
    sortLabel: { fontSize: Typography.size.sm, color: c.text.secondary },
    sortValue: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
