import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import type { ScreenKind } from '../../hooks/useLayoutMode';
import { useAuth } from '../../hooks/useAuth';
import { notifyLibraryUpdated, useLibraryUpdates } from '../../lib/cache';
import { getFolderBreadcrumbs } from '../../services/folder.service';
import { getProjects, type ProjectWithCount } from '../../services/project.service';
import { getCourseLevel, getReviewDueCount } from '../../services/shelf.service';
import { openTarget, TYPE_ICON, type ShelfItem } from '../../utils/shelf';
import { NewProjectModal } from '../NewProjectModal';
import { useShell } from './ShellContext';

/**
 * The laptop's library sidebar (docs/design desktop-01/04): + New, the
 * sections (Recent, Starred, Exam packs open on Library; Review today with
 * its count), the courses with their item counts, the open course expanded
 * to its folders and files, Trash.
 */

export const SECTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: 'starred', label: 'Starred' },
  { key: 'exam-packs', label: 'Exam packs' },
] as const;


export function Sidebar({ kind }: { kind: ScreenKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  const { location } = useShell();
  const { profile } = useAuth();
  const [courses, setCourses] = useState<ProjectWithCount[]>([]);
  const [reviewDue, setReviewDue] = useState<number | null>(null);
  const [showNewCourse, setShowNewCourse] = useState(false);

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
          style={styles.newButton}
          onPress={() => setShowNewCourse(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="New course"
        >
          <Ionicons name="add" size={18} color={Colors.button.primaryText} />
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
                />
                {open && (
                  <CourseTree
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
        <Ionicons name="trash-outline" size={16} color={Colors.text.primary} />
        <Text style={styles.itemText}>Trash</Text>
      </Pressable>

      {profile?.id && (
        <NewProjectModal
          visible={showNewCourse}
          userId={profile.id}
          onClose={() => setShowNewCourse(false)}
          onCreated={() => {
            setShowNewCourse(false);
            notifyLibraryUpdated();
          }}
        />
      )}
    </View>
  );
}

/**
 * The open course's contents: its top level, and the folders the student
 * opens (the chevron) or is in (expanded on the way down to it).
 */
function CourseTree({ courseId, folderId, itemId }: { courseId: string; folderId: string | null; itemId: string | null }) {
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
          >
            {isFolder ? (
              <Pressable
                onPress={() => toggle(item.id)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={open ? `Collapse ${item.title}` : `Expand ${item.title}`}
              >
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={12} color={Colors.text.secondary} />
              </Pressable>
            ) : (
              <View style={styles.chevronSpace} />
            )}
            <Ionicons name={TYPE_ICON[item.type]} size={14} color={active ? Colors.accentDark : Colors.text.secondary} />
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
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  bold?: boolean;
  color?: string;
  count?: number;
  badge?: number;
}) {
  return (
    <Pressable
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: !!active }}
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

const styles = StyleSheet.create({
  sidebar: {
    width: Layout.sidebarWidth,
    backgroundColor: Colors.white,
    borderRightWidth: 1,
    borderRightColor: Colors.surfaceMuted,
  },
  content: { padding: 12, paddingTop: 16, gap: 4 },
  newButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.button.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 42,
    marginBottom: 16,
  },
  newText: { color: Colors.button.primaryText, fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },

  searchBlock: { gap: 6, marginBottom: 14 },
  smallLabel: { fontSize: Typography.size.xs, color: Colors.text.secondary, paddingHorizontal: 2 },
  search: {
    height: 36,
    justifyContent: 'center',
    backgroundColor: Colors.salmonLight,
    borderWidth: 1,
    borderColor: Colors.salmon,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchText: { fontSize: Typography.size.sm, color: Colors.text.secondary },

  group: { gap: 2 },
  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
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
  itemActive: { backgroundColor: Colors.accentLight },
  itemText: { flex: 1, fontSize: Typography.size.base, color: Colors.text.primary },
  itemTextActive: { fontWeight: Typography.weight.semibold },
  square: { width: 10, height: 10, borderRadius: 2 },
  count: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.white, fontSize: Typography.size.xs, fontWeight: Typography.weight.bold },
  empty: { fontSize: Typography.size.sm, color: Colors.text.secondary, paddingHorizontal: 10 },

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
  treeItemActive: { backgroundColor: Colors.salmonLight },
  chevronSpace: { width: 12 },
  treeText: { flex: 1, fontSize: Typography.size.sm, color: Colors.text.primary },
  treeTextActive: { color: Colors.accentDark, fontWeight: Typography.weight.semibold },
  trash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
});
