import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import type { ScreenKind } from '../../hooks/useLayoutMode';
import { useAuth } from '../../hooks/useAuth';
import { notifyLibraryUpdated, useLibraryUpdates } from '../../lib/cache';
import { getProjects, type ProjectWithCount } from '../../services/project.service';
import { showAlert } from '../dialogs/dialogs';
import { NewProjectModal } from '../NewProjectModal';

/**
 * The laptop's library sidebar (docs/design desktop-01/04): + New, the
 * shortcuts, the courses, Trash. Recent, Starred, Exam packs and the
 * course tree fill in with step 2.2 and later phases.
 */
export function Sidebar({ kind }: { kind: ScreenKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();
  const [courses, setCourses] = useState<ProjectWithCount[]>([]);
  const [showNewCourse, setShowNewCourse] = useState(false);

  const load = useCallback(() => {
    if (!profile?.id) return;
    getProjects(profile.id).then(setCourses).catch(() => {});
  }, [profile?.id]);
  useEffect(load, [load]);
  useLibraryUpdates(load);

  const comingSoon = (what: string) => showAlert(what, 'Coming soon.');

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
          <Item label="Recent" active={pathname === '/library'} onPress={() => router.navigate('/library')} />
          <Item label="Starred" onPress={() => comingSoon('Starred')} />
          <Item label="Exam packs" onPress={() => comingSoon('Exam packs')} />
          <Item label="Review today" active={pathname === '/review'} onPress={() => router.navigate('/review')} />
        </View>

        <Text style={styles.sectionLabel}>COURSES · DROP FILES HERE</Text>
        <View style={styles.group}>
          {courses.map(course => (
            <Item
              key={course.id}
              label={course.name}
              color={course.color}
              count={course.sessionCount}
              active={pathname === `/project/${course.id}`}
              onPress={() => router.navigate(`/project/${course.id}`)}
            />
          ))}
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

function Item({
  label,
  onPress,
  active,
  color,
  count,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  color?: string;
  count?: number;
}) {
  return (
    <Pressable
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: !!active }}
    >
      {color && <View style={[styles.square, { backgroundColor: color }]} />}
      <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && <Text style={styles.count}>{count}</Text>}
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
  empty: { fontSize: Typography.size.sm, color: Colors.text.secondary, paddingHorizontal: 10 },
  trash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
});
