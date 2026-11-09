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
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { a11yState } from '../utils/a11y';
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
   * 'either' (a lecture's photo or PDF): tap a lecture to pick it, or
   *   confirm with none picked to move it to the course or folder shown.
   */
  pick?: 'place' | 'lecture' | 'either';
  /** The verb on the confirm buttons: "Move" (default) or "Save". */
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
  confirmLabel = 'Move',
  excludeProjectIds = [],
  excludeFolderIds = [],
  excludeLectureIds = [],
  current,
  onMove,
  onPickLecture,
  onClose,
}: MoveToModalProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RowItem[]>([]);
  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'Courses', type: 'root' }]);
  // 'lecture' mode: the lecture tapped, confirmed with the buttons.
  const [selected, setSelected] = useState<PickedLecture | null>(null);

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
          pick !== 'place' ? getSessionsByProject(currentCrumb.projectId!, parentFolderId) : Promise.resolve([]),
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
      setSelected(prev => (prev?.id === item.data.id ? null : { id: item.data.id, title: item.data.title, label }));
      return;
    }
    setSelected(null);
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
    setSelected(null);
    setCrumbs(prev => prev.slice(0, index + 1));
  }

  function handleConfirm() {
    if (!canConfirm) return;
    if (pick === 'lecture' || (pick === 'either' && selected)) {
      if (selected) onPickLecture?.(selected);
      reset();
      return;
    }

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
    setCrumbs([{ id: null, name: 'Courses', type: 'root' }]);
    setItems([]);
    setSelected(null);
  }

  const here = {
    projectId: currentCrumb.projectId ?? null,
    folderId: currentCrumb.type === 'folder' ? currentCrumb.id : null,
  };
  const isCurrent = !!current && current.projectId === here.projectId && current.folderId === here.folderId;
  const placeLabel = crumbs.slice(1).map(c => c.name).join(' / ');

  // What the confirm buttons do, or why they're off.
  let reason: string | null = null;
  if (pick === 'lecture') {
    if (!selected) reason = 'Choose a lecture';
  } else if (pick === 'either' && selected) {
    reason = null;
  } else if (currentCrumb.type === 'root') {
    reason = pick === 'either' ? 'Choose a course, folder or lecture' : 'Choose a course or folder';
  } else if (isCurrent) {
    reason = 'Already here';
  }
  const canConfirm = reason === null;
  const destination = pick === 'lecture' || (pick === 'either' && selected) ? selected?.label ?? '' : placeLabel;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.headerSide}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          {/* One line, shrinking: a long name must never push the buttons off-screen. */}
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!canConfirm}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            style={styles.headerSide}
          >
            <Text style={[styles.moveText, styles.headerRight, !canConfirm && styles.moveTextDisabled]}>
              {confirmLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Breadcrumbs */}
        <View style={styles.breadcrumbRow}>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <Ionicons name="chevron-forward" size={13} color={c.text.secondary} style={styles.chevron} />
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
            <ActivityIndicator color={c.salmon} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {currentCrumb.type === 'root'
                ? 'No courses yet.'
                : pick !== 'place'
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
              <TouchableOpacity
                style={[styles.row, item.kind === 'lecture' && selected?.id === item.data.id && styles.rowSelected]}
                onPress={() => navigateInto(item)}
                {...a11yState(item.kind === 'lecture' ? { selected: selected?.id === item.data.id } : undefined)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={item.kind === 'project' ? 'folder' : item.kind === 'folder' ? 'folder-open-outline' : 'mic-outline'}
                    size={20}
                    color={item.kind === 'project' ? c.salmon : c.accent}
                  />
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item.kind === 'lecture' ? item.data.title : item.data.name}
                </Text>
                {item.kind !== 'lecture' ? (
                  <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
                ) : selected?.id === item.data.id ? (
                  <Ionicons name="checkmark-circle" size={20} color={c.salmon} />
                ) : null}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
        {/* Always visible, above the home indicator (SafeAreaView bottom edge). */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            activeOpacity={0.85}
          >
            <Text style={[styles.confirmText, !canConfirm && styles.confirmTextDisabled]} numberOfLines={2}>
              {canConfirm ? `${confirmLabel} to ${destination}` : reason}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: c.offWhite,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
    backgroundColor: c.white,
  },
  headerSide: {
    minWidth: 64,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold as '600',
    color: c.text.primary,
  },
  cancelText: {
    fontSize: Typography.size.base,
    color: c.text.secondary,
  },
  moveText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold as '600',
    color: c.salmon,
  },
  moveTextDisabled: {
    color: c.button.disabled,
  },
  rowSelected: {
    backgroundColor: c.salmonLight,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: c.white,
    borderTopWidth: 1,
    borderTopColor: c.surfaceMuted,
  },
  confirmButton: {
    backgroundColor: c.button.primary,
    borderRadius: 14,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: c.surfaceMuted,
  },
  confirmText: {
    color: c.button.primaryText,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold as '600',
    textAlign: 'center',
  },
  confirmTextDisabled: {
    color: c.text.secondary,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: c.white,
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
    gap: 2,
  },
  crumbText: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
  },
  crumbTextActive: {
    color: c.text.primary,
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
    color: c.text.secondary,
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
    backgroundColor: c.white,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: Typography.size.base,
    color: c.text.primary,
  },
  separator: {
    height: 1,
    backgroundColor: c.surfaceMuted,
    marginLeft: 68,
  },
});
