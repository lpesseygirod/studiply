import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '../../../src/components/IconButton';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  BackHandler,
  Platform,
  Image,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useAuth } from '../../../src/hooks/useAuth';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { LightColors, type ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getProject } from '../../../src/services/project.service';
import {
  getSessionsByProject,
  getOrCreateProjectUploadSession,
} from '../../../src/services/session.service';
import { getFolders, createFolder, getFolderBreadcrumbs, renameFolder, type Breadcrumb } from '../../../src/services/folder.service';
import { restoreItem, trashSession, trashFolder } from '../../../src/services/trash.service';
import {
  getProjectSourceFiles,
  createSourceFile,
  markDeleted as markSourceFileDeleted,
  sourceFileName,
  fileLabel,
  sameLectureFiles,
  getLibraryFiles,
  type LibraryFile,
} from '../../../src/services/source-file.service';
import { requestCameraPermission, requestMediaLibraryPermission } from '../../../src/utils/permissions';
import { formatFileSize, getLocalFileSize } from '../../../src/utils/file-size';
import UndoToast from '../../../src/components/UndoToast';
import {
  menuTriggerProps,
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
import { useShellCommand, useShellScreen } from '../../../src/components/shell/ShellContext';
import { LibraryGrid, type NameEditing } from '../../../src/components/library/LibraryGrid';
import { LibraryHeader } from '../../../src/components/library/LibraryHeader';
import { LibraryToolbar } from '../../../src/components/library/LibraryToolbar';
import { getCourseContents } from '../../../src/services/shelf.service';
import { useLibraryPrefs } from '../../../src/lib/libraryPrefs';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { sortEntries } from '../../../src/utils/libraryGrid';
import type { ShelfItem } from '../../../src/utils/shelf';
import { starButton } from '../../../src/utils/star';
import type { Project, Session, Folder, SourceFile } from '../../../src/types/database';
import { GradientFill } from '../../../src/components/GradientBackground';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const H_PADDING = 20;

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function ProjectDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // `folder`: open at that folder (links from the laptop sidebar and top bar).
  const { id, folder: folderParam } = useLocalSearchParams<{ id: string; folder?: string }>();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id ?? '';

  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Breadcrumb navigation — first entry is always the project root
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
  const currentFolderId = currentCrumb?.type === 'folder' ? currentCrumb.id : null;

  // The Finder-style grid (step 3.2): this level's items, the selection
  // (web), a folder being named in place, and how this device shows them.
  const [entries, setEntries] = useState<ShelfItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<NameEditing>(null);
  const [libraryPrefs, setLibraryPrefs] = useLibraryPrefs();
  const compact = useLayoutMode() === 'compact';

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
      const [p, folderList, sessionList, fileList, contents] = await Promise.all([
        getProject(id),
        getFolders({ projectId: id, parentFolderId: folderId }),
        getSessionsByProject(id, folderId),
        getLibraryFiles(id, folderId),
        getCourseContents(id, folderId),
      ]);
      setProject(p);
      setFolders(folderList);
      setSessions(sessionList);
      setLibraryFiles(fileList);
      setEntries(contents);

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
    setEntries([]);
    setSelectedId(null);
    setEditing(null);
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

  // ⌥⇧N on the web: a new folder here, named in place.
  useShellCommand('newFolder', () => startNewFolder());

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
    setEntries([]);
    setSelectedId(null);
    setEditing(null);
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
    setEntries([]);
    setSelectedId(null);
    setEditing(null);
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
      { text: 'Rename', onPress: () => setEditing({ mode: 'rename', id: folder.id }) },
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
    const name = fileLabel(file, sameLectureFiles(file, projectFiles));
    showActionSheet(name, [
      { text: 'Rename…', onPress: () => renameFile(file) },
      { text: 'Move to another lecture…', onPress: () => move.openMoveMedia(file, name) },
      { text: 'Save to library…', onPress: () => move.openSaveToLibrary(file, name) },
      starButton({ type: 'media', id: file.id }, name, file.starred_at ?? null, showUndo, starred_at =>
        setProjectFiles(prev => prev.map(f => (f.id === file.id ? { ...f, starred_at } : f))),
      ),
      { text: Platform.OS === 'web' ? 'Open / Download' : 'Export / Share', onPress: () => shareFile(file) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteFile(file) },
    ], { anchor });
  }

  async function renameFile(file: SourceFile) {
    const renamed = await promptRenameFile(file, sameLectureFiles(file, projectFiles));
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
  // New folder and rename, in place on the tile (step 3.2)
  // -------------------------------------------------------------------

  function startNewFolder() {
    setSelectedId(null);
    setEditing({ mode: 'new' });
  }

  /** Enter or a tap elsewhere: create or rename. False keeps the field open. */
  async function saveName(raw: string): Promise<boolean> {
    const current = editing;
    if (!current || !id) return true;
    try {
      if (current.mode === 'new') {
        const created = await createFolder({
          userId,
          projectId: id,
          parentFolderId: currentFolderId,
          name: raw.trim() || 'Untitled folder',
        });
        setEditing(null);
        setSelectedId(created.id);
      } else {
        const before = entries.find(e => e.id === current.id)?.title;
        setEditing(null);
        if (raw.trim() && raw.trim() !== before) await renameFolder(current.id, raw);
      }
      await fetchData(currentFolderId);
      return true;
    } catch (err) {
      showAlert(current.mode === 'new' ? 'Could not create the folder' : 'Could not rename the folder', errorMessage(err, err instanceof Error ? err.message : 'Please try again.'));
      if (current.mode === 'rename') setEditing(current);
      return false;
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
  // Grid items: open and menu, through the screen's existing actions
  // -------------------------------------------------------------------

  function openEntry(item: ShelfItem) {
    if (item.type === 'folder') {
      const folder = folders.find(f => f.id === item.id);
      if (folder) navigateIntoFolder(folder);
      return;
    }
    if (item.type === 'lecture') {
      const session = sessions.find(s => s.id === item.id);
      if (session) handleSessionPress(session);
      return;
    }
    const file = libraryFiles.find(f => f.id === item.id);
    if (file) return openLibraryFile(file);
    showAlert(item.title, 'This kind of file opens with the editor. Coming soon.');
  }

  function entryMenu(item: ShelfItem, anchor?: Anchor) {
    setSelectedId(item.id);
    const folder = item.type === 'folder' ? folders.find(f => f.id === item.id) : undefined;
    if (folder) return showFolderActions(folder, anchor);
    const session = item.type === 'lecture' ? sessions.find(s => s.id === item.id) : undefined;
    if (session) return showSessionActions(session, anchor);
    const file = libraryFiles.find(f => f.id === item.id);
    if (file) return showLibraryFileActions(file, anchor);
    showActionSheet(item.title, [
      { text: 'Open', onPress: () => openEntry(item) },
      starButton({ type: 'file', id: item.id }, item.title, item.starredAt, showUndo),
    ], { anchor });
  }

  function chooseUpload() {
    showActionSheet('Upload to this course', [
      { text: 'Photos', onPress: () => handlePickPhotos().then(() => setLibraryPrefs({ lecturePhotosOpen: true })) },
      { text: 'PDF', onPress: () => handlePickDocuments().then(() => setLibraryPrefs({ lecturePhotosOpen: true })) },
    ]);
  }

  const sortedEntries = sortEntries(entries, libraryPrefs.sort);
  const view = compact ? libraryPrefs.view : 'grid';

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      {loading ? (
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <ActivityIndicator color={c.text.onGradientStrong} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.text.onGradientStrong} />
          }
        >
          {/* ── My library › Course › Folder · N items, Sort, grid/list ── */}
          <LibraryHeader
            crumbs={breadcrumbs.map(b => b.name)}
            onLibrary={() => router.navigate('/library')}
            onCrumb={navigateToCrumb}
            count={entries.length}
            sort={libraryPrefs.sort}
            onSort={sort => setLibraryPrefs({ sort })}
            view={view}
            onToggleView={() => setLibraryPrefs({ view: view === 'grid' ? 'list' : 'grid' })}
            showViewToggle={compact}
            onBack={navigateUp}
          />

          <LibraryToolbar
            onNewFolder={startNewFolder}
            onUpload={chooseUpload}
            onTakePhoto={handleTakePhoto}
            onRecord={() =>
              router.push({
                pathname: '/record',
                params: { projectId: id, ...(currentFolderId ? { folderId: currentFolderId } : {}) },
              })
            }
            uploading={uploadingCamera || uploadingGallery || uploadingDocs}
          />

          {/* ── The items (docs/design desktop-04) ─────────────────── */}
          {sortedEntries.length === 0 && !editing ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={44} color={c.text.onGradient} />
              <Text style={styles.emptyTitle}>{breadcrumbs.length > 1 ? 'This folder is empty' : 'Nothing here yet'}</Text>
              <Text style={styles.emptyBody}>Make a folder, upload a file or record a lecture here.</Text>
            </View>
          ) : (
            <Pressable onPress={() => setSelectedId(null)} accessible={false} style={styles.gridArea}>
              <LibraryGrid
                items={sortedEntries}
                view={view}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onOpen={openEntry}
                onMenu={entryMenu}
                editing={editing}
                onSaveName={saveName}
                onCancelName={() => setEditing(null)}
                thumbnailFor={item =>
                  item.type === 'image' ? libraryFiles.find(f => f.id === item.id)?.media?.file_path || undefined : undefined
                }
              />
            </Pressable>
          )}

          {/* ── Photos & PDFs from lectures (the old Project Files list) ── */}
          {projectFiles.length > 0 && (
            <View style={styles.lecturePhotos}>
              <Pressable
                style={styles.lecturePhotosHeader}
                onPress={() => setLibraryPrefs({ lecturePhotosOpen: !libraryPrefs.lecturePhotosOpen })}
                accessibilityRole="button"
                accessibilityState={{ expanded: libraryPrefs.lecturePhotosOpen }}
              >
                <Text style={styles.sectionLabel}>PHOTOS & PDFS FROM LECTURES · {projectFiles.length}</Text>
                <Ionicons
                  name={libraryPrefs.lecturePhotosOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={c.text.onGradient}
                />
              </Pressable>
              {libraryPrefs.lecturePhotosOpen && (
                <View style={styles.filesList}>
                  {projectFiles.map((file, index) => {
                    const isPhoto = file.file_type === 'photo';
                    const label = fileLabel(file, sameLectureFiles(file, projectFiles));
                    return (
                      <TouchableOpacity
                        key={file.id}
                        style={[styles.fileRow, index < projectFiles.length - 1 && styles.fileRowDivider]}
                        onPress={isPhoto ? () => setPreviewUri(file.file_path) : undefined}
                        {...menuTriggerProps(anchor => showFileActions(file, anchor))}
                        activeOpacity={0.75}
                      >
                        {isPhoto ? (
                          <Image source={{ uri: file.file_path }} style={styles.fileThumb} resizeMode="cover" />
                        ) : (
                          <View style={styles.fileIconWrap}>
                            <Ionicons name="document-text" size={18} color={c.text.secondary} />
                          </View>
                        )}
                        <View style={styles.fileInfo}>
                          <Text style={styles.fileName} numberOfLines={1}>{label}</Text>
                          <Text style={styles.fileMeta}>
                            {formatShortDate(file.created_at)}
                            {file.file_size_bytes != null ? ` · ${formatFileSize(file.file_size_bytes)}` : ''}
                          </Text>
                        </View>
                        {isPhoto && <Ionicons name="chevron-forward" size={16} color={c.text.placeholder} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

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
          <IconButton icon="close" label="Close preview" onPress={() => setPreviewUri(null)} size={28} color={LightColors.white} style={styles.previewClose} />
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
// Styles
// -------------------------------------------------------------------

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Scroll
  scrollContent: {
    paddingHorizontal: H_PADDING,
    gap: 16,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  gridArea: { minHeight: 140 },
  lecturePhotos: { gap: 10, marginTop: 8 },
  lecturePhotosHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },

  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold as '700',
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 12,
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
    color: c.text.onGradientStrong,
  },
  emptyBody: {
    fontSize: Typography.size.base,
    color: c.text.onGradient,
    textAlign: 'center',
    lineHeight: Typography.size.base * Typography.leading.relaxed,
    maxWidth: 280,
  },

  // Error
  errorText: {
    fontSize: Typography.size.base,
    color: c.error,
  },

  // Project files list
  filesList: {
    backgroundColor: c.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
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
    borderBottomColor: c.surfaceMuted,
  },
  fileThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: c.surfaceMuted,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: c.salmonLight,
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
    color: c.text.primary,
  },
  fileMeta: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },

  // Photo preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: c.photoBackdrop,
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
