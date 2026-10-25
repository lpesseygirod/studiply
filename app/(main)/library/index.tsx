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
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { Colors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { getProjects, updateProject, type ProjectWithCount } from '../../../src/services/project.service';
import { getRecentSessions } from '../../../src/services/session.service';
import { trashSession, trashProject } from '../../../src/services/trash.service';
import { getNoteBySession } from '../../../src/services/note.service';
import { exportNoteToPDF } from '../../../src/services/export.service';
import { shouldOfferEarlierVersion } from '../../../src/services/legacyImport';
import { GradientBackground } from '../../../src/components/GradientBackground';
import { NewProjectModal } from '../../../src/components/NewProjectModal';
import UndoToast from '../../../src/components/UndoToast';
import UserAvatar from '../../../src/components/UserAvatar';
import {
  menuTriggerProps,
  promptText,
  showActionSheet,
  showAlert,
  type Anchor,
} from '../../../src/components/dialogs/dialogs';
import { errorMessage } from '../../../src/utils/errors';
import { promptRenameLecture } from '../../../src/utils/rename';
import { lectureItem } from '../../../src/utils/libraryItems';
import { useMoveFlow } from '../../../src/hooks/useMoveFlow';
import { useLibraryUpdates } from '../../../src/lib/cache';
import type { Session } from '../../../src/types/database';

const H_PADDING = 18;
const CARD_GAP = 10;

// Filters shown under the search field (docs/design iphone-01). They fill
// in with step 2.2 (Recent, Starred) and the study phase (Exam packs, Review).
const CHIPS = ['Recent', 'Starred', 'Exam packs', 'Review today'] as const;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatDay(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sessionState(status: Session['status']): string {
  if (status === 'completed') return 'Summary ready';
  if (status === 'processing' || status === 'transcribing') return 'Processing';
  if (status === 'failed') return 'Needs attention';
  return 'Not processed yet';
}

function lectureCount(n: number): string {
  return `${n} lecture${n === 1 ? '' : 's'}`;
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

/** "Later" on the earlier-version card: hidden until the app starts again. */
let earlierDismissed = false;

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const wide = useLayoutMode() === 'wide';
  const { width } = useWindowDimensions();

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewCourse, setShowNewCourse] = useState(false);

  const [undoVisible, setUndoVisible] = useState(false);
  const [undoMessage, setUndoMessage] = useState('');
  const undoCallbackRef = useRef<(() => void) | null>(null);

  // Two recent cards per row on the iPhone (the last one peeks when there are more).
  const contentWidth = wide ? Layout.pageMaxWidth : width - H_PADDING * 2;
  const recentWidth = wide ? 220 : (contentWidth - CARD_GAP) / 2;

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [projectsData, sessionsData] = await Promise.all([
        getProjects(profile.id),
        getRecentSessions(profile.id, 6),
      ]);
      setProjects(projectsData);
      setSessions(sessionsData);
    } catch {
      // non-fatal — just show empty state
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useLibraryUpdates(fetchData);
  const move = useMoveFlow({ showUndo, onChanged: fetchData });

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

  const handleSessionPress = (session: Session) => {
    if (session.status === 'completed') {
      router.push(`/note/${session.id}`);
    } else {
      router.push({
        pathname: '/record/post-session',
        params: { sessionId: session.id, title: session.title },
      });
    }
  };

  function showUndo(message: string, onUndo: () => void) {
    undoCallbackRef.current = onUndo;
    setUndoMessage(message);
    setUndoVisible(true);
  }

  function handleUndo() {
    setUndoVisible(false);
    undoCallbackRef.current?.();
    undoCallbackRef.current = null;
  }

  function comingSoon(what: string) {
    showAlert(what, 'Coming soon.');
  }

  function showSessionActions(session: Session, anchor?: Anchor) {
    showActionSheet(session.title, [
      { text: 'Rename…', onPress: () => renameLecture(session) },
      { text: 'Move to…', onPress: () => move.openMove(lectureItem(session)) },
      { text: 'Export PDF', onPress: () => exportSessionPDF(session) },
      { text: 'Delete Session', style: 'destructive', onPress: () => confirmTrashSession(session) },
    ], { anchor });
  }

  async function renameLecture(session: Session) {
    if (await promptRenameLecture(session)) fetchData();
  }

  async function exportSessionPDF(session: Session) {
    try {
      const note = await getNoteBySession(session.id);
      if (!note) {
        showAlert('No notes yet', 'Process this session first to generate notes for export.');
        return;
      }
      await exportNoteToPDF({ note, session, transcript: null });
    } catch (err) {
      showAlert('Export Failed', err instanceof Error ? err.message : 'Could not export PDF.');
    }
  }

  function showProjectActions(project: ProjectWithCount, anchor?: Anchor) {
    showActionSheet(project.name, [
      { text: 'Rename', onPress: () => promptRenameProject(project) },
      { text: 'Delete Project', style: 'destructive', onPress: () => confirmTrashProject(project) },
    ], { anchor });
  }

  async function promptRenameProject(project: ProjectWithCount) {
    const name = await promptText('Rename Project', { defaultValue: project.name, placeholder: 'Project name' });
    if (!name) return;
    try {
      await updateProject(project.id, { name });
      setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, name } : p)));
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not rename project.'));
    }
  }

  function confirmTrashProject(project: ProjectWithCount) {
    showAlert(
      'Delete Project',
      `"${project.name}" and all its contents will be moved to Recently Deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await trashProject(project.id);
              setProjects(prev => prev.filter(p => p.id !== project.id));
              showUndo(`"${project.name}" moved to trash`, async () => {
                const { restoreItem } = await import('../../../src/services/trash.service');
                await restoreItem({ id: project.id, type: 'project' });
                fetchData();
              });
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Could not delete project.'));
            }
          },
        },
      ]
    );
  }

  function confirmTrashSession(session: Session) {
    showAlert(
      'Delete Session',
      `"${session.title}" will be moved to Recently Deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await trashSession(session.id);
              setSessions(prev => prev.filter(s => s.id !== session.id));
              showUndo(`"${session.title}" moved to trash`, async () => {
                const { restoreItem } = await import('../../../src/services/trash.service');
                await restoreItem({ id: session.id, type: 'session' });
                fetchData();
              });
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Could not delete session.'));
            }
          },
        },
      ]
    );
  }

  return (
    <GradientBackground>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          wide && styles.contentWide,
          { paddingTop: wide ? 28 : insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.text.onGradient} />
        }
      >
        {/* ── Header: on the laptop, search and the avatar are in the top bar ── */}
        <View style={styles.headerRow}>
          <Text style={[styles.title, wide && styles.titleWide]}>{wide ? 'My library' : 'Library'}</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => setShowNewCourse(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="New course"
            >
              <Ionicons name="add" size={22} color={Colors.button.primaryText} />
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
              {CHIPS.map(chip => (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chip, chip === 'Review today' && styles.chipAccent]}
                  onPress={() => comingSoon(chip)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, chip === 'Review today' && styles.chipTextAccent]}>{chip}</Text>
                </TouchableOpacity>
              ))}
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
                {...menuTriggerProps(anchor => showProjectActions(project, anchor))}
                activeOpacity={0.75}
                accessibilityLabel={`${project.name}, ${lectureCount(project.sessionCount)}`}
              >
                <View style={[styles.courseSquare, { backgroundColor: project.color }]} />
                <Text style={styles.courseName} numberOfLines={1}>
                  {project.name}
                </Text>
                <Text style={styles.courseCount}>{project.sessionCount}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.text.secondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Recent ─────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>RECENT</Text>
        {sessions.length === 0 ? (
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
            {sessions.map(session => (
              <TouchableOpacity
                key={session.id}
                style={[styles.recentCard, { width: recentWidth }]}
                onPress={() => handleSessionPress(session)}
                {...menuTriggerProps(anchor => showSessionActions(session, anchor))}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[Colors.accent, Colors.gradient.bottomMid, Colors.gradient.bottomEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.recentLine}
                />
                <Text style={styles.recentTitle} numberOfLines={2}>
                  {session.title}
                </Text>
                <Text style={styles.recentMeta} numberOfLines={1}>
                  {formatDay(session.created_at)} · {sessionState(session.status)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <Text style={styles.hint}>
          {wide ? 'Right-click any item to rename, move or delete it' : 'Long-press any item to rename, move or star it'}
        </Text>
      </ScrollView>

      {profile?.id && (
        <NewProjectModal
          visible={showNewCourse}
          userId={profile.id}
          onClose={() => setShowNewCourse(false)}
          onCreated={() => {
            setShowNewCourse(false);
            fetchData();
          }}
        />
      )}
      {move.modal}
      <UndoToast
        visible={undoVisible}
        message={undoMessage}
        onUndo={handleUndo}
        onDismiss={() => setUndoVisible(false)}
      />
    </GradientBackground>
  );
}

const radius = Layout.cardRadius.iphone;

const styles = StyleSheet.create({
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
    color: Colors.text.primary,
  },
  titleWide: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.button.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search and chips
  searchField: {
    backgroundColor: Colors.salmonLight,
    borderWidth: 1,
    borderColor: Colors.salmon,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchPlaceholder: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },
  // Horizontal rows keep their content's height (React Native Web's ScrollView grows by default).
  chipsScroll: { flexGrow: 0, marginHorizontal: -H_PADDING, marginTop: 14 },
  chips: { gap: 8, paddingHorizontal: H_PADDING, alignItems: 'flex-start' },
  chip: {
    backgroundColor: Colors.white,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipAccent: { backgroundColor: Colors.accentLight },
  chipText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  chipTextAccent: { color: Colors.accentDark, fontWeight: Typography.weight.semibold },

  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginTop: 24,
    marginBottom: 10,
  },

  // Earlier version card (step 1.9)
  earlierCard: {
    marginTop: 20,
    backgroundColor: Colors.white,
    borderRadius: radius,
    padding: 16,
    gap: 6,
  },
  earlierTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: Colors.text.primary },
  earlierText: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  earlierButtons: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  earlierPrimary: { backgroundColor: Colors.button.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  earlierPrimaryText: { color: Colors.button.primaryText, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  earlierLater: { color: Colors.text.secondary, fontSize: Typography.size.sm, fontWeight: Typography.weight.medium },

  // Courses
  listCard: {
    backgroundColor: Colors.white,
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
    borderBottomColor: Colors.surfaceMuted,
  },
  courseSquare: { width: 32, height: 28, borderRadius: 6 },
  courseName: {
    flex: 1,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  courseCount: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },

  // Recent
  recentScroll: { flexGrow: 0, marginHorizontal: -H_PADDING },
  recentRow: { gap: CARD_GAP, paddingHorizontal: H_PADDING, alignItems: 'flex-start' },
  recentCard: {
    backgroundColor: Colors.white,
    borderRadius: radius - 4,
    padding: 12,
    gap: 6,
  },
  recentLine: { width: 32, height: 3, borderRadius: 2 },
  recentTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  recentMeta: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },

  // Empty states
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: radius,
    padding: 16,
  },
  emptyText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },

  hint: {
    fontSize: Typography.size.xs,
    color: Colors.text.onGradient,
    textAlign: 'center',
    marginTop: 20,
  },
});
