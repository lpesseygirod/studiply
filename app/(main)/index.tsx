import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActionSheetIOS,
  Platform,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/hooks/useAuth';
import { Colors } from '../../src/constants/colors';
import { Typography } from '../../src/constants/typography';
import { getRecentProjects, updateProject, type ProjectWithCount } from '../../src/services/project.service';
import { getRecentSessions } from '../../src/services/session.service';
import { trashSession, trashProject } from '../../src/services/trash.service';
import { getNoteBySession } from '../../src/services/note.service';
import { exportNoteToPDF } from '../../src/services/export.service';
import UndoToast from '../../src/components/UndoToast';
import Avatar from '../../src/components/Avatar';
import type { Session } from '../../src/types/database';

const CARD_GAP = 12;
const H_PADDING = 24;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function sessionStatusIcon(status: Session['status']): {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
} {
  if (status === 'completed') return { name: 'checkmark-circle', color: Colors.success };
  if (status === 'processing' || status === 'transcribing')
    return { name: 'time-outline', color: Colors.gradient.bottom };
  return { name: 'alert-circle-outline', color: Colors.text.secondary };
}

function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [undoVisible, setUndoVisible] = useState(false);
  const [undoMessage, setUndoMessage] = useState('');
  const undoCallbackRef = useRef<(() => void) | null>(null);

  // Rename modal (Android — iOS uses Alert.prompt)
  const [renamingProject, setRenamingProject] = useState<ProjectWithCount | null>(null);
  const [renameText, setRenameText] = useState('');

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - H_PADDING * 2 - CARD_GAP) / 2;

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [projectsData, sessionsData] = await Promise.all([
        getRecentProjects(profile.id, 6),
        getRecentSessions(profile.id, 5),
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

  function showSessionActions(session: Session) {
    const options = ['Export PDF', 'Delete Session', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, destructiveButtonIndex: 1, title: session.title },
        (index) => {
          if (index === 0) exportSessionPDF(session);
          if (index === 1) confirmTrashSession(session);
        }
      );
    } else {
      Alert.alert(session.title, undefined, [
        { text: 'Export PDF', onPress: () => exportSessionPDF(session) },
        { text: 'Delete Session', style: 'destructive', onPress: () => confirmTrashSession(session) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function exportSessionPDF(session: Session) {
    try {
      const note = await getNoteBySession(session.id);
      if (!note) {
        Alert.alert('No notes yet', 'Process this session first to generate notes for export.');
        return;
      }
      await exportNoteToPDF({ note, session, transcript: null });
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export PDF.');
    }
  }

  function showProjectActions(project: ProjectWithCount) {
    const options = ['Rename', 'Delete Project', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, destructiveButtonIndex: 1, title: project.name },
        (index) => {
          if (index === 0) promptRenameProject(project);
          if (index === 1) confirmTrashProject(project);
        }
      );
    } else {
      Alert.alert(project.name, undefined, [
        { text: 'Rename', onPress: () => promptRenameProject(project) },
        { text: 'Delete Project', style: 'destructive', onPress: () => confirmTrashProject(project) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function promptRenameProject(project: ProjectWithCount) {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rename Project',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (newName: string | undefined) => {
              const trimmed = newName?.trim();
              if (trimmed) confirmRenameProject(project, trimmed);
            },
          },
        ],
        'plain-text',
        project.name,
      );
    } else {
      setRenameText(project.name);
      setRenamingProject(project);
    }
  }

  async function confirmRenameProject(project: ProjectWithCount, newName: string) {
    try {
      await updateProject(project.id, { name: newName });
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, name: newName } : p));
    } catch {
      Alert.alert('Error', 'Could not rename project.');
    }
  }

  function confirmTrashProject(project: ProjectWithCount) {
    Alert.alert(
      'Delete Project',
      `"${project.name}" and all its sessions will be moved to Recently Deleted.`,
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
                const { restoreItem } = await import('../../src/services/trash.service');
                await restoreItem({ id: project.id, type: 'project' });
                fetchData();
              });
            } catch {
              Alert.alert('Error', 'Could not delete project.');
            }
          },
        },
      ]
    );
  }

  function confirmTrashSession(session: Session) {
    Alert.alert(
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
                const { restoreItem } = await import('../../src/services/trash.service');
                await restoreItem({ id: session.id, type: 'session' });
                fetchData();
              });
            } catch {
              Alert.alert('Error', 'Could not delete session.');
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.salmon}
          />
        }
      >
        {/* ── App title ─────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.appTitle}>STUDIPLY</Text>
            <Text style={styles.sectionLabel}>WORKPLACE</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/settings/account')}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Avatar size={40} initials={profile?.initials ?? '??'} />
          </TouchableOpacity>
        </View>

        {/* ── Search bar (tappable shortcut) ────────────────────── */}
        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => router.push('/search')}
          activeOpacity={0.85}
        >
          <Ionicons name="search-outline" size={16} color={Colors.text.primary} />
          <Text style={styles.searchPlaceholder}>Search</Text>
        </TouchableOpacity>

        {/* ── Quick actions ─────────────────────────────────────── */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.newAudioChip}
            onPress={() => router.push('/record')}
            activeOpacity={0.8}
          >
            <Text style={styles.newAudioText}>New Audio</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.micButton}
            onPress={() => router.push('/record')}
            activeOpacity={0.8}
          >
            <Ionicons name="mic-outline" size={20} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Recent sessions ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>RECENT SESSIONS</Text>

        {sessions.length === 0 ? (
          <View style={styles.sessionsEmpty}>
            <Text style={styles.sessionsEmptyText}>
              No sessions yet. Record your first lecture!
            </Text>
          </View>
        ) : (
          <View style={styles.sessionsList}>
            {sessions.map((session, index) => {
              const icon = sessionStatusIcon(session.status);
              const dur = formatDuration(session.duration_seconds);
              return (
                <TouchableOpacity
                  key={session.id}
                  style={[
                    styles.sessionRow,
                    index < sessions.length - 1 && styles.sessionRowDivider,
                  ]}
                  onPress={() => handleSessionPress(session)}
                  onLongPress={() => showSessionActions(session)}
                  activeOpacity={0.75}
                  delayLongPress={400}
                >
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                      {session.title}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      {formatShortDate(session.created_at)}
                    </Text>
                  </View>
                  {!!dur && <Text style={styles.sessionDuration}>{dur}</Text>}
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={Colors.text.placeholder}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Recent projects ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>RECENT PROJECTS</Text>

        {projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <TouchableOpacity onPress={() => router.push('/library')} activeOpacity={0.8}>
              <Text style={styles.emptyAction}>Create your first project →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {projects.map(project => (
              <TouchableOpacity
                key={project.id}
                style={[styles.card, { width: cardWidth, backgroundColor: project.color }]}
                onPress={() => router.push(`/project/${project.id}`)}
                onLongPress={() => showProjectActions(project)}
                delayLongPress={400}
                activeOpacity={0.85}
              >
                <Text style={styles.cardName} numberOfLines={2}>
                  {project.name}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {project.sessionCount === 0
                    ? 'Empty'
                    : `${project.sessionCount} session${project.sessionCount !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      <UndoToast
        visible={undoVisible}
        message={undoMessage}
        onUndo={handleUndo}
        onDismiss={() => setUndoVisible(false)}
      />

      {/* ── Rename modal (Android only) ───────────────────────── */}
      <Modal
        visible={renamingProject !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setRenamingProject(null); setRenameText(''); }}
      >
        <View style={styles.renameOverlay}>
          <View style={styles.renameDialog}>
            <Text style={styles.renameTitle}>Rename Project</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              placeholder="Project name"
              placeholderTextColor={Colors.text.placeholder}
              returnKeyType="done"
              onSubmitEditing={() => {
                const trimmed = renameText.trim();
                if (renamingProject && trimmed) {
                  confirmRenameProject(renamingProject, trimmed);
                  setRenamingProject(null);
                  setRenameText('');
                }
              }}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                onPress={() => { setRenamingProject(null); setRenameText(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const trimmed = renameText.trim();
                  if (renamingProject && trimmed) {
                    confirmRenameProject(renamingProject, trimmed);
                    setRenamingProject(null);
                    setRenameText('');
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF9',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: H_PADDING,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  appTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.extrabold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.widest,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 14,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchPlaceholder: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  newAudioChip: {
    flex: 1,
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  newAudioText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.salmon,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sessions list
  sessionsEmpty: {
    paddingVertical: 12,
  },
  sessionsEmptyText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
  },
  sessionsList: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  sessionRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  sessionInfo: { flex: 1, gap: 1 },
  sessionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  sessionMeta: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  sessionDuration: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
    minWidth: 36,
    textAlign: 'right',
  },

  // Project grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  card: {
    aspectRatio: 1,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'flex-end',
  },
  cardName: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
    opacity: 0.65,
  },

  // Empty state
  emptyState: {
    paddingTop: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
  },
  emptyAction: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    textDecorationLine: 'underline',
  },

  // Rename modal (Android)
  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameDialog: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    gap: 16,
  },
  renameTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  renameInput: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
  },
  renameCancelText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  renameSaveText: {
    fontSize: Typography.size.base,
    color: Colors.salmon,
    fontWeight: Typography.weight.semibold,
  },
});
