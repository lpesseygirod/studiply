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
  Alert,
  BackHandler,
  Platform,
  ActionSheetIOS,
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
  moveSession,
  getOrCreateProjectUploadSession,
} from '../../../src/services/session.service';
import { getFolders, createFolder, type Breadcrumb } from '../../../src/services/folder.service';
import { getSessionsWithNotes } from '../../../src/services/note.service';
import { trashSession, trashFolder } from '../../../src/services/trash.service';
import {
  getProjectSourceFiles,
  createSourceFile,
  markDeleted as markSourceFileDeleted,
} from '../../../src/services/source-file.service';
import { requestCameraPermission, requestMediaLibraryPermission } from '../../../src/utils/permissions';
import { formatFileSize, getLocalFileSize } from '../../../src/utils/file-size';
import UndoToast from '../../../src/components/UndoToast';
import MoveToModal from '../../../src/components/MoveToModal';
import type { Project, Session, Folder, SourceFile } from '../../../src/types/database';

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
  const { id } = useLocalSearchParams<{ id: string }>();
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

  // Move session modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingSessionId, setMovingSessionId] = useState<string | null>(null);

  // Move folder modal
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);

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
      const [p, folderList, sessionList] = await Promise.all([
        getProject(id),
        getFolders({ projectId: id, parentFolderId: folderId }),
        getSessionsByProject(id, folderId),
      ]);
      setProject(p);
      setFolders(folderList);
      setSessions(sessionList);

      // Batch-check which sessions have a confirmed note.
      const ids = sessionList.map(s => s.id);
      const noteIds = await getSessionsWithNotes(ids);
      setSessionNoteIds(noteIds);

      // Initialize breadcrumbs with project root on first load
      setBreadcrumbs(prev =>
        prev.length === 0
          ? [{ id: null, name: p.name, type: 'project' }]
          : prev
      );
    } catch {
      setError('Could not load project.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData(null);
  }, [id]);

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
    setFolders([]);
    setSessions([]);
    setLoading(true);
    fetchData(folder.id).finally(() => setLoading(false));
  }

  function navigateToCrumb(index: number) {
    const crumb = breadcrumbs[index];
    const folderId = crumb.type === 'folder' ? crumb.id : null;
    setBreadcrumbs(prev => prev.slice(0, index + 1));
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

  function showFolderActions(folder: Folder) {
    const options = ['Rename', 'Move to…', 'Delete Folder', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2, title: folder.name },
        (index) => {
          if (index === 0) promptRenameFolder(folder);
          if (index === 1) openMoveFolder(folder);
          if (index === 2) confirmTrashFolder(folder);
        }
      );
    } else {
      Alert.alert(folder.name, undefined, [
        { text: 'Rename', onPress: () => promptRenameFolder(folder) },
        { text: 'Move to…', onPress: () => openMoveFolder(folder) },
        { text: 'Delete Folder', style: 'destructive', onPress: () => confirmTrashFolder(folder) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function showSessionActions(session: Session) {
    const options = ['View Notes', 'Export as PDF', 'Move to…', 'Delete Session', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 4, destructiveButtonIndex: 3, title: session.title },
        (index) => {
          if (index === 0) handleSessionPress(session);
          if (index === 1) exportSessionPDF(session);
          if (index === 2) openMoveSession(session);
          if (index === 3) confirmTrashSession(session);
        }
      );
    } else {
      Alert.alert(session.title, undefined, [
        { text: 'View Notes', onPress: () => handleSessionPress(session) },
        { text: 'Export as PDF', onPress: () => exportSessionPDF(session) },
        { text: 'Move to…', onPress: () => openMoveSession(session) },
        { text: 'Delete Session', style: 'destructive', onPress: () => confirmTrashSession(session) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function exportSessionPDF(session: Session) {
    try {
      const { getNoteBySession } = await import('../../../src/services/note.service');
      const { exportNoteToPDF } = await import('../../../src/services/export.service');
      const note = await getNoteBySession(session.id);
      if (!note) {
        Alert.alert('No Note', 'This session has not been processed yet.');
        return;
      }
      await exportNoteToPDF({ note, session, transcript: null, projectName: project?.name });
    } catch {
      Alert.alert('Error', 'Could not export PDF.');
    }
  }

  function openMoveFolder(folder: Folder) {
    setMovingFolderId(folder.id);
    setShowMoveFolderModal(true);
  }

  async function handleMoveFolder(target: { projectId: string; folderId: string | null; label: string }) {
    if (!movingFolderId) return;
    setShowMoveFolderModal(false);
    try {
      const { moveFolder } = await import('../../../src/services/folder.service');
      await moveFolder(movingFolderId, target.folderId);
      setFolders(prev => prev.filter(f => f.id !== movingFolderId));
    } catch {
      Alert.alert('Error', 'Could not move folder.');
    } finally {
      setMovingFolderId(null);
    }
  }

  function showFileActions(file: SourceFile) {
    const isPhoto = file.file_type === 'photo';
    const options = isPhoto
      ? ['Export / Share', 'Delete', 'Cancel']
      : ['Export / Share', 'Delete', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, destructiveButtonIndex: 1 },
        (index) => {
          if (index === 0) shareFile(file);
          if (index === 1) confirmDeleteFile(file);
        }
      );
    } else {
      Alert.alert('File', undefined, [
        { text: 'Export / Share', onPress: () => shareFile(file) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteFile(file) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function shareFile(file: SourceFile) {
    try {
      const Sharing = await import('expo-sharing');
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Your device does not support sharing.');
        return;
      }
      await Sharing.shareAsync(file.file_path);
    } catch {
      Alert.alert('Error', 'Could not share file.');
    }
  }

  function confirmDeleteFile(file: SourceFile) {
    Alert.alert('Delete File', 'This file will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await markSourceFileDeleted(file.id);
            setProjectFiles(prev => prev.filter(f => f.id !== file.id));
          } catch {
            Alert.alert('Error', 'Could not delete file.');
          }
        },
      },
    ]);
  }

  // -------------------------------------------------------------------
  // Folder rename
  // -------------------------------------------------------------------

  function promptRenameFolder(folder: Folder) {
    Alert.prompt(
      'Rename Folder',
      undefined,
      async (name) => {
        if (!name?.trim()) return;
        try {
          const { renameFolder } = await import('../../../src/services/folder.service');
          await renameFolder(folder.id, name.trim());
          await fetchData(currentFolderId);
        } catch {
          Alert.alert('Error', 'Could not rename folder.');
        }
      },
      'plain-text',
      folder.name
    );
  }

  // -------------------------------------------------------------------
  // Folder trash
  // -------------------------------------------------------------------

  function confirmTrashFolder(folder: Folder) {
    Alert.alert(
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
            } catch {
              Alert.alert('Error', 'Could not delete folder.');
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
                const { restoreItem } = await import('../../../src/services/trash.service');
                await restoreItem({ id: session.id, type: 'session' });
                fetchData(currentFolderId);
              });
            } catch {
              Alert.alert('Error', 'Could not delete session.');
            }
          },
        },
      ]
    );
  }

  // -------------------------------------------------------------------
  // Move session
  // -------------------------------------------------------------------

  function openMoveSession(session: Session) {
    setMovingSessionId(session.id);
    setShowMoveModal(true);
  }

  async function handleMove(target: { projectId: string; folderId: string | null; label: string }) {
    if (!movingSessionId) return;
    setShowMoveModal(false);
    try {
      await moveSession(movingSessionId, target.projectId, target.folderId);
      setSessions(prev => prev.filter(s => s.id !== movingSessionId));
    } catch {
      Alert.alert('Error', 'Could not move session.');
    } finally {
      setMovingSessionId(null);
    }
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
    } catch {
      Alert.alert('Error', 'Could not create folder.');
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
          fileSizeBytes: fileSize,
          mimeType: 'image/jpeg',
        });
        setProjectFiles(prev => [newFile, ...prev]);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo. Please try again.');
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
              fileSizeBytes: fileSize,
              mimeType: 'image/jpeg',
            });
          })
        );
        setProjectFiles(prev => [...newFiles, ...prev]);
      }
    } catch {
      Alert.alert('Error', 'Could not pick photos. Please try again.');
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
              fileSizeBytes: fileSize,
              mimeType: asset.mimeType ?? 'application/pdf',
            });
          })
        );
        setProjectFiles(prev => [...newFiles, ...prev]);
      }
    } catch {
      Alert.alert('Error', 'Could not pick documents. Please try again.');
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
                  const photos = projectFiles.filter(f => f.file_type === 'photo');
                  const photoIdx = photos.findIndex(f => f.id === file.id) + 1;
                  const label = isPhoto
                    ? `Photo ${photoIdx}`
                    : (file.file_path.split('/').pop() ?? 'Document');

                  return (
                    <TouchableOpacity
                      key={file.id}
                      style={[
                        styles.fileRow,
                        index < projectFiles.length - 1 && styles.fileRowDivider,
                      ]}
                      onPress={isPhoto ? () => setPreviewUri(file.file_path) : undefined}
                      onLongPress={() => showFileActions(file)}
                      activeOpacity={0.75}
                      delayLongPress={400}
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
                    onLongPress={() => showFolderActions(folder)}
                    activeOpacity={0.8}
                    delayLongPress={400}
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

          {/* ── Sessions list ─────────────────────────────────── */}
          {sessions.filter(s => s.title !== 'Project Files').length > 0 && (
            <>
              <Text style={[styles.sectionLabel, folders.length > 0 && { marginTop: 24 }]}>
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
                      onLongPress={() => showSessionActions(session)}
                      activeOpacity={0.75}
                      delayLongPress={400}
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
          {folders.length === 0 && sessions.filter(s => s.title !== 'Project Files').length === 0 && projectFiles.length === 0 && (
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

      {/* ── Move Session modal ────────────────────────────────── */}
      <MoveToModal
        visible={showMoveModal}
        title="Move Session to…"
        userId={userId}
        excludeProjectIds={[]}
        onMove={handleMove}
        onClose={() => {
          setShowMoveModal(false);
          setMovingSessionId(null);
        }}
      />

      {/* ── Move Folder modal ─────────────────────────────────── */}
      <MoveToModal
        visible={showMoveFolderModal}
        title="Move Folder to…"
        userId={userId}
        excludeProjectIds={[]}
        onMove={handleMoveFolder}
        onClose={() => {
          setShowMoveFolderModal(false);
          setMovingFolderId(null);
        }}
      />

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
  container: { flex: 1, backgroundColor: '#FFFDF9' },
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
    flex: 0,
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
