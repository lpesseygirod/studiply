import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { getProjects, type ProjectWithCount } from '../../../src/services/project.service';
import {
  getExamPacks,
  getRecentItems,
  getReviewDueCount,
  getStarredItems,
} from '../../../src/services/shelf.service';
import { shouldOfferEarlierVersion } from '../../../src/services/legacyImport';
import { GradientBackground } from '../../../src/components/GradientBackground';
import { anchorBelow, useNewMenu } from '../../../src/components/NewMenu';
import { NewCourseDialog } from '../../../src/components/NewCourseDialog';
import { useUndoToast } from '../../../src/hooks/useUndoToast';
import UserAvatar from '../../../src/components/UserAvatar';
import { menuTriggerProps } from '../../../src/components/dialogs/dialogs';
import { useItemMenu } from '../../../src/hooks/useItemMenu';
import { notifyLibraryUpdated, useLibraryUpdates } from '../../../src/lib/cache';
import { courseShelfItem, itemMeta, openTarget, TYPE_ICON, type ShelfItem } from '../../../src/utils/shelf';

const H_PADDING = 18;
// The chips are ~33 pt tall (docs/design); their touch area reaches 44.
const CHIP_SLOP = { top: 6, bottom: 6 };
const CARD_GAP = 10;

// The sections (docs/design iphone-01 chips; the laptop sidebar links here
// with ?section=). Review today opens the Review tab.
const SECTIONS = [
  { key: 'recent', label: 'Recent', empty: 'Nothing here yet.' },
  { key: 'favorites', label: 'Favorites', empty: 'No favorites yet. Long-press (or right-click) an item and choose Add to Favorites.' },
  { key: 'exam-packs', label: 'Exam packs', empty: 'Exam packs you make from a course show up here.' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

function sectionFor(param: string | undefined) {
  return SECTIONS.find(s => s.key === param) ?? null;
}

function loadSection(key: SectionKey): Promise<ShelfItem[]> {
  if (key === 'favorites') return getStarredItems();
  if (key === 'exam-packs') return getExamPacks();
  return getRecentItems(50);
}

function itemCount(n: number): string {
  return `${n} item${n === 1 ? '' : 's'}`;
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

/** "Later" on the earlier-version card: hidden until the app starts again. */
let earlierDismissed = false;

export default function LibraryScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const wide = useLayoutMode() === 'wide';
  const { width } = useWindowDimensions();
  const section = sectionFor(useLocalSearchParams<{ section?: string }>().section);

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [recent, setRecent] = useState<ShelfItem[]>([]);
  // The open section's items (null while loading).
  const [sectionItems, setSectionItems] = useState<ShelfItem[] | null>(null);
  const [reviewDue, setReviewDue] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewCourse, setShowNewCourse] = useState(false);
  const newMenu = useNewMenu();
  const newButtonRef = useRef<View>(null);

  const { showUndo, toast: undoToast } = useUndoToast();

  // Two recent cards per row on the iPhone (the last one peeks when there are more).
  const contentWidth = wide ? Layout.pageMaxWidth : width - H_PADDING * 2;
  const recentWidth = wide ? 220 : (contentWidth - CARD_GAP) / 2;

  const sectionKey = section?.key ?? null;
  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    getReviewDueCount().then(setReviewDue);
    try {
      const [projectsData, items] = await Promise.all([
        getProjects(profile.id),
        sectionKey ? loadSection(sectionKey) : getRecentItems(6),
      ]);
      setProjects(projectsData);
      if (sectionKey) setSectionItems(items);
      else setRecent(items);
    } catch {
      // non-fatal — just show empty state
      if (sectionKey) setSectionItems([]);
    }
  }, [profile?.id, sectionKey]);

  useEffect(() => {
    setSectionItems(null);
  }, [sectionKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useLibraryUpdates(fetchData);
  // The same item menu as the course grid and the sidebar; changes reload through useLibraryUpdates.
  const itemMenu = useItemMenu({ showUndo, onOpen: item => router.push(openTarget(item)) });

  // Step 1.9: the earlier version's data on this iPhone, offered once per app start.
  const [earlier, setEarlier] = useState<{ courses: number; lectures: number; notes: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id || earlierDismissed) return;
      shouldOfferEarlierVersion(profile.id).then(setEarlier).catch(() => setEarlier(null));
    }, [profile?.id]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  /** A chip: open its section, or close it again (back to the overview). */
  function toggleSection(key: SectionKey) {
    router.setParams({ section: sectionKey === key ? undefined : key });
  }

  return (
    <GradientBackground>
      <ThemedStatusBar />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          wide && styles.contentWide,
          { paddingTop: wide ? 28 : insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.text.onGradient} />
        }
      >
        {/* ── Header: on the laptop, search and the avatar are in the top bar ── */}
        <View style={styles.headerRow}>
          {wide && section ? (
            <View style={styles.crumbRow}>
              <TouchableOpacity onPress={() => router.setParams({ section: undefined })} accessibilityRole="link">
                <Text style={[styles.title, styles.titleWide, styles.crumbMuted]}>My library</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={18} color={c.text.onGradient} />
              <Text style={[styles.title, styles.titleWide]}>{section.label}</Text>
            </View>
          ) : (
            <Text style={[styles.title, wide && styles.titleWide]}>{wide ? 'My library' : 'Library'}</Text>
          )}
          <View style={styles.headerButtons}>
            <TouchableOpacity
              ref={newButtonRef}
              style={styles.newButton}
              onPress={() => anchorBelow(newButtonRef).then(newMenu.open)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="New"
              accessibilityHint="Course, folder, upload, recording"
            >
              <Ionicons name="add" size={22} color={c.button.onGradientText} />
            </TouchableOpacity>
            {!wide && (
              <TouchableOpacity
                onPress={() => router.push('/settings/account')}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Account"
              >
                <UserAvatar size={40} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!wide && (
          <>
            <TouchableOpacity style={styles.searchField} onPress={() => router.push('/search')} activeOpacity={0.85}>
              <Text style={styles.searchPlaceholder}>Search notes, lectures, terms…</Text>
            </TouchableOpacity>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {SECTIONS.map(chip => {
                const active = chip.key === sectionKey;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.chip, active && styles.chipActive]}
                    hitSlop={CHIP_SLOP}
                    onPress={() => toggleSection(chip.key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} maxFontSizeMultiplier={1.6}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.chip, styles.chipAccent]}
                hitSlop={CHIP_SLOP}
                onPress={() => router.push('/review')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, styles.chipTextAccent]} maxFontSizeMultiplier={1.6}>
                  {reviewDue ? `Review today · ${reviewDue}` : 'Review today'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </>
        )}

        {/* ── Earlier version (step 1.9) ─────────────────────────── */}
        {earlier && (
          <View style={styles.earlierCard}>
            <Text style={styles.earlierTitle}>Found data from the earlier version on this iPhone</Text>
            <Text style={styles.earlierText}>
              {earlier.courses} {earlier.courses === 1 ? 'course' : 'courses'} · {earlier.lectures}{' '}
              {earlier.lectures === 1 ? 'lecture' : 'lectures'} · {earlier.notes} {earlier.notes === 1 ? 'note' : 'notes'}
            </Text>
            <View style={styles.earlierButtons}>
              <TouchableOpacity
                style={styles.earlierPrimary}
                onPress={() => router.push('/settings/earlier-version')}
                activeOpacity={0.85}
              >
                <Text style={styles.earlierPrimaryText}>Review & upload</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  earlierDismissed = true;
                  setEarlier(null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.earlierLater}>Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── A section (Recent, Favorites, Exam packs) ─────────── */}
        {section && (
          <>
            {!wide && <Text style={styles.sectionLabel}>{section.label.toUpperCase()}</Text>}
            {sectionItems === null ? null : sectionItems.length === 0 ? (
              <View style={[styles.emptyCard, wide && styles.sectionTop]}>
                <Text style={styles.emptyText}>{section.empty}</Text>
              </View>
            ) : (
              <View style={[styles.listCard, wide && styles.sectionTop]} testID="section-list">
                {sectionItems.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.type}-${item.id}`}
                    style={[styles.itemRow, index < sectionItems.length - 1 && styles.rowDivider]}
                    onPress={() => router.push(openTarget(item))}
                    {...menuTriggerProps(anchor => itemMenu.open(item, anchor))}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.itemIcon, { backgroundColor: item.color ?? c.surfaceMuted }]}>
                      <Ionicons name={TYPE_ICON[item.type]} size={16} color={c.text.primary} />
                    </View>
                    <View style={styles.itemText}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.recentMeta} numberOfLines={1}>
                        {item.type !== 'course' && item.courseName ? `${item.courseName} · ` : ''}
                        {itemMeta(item)}
                      </Text>
                    </View>
                    {item.starredAt && (
                      <Ionicons name="star" size={14} color={c.favorite} accessibilityLabel="In Favorites" />
                    )}
                    <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {!section && (
          <>
            {/* ── Courses ────────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>COURSES</Text>
            {projects.length === 0 ? (
              <TouchableOpacity style={styles.emptyCard} onPress={() => setShowNewCourse(true)} activeOpacity={0.85}>
                <Text style={styles.emptyText}>No courses yet. Tap + to create your first one.</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.listCard}>
                {projects.map((project, index) => (
                  <TouchableOpacity
                    key={project.id}
                    style={[styles.courseRow, index < projects.length - 1 && styles.rowDivider]}
                    onPress={() => router.push(`/project/${project.id}`)}
                    {...menuTriggerProps(anchor => itemMenu.open(courseShelfItem(project), anchor))}
                    activeOpacity={0.75}
                    accessibilityLabel={`${project.name}, ${itemCount(project.itemCount)}`}
                  >
                    <View style={[styles.courseSquare, { backgroundColor: project.color }]} />
                    <Text style={styles.courseName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {project.starred_at && <Ionicons name="star" size={14} color={c.favorite} accessibilityLabel="In Favorites" />}
                    <Text style={styles.courseCount}>{project.itemCount}</Text>
                    <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Recent ─────────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>RECENT</Text>
            {recent.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No lectures yet. Record your first one with the red button.</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.recentScroll}
                contentContainerStyle={styles.recentRow}
              >
                {recent.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.recentCard, { width: recentWidth }]}
                    onPress={() => router.push(openTarget(item))}
                    {...menuTriggerProps(anchor => itemMenu.open(item, anchor))}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={[c.accent, c.gradient.bottomMid, c.gradient.bottomEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.recentLine}
                    />
                    <Text style={styles.recentTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>
                      {itemMeta(item)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        <Text style={styles.hint}>
          {wide ? 'Right-click any item to rename, move or add it to Favorites' : 'Long-press any item to rename, move or add it to Favorites'}
        </Text>
      </ScrollView>

      {newMenu.dialog}
      {profile?.id && (
        <NewCourseDialog
          visible={showNewCourse}
          userId={profile.id}
          onClose={() => setShowNewCourse(false)}
          onCreated={() => {
            setShowNewCourse(false);
            notifyLibraryUpdated();
          }}
        />
      )}
      {itemMenu.modal}
      {undoToast}
    </GradientBackground>
  );
}

const radius = Layout.cardRadius.iphone;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: H_PADDING,
  },
  contentWide: {
    width: '100%',
    maxWidth: Layout.pageMaxWidth + 48,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.extrabold,
    color: c.text.onGradientStrong,
  },
  titleWide: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  crumbRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  crumbMuted: { color: c.text.onGradient, fontWeight: Typography.weight.medium },
  newButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.button.onGradient,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search and chips
  searchField: {
    backgroundColor: c.search.bg,
    borderWidth: 1,
    borderColor: c.search.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchPlaceholder: {
    fontSize: Typography.size.base,
    color: c.search.placeholder,
  },
  // Horizontal rows keep their content's height (React Native Web's ScrollView grows by default).
  chipsScroll: { flexGrow: 0, marginHorizontal: -H_PADDING, marginTop: 14 },
  chips: { gap: 8, paddingHorizontal: H_PADDING, alignItems: 'flex-start' },
  chip: {
    backgroundColor: c.white,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: c.accentDark },
  chipTextActive: { color: c.accentOn, fontWeight: Typography.weight.semibold },
  chipAccent: { backgroundColor: c.accentLight },
  chipText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: c.text.primary,
  },
  chipTextAccent: { color: c.accentDark, fontWeight: Typography.weight.semibold },

  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginTop: 24,
    marginBottom: 10,
  },

  // Earlier version card (step 1.9)
  earlierCard: {
    marginTop: 20,
    backgroundColor: c.white,
    borderRadius: radius,
    padding: 16,
    gap: 6,
  },
  earlierTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
  earlierText: { fontSize: Typography.size.sm, color: c.text.secondary },
  earlierButtons: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  earlierPrimary: { backgroundColor: c.button.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  earlierPrimaryText: { color: c.button.primaryText, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  earlierLater: { color: c.text.secondary, fontSize: Typography.size.sm, fontWeight: Typography.weight.medium },

  // Courses
  listCard: {
    backgroundColor: c.white,
    borderRadius: radius,
    overflow: 'hidden',
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
  },
  courseSquare: { width: 32, height: 28, borderRadius: 6 },
  courseName: {
    flex: 1,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    color: c.text.primary,
  },
  courseCount: {
    fontSize: Typography.size.base,
    color: c.text.secondary,
  },

  // Section lists
  sectionTop: { marginTop: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 60,
  },
  itemIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },

  // Recent
  recentScroll: { flexGrow: 0, marginHorizontal: -H_PADDING },
  recentRow: { gap: CARD_GAP, paddingHorizontal: H_PADDING, alignItems: 'flex-start' },
  recentCard: {
    backgroundColor: c.white,
    borderRadius: radius - 4,
    padding: 12,
    gap: 6,
  },
  recentLine: { width: 32, height: 3, borderRadius: 2 },
  recentTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  recentMeta: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },

  // Empty states
  emptyCard: {
    backgroundColor: c.white,
    borderRadius: radius,
    padding: 16,
  },
  emptyText: {
    fontSize: Typography.size.base,
    color: c.text.secondary,
  },

  hint: {
    fontSize: Typography.size.xs,
    color: c.text.onGradient,
    textAlign: 'center',
    marginTop: 20,
  },
});
