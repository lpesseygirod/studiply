import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  BackHandler,
  Platform,
  Dimensions,
  Image,
  Pressable,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getProject } from '../../../src/services/project.service';
import {
  getSessionsByProject,
  getOrCreateProjectUploadSession,
} from '../../../src/services/session.service';
import { getFolders, createFolder, getFolderBreadcrumbs, type Breadcrumb } from '../../../src/services/folder.service';
import { getSessionsWithNotes } from '../../../src/services/note.service';
import { restoreItem, trashSession, trashFolder } from '../../../src/services/trash.service';
import {
  getProjectSourceFiles,
  createSourceFile,
  markDeleted as markSourceFileDeleted,
  sourceFileName,
  fileLabel,
  getLibraryFiles,
  type LibraryFile,
} from '../../../src/services/source-file.service';
import { requestCameraPermission, requestMediaLibraryPermission } from '../../../src/utils/permissions';
import { formatFileSize, getLocalFileSize } from '../../../src/utils/file-size';
import UndoToast from '../../../src/components/UndoToast';
import {
  menuTriggerProps,
  promptText,
  showActionSheet,
  showAlert,
  type Anchor,
} from '../../../src/components/dialogs/dialogs';
import { errorMessage } from '../../../src/utils/errors';
import { promptRenameFile, promptRenameLecture, promptRenameLibraryFile } from '../../../src/utils/rename';
import { folderItem, lectureItem, libraryFileItem } from '../../../src/utils/libraryItems';
import { useMoveFlow } from '../../../src/hooks/useMoveFlow';
import { confirmAction } from '../../../src/utils/confirm';
import { useLibraryUpdates } from '../../../src/lib/cache';
import { withProjectRoot } from '../../../src/utils/breadcrumbs';
import { useShellScreen } from '../../../src/components/shell/ShellContext';
import { starButton } from '../../../src/utils/star';
import type { Project, Session, Folder, SourceFile } from '../../../src/types/database';
import { GradientFill } from '../../../src/components/GradientBackground';

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
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CARD_GAP = 12;
const H_PADDING = 20;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FOLDER_CARD_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP) / 2;

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function ProjectDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // `folder`: open at that folder (links from the laptop sidebar and top bar).
  const { id, folder: folderParam } = useLocalSearchParams<{ id: string; folder?: string }>();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id ?? '';

  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionNoteIds, setSessionNoteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Breadcrumb navigation — first entry is always the project root
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
  const currentFolderId = currentCrumb?.type === 'folder' ? currentCrumb.id : null;

  // New Folder modal
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Undo toast state
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoMessage, setUndoMessage] = useState('');
  const undoCallbackRef = useRef<(() => void) | null>(null);

  // Photos and PDFs saved to the library, at the current level
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([]);

  // Project-level files (photos + PDFs across all sessions)
  const [projectFiles, setProjectFiles] = useState<SourceFile[]>([]);
  const [uploadingCamera, setUploadingCamera] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // -------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------

  const fetchData = useCallback(async (folderId: string | null = currentFolderId) => {
    if (!id) return;
    try {
      const [p, folderList, sessionList, fileList] = await Promise.all([
        getProject(id),
        getFolders({ projectId: id, parentFolderId: folderId }),
        getSessionsByProject(id, folderId),
        getLibraryFiles(id, folderId),
      ]);
      setProject(p);
      setFolders(folderList);
      setSessions(sessionList);
      setLibraryFiles(fileList);

      // Batch-check which sessions have a confirmed note.
      const ids = sessionList.map(s => s.id);
      const noteIds = await getSessionsWithNotes(ids);
      setSessionNoteIds(noteIds);

      // The root crumb always shows the project's current name (it may
      // have been renamed elsewhere); the folder crumbs below it stay.
      setBreadcrumbs(prev => withProjectRoot(prev, p.name));
    } catch {
      setError('Could not load project.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // This screen stays mounted when the student leaves it, so opening
  // another project must start from that project's root (or the linked
  // folder), not from the previous project's breadcrumbs and lists.
  const shownRef = useRef<{ id: string; folderId: string | null } | null>(null);
  useEffect(() => {
    const target = folderParam ?? null;
    const shown = shownRef.current;
    if (shown && shown.id === id && shown.folderId === target) return; // already there
    shownRef.current = { id, folderId: target };
    setBreadcrumbs([]);
    setProject(null);
    setFolders([]);
    setSessions([]);
    setLoading(true);
    if (!target) {
      fetchData(null);
      return;
    }
    getProject(id)
      .then(p => getFolderBreadcrumbs(target, p.name))
      .then(chain => setBreadcrumbs(chain))
      .catch(() => {})
      .finally(() => fetchData(target));
  }, [id, folderParam]);

  // The link follows the folder the student is in, so the sidebar and
  // top bar can bring them back to it.
  function showFolder(folderId: string | null) {
    shownRef.current = { id, folderId };
    router.setParams({ folder: folderId ?? undefined });
  }

  // The laptop shell: Record lecture preselects this course and folder;
  // the sidebar expands this course.
  useShellScreen({ courseId: id ?? null, folderId: currentFolderId });

  // Coming back to the screen (e.g. after a rename in Library) reloads the
  // level the student is on. The first focus is the initial load above.
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;
  const currentFolderIdRef = useRef(currentFolderId);
  currentFolderIdRef.current = currentFolderId;
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      fetchDataRef.current(currentFolderIdRef.current);
    }, [])
  );
  useLibraryUpdates(() => fetchDataRef.current(currentFolderIdRef.current));

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(currentFolderId), fetchProjectFiles()]);
    setRefreshing(false);
  };

  // -------------------------------------------------------------------
  // Android back — pop breadcrumb instead of navigating away
  // -------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (breadcrumbs.length > 1) {
          navigateUp();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [breadcrumbs])
  );

  // -------------------------------------------------------------------
  // Breadcrumb navigation
  // -------------------------------------------------------------------

  function navigateIntoFolder(folder: Folder) {
    const newCrumb: Breadcrumb = { id: folder.id, name: folder.name, type: 'folder' };
    setBreadcrumbs(prev => [...prev, newCrumb]);
    showFolder(folder.id);
    setFolders([]);
    setSessions([]);
    setLoading(true);
    fetchData(folder.id).finally(() => setLoading(false));
  }

  function navigateToCrumb(index: number) {
    const crumb = breadcrumbs[index];
    const folderId = crumb.type === 'folder' ? crumb.id : null;
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    showFolder(folderId);
    setFolders([]);
    setSessions([]);
    setLoading(true);
    fetchData(folderId).finally(() => setLoading(false));
  }

  function navigateUp() {
    if (breadcrumbs.length <= 1) {
      router.back();
      return;
    }
    navigateToCrumb(breadcrumbs.length - 2);
  }

  // -------------------------------------------------------------------
  // Session navigation
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // Long-press action sheets
  // -------------------------------------------------------------------

  function showFolderActions(folder: Folder, anchor?: Anchor) {
    showActionSheet(folder.name, [
      { text: 'Rename', onPress: () => promptRenameFolder(folder) },
      { text: 'Move to…', onPress: () => move.openMove(folderItem(folder)) },
      starButton({ type: 'folder', id: folder.id }, folder.name, folder.starred_at, showUndo),
      { text: 'Delete Folder', style: 'destructive', onPress: () => confirmTrashFolder(folder) },
    ], { anchor });
  }

  function showSessionActions(session: Session, anchor?: Anchor) {
    showActionSheet(session.title, [
      { text: 'View Notes', onPress: () => handleSessionPress(session) },
      { text: 'Rename…', onPress: () => renameLecture(session) },
      { text: 'Export as PDF', onPress: () => exportSessionPDF(session) },
      { text: 'Move to…', onPress: () => move.openMove(lectureItem(session)) },
      starButton({ type: 'file', id: session.id }, session.title, session.starred_at, showUndo),
      { text: 'Delete Session', style: 'destructive', onPress: () => confirmTrashSession(session) },
    ], { anchor });
  }

  async function exportSessionPDF(session: Session) {
    try {
      const { getNoteBySession } = await import('../../../src/services/note.service');
      const { exportNoteToPDF } = await import('../../../src/services/export.service');
      const note = await getNoteBySession(session.id);
      if (!note) {
        showAlert('No Note', 'This session has not been processed yet.');
        return;
      }
      await exportNoteToPDF({ note, session, transcript: null, projectName: project?.name });
    } catch {
      showAlert('Error', 'Could not export PDF.');
    }
  }

  function showFileActions(file: SourceFile, anchor?: Anchor) {
    const name = fileLabel(file, projectFiles);
    showActionSheet(name, [
      { text: 'Rename…', onPress: () => renameFile(file) },
      { text: 'Move to another lecture…', onPress: () => move.openMoveMedia(file, name) },
      { text: 'Save to library…', onPress: () => move.openSaveToLibrary(file, name) },
      { text: Platform.OS === 'web' ? 'Open / Download' : 'Export / Share', onPress: () => shareFile(file) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteFile(file) },
    ], { anchor });
  }

  async function renameFile(file: SourceFile) {
    const renamed = await promptRenameFile(file, projectFiles);
    if (renamed) setProjectFiles(prev => prev.map(f => (f.id === renamed.id ? renamed : f)));
  }

  async function renameLecture(session: Session) {
    if (await promptRenameLecture(session)) fetchData(currentFolderId);
  }

  async function shareFile(file: SourceFile) {
    // A browser has no share sheet: open the file's signed link in a new tab.
    if (Platform.OS === 'web') {
      window.open(file.file_path, '_blank', 'noopener');
      return;
    }
    try {
      const Sharing = await import('expo-sharing');
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showAlert('Sharing not available', 'Your device does not support sharing.');
        return;
      }
      // file_path is a signed link; the share sheet needs a file on the device.
      const FileSystem = await import('expo-file-system/legacy');
      const ext = file.file_type === 'photo' ? 'jpg' : 'pdf';
      const name = file.file_type === 'pdf' ? sourceFileName(file).replace(/[^\p{L}\p{N}._-]+/gu, '_') : `photo-${file.id}.${ext}`;
      const local = `${FileSystem.cacheDirectory}${name.endsWith(`.${ext}`) ? name : `${name}.${ext}`}`;
      const { uri } = await FileSystem.downloadAsync(file.file_path, local);
      await Sharing.shareAsync(uri);
    } catch {
      showAlert('Error', 'Could not share file.');
    }
  }

  function confirmDeleteFile(file: SourceFile) {
    showAlert('Delete File', 'This file will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await markSourceFileDeleted(file.id);
            setProjectFiles(prev => prev.filter(f => f.id !== file.id));
          } catch (err) {
            showAlert('Error', errorMessage(err, 'Could not delete file.'));
          }
        },
      },
    ]);
  }

  // -------------------------------------------------------------------
  // Folder rename
  // -------------------------------------------------------------------

  async function promptRenameFolder(folder: Folder) {
    const name = await promptText('Rename Folder', { defaultValue: folder.name, placeholder: 'Folder name' });
    if (!name) return;
    try {
      const { renameFolder } = await import('../../../src/services/folder.service');
      await renameFolder(folder.id, name);
      await fetchData(currentFolderId);
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not rename folder.'));
    }
  }

  // -------------------------------------------------------------------
  // Folder trash
  // -------------------------------------------------------------------

  function confirmTrashFolder(folder: Folder) {
    showAlert(
      'Delete Folder',
      `"${folder.name}" and all its contents will be moved to Recently Deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await trashFolder(folder.id);
              setFolders(prev => prev.filter(f => f.id !== folder.id));
              showUndo(`"${folder.name}" moved to trash`, async () => {
                const { restoreItem } = await import('../../../src/services/trash.service');
                await restoreItem({ id: folder.id, type: 'folder' });
                fetchData(currentFolderId);
              });
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Could not delete folder.'));
            }
          },
        },
      ]
    );
  }

  // -------------------------------------------------------------------
  // Session trash
  // -------------------------------------------------------------------

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
                fetchData(currentFolderId);
              });
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Could not delete session.'));
            }
          },
        },
      ]
    );
  }

  // -------------------------------------------------------------------
  // Undo toast
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // New Folder
  // -------------------------------------------------------------------

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name || !id || !userId) return;
    setIsCreatingFolder(true);
    try {
      await createFolder({
        userId,
        projectId: id,
        parentFolderId: currentFolderId,
        name,
      });
      setShowNewFolder(false);
      setNewFolderName('');
      await fetchData(currentFolderId);
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not create folder.'));
    } finally {
      setIsCreatingFolder(false);
    }
  }

  // -------------------------------------------------------------------
  // Project files
  // -------------------------------------------------------------------

  const fetchProjectFiles = useCallback(async () => {
    if (!id) return;
    try {
      const files = await getProjectSourceFiles(id);
      setProjectFiles(files);
    } catch {
      // non-fatal
    }
  }, [id]);

  useEffect(() => {
    fetchProjectFiles();
  }, [fetchProjectFiles]);

  // "Move to…", "Move to another lecture…", "Save to library…" (with Undo).
  const move = useMoveFlow({
    showUndo,
    onChanged: () => {
      fetchData(currentFolderIdRef.current);
      fetchProjectFiles();
    },
  });

  // -------------------------------------------------------------------
  // Files saved to the library
  // -------------------------------------------------------------------

  function showLibraryFileActions(file: LibraryFile, anchor?: Anchor) {
    showActionSheet(file.title, [
      { text: Platform.OS === 'web' ? 'Open / Download' : 'Open / Share', onPress: () => openLibraryFile(file) },
      { text: 'Rename…', onPress: () => renameLibraryFile(file) },
      { text: 'Move to…', onPress: () => move.openMove(libraryFileItem(file)) },
      starButton({ type: 'file', id: file.id }, file.title, file.starredAt, showUndo),
      { text: 'Delete', style: 'destructive', onPress: () => trashLibraryFile(file) },
    ], { anchor });
  }

  function openLibraryFile(file: LibraryFile) {
    if (!file.media?.file_path) {
      showAlert('Not available', "This file can't be opened right now. Check your connection.");
      return;
    }
    if (file.kind === 'image') setPreviewUri(file.media.file_path);
    else shareFile({ ...file.media, display_name: file.title });
  }

  async function renameLibraryFile(file: LibraryFile) {
    const renamed = await promptRenameLibraryFile(file);
    if (renamed) setLibraryFiles(prev => prev.map(f => (f.id === renamed.id ? renamed : f)));
  }

  async function trashLibraryFile(file: LibraryFile) {
    if (!(await confirmAction('Delete File', `"${file.title}" will be moved to Recently Deleted.`, 'Delete'))) return;
    try {
      await trashSession(file.id);
      setLibraryFiles(prev => prev.filter(f => f.id !== file.id));
      showUndo(`"${file.title}" moved to trash`, async () => {
        await restoreItem({ id: file.id, type: 'session' });
        fetchData(currentFolderIdRef.current);
      });
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not delete the file.'));
    }
  }

  // ── Take Photo ────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    if (!userId || !id) return;
    const granted = await requestCameraPermission();
    if (!granted) return;

    setUploadingCamera(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0]!;
        const uploadSession = await getOrCreateProjectUploadSession(userId, id);
        const fileSize = asset.fileSize ?? (await getLocalFileSize(asset.uri)) ?? undefined;
        const newFile = await createSourceFile({
          userId,
          sessionId: uploadSession.id,
          fileType: 'photo',
          filePath: asset.uri,
          size: { width: asset.width, height: asset.height },
          fileSizeBytes: fileSize,
          mimeType: 'image/jpeg',
        });
        setProjectFiles(prev => [newFile, ...prev]);
      }
    } catch {
      showAlert('Error', 'Could not capture photo. Please try again.');
    } finally {
      setUploadingCamera(false);
    }
  };

  // ── Upload from Gallery ───────────────────────────────────────
  const handlePickPhotos = async () => {
    if (!userId || !id) return;
    const granted = await requestMediaLibraryPermission();
    if (!granted) return;

    setUploadingGallery(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uploadSession = await getOrCreateProjectUploadSession(userId, id);
        const newFiles = await Promise.all(
          result.assets.map(async asset => {
            const fileSize = asset.fileSize ?? (await getLocalFileSize(asset.uri)) ?? undefined;
            return createSourceFile({
              userId,
              sessionId: uploadSession.id,
              fileType: 'photo',
              filePath: asset.uri,
              size: { width: asset.width, height: asset.height },
              fileSizeBytes: fileSize,
              mimeType: 'image/jpeg',
            });
          })
        );
        setProjectFiles(prev => [...newFiles, ...prev]);
      }
    } catch {
      showAlert('Error', 'Could not pick photos. Please try again.');
    } finally {
      setUploadingGallery(false);
    }
  };

  // ── Upload PDF ────────────────────────────────────────────────
  const handlePickDocuments = async () => {
    if (!userId || !id) return;
    setUploadingDocs(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uploadSession = await getOrCreateProjectUploadSession(userId, id);
        const newFiles = await Promise.all(
          result.assets.map(async asset => {
            const fileSize = asset.size ?? (await getLocalFileSize(asset.uri)) ?? undefined;
            return createSourceFile({
              userId,
              sessionId: uploadSession.id,
              fileType: 'pdf',
              filePath: asset.uri,
              fileName: asset.name,
              fileSizeBytes: fileSize,
              mimeType: asset.mimeType ?? 'application/pdf',
            });
          })
        );
        setProjectFiles(prev => [...newFiles, ...prev]);
      }
    } catch {
      showAlert('Error', 'Could not pick documents. Please try again.');
    } finally {
      setUploadingDocs(false);
    }
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  const isRoot = breadcrumbs.length <= 1;

  return (
    <View style={styles.container}>
      <GradientFill />
      <StatusBar style="dark" />

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={navigateUp}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {project && isRoot && (
            <View style={[styles.projectColorDot, { backgroundColor: project.color }]} />
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentCrumb?.name ?? project?.name ?? ''}
          </Text>
        </View>

        <View style={styles.iconButton} />
      </View>

      {/* ── Breadcrumbs (when inside a folder) ────────────────── */}
      {!isRoot && (
        <View style={styles.breadcrumbRow}>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={Colors.text.secondary}
                  style={styles.breadcrumbChevron}
                />
              )}
              <TouchableOpacity
                onPress={() => navigateToCrumb(index)}
                disabled={index === breadcrumbs.length - 1}
              >
                <Text
                  style={[
                    styles.crumbText,
                    index === breadcrumbs.length - 1 && styles.crumbTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {crumb.name}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.salmon} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
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
          {/* ── Upload action buttons ────────────────────────── */}
          <View style={styles.uploadRow}>
              <UploadButton
                icon="camera-outline"
                label="Take Photo"
                loading={uploadingCamera}
                onPress={handleTakePhoto}
              />
              <UploadButton
                icon="images-outline"
                label="Upload Photo"
                loading={uploadingGallery}
                onPress={handlePickPhotos}
              />
              <UploadButton
                icon="document-outline"
                label="Upload File"
                loading={uploadingDocs}
                onPress={handlePickDocuments}
              />
            </View>

          {/* ── Project Files section ────────────────────────── */}
          {projectFiles.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>PROJECT FILES</Text>
              <View style={styles.filesList}>
                {projectFiles.map((file, index) => {
                  const isPhoto = file.file_type === 'photo';
                  const label = fileLabel(file, projectFiles);

                  return (
                    <TouchableOpacity
                      key={file.id}
                      style={[
                        styles.fileRow,
                        index < projectFiles.length - 1 && styles.fileRowDivider,
                      ]}
                      onPress={isPhoto ? () => setPreviewUri(file.file_path) : undefined}
                      {...menuTriggerProps(anchor => showFileActions(file, anchor))}
                      activeOpacity={0.75}
                    >
                      {isPhoto ? (
                        <Image
                          source={{ uri: file.file_path }}
                          style={styles.fileThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.fileIconWrap}>
                          <Ionicons name="document-text" size={18} color={Colors.text.secondary} />
                        </View>
                      )}
                      <View style={styles.fileInfo}>
                        <Text style={styles.fileName} numberOfLines={1}>{label}</Text>
                        <Text style={styles.fileMeta}>
                          {formatShortDate(file.created_at)}
                          {file.file_size_bytes != null ? ` · ${formatFileSize(file.file_size_bytes)}` : ''}
                        </Text>
                      </View>
                      {isPhoto && (
                        <Ionicons name="chevron-forward" size={16} color={Colors.text.placeholder} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Folder grid ──────────────────────────────────── */}
          {folders.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, projectFiles.length > 0 && { marginTop: 24 }]}>FOLDERS</Text>
              <View style={styles.folderGrid}>
                {folders.map(folder => (
                  <TouchableOpacity
                    key={folder.id}
                    style={styles.folderCard}
                    onPress={() => navigateIntoFolder(folder)}
                    {...menuTriggerProps(anchor => showFolderActions(folder, anchor))}
                    activeOpacity={0.8}
                  >
                    <View style={styles.folderIconWrap}>
                      <Ionicons name="folder" size={28} color={Colors.salmon} />
                    </View>
                    <Text style={styles.folderName} numberOfLines={2}>
                      {folder.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ── Files saved to the library ────────────────────── */}
          {libraryFiles.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, folders.length > 0 && { marginTop: 24 }]}>FILES</Text>
              <View style={styles.filesList}>
                {libraryFiles.map((file, index) => (
                  <TouchableOpacity
                    key={file.id}
                    style={[styles.fileRow, index < libraryFiles.length - 1 && styles.fileRowDivider]}
                    onPress={() => openLibraryFile(file)}
                    {...menuTriggerProps(anchor => showLibraryFileActions(file, anchor))}
                    activeOpacity={0.75}
                  >
                    {file.kind === 'image' && file.media?.file_path ? (
                      <Image source={{ uri: file.media.file_path }} style={styles.fileThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.fileIconWrap}>
                        <Ionicons
                          name={file.kind === 'image' ? 'image-outline' : 'document-text'}
                          size={18}
                          color={Colors.text.secondary}
                        />
                      </View>
                    )}
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.title}</Text>
                      <Text style={styles.fileMeta}>
                        {formatShortDate(file.createdAt)}
                        {file.media?.file_size_bytes != null ? ` · ${formatFileSize(file.media.file_size_bytes)}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ── Sessions list ─────────────────────────────────── */}
          {sessions.filter(s => s.title !== 'Project Files').length > 0 && (
            <>
              <Text style={[styles.sectionLabel, (folders.length > 0 || libraryFiles.length > 0) && { marginTop: 24 }]}>
                SESSIONS
              </Text>
              <View style={styles.sessionsList}>
                {sessions.filter(s => s.title !== 'Project Files').map((session, index, arr) => {
                  const icon = sessionStatusIcon(session.status);
                  const dur = formatDuration(session.duration_seconds);
                  const hasNote = sessionNoteIds.has(session.id);
                  return (
                    <TouchableOpacity
                      key={session.id}
                      style={[
                        styles.sessionRow,
                        index < arr.length - 1 && styles.sessionRowDivider,
                      ]}
                      onPress={() => handleSessionPress(session)}
                      {...menuTriggerProps(anchor => showSessionActions(session, anchor))}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={icon.name} size={22} color={icon.color} />
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionTitle} numberOfLines={1}>
                          {session.title}
                        </Text>
                        <View style={styles.sessionMetaRow}>
                          <Text style={styles.sessionMeta}>
                            {formatShortDate(session.created_at)}
                          </Text>
                          {hasNote && (
                            <View style={styles.noteBadge}>
                              <Text style={styles.noteBadgeText}>Notes ✓</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {!!dur && <Text style={styles.sessionDuration}>{dur}</Text>}
                      <Ionicons name="chevron-forward" size={16} color={Colors.text.placeholder} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Empty state ───────────────────────────────────── */}
          {folders.length === 0 && sessions.filter(s => s.title !== 'Project Files').length === 0 && projectFiles.length === 0 && libraryFiles.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={44} color={Colors.text.placeholder} />
              <Text style={styles.emptyTitle}>
                {isRoot ? 'No sessions yet' : 'Empty folder'}
              </Text>
              <Text style={styles.emptyBody}>
                {isRoot
                  ? 'Start a recording or create a folder to organise your sessions.'
                  : 'Start a recording to add sessions here.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Dual FAB ──────────────────────────────────────────── */}
      {!loading && !error && (
        <View style={[styles.fabContainer, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.fab, styles.fabSecondary]}
            onPress={() => {
              setNewFolderName('');
              setShowNewFolder(true);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="folder-outline" size={18} color={Colors.text.primary} />
            <Text style={styles.fabSecondaryText}>New Folder</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              router.push({
                pathname: '/record',
                params: {
                  projectId: id,
                  ...(currentFolderId ? { folderId: currentFolderId } : {}),
                },
              });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="mic-outline" size={18} color={Colors.white} />
            <Text style={styles.fabText}>New Recording</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── New Folder modal ──────────────────────────────────── */}
      <Modal
        visible={showNewFolder}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewFolder(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewFolder(false)}>
          <KeyboardAvoidingView
            style={styles.modalKAV}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable>
              <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
                <Text style={styles.modalTitle}>New Folder</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Folder name"
                  placeholderTextColor={Colors.text.placeholder}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateFolder}
                />
                <TouchableOpacity
                  style={[styles.createButton, isCreatingFolder && { opacity: 0.6 }]}
                  onPress={handleCreateFolder}
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  activeOpacity={0.85}
                >
                  {isCreatingFolder ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.createButtonText}>Create</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowNewFolder(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {move.modal}

      {/* ── Undo toast ────────────────────────────────────────── */}
      <UndoToast
        visible={undoVisible}
        message={undoMessage}
        onUndo={handleUndo}
        onDismiss={() => setUndoVisible(false)}
      />

      {/* ── Photo preview modal ───────────────────────────────── */}
      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <View style={styles.previewOverlay}>
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// -------------------------------------------------------------------
// UploadButton sub-component
// -------------------------------------------------------------------

function UploadButton({
  icon,
  label,
  loading,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.uploadButton}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      <View style={styles.uploadButtonIcon}>
        {loading ? (
          <ActivityIndicator color={Colors.text.secondary} size="small" />
        ) : (
          <Ionicons name={icon} size={22} color={Colors.text.secondary} />
        )}
      </View>
      <Text style={styles.uploadButtonLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  projectColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold as '700',
    color: Colors.text.primary,
    flexShrink: 1,
  },

  // Breadcrumbs
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
    gap: 2,
  },
  crumbText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  crumbTextActive: {
    color: Colors.text.primary,
    fontWeight: Typography.weight.medium as '500',
  },
  breadcrumbChevron: {
    marginHorizontal: 2,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 20,
  },

  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold as '700',
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 12,
  },

  // Folder grid
  folderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  folderCard: {
    width: FOLDER_CARD_WIDTH,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    padding: 14,
    gap: 10,
  },
  folderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.text.primary,
  },

  // Sessions list
  sessionsList: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  sessionRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  sessionInfo: { flex: 1, gap: 2 },
  sessionTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.text.primary,
  },
  sessionMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  sessionMeta: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  noteBadge: {
    backgroundColor: Colors.success + '22',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  noteBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.success,
    letterSpacing: 0.2,
  },
  sessionDuration: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium as '500',
    color: Colors.text.secondary,
    minWidth: 40,
    textAlign: 'right',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold as '700',
    color: Colors.text.primary,
  },
  emptyBody: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: Typography.size.base * Typography.leading.relaxed,
    maxWidth: 280,
  },

  // Dual FAB
  fabContainer: {
    position: 'absolute',
    left: H_PADDING,
    right: H_PADDING,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  fabSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.surfaceMuted,
    // Its own width (React Native Web reads `flex: 0` as a zero width).
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingHorizontal: 18,
  },
  fabText: {
    color: Colors.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold as '600',
    letterSpacing: Typography.tracking.wide,
  },
  fabSecondaryText: {
    color: Colors.text.primary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium as '500',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalKAV: {
    width: '100%',
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
    fontWeight: Typography.weight.bold as '700',
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
    fontWeight: Typography.weight.semibold as '600',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium as '500',
  },

  // Error
  errorText: {
    fontSize: Typography.size.base,
    color: Colors.error,
  },

  // Upload action buttons
  uploadRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  uploadButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  uploadButtonIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: Colors.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonLabel: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium as '500',
    textAlign: 'center',
  },

  // Project files list
  filesList: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  fileRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  fileThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.text.primary,
  },
  fileMeta: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },

  // Photo preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
});
