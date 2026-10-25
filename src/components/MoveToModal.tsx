import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { getProjects } from '../services/project.service';
import { getFolders } from '../services/folder.service';
import { getSessionsByProject } from '../services/session.service';
import type { Folder, Project, Session } from '../types/database';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

interface Breadcrumb {
  id: string | null;           // null = "Projects" root
  name: string;
  projectId?: string;          // set when inside a project
  type: 'root' | 'project' | 'folder';
}

export interface MoveTarget {
  projectId: string;
  folderId: string | null;
  label: string;               // human-readable path for confirmation
}

export interface PickedLecture {
  id: string;
  title: string;
  /** "Math / Funcions / Lecture 3", for messages. */
  label: string;
}

interface MoveToModalProps {
  visible: boolean;
  title?: string;              // defaults to "Move to…"
  userId: string;
  /**
   * 'place' (default): pick a course or folder with the header button.
   * 'lecture': lectures are listed too, and tapping one picks it.
   */
  pick?: 'place' | 'lecture';
  /** The header button in 'place' mode (default "Move Here"). */
  confirmLabel?: string;
  /** IDs to exclude from the list (e.g., the item being moved: a folder hides its subfolders too) */
  excludeProjectIds?: string[];
  excludeFolderIds?: string[];
  excludeLectureIds?: string[];
  /** Where the item is now: the header button is off there. */
  current?: { projectId: string | null; folderId: string | null };
  onMove?: (target: MoveTarget) => void;
  onPickLecture?: (lecture: PickedLecture) => void;
  onClose: () => void;
}

/** The hidden lecture that holds a course's own uploads (see session.service). */
const PROJECT_FILES_TITLE = 'Project Files';

// -------------------------------------------------------------------
// Row item union
// -------------------------------------------------------------------
type RowItem =
  | { kind: 'project'; data: Project }
  | { kind: 'folder';  data: Folder }
  | { kind: 'lecture'; data: Session };

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export default function MoveToModal({
  visible,
  title = 'Move to…',
  userId,
  pick = 'place',
  confirmLabel = 'Move Here',
  excludeProjectIds = [],
  excludeFolderIds = [],
  excludeLectureIds = [],
  current,
  onMove,
  onPickLecture,
  onClose,
}: MoveToModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RowItem[]>([]);
  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'Projects', type: 'root' }]);

  const currentCrumb = crumbs[crumbs.length - 1];

  // Reload list whenever the navigation level changes
  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, crumbs.length]);

  async function load() {
    setLoading(true);
    try {
      if (currentCrumb.type === 'root') {
        // Show all projects
        const projects = await getProjects(userId);
        const filtered = projects.filter(p => !excludeProjectIds.includes(p.id));
        setItems(filtered.map(p => ({ kind: 'project', data: p })));

      } else {
        // Show folders at this level
        const parentFolderId =
          currentCrumb.type === 'folder' ? currentCrumb.id : null;

        const [folders, lectures] = await Promise.all([
          getFolders({ projectId: currentCrumb.projectId!, parentFolderId }),
          pick === 'lecture' ? getSessionsByProject(currentCrumb.projectId!, parentFolderId) : Promise.resolve([]),
        ]);
        const filtered = folders.filter(f => !excludeFolderIds.includes(f.id));
        const pickable = lectures.filter(l => l.title !== PROJECT_FILES_TITLE && !excludeLectureIds.includes(l.id));
        setItems([
          ...filtered.map(f => ({ kind: 'folder' as const, data: f })),
          ...pickable.map(l => ({ kind: 'lecture' as const, data: l })),
        ]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function navigateInto(item: RowItem) {
    if (item.kind === 'lecture') {
      const label = [...crumbs.slice(1).map(c => c.name), item.data.title].join(' / ');
      onPickLecture?.({ id: item.data.id, title: item.data.title, label });
      reset();
      return;
    }
    if (item.kind === 'project') {
      setCrumbs(prev => [
        ...prev,
        {
          id: item.data.id,
          name: item.data.name,
          projectId: item.data.id,
          type: 'project',
        },
      ]);
    } else {
      setCrumbs(prev => [
        ...prev,
        {
          id: item.data.id,
          name: item.data.name,
          projectId: prev[prev.length - 1].projectId,
          type: 'folder',
        },
      ]);
    }
  }

  function navigateToCrumb(index: number) {
    setCrumbs(prev => prev.slice(0, index + 1));
  }

  function handleMoveHere() {
    if (currentCrumb.type === 'root') return; // can't move to the root list

    const projectId = currentCrumb.projectId!;
    const folderId = currentCrumb.type === 'folder' ? currentCrumb.id : null;
    const label = crumbs
      .slice(1)
      .map(c => c.name)
      .join(' / ');

    onMove?.({ projectId, folderId, label });
    reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function reset() {
    setCrumbs([{ id: null, name: 'Projects', type: 'root' }]);
    setItems([]);
  }

  const here = {
    projectId: currentCrumb.projectId ?? null,
    folderId: currentCrumb.type === 'folder' ? currentCrumb.id : null,
  };
  const isCurrent = !!current && current.projectId === here.projectId && current.folderId === here.folderId;
  const canMoveHere = currentCrumb.type !== 'root' && !isCurrent;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          {pick === 'place' ? (
            <TouchableOpacity
              onPress={handleMoveHere}
              disabled={!canMoveHere}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityState={{ disabled: !canMoveHere }}
            >
              <Text style={[styles.moveText, !canMoveHere && styles.moveTextDisabled]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          ) : (
            // Keeps the title centred; a lecture is picked by tapping it.
            <View style={styles.headerSpacer} />
          )}
        </View>

        {/* Breadcrumbs */}
        <View style={styles.breadcrumbRow}>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <Ionicons name="chevron-forward" size={13} color={Colors.text.secondary} style={styles.chevron} />
              )}
              <TouchableOpacity
                onPress={() => navigateToCrumb(index)}
                disabled={index === crumbs.length - 1}
              >
                <Text
                  style={[
                    styles.crumbText,
                    index === crumbs.length - 1 && styles.crumbTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {crumb.name}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.salmon} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {currentCrumb.type === 'root'
                ? 'No projects yet.'
                : pick === 'lecture'
                  ? 'No folders or lectures here.'
                  : 'No sub-folders here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => `${item.kind}-${item.data.id}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => navigateInto(item)}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={item.kind === 'project' ? 'folder' : item.kind === 'folder' ? 'folder-open-outline' : 'mic-outline'}
                    size={20}
                    color={item.kind === 'project' ? Colors.salmon : Colors.accent}
                  />
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item.kind === 'lecture' ? item.data.title : item.data.name}
                </Text>
                {item.kind !== 'lecture' && (
                  <Ionicons name="chevron-forward" size={16} color={Colors.text.secondary} />
                )}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------
const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.offWhite,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
    backgroundColor: Colors.white,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.text.primary,
  },
  cancelText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },
  moveText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.salmon,
  },
  moveTextDisabled: {
    color: Colors.button.disabled,
  },
  headerSpacer: {
    width: 72,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
    gap: 2,
  },
  crumbText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
  },
  crumbTextActive: {
    color: Colors.text.primary,
    fontWeight: Typography.weight.medium as '500',
  },
  chevron: {
    marginHorizontal: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginLeft: 68,
  },
});
