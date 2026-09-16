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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import {
  getProjects,
  updateProject,
  type ProjectWithCount,
} from '../../../src/services/project.service';
import { getFolderCount } from '../../../src/services/folder.service';
import { trashProject } from '../../../src/services/trash.service';
import { NewProjectModal } from '../../../src/components/NewProjectModal';
import UndoToast from '../../../src/components/UndoToast';

const CARD_GAP = 12;
const H_PADDING = 24;

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const [showModal, setShowModal] = useState(false);

  const [undoVisible, setUndoVisible] = useState(false);
  const [undoMessage, setUndoMessage] = useState('');
  const undoCallbackRef = useRef<(() => void) | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - H_PADDING * 2 - CARD_GAP) / 2;

  const fetchProjects = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await getProjects(profile.id);
      setProjects(data);

      // Load folder counts for each project in parallel
      const counts = await Promise.all(
        data.map(p => getFolderCount({ projectId: p.id, parentFolderId: null })
          .then(count => ({ id: p.id, count }))
          .catch(() => ({ id: p.id, count: 0 }))
        )
      );
      setFolderCounts(Object.fromEntries(counts.map(c => [c.id, c.count])));
    } catch {
      // non-fatal
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
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
    Alert.prompt(
      'Rename Project',
      undefined,
      async (name) => {
        if (!name?.trim()) return;
        try {
          await updateProject(project.id, { name: name.trim() });
          setProjects(prev =>
            prev.map(p => p.id === project.id ? { ...p, name: name.trim() } : p)
          );
        } catch {
          Alert.alert('Error', 'Could not rename project.');
        }
      },
      'plain-text',
      project.name
    );
  }

  function confirmTrashProject(project: ProjectWithCount) {
    Alert.alert(
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
                fetchProjects();
              });
            } catch {
              Alert.alert('Error', 'Could not delete project.');
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
        {/* ── Header ────────────────────────────────────────────── */}
        <Text style={styles.appTitle}>STUDIPLY</Text>
        <Text style={styles.screenSubtitle}>Library</Text>
        <Text style={styles.sectionLabel}>PROJECTS</Text>

        {/* ── Project grid ──────────────────────────────────────── */}
        {projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No projects yet. Tap + to create one.</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {projects.map(project => (
            <TouchableOpacity
              key={project.id}
              style={[styles.card, { width: cardWidth, backgroundColor: project.color }]}
              onPress={() => router.push(`/project/${project.id}`)}
              onLongPress={() => showProjectActions(project)}
              activeOpacity={0.85}
              delayLongPress={400}
            >
              <Text style={styles.cardName} numberOfLines={2}>
                {project.name}
              </Text>
              <Text style={styles.cardSubtitle}>
                {(() => {
                  const sc = project.sessionCount;
                  const fc = folderCounts[project.id] ?? 0;
                  if (sc === 0 && fc === 0) return 'Empty';
                  const parts: string[] = [];
                  if (fc > 0) parts.push(`${fc} folder${fc !== 1 ? 's' : ''}`);
                  if (sc > 0) parts.push(`${sc} session${sc !== 1 ? 's' : ''}`);
                  return parts.join(', ');
                })()}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Add button card */}
          <TouchableOpacity
            style={[styles.card, styles.addCard, { width: cardWidth }]}
            onPress={() => setShowModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={32} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {profile?.id && (
        <NewProjectModal
          visible={showModal}
          userId={profile.id}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchProjects();
          }}
        />
      )}

      <UndoToast
        visible={undoVisible}
        message={undoMessage}
        onUndo={handleUndo}
        onDismiss={() => setUndoVisible(false)}
      />
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
  appTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.extrabold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.widest,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 14,
  },

  // Grid
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
  addCard: {
    backgroundColor: Colors.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: 16,
  },
  emptyText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 24,
    gap: 14,
  },
  modalTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  errorText: {
    fontSize: Typography.size.sm,
    color: Colors.error,
    marginTop: -6,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  swatchSelected: {
    borderWidth: 2.5,
    borderColor: Colors.text.primary,
  },
  createButton: {
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    marginTop: 4,
  },
  createButtonText: {
    color: Colors.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
});
