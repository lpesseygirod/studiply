import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getSession, updateSession } from '../../../src/services/session.service';
import {
  getActiveSourceFiles,
  createSourceFile,
  markDeleted,
} from '../../../src/services/source-file.service';
import { getUserSettings } from '../../../src/services/settings.service';
import { requestCameraPermission, requestMediaLibraryPermission } from '../../../src/utils/permissions';
import { formatFileSize, getLocalFileSize } from '../../../src/utils/file-size';
import type { Session, SourceFile, UserSettings } from '../../../src/types/database';

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

function getFileLabel(file: SourceFile, allFiles: SourceFile[]): string {
  if (file.file_type === 'audio') return 'Recording';
  if (file.file_type === 'photo') {
    const photos = allFiles.filter(f => f.file_type === 'photo');
    const idx = photos.findIndex(f => f.id === file.id) + 1;
    return `Photo ${idx}`;
  }
  // PDF — extract filename from path
  const parts = file.file_path.split('/');
  return parts[parts.length - 1] ?? 'Document';
}

function getLanguageLabel(lang: string): string {
  return lang === 'auto' ? 'AUTO' : lang.toUpperCase().slice(0, 2);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostSessionScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [summaryLevel, setSummaryLevel] = useState<'minimal' | 'standard' | 'extra'>('standard');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadingCamera, setUploadingCamera] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);

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
          fileSizeBytes: fileSize,
          mimeType: 'image/jpeg',
          retentionPolicy: userSettings?.default_retention_policy ?? 'delete_manually',
        });
        setSourceFiles(prev => [...prev, newFile]);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo. Please try again.');
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
              fileSizeBytes: fileSize,
              mimeType: 'image/jpeg',
              retentionPolicy: userSettings?.default_retention_policy ?? 'delete_manually',
            });
          })
        );
        setSourceFiles(prev => [...prev, ...newFiles]);
      }
    } catch {
      Alert.alert('Error', 'Could not pick photos. Please try again.');
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
              fileSizeBytes: fileSize,
              mimeType: asset.mimeType ?? 'application/pdf',
              retentionPolicy: userSettings?.default_retention_policy ?? 'delete_manually',
            });
          })
        );
        setSourceFiles(prev => [...prev, ...newFiles]);
      }
    } catch {
      Alert.alert('Error', 'Could not pick documents. Please try again.');
    } finally {
      setUploadingDocs(false);
    }
  };

  // ── Delete file ──────────────────────────────────────────────
  const handleDeleteFile = (file: SourceFile) => {
    Alert.alert(
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
              Alert.alert('Error', 'Could not remove the file. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── Generate Notes ───────────────────────────────────────────
  const handleGenerateNotes = async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      await updateSession(sessionId, { status: 'processing' });
      router.replace({
        pathname: '/record/review',
        params: { sessionId, summaryLevel },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not start processing. Please try again.');
      setIsGenerating(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={Colors.salmon} />
      </View>
    );
  }

  const audioFiles = sourceFiles.filter(f => f.file_type === 'audio');
  const nonAudioFiles = sourceFiles.filter(f => f.file_type !== 'audio');
  const combinedAudioSize = audioFiles.reduce((sum, f) => sum + (f.file_size_bytes ?? 0), 0);
  const hasOnlyAudio = audioFiles.length > 0 && nonAudioFiles.length === 0;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* ── Scrollable body ───────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.appTitle}>STUDIPLY</Text>
        <Text style={styles.screenSubtitle}>Post-Session</Text>

        {/* ── Transcript status banner ─────────────────────── */}
        {session && (
          <View style={styles.statusBanner}>
            <Text style={styles.bannerTitle} numberOfLines={2}>{session.title}</Text>
            <View style={styles.bannerMeta}>
              <View style={styles.metaBadge}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                <Text style={styles.metaBadgeText}>Transcript ready</Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{formatDuration(session.duration_seconds)}</Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>
                  {MODE_LABELS[session.recording_mode] ?? session.recording_mode}
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
                      <Ionicons name="mic" size={18} color={Colors.text.secondary} />
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
                  <View style={styles.fileRow}>
                    <View style={styles.fileIcon}>
                      <Ionicons
                        name={FILE_ICONS[file.file_type]}
                        size={18}
                        color={Colors.text.secondary}
                      />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {getFileLabel(file, sourceFiles)}
                      </Text>
                      {file.file_size_bytes != null && (
                        <Text style={styles.fileSize}>
                          {formatFileSize(file.file_size_bytes)}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteFile(file)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close" size={14} color={Colors.text.secondary} />
                    </TouchableOpacity>
                  </View>
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
        <TouchableOpacity
          style={[styles.generateButton, isGenerating && { opacity: 0.6 }]}
          onPress={handleGenerateNotes}
          disabled={isGenerating}
          activeOpacity={0.85}
        >
          {isGenerating ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <Text style={styles.generateButtonText}>GENERATE NOTES</Text>
          )}
        </TouchableOpacity>
      </View>
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
  return (
    <TouchableOpacity style={styles.materialButton} onPress={onPress} disabled={loading} activeOpacity={0.8}>
      <View style={styles.materialButtonIcon}>
        {loading ? (
          <ActivityIndicator color={Colors.text.secondary} size="small" />
        ) : (
          <Ionicons name={icon} size={24} color={Colors.text.secondary} />
        )}
      </View>
      <Text style={styles.materialButtonLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
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
    marginBottom: 20,
  },

  // Section label
  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 12,
  },

  // Transcript status banner
  statusBanner: {
    backgroundColor: Colors.salmonLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  bannerTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
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
    backgroundColor: Colors.white,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
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
    backgroundColor: Colors.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialButtonLabel: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    textAlign: 'center',
    fontWeight: Typography.weight.medium,
  },

  // Files list
  filesList: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
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
    backgroundColor: Colors.salmonLight,
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
    color: Colors.text.primary,
  },
  fileSize: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileSeparator: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
  },
  noFilesText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    paddingVertical: 16,
    textAlign: 'center',
  },
  addMorePrompt: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
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
    backgroundColor: Colors.surfaceMuted,
  },
  summaryPillActive: {
    backgroundColor: Colors.salmon,
  },
  summaryPillText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  summaryPillTextActive: {
    color: Colors.text.primary,
  },

  // Generate Notes button
  bottomAction: {
    backgroundColor: '#FFFDF9',
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
  },
  generateButton: {
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  generateButtonText: {
    color: Colors.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },
});
