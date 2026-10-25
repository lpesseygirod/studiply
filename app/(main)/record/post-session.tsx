import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useAuth } from '../../../src/hooks/useAuth';
import { useLectureShell } from '../../../src/hooks/useLectureShell';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getSession, updateSession } from '../../../src/services/session.service';
import {
  getActiveSourceFiles,
  createSourceFile,
  fileLabel,
  markDeleted,
} from '../../../src/services/source-file.service';
import { promptRenameFile } from '../../../src/utils/rename';
import { useMoveFlow } from '../../../src/hooks/useMoveFlow';
import { useUndoToast } from '../../../src/hooks/useUndoToast';
import { starButton } from '../../../src/utils/star';
import { getUserSettings } from '../../../src/services/settings.service';
import { requestCameraPermission, requestMediaLibraryPermission } from '../../../src/utils/permissions';
import { formatFileSize, getLocalFileSize } from '../../../src/utils/file-size';
import type { Session, SourceFile, UserSettings } from '../../../src/types/database';
import { menuTriggerProps, showActionSheet, showAlert, type Anchor } from '../../../src/components/dialogs/dialogs';
import { useConnectivity } from '../../../src/lib/connectivity';
import { syncEnabled, usePendingSync } from '../../../src/lib/sync';
import FlowCloseButton, { leaveRecordingFlow } from '../../../src/components/FlowCloseButton';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUMMARY_LEVELS: { value: 'minimal' | 'standard' | 'extra'; label: string }[] = [
  { value: 'minimal', label: 'MINIMAL' },
  { value: 'standard', label: 'STANDARD' },
  { value: 'extra', label: 'DETAILED' },
];

const MODE_LABELS: Record<string, string> = {
  lecture: 'Lecture',
  standard: 'Standard',
  discussion: 'Discussion',
};

const FILE_ICONS: Record<SourceFile['file_type'], React.ComponentProps<typeof Ionicons>['name']> = {
  audio: 'mic',
  photo: 'image',
  pdf: 'document-text',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


function getLanguageLabel(lang: string): string {
  return lang === 'auto' ? 'AUTO' : lang.toUpperCase().slice(0, 2);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostSessionScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  // `mode` comes from the recording screen; the lecture has no column for it.
  const { sessionId, mode } = useLocalSearchParams<{ sessionId: string; mode?: string }>();
  useLectureShell(sessionId);

  const [session, setSession] = useState<Session | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [summaryLevel, setSummaryLevel] = useState<'minimal' | 'standard' | 'extra'>('standard');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadingCamera, setUploadingCamera] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  // iPhone: the recording and files still on their way to Studiply.
  const offline = useConnectivity() === 'offline';
  const waitingUploads = usePendingSync(sessionId);
  const generateBlocked = syncEnabled && (offline || waitingUploads > 0);

  // ── Initial data load ────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!sessionId || !profile?.id) return;
    try {
      const [sessionData, filesData, settingsData] = await Promise.all([
        getSession(sessionId),
        getActiveSourceFiles(sessionId),
        getUserSettings(profile.id),
      ]);
      setSession(sessionData);
      setSourceFiles(filesData);
      setUserSettings(settingsData);
      if (settingsData?.default_summary_level) {
        const lvl = settingsData.default_summary_level as 'minimal' | 'standard' | 'extra';
        if (SUMMARY_LEVELS.some(s => s.value === lvl)) setSummaryLevel(lvl);
      }
    } catch {
      // Non-fatal — render with empty state
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // "Move to another lecture…" / "Save to library…" for photos and PDFs, with Undo.
  const { showUndo, toast: undoToast } = useUndoToast();
  const move = useMoveFlow({ showUndo, onChanged: loadData });

  // ── Material upload — Take Photo ─────────────────────────────
  const handleTakePhoto = async () => {
    if (!profile?.id || !sessionId) return;
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
        const asset = result.assets[0];
        const fileSize = asset.fileSize ?? (await getLocalFileSize(asset.uri)) ?? undefined;
        const newFile = await createSourceFile({
          userId: profile.id,
          sessionId,
          fileType: 'photo',
          filePath: asset.uri,
          size: { width: asset.width, height: asset.height },
          fileSizeBytes: fileSize,
          mimeType: 'image/jpeg',
          retentionPolicy: userSettings?.default_retention_policy ?? 'delete_manually',
        });
        setSourceFiles(prev => [...prev, newFile]);
      }
    } catch {
      showAlert('Error', 'Could not capture photo. Please try again.');
    } finally {
      setUploadingCamera(false);
    }
  };

  // ── Material upload — Pick from Gallery ──────────────────────
  const handlePickPhotos = async () => {
    if (!profile?.id || !sessionId) return;
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
        const newFiles = await Promise.all(
          result.assets.map(async asset => {
            const fileSize = asset.fileSize ?? (await getLocalFileSize(asset.uri)) ?? undefined;
            return createSourceFile({
              userId: profile.id,
              sessionId,
              fileType: 'photo',
              filePath: asset.uri,
              size: { width: asset.width, height: asset.height },
              fileSizeBytes: fileSize,
              mimeType: 'image/jpeg',
              retentionPolicy: userSettings?.default_retention_policy ?? 'delete_manually',
            });
          })
        );
        setSourceFiles(prev => [...prev, ...newFiles]);
      }
    } catch {
      showAlert('Error', 'Could not pick photos. Please try again.');
    } finally {
      setUploadingGallery(false);
    }
  };

  // ── Material upload — PDF Documents ──────────────────────────
  const handlePickDocuments = async () => {
    if (!profile?.id || !sessionId) return;
    setUploadingDocs(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newFiles = await Promise.all(
          result.assets.map(async asset => {
            const fileSize = asset.size ?? (await getLocalFileSize(asset.uri)) ?? undefined;
            return createSourceFile({
              userId: profile.id,
              sessionId,
              fileType: 'pdf',
              filePath: asset.uri,
              fileName: asset.name,
              fileSizeBytes: fileSize,
              mimeType: asset.mimeType ?? 'application/pdf',
              retentionPolicy: userSettings?.default_retention_policy ?? 'delete_manually',
            });
          })
        );
        setSourceFiles(prev => [...prev, ...newFiles]);
      }
    } catch {
      showAlert('Error', 'Could not pick documents. Please try again.');
    } finally {
      setUploadingDocs(false);
    }
  };

  // ── Delete file ──────────────────────────────────────────────
  // Long-press (iPhone) or right-click (web) on a photo or PDF.
  const showFileActions = (file: SourceFile, anchor?: Anchor) => {
    const name = fileLabel(file, sourceFiles);
    showActionSheet(name, [
      { text: 'Rename…', onPress: () => renameFile(file) },
      { text: 'Move to another lecture…', onPress: () => move.openMoveMedia(file, name) },
      { text: 'Save to library…', onPress: () => move.openSaveToLibrary(file, name) },
      starButton({ type: 'media', id: file.id }, name, file.starred_at ?? null, showUndo, starred_at =>
        setSourceFiles(prev => prev.map(f => (f.id === file.id ? { ...f, starred_at } : f))),
      ),
      { text: 'Remove', style: 'destructive', onPress: () => handleDeleteFile(file) },
    ], { anchor });
  };

  const renameFile = async (file: SourceFile) => {
    const renamed = await promptRenameFile(file, sourceFiles);
    if (renamed) setSourceFiles(prev => prev.map(f => (f.id === renamed.id ? renamed : f)));
  };

  const handleDeleteFile = (file: SourceFile) => {
    showAlert(
      'Remove File',
      'Remove this file from the session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await markDeleted(file.id);
              setSourceFiles(prev => prev.filter(f => f.id !== file.id));
            } catch {
              showAlert('Error', 'Could not remove the file. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── Generate Notes ───────────────────────────────────────────
  const handleGenerateNotes = async () => {
    if (!sessionId || generateBlocked) return;
    setIsGenerating(true);
    try {
      await updateSession(sessionId, { status: 'processing' });
      router.replace({
        pathname: '/record/review',
        params: { sessionId, summaryLevel, mode: mode ?? session?.recording_mode ?? 'lecture' },
      });
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not start processing. Please try again.');
      setIsGenerating(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ThemedStatusBar />
        <ActivityIndicator color={c.salmon} />
      </View>
    );
  }

  const audioFiles = sourceFiles.filter(f => f.file_type === 'audio');
  const nonAudioFiles = sourceFiles.filter(f => f.file_type !== 'audio');
  const combinedAudioSize = audioFiles.reduce((sum, f) => sum + (f.file_size_bytes ?? 0), 0);
  const hasOnlyAudio = audioFiles.length > 0 && nonAudioFiles.length === 0;

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      {/* ── Scrollable body ───────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — the recording is saved, so leaving loses nothing */}
        <FlowCloseButton onPress={() => leaveRecordingFlow(router)} />
        <Text style={styles.screenSubtitle}>Post-Session</Text>

        {/* ── Transcript status banner ─────────────────────── */}
        {session && (
          <View style={styles.statusBanner}>
            <Text style={styles.bannerTitle} numberOfLines={2}>{session.title}</Text>
            <View style={styles.bannerMeta}>
              <View style={styles.metaBadge}>
                <Ionicons name="checkmark-circle" size={13} color={c.success} />
                <Text style={styles.metaBadgeText}>Transcript ready</Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{formatDuration(session.duration_seconds)}</Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>
                  {MODE_LABELS[mode || session.recording_mode] ?? session.recording_mode}
                </Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{getLanguageLabel(session.language)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Add Materials ────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ADD MATERIALS</Text>
        <View style={styles.materialRow}>
          <MaterialButton
            icon="camera-outline"
            label="take photo"
            loading={uploadingCamera}
            onPress={handleTakePhoto}
          />
          <MaterialButton
            icon="images-outline"
            label="upload photo"
            loading={uploadingGallery}
            onPress={handlePickPhotos}
          />
          <MaterialButton
            icon="document-outline"
            label="upload files"
            loading={uploadingDocs}
            onPress={handlePickDocuments}
          />
        </View>

        {/* ── Attached files list ──────────────────────────── */}
        <View style={styles.filesList}>
          {sourceFiles.length === 0 ? (
            <Text style={styles.noFilesText}>No files attached</Text>
          ) : (
            <>
              {/* Grouped audio row */}
              {audioFiles.length > 0 && (
                <View>
                  <View style={styles.fileRow}>
                    <View style={styles.fileIcon}>
                      <Ionicons name="mic" size={18} color={c.text.secondary} />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>Recording</Text>
                      <Text style={styles.fileSize}>
                        {audioFiles.length > 1
                          ? `${audioFiles.length} parts • ${combinedAudioSize > 0 ? formatFileSize(combinedAudioSize) : ''}`
                          : combinedAudioSize > 0 ? formatFileSize(combinedAudioSize) : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.fileSeparator} />
                </View>
              )}
              {/* Individual non-audio files */}
              {nonAudioFiles.map(file => (
                <View key={file.id}>
                  <TouchableOpacity
                    style={styles.fileRow}
                    activeOpacity={1}
                    {...menuTriggerProps(anchor => showFileActions(file, anchor))}
                  >
                    <View style={styles.fileIcon}>
                      <Ionicons
                        name={FILE_ICONS[file.file_type]}
                        size={18}
                        color={c.text.secondary}
                      />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {fileLabel(file, sourceFiles)}
                      </Text>
                      {file.file_size_bytes != null && (
                        <Text style={styles.fileSize}>
                          {formatFileSize(file.file_size_bytes)}
                        </Text>
                      )}
                    </View>
                    <IconButton icon="close" label="Remove file" onPress={() => handleDeleteFile(file)} size={14} color={c.text.secondary} style={styles.deleteButton} />
                  </TouchableOpacity>
                  <View style={styles.fileSeparator} />
                </View>
              ))}
              {hasOnlyAudio && (
                <Text style={styles.addMorePrompt}>
                  Add photos or slides to improve your notes
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── AI Summary Level ─────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>AI SUMMARY LEVEL</Text>
        <View style={styles.summaryLevels}>
          {SUMMARY_LEVELS.map(lvl => {
            const active = summaryLevel === lvl.value;
            return (
              <TouchableOpacity
                key={lvl.value}
                style={[styles.summaryPill, active && styles.summaryPillActive]}
                onPress={() => setSummaryLevel(lvl.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.summaryPillText, active && styles.summaryPillTextActive]}>
                  {lvl.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bottom padding for the fixed button */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Fixed Generate Notes button ───────────────────────── */}
      <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 16 }]}>
        {generateBlocked && (
          <Text style={styles.generateHint}>
            {offline
              ? 'Generating needs a connection. This lecture is saved in your library.'
              : `Uploading to Studiply… ${waitingUploads} ${waitingUploads === 1 ? 'step' : 'steps'} left`}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.generateButton, (isGenerating || generateBlocked) && { opacity: 0.6 }]}
          onPress={handleGenerateNotes}
          disabled={isGenerating || generateBlocked}
          activeOpacity={0.85}
        >
          {isGenerating ? (
            <ActivityIndicator color={c.white} size="small" />
          ) : (
            <Text style={styles.generateButtonText}>GENERATE NOTES</Text>
          )}
        </TouchableOpacity>
      </View>
      {move.modal}
      {undoToast}
    </View>
  );
}

// ─── Material button sub-component ────────────────────────────────────────────

function MaterialButton({
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
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity style={styles.materialButton} onPress={onPress} disabled={loading} activeOpacity={0.8}>
      <View style={styles.materialButtonIcon}>
        {loading ? (
          <ActivityIndicator color={c.text.secondary} size="small" />
        ) : (
          <Ionicons name={icon} size={24} color={c.text.secondary} />
        )}
      </View>
      <Text style={styles.materialButtonLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  generateHint: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    textAlign: 'center',
    marginBottom: 10,
  },
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  // Header
  screenSubtitle: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.extrabold,
    color: c.text.onGradientStrong,
    marginBottom: 20,
  },

  // Section label
  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 12,
  },

  // Transcript status banner
  statusBanner: {
    backgroundColor: c.titleCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  bannerTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
  },
  bannerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: c.cardMuted,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },

  // Material buttons
  materialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  materialButton: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  materialButtonIcon: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: c.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialButtonLabel: {
    fontSize: Typography.size.xs,
    color: c.text.onGradient,
    textAlign: 'center',
    fontWeight: Typography.weight.medium,
  },

  // Files list
  filesList: {
    backgroundColor: c.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  fileIcon: {
    width: 36,
    height: 36,
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
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: c.text.primary,
  },
  fileSize: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileSeparator: {
    height: 1,
    backgroundColor: c.surfaceMuted,
  },
  noFilesText: {
    fontSize: Typography.size.base,
    color: c.text.secondary,
    paddingVertical: 16,
    textAlign: 'center',
  },
  addMorePrompt: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    paddingVertical: 10,
    paddingBottom: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Summary level
  summaryLevels: {
    gap: 8,
  },
  summaryPill: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: c.surfaceMuted,
  },
  summaryPillActive: {
    backgroundColor: c.salmon,
  },
  summaryPillText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: c.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  summaryPillTextActive: {
    color: c.text.primary,
  },

  // Generate Notes button
  bottomAction: {
    backgroundColor: c.card,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.surfaceMuted,
  },
  generateButton: {
    backgroundColor: c.black,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  generateButtonText: {
    color: c.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },
});
