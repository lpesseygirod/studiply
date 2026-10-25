import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import type { ScreenKind } from '../../hooks/useLayoutMode';
import { useAuth } from '../../hooks/useAuth';
import { useLibraryUpdates } from '../../lib/cache';
import { getFolderBreadcrumbs } from '../../services/folder.service';
import { getProjects, type ProjectWithCount } from '../../services/project.service';
import { getCourseLevel, getReviewDueCount } from '../../services/shelf.service';
import { useItemMenu } from '../../hooks/useItemMenu';
import { courseShelfItem, openTarget, TYPE_ICON, type ShelfItem } from '../../utils/shelf';
import type { ShowUndo } from '../../utils/star';
import { menuTriggerProps, type Anchor } from '../dialogs/dialogs';
import { anchorBelow, useNewMenu } from '../NewMenu';
import { useShell } from './ShellContext';

/**
 * The laptop's library sidebar (docs/design desktop-01/04): + New, the
 * sections (Recent, Favorites, Exam packs open on Library; Review today with
 * its count), the courses with their item counts, the open course expanded
 * to its folders and files, Trash. Right-click a course or an item for the
 * same menu as in the grid (useItemMenu).
 */

export const SECTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'exam-packs', label: 'Exam packs' },
] as const;


export function Sidebar({ kind, showUndo }: { kind: ScreenKind; showUndo: ShowUndo }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  const { location } = useShell();
  const { profile } = useAuth();
  const [courses, setCourses] = useState<ProjectWithCount[]>([]);
  const [reviewDue, setReviewDue] = useState<number | null>(null);
  const newMenu = useNewMenu();
  const newButtonRef = useRef<View>(null);
  const itemMenu = useItemMenu({
    showUndo,
    // Leave a course or folder that was just deleted.
    onTrashed: item => {
      if (item.type === 'course' && item.id === location?.courseId) router.navigate('/library');
      else if (item.type === 'folder' && item.id === location?.folderId) router.navigate(`/project/${item.courseId}`);
    },
  });

  const load = useCallback(() => {
    if (!profile?.id) return;
    getProjects(profile.id).then(setCourses).catch(() => {});
    getReviewDueCount().then(setReviewDue);
  }, [profile?.id]);
  useEffect(load, [load, pathname]);
  useLibraryUpdates(load);

  const openCourseId = location?.courseId ?? null;
  const onLibrary = pathname === '/library';

  return (
    <View style={styles.sidebar} testID="sidebar">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          ref={newButtonRef}
          style={styles.newButton}
          onPress={() => anchorBelow(newButtonRef).then(newMenu.open)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="New"
          accessibilityHint="Course, folder, upload, recording"
        >
          <Ionicons name="add" size={18} color={c.button.primaryText} />
          <Text style={styles.newText}>New</Text>
        </TouchableOpacity>

        {/* On documents the top bar has no search field, so it sits here. */}
        {kind === 'document' && (
          <View style={styles.searchBlock}>
            <Text style={styles.smallLabel}>Search</Text>
            <Pressable style={styles.search} onPress={() => router.navigate('/search')} accessibilityRole="search">
              <Text style={styles.searchText} numberOfLines={1}>
                Search notes, lectures, terms…
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.group}>
          {SECTIONS.map(s => (
            <Item
              key={s.key}
              label={s.label}
              active={onLibrary && section === s.key}
              onPress={() => router.navigate({ pathname: '/library', params: { section: s.key } })}
            />
          ))}
          <Item
            label="Review today"
            active={pathname === '/review'}
            badge={reviewDue ? reviewDue : undefined}
            onPress={() => router.navigate('/review')}
          />
        </View>

        <Text style={styles.sectionLabel}>COURSES · DROP FILES HERE</Text>
        <View style={styles.group}>
          {courses.map(course => {
            const open = course.id === openCourseId;
            return (
              <View key={course.id}>
                <Item
                  label={course.name}
                  color={course.color}
                  count={course.itemCount}
                  active={open && pathname === `/project/${course.id}` && !location?.folderId}
                  bold={open}
                  onPress={() => router.navigate(`/project/${course.id}`)}
                  onMenu={anchor => itemMenu.open(courseShelfItem(course), anchor)}
                />
                {open && (
                  <CourseTree
                    onMenu={itemMenu.open}
                    courseId={course.id}
                    folderId={location?.folderId ?? null}
                    itemId={location?.itemId ?? null}
                  />
                )}
              </View>
            );
          })}
          {courses.length === 0 && <Text style={styles.empty}>No courses yet</Text>}
        </View>
      </ScrollView>

      <Pressable style={styles.trash} onPress={() => router.navigate('/settings/trash')} accessibilityRole="link">
        <Ionicons name="trash-outline" size={16} color={c.text.primary} />
        <Text style={styles.itemText}>Trash</Text>
      </Pressable>

      {newMenu.dialog}
      {itemMenu.modal}
    </View>
  );
}

/**
 * The open course's contents: its top level, and the folders the student
 * opens (the chevron) or is in (expanded on the way down to it).
 */
function CourseTree({
  courseId,
  folderId,
  itemId,
  onMenu,
}: {
  courseId: string;
  folderId: string | null;
  itemId: string | null;
  onMenu: (item: ShelfItem, anchor?: Anchor) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const [levels, setLevels] = useState<Record<string, ShelfItem[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadLevel = useCallback(
    (parent: string | null) => {
      getCourseLevel(courseId, parent)
        .then(items => setLevels(prev => ({ ...prev, [parent ?? '']: items })))
        .catch(() => {});
    },
    [courseId],
  );

  // A new course starts collapsed.
  useEffect(() => {
    setLevels({});
    setExpanded(new Set());
    loadLevel(null);
  }, [courseId, loadLevel]);

  // The folder the student is in, and every folder above it, open.
  useEffect(() => {
    if (!folderId) return;
    getFolderBreadcrumbs(folderId, '')
      .then(chain => {
        const ids = chain.flatMap(c => (c.type === 'folder' && c.id ? [c.id] : []));
        setExpanded(prev => new Set([...prev, ...ids]));
        ids.forEach(loadLevel);
      })
      .catch(() => {});
  }, [folderId, loadLevel]);

  const reloadAll = useCallback(() => {
    loadLevel(null);
    expanded.forEach(loadLevel);
  }, [expanded, loadLevel]);
  useLibraryUpdates(reloadAll);

  function toggle(id: string) {
    const willOpen = !expanded.has(id);
    setExpanded(prev => {
      const next = new Set(prev);
      if (willOpen) next.add(id);
      else next.delete(id);
      return next;
    });
    if (willOpen) loadLevel(id);
  }

  function renderLevel(parent: string | null, depth: number): React.ReactNode {
    const items = levels[parent ?? ''];
    if (!items) return null;
    if (items.length === 0) return <Text style={[styles.empty, styles.treeEmpty, { paddingLeft: 34 + depth * 14 }]}>Empty</Text>;
    return items.map(item => {
      const isFolder = item.type === 'folder';
      const open = isFolder && expanded.has(item.id);
      const active = item.id === itemId || (isFolder && !itemId && item.id === folderId);
      return (
        <View key={item.id}>
          <Pressable
            style={[styles.treeItem, { paddingLeft: 14 + depth * 14 }, active && styles.treeItemActive]}
            onPress={() => {
              if (isFolder && !open) toggle(item.id);
              router.navigate(openTarget(item));
            }}
            accessibilityRole="link"
            accessibilityState={{ selected: active }}
            testID={active ? 'sidebar-current' : undefined}
            {...menuTriggerProps(anchor => onMenu(item, anchor))}
          >
            {isFolder ? (
              <Pressable
                onPress={() => toggle(item.id)}
                style={styles.chevron}
                accessibilityRole="button"
                accessibilityLabel={open ? `Collapse ${item.title}` : `Expand ${item.title}`}
              >
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={c.text.secondary} />
              </Pressable>
            ) : (
              <View style={styles.chevronSpace} />
            )}
            <Ionicons name={TYPE_ICON[item.type]} size={14} color={active ? c.accentDark : c.text.secondary} />
            <Text style={[styles.treeText, active && styles.treeTextActive]} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
          {open && renderLevel(item.id, depth + 1)}
        </View>
      );
    });
  }

  return <View style={styles.tree}>{renderLevel(null, 0)}</View>;
}

function Item({
  label,
  onPress,
  active,
  bold,
  color,
  count,
  badge,
  onMenu,
}: {
  label: string;
  onPress: () => void;
  /** Right-click (web) or long-press: the item's menu. */
  onMenu?: (anchor?: Anchor) => void;
  active?: boolean;
  bold?: boolean;
  color?: string;
  count?: number;
  badge?: number;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: !!active }}
      {...(onMenu && menuTriggerProps(onMenu))}
    >
      {color && <View style={[styles.square, { backgroundColor: color }]} />}
      <Text style={[styles.itemText, (active || bold) && styles.itemTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && <Text style={styles.count}>{count}</Text>}
      {badge !== undefined && (
        <View style={styles.badge} accessibilityLabel={`${badge} due`}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  sidebar: {
    width: Layout.sidebarWidth,
    backgroundColor: c.white,
    borderRightWidth: 1,
    borderRightColor: c.surfaceMuted,
  },
  content: { padding: 12, paddingTop: 16, gap: 4 },
  newButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.button.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 42,
    marginBottom: 16,
  },
  newText: { color: c.button.primaryText, fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },

  searchBlock: { gap: 6, marginBottom: 14 },
  smallLabel: { fontSize: Typography.size.xs, color: c.text.secondary, paddingHorizontal: 2 },
  search: {
    height: 36,
    justifyContent: 'center',
    backgroundColor: c.search.bg,
    borderWidth: 1,
    borderColor: c.search.border,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchText: { fontSize: Typography.size.sm, color: c.search.placeholder },

  group: { gap: 2 },
  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.secondary,
    letterSpacing: Typography.tracking.wide,
    marginTop: 18,
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  itemActive: { backgroundColor: c.accentLight },
  itemText: { flex: 1, fontSize: Typography.size.base, color: c.text.primary },
  itemTextActive: { fontWeight: Typography.weight.semibold },
  square: { width: 10, height: 10, borderRadius: 2 },
  count: { fontSize: Typography.size.sm, color: c.text.secondary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: c.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: c.accentOn, fontSize: Typography.size.xs, fontWeight: Typography.weight.bold },
  empty: { fontSize: Typography.size.sm, color: c.text.secondary, paddingHorizontal: 10 },

  tree: { paddingVertical: 2 },
  treeEmpty: { paddingVertical: 4 },
  treeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingRight: 10,
    borderRadius: 8,
  },
  treeItemActive: { backgroundColor: c.salmonLight },
  chevronSpace: { width: 24 },
  // A 24 px target in the 30 px row (WCAG 2.2 minimum for pointer targets on the laptop)
  chevron: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  treeText: { flex: 1, fontSize: Typography.size.sm, color: c.text.primary },
  treeTextActive: { color: c.accentDark, fontWeight: Typography.weight.semibold },
  trash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
});
