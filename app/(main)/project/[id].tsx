import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getSessionsByProject } from '../../../src/services/session.service';
import { getFolders, createFolder, getFolder, getFolderBreadcrumbs, renameFolder, type Breadcrumb } from '../../../src/services/folder.service';
import {
  getProjectSourceFiles,
  markDeleted as markSourceFileDeleted,
  sourceFileName,
  fileLabel,
  sameLectureFiles,
  getLibraryFiles,
  type LibraryFile,
} from '../../../src/services/source-file.service';
import { requestCameraPermission, requestMediaLibraryPermission } from '../../../src/utils/permissions';
import { formatFileSize, getLocalFileSize } from '../../../src/utils/file-size';
import { useAppUndo } from '../../../src/hooks/useAppUndo';
import {
  isDialogOpen,
  menuTriggerProps,
  showActionSheet,
  showAlert,
  type Anchor,
  type DialogButton,
} from '../../../src/components/dialogs/dialogs';
import { errorMessage } from '../../../src/utils/errors';
import { promptRenameFile } from '../../../src/utils/rename';
import { useItemMenu } from '../../../src/hooks/useItemMenu';
import { useLibraryDrop } from '../../../src/hooks/useLibraryDrop';
import { useLibraryUpload } from '../../../src/hooks/useLibraryUpload';
import type { Place } from '../../../src/utils/moveRules';
import { mergeRefs, useDragSource, useDropZone, type DropHandlers } from '../../../src/lib/dnd/useHtml5Drag';
import { isEditable } from '../../../src/lib/shortcuts';
import { DraggableView, GestureDragProvider, lastItemGestureAt, type Scroller } from '../../../src/lib/dnd/GestureDrag';
import {
  Gesture,
  GestureDetector,
  RefreshControl as GestureRefreshControl,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import { dragLog, useDragDebug } from '../../../src/lib/dnd/dragDebug';
import type { Dragged, DropTarget } from '../../../src/lib/dnd/rules';
import { emptySpaceActions, pasteLabel, SPACE_LABELS, type SpaceAction } from '../../../src/utils/itemMenu';
import { getClip } from '../../../src/lib/clipboard';
import { useLibraryUpdates } from '../../../src/lib/cache';
import { withProjectRoot } from '../../../src/utils/breadcrumbs';
import { useShellCommand, useShellScreen } from '../../../src/components/shell/ShellContext';
import { LibraryGrid, type NameEditing } from '../../../src/components/library/LibraryGrid';
import { LibraryHeader, showSortMenu } from '../../../src/components/library/LibraryHeader';
import { LibraryToolbar } from '../../../src/components/library/LibraryToolbar';
import { getCourseContents } from '../../../src/services/shelf.service';
import { useLibraryPrefs } from '../../../src/lib/libraryPrefs';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { sortEntries } from '../../../src/utils/libraryGrid';
import { courseShelfItem, folderItemFromFolder, type ShelfItem } from '../../../src/utils/shelf';
import { starButton } from '../../../src/utils/star';
import type { Session, Folder, SourceFile } from '../../../src/types/database';
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

  // The app's Undo toast (also ⌘Z's, src/lib/undo.ts): it stays visible
  // when deleting the course or folder you're in takes you up a level.
  const showUndo = useAppUndo();

  // Photos and PDFs saved to the library, at the current level
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([]);

  // Project-level files (photos + PDFs across all sessions)
  const [projectFiles, setProjectFiles] = useState<SourceFile[]>([]);
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
      setFolders(folderList);
      setSessions(sessionList);
      setLibraryFiles(fileList);
      setEntries(contents);

      // The crumbs show the current names (the course or a folder may have
      // been renamed elsewhere, or from the title's menu).
      setBreadcrumbs(prev => withProjectRoot(prev, p.name));
      if (folderId) {
        const folder = await getFolder(folderId).catch(() => null);
        // Moved to another course (Move to… on the title): follow it there.
        if (folder && folder.project_id && folder.project_id !== id && !folder.is_deleted) {
          router.replace({ pathname: '/project/[id]', params: { id: folder.project_id, folder: folderId } });
          return;
        }
        const chain = await getFolderBreadcrumbs(folderId, p.name).catch(() => null);
        if (chain) setBreadcrumbs(chain);
      }
    } catch {
      setError('Could not load this course.');
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

  // ⌥⇧N on the web, and the New menu: a new folder here, named in place.
  useShellCommand('newFolder', () => startNewFolder());
  // The New menu's "Upload photo or PDF".
  useShellCommand('upload', () => chooseUpload());

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

  function showFileActions(file: SourceFile, anchor?: Anchor) {
    const name = fileLabel(file, sameLectureFiles(file, projectFiles));
    showActionSheet(name, [
      { text: 'Rename…', onPress: () => renameFile(file) },
      { text: 'Move to…', onPress: () => move.openMoveMedia(file, name) },
      { text: 'Save a copy to library…', onPress: () => move.openSaveToLibrary(file, name) },
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

  // The items' menu (shared with the sidebar and Library), and Move to…
  // for the lecture photos below the grid. Changes reload through
  // useLibraryUpdates; the lecture photos reload here.
  const itemMenu = useItemMenu({
    showUndo,
    onOpen: item => openEntry(item),
    renameFolderInPlace: folderId => setEditing({ mode: 'rename', id: folderId }),
    // The folder or course you're in went to the trash (its title's menu): go up one level.
    onTrashed: item => {
      if (item.type === 'course' && item.id === id) router.navigate('/library');
      else if (item.type === 'folder' && item.id === currentFolderIdRef.current) navigateUp();
    },
  });

  /** The title's menu: the course or folder you're in (no Open; Rename… in a dialog). */
  async function titleMenu(anchor?: Anchor) {
    if (!id) return;
    try {
      const item = currentFolderId
        ? folderItemFromFolder(await getFolder(currentFolderId))
        : courseShelfItem(await getProject(id));
      itemMenu.open(item, anchor, { skip: ['open', 'cut', 'copy'], dialogRename: true });
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not open the menu.'));
    }
  }
  const move = itemMenu.move;
  // Development: the list without gesture-handler, to compare the iPhone drag (dragDebug.ts).
  const { plainScroll } = useDragDebug();
  const Scroll = plainScroll ? ScrollView : ListScroll;
  const Refresh = plainScroll ? RefreshControl : ListRefresh;

  // Upload (step 3.4): photos and PDFs become files in the open course or folder.
  const uploader = useLibraryUpload({ showUndo });
  const herePlace = (): Place => ({ courseId: id ?? null, folderId: currentFolderId, label: currentCrumb?.name ?? 'this course' });

  // Drag and drop (step 3.3): onto folder tiles and the breadcrumb; files from the Finder are uploaded there.
  const dnd = useLibraryDrop({ showUndo, upload: uploader.upload });

  // Laptop: ⌘V with an image or PDF (a screenshot, a copied file) adds it here (not while typing in a field).
  const uploadRef = useRef({ upload: uploader.upload, herePlace });
  uploadRef.current = { upload: uploader.upload, herePlace };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(document.activeElement) || isDialogOpen()) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      const { upload, herePlace: here } = uploadRef.current;
      upload(
        here(),
        files.map(f => ({ uri: URL.createObjectURL(f), name: f.name || null, mimeType: f.type || null, sizeBytes: f.size })),
      );
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // iPhone: the list scrolls while a dragged item is held near the top or bottom.
  const scrollRef = useRef<ScrollView>(null);
  const scrollState = useRef({ y: 0, content: 0, height: 0 });
  const scroller = useMemo<Scroller>(
    () => ({
      scrollBy: dy => {
        const s = scrollState.current;
        const next = Math.max(0, Math.min(s.y + dy, Math.max(0, s.content - s.height)));
        const moved = next - s.y;
        if (moved !== 0) {
          scrollRef.current?.scrollTo({ y: next, animated: false });
          s.y = next;
        }
        return moved;
      },
    }),
    [],
  );
  useLibraryUpdates(fetchProjectFiles);

  // -------------------------------------------------------------------
  // Files saved to the library
  // -------------------------------------------------------------------

  function openLibraryFile(file: LibraryFile) {
    if (!file.media?.file_path) {
      showAlert('Not available', "This file can't be opened right now. Check your connection.");
      return;
    }
    if (file.kind === 'image') setPreviewUri(file.media.file_path);
    else shareFile({ ...file.media, display_name: file.title });
  }

  // ── Upload (step 3.4): photos and PDFs become files in the open course or folder ──

  const handleTakePhoto = async () => {
    if (!id || !(await requestCameraPermission())) return;
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      const a = result.canceled ? undefined : result.assets[0];
      if (!a) return;
      await uploader.upload(herePlace(), [
        { uri: a.uri, name: null, mimeType: a.mimeType ?? 'image/jpeg', sizeBytes: a.fileSize ?? null, size: { width: a.width, height: a.height } },
      ]);
    } catch {
      showAlert('Error', 'Could not take the photo. Please try again.');
    }
  };

  const handlePickPhotos = async () => {
    if (!id || !(await requestMediaLibraryPermission())) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled) return;
      await uploader.upload(
        herePlace(),
        result.assets.map(a => ({
          uri: a.uri,
          name: a.fileName ?? null,
          mimeType: a.mimeType ?? 'image/jpeg',
          sizeBytes: a.fileSize ?? null,
          size: { width: a.width, height: a.height },
        })),
      );
    } catch {
      showAlert('Error', 'Could not pick photos. Please try again.');
    }
  };

  /** PDFs (iPhone: from Files); on the laptop one picker for PDFs and images. */
  const handlePickDocuments = async () => {
    if (!id) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web' ? ['application/pdf', 'image/*'] : 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked = await Promise.all(
        result.assets.map(async a => ({
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType ?? null,
          sizeBytes: a.size ?? (await getLocalFileSize(a.uri)) ?? null,
        })),
      );
      await uploader.upload(herePlace(), picked);
    } catch {
      showAlert('Error', 'Could not pick the files. Please try again.');
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
    if (item.pending) {
      showAlert('Waiting to upload', 'This file opens once it has been uploaded.');
      return;
    }
    const file = libraryFiles.find(f => f.id === item.id);
    if (file) return openLibraryFile(file);
    showAlert(item.title, 'This kind of file opens with the editor. Coming soon.');
  }

  function entryMenu(item: ShelfItem, anchor?: Anchor) {
    setSelectedId(item.id);
    itemMenu.open(item, anchor);
  }

  function recordHere() {
    router.push({
      pathname: '/record',
      params: { projectId: id, ...(currentFolderId ? { folderId: currentFolderId } : {}) },
    });
  }

  /** Empty space: right-click (laptop) or long-press (iPhone), like Finder. The toolbar stays. */
  function spaceMenu(anchor?: Anchor) {
    // iPhone: a long-press on a tile is the tile's (its drag or its menu), not the space around it.
    if (editing || Date.now() - lastItemGestureAt() < 1000) {
      dragLog('empty-space menu: ignored (an item took the press)');
      return;
    }
    dragLog('empty-space menu: opened');
    setSelectedId(null);
    const clip = getClip();
    const paste = pasteLabel(clip && { mode: clip.mode, title: clip.item.title });
    const run: Record<SpaceAction, () => void> = {
      newFolder: startNewFolder,
      newDocument: () => {},
      record: recordHere,
      upload: chooseUpload,
      takePhoto: handleTakePhoto,
      paste: () => dnd.pasteHere(herePlace()),
      sort: () => showSortMenu(libraryPrefs.sort, sort => setLibraryPrefs({ sort }), anchor),
    };
    const button = (action: SpaceAction): DialogButton => {
      if (action === 'newDocument') return { text: SPACE_LABELS.newDocument, disabled: true, hint: 'Coming soon' };
      if (action === 'paste') return paste.hint ? { text: paste.text, disabled: true, hint: paste.hint } : { text: paste.text, onPress: run.paste };
      return { text: SPACE_LABELS[action], onPress: run[action] };
    };
    showActionSheet(currentCrumb?.name, emptySpaceActions(Platform.OS !== 'web').map(button), { anchor });
  }

  /** Laptop: one file picker (PDFs and images). iPhone: Photos, PDF (Files) or Take photo. */
  function chooseUpload() {
    if (Platform.OS === 'web') {
      handlePickDocuments();
      return;
    }
    showActionSheet(`Upload to ${herePlace().label}`, [
      { text: 'Photos', onPress: handlePickPhotos },
      { text: 'PDF (Files)', onPress: handlePickDocuments },
      { text: 'Take photo', onPress: handleTakePhoto },
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
        <DragArea check={dnd.check} onDrop={dnd.drop} scroller={scroller}>
          <Scroll
            ref={scrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={e => (scrollState.current.y = e.nativeEvent.contentOffset.y)}
            onScrollBeginDrag={() => dragLog('list scroll started')}
            onContentSizeChange={(_w, h) => (scrollState.current.content = h)}
            onLayout={e => (scrollState.current.height = e.nativeEvent.layout.height)}
            refreshControl={
              <Refresh refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.text.onGradientStrong} />
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
              crumbTargets={breadcrumbs.map((b, i) =>
                i === breadcrumbs.length - 1 || !id
                  ? null
                  : { id: b.id ?? id, kind: 'place', place: { courseId: id, folderId: b.type === 'folder' ? b.id : null, label: b.name } },
              )}
              dnd={dnd}
              onTitleMenu={titleMenu}
              onMore={compact ? () => spaceMenu() : undefined}
            />

            <LibraryToolbar
              onNewFolder={startNewFolder}
              onUpload={chooseUpload}
              onTakePhoto={handleTakePhoto}
              onRecord={recordHere}
              uploadProgress={uploader.progress}
            />

            {/* ── The items (docs/design desktop-04), and the empty space around them ── */}
            <SpaceArea
              onPress={() => setSelectedId(null)}
              onMenu={spaceMenu}
              style={styles.space}
              dropTarget={id ? { id: 'here', kind: 'place', place: herePlace() } : null}
              dnd={dnd}
            >
              {sortedEntries.length === 0 && !editing ? (
                <View style={styles.emptyState}>
                  <Ionicons name="folder-open-outline" size={44} color={c.text.onGradient} />
                  <Text style={styles.emptyTitle}>{breadcrumbs.length > 1 ? 'This folder is empty' : 'Nothing here yet'}</Text>
                  <Text style={styles.emptyBody}>Make a folder, upload a file or record a lecture here.</Text>
                </View>
              ) : (
                <View style={styles.gridArea}>
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
                    dnd={dnd}
                    thumbnailFor={item =>
                      item.type === 'image' ? libraryFiles.find(f => f.id === item.id)?.media?.file_path || undefined : undefined
                    }
                  />
                </View>
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
                          <MediaDragSource
                            key={file.id}
                            dragged={{ kind: 'media', file, name: label }}
                            style={[styles.fileRow, index < projectFiles.length - 1 && styles.fileRowDivider]}
                            onOpen={isPhoto ? () => setPreviewUri(file.file_path) : undefined}
                            onMenu={anchor => showFileActions(file, anchor)}
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
                          </MediaDragSource>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </SpaceArea>
          </Scroll>
        </DragArea>
      )}

      {move.modal}


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

// iPhone: gesture-handler's list, so holding an item to drag it and scrolling don't fight (step 3.3).
const ListScroll = (Platform.OS === 'web' ? ScrollView : GestureScrollView) as typeof ScrollView;
const ListRefresh = (Platform.OS === 'web' ? RefreshControl : GestureRefreshControl) as typeof RefreshControl;

/**
 * The empty space around the tiles: a click clears the selection and a
 * right-click shows the empty-space menu (laptop); a long-press shows it on
 * the iPhone. There it is a gesture-handler long-press (500 ms), so a tile's
 * own hold (350 ms, its drag or its menu) wins natively, with no race
 * between the two (step 3.3 iPhone fix).
 */
function SpaceArea({
  onPress,
  onMenu,
  style,
  dropTarget,
  dnd,
  children,
}: {
  onPress: () => void;
  onMenu: (anchor?: Anchor) => void;
  style: React.ComponentProps<typeof View>['style'];
  /** Laptop: files from the Finder dropped on the empty grid go here (step 3.4). */
  dropTarget: DropTarget | null;
  dnd: DropHandlers;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const drop = useDropZone(dropTarget, dnd);
  const menuRef = useRef(onMenu);
  menuRef.current = onMenu;
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(500)
        .runOnJS(true)
        .withTestId('space-long-press')
        .onStart(() => menuRef.current()),
    [],
  );
  const menu = menuTriggerProps(onMenu);
  if (Platform.OS === 'web') {
    return (
      <Pressable
        ref={mergeRefs(menu.ref, drop.ref) as never}
        onPress={onPress}
        onLongPress={menu.onLongPress}
        delayLongPress={menu.delayLongPress}
        accessible={false}
        style={[style, drop.hover === 'ok' && styles.spaceDropOk]}
        testID="library-space"
      >
        {children}
      </Pressable>
    );
  }
  return (
    <GestureDetector gesture={longPress}>
      <View style={style} collapsable={false} testID="library-space">
        {children}
      </View>
    </GestureDetector>
  );
}

/** The iPhone's drag (the laptop uses the browser's own drag, no provider needed). */
function DragArea({ children, ...props }: React.ComponentProps<typeof GestureDragProvider>) {
  return Platform.OS === 'web' ? <>{children}</> : <GestureDragProvider {...props}>{children}</GestureDragProvider>;
}

/**
 * A lecture's photo or PDF row (step 3.3): dragged onto a folder, it leaves
 * its lecture as a library file. Laptop: the browser's drag on the row, a
 * click opens, a right-click shows the menu. iPhone: tap opens, hold and
 * release shows the menu, hold and move drags.
 */
function MediaDragSource({
  dragged,
  style,
  onOpen,
  onMenu,
  children,
}: {
  dragged: Extract<Dragged, { kind: 'media' }>;
  style: React.ComponentProps<typeof View>['style'];
  onOpen?: () => void;
  onMenu: (anchor?: Anchor) => void;
  children: React.ReactNode;
}) {
  const ref = useDragSource(dragged);
  if (Platform.OS !== 'web') {
    return (
      <DraggableView dragged={dragged} onOpen={onOpen ?? (() => {})} onMenu={() => onMenu()} style={style} accessibilityLabel={dragged.name}>
        {children}
      </DraggableView>
    );
  }
  return (
    <View ref={ref as never} collapsable={false}>
      <TouchableOpacity style={style} onPress={onOpen} {...menuTriggerProps(onMenu)} activeOpacity={0.75}>
        {children}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Scroll
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: H_PADDING,
    gap: 16,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  gridArea: { minHeight: 140 },
  // Fills the rest of the screen, so there is empty space to right-click or long-press.
  space: { flexGrow: 1, gap: 16, minHeight: 240, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  // Files from the Finder over the empty grid: they go into the folder you're in.
  spaceDropOk: { borderStyle: 'dashed', borderColor: c.accent },
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
