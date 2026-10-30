import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';

import { useAuth } from '../../../src/hooks/useAuth';
import { useShellScreen } from '../../../src/components/shell/ShellContext';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getProjects, type ProjectWithCount } from '../../../src/services/project.service';
import { NewCourseDialog } from '../../../src/components/NewCourseDialog';
import { getUserSettings } from '../../../src/services/settings.service';
import { createSession } from '../../../src/services/session.service';
import { getTodayUsage, type TodayUsage } from '../../../src/services/credit-check.service';
import { promptText, showAlert } from '../../../src/components/dialogs/dialogs';
import { isOffline } from '../../../src/lib/connectivity';
import { createFolder, getFolders } from '../../../src/services/folder.service';
import { recorder } from '../../../src/services/recorder';
import { recordingFlow } from '../../../src/services/recording.service';
import { useRecorderState } from '../../../src/hooks/useRecorder';
import type { Folder } from '../../../src/types/database';
import { folderPath, folderTree } from '../../../src/utils/folderTree';
import { errorMessage } from '../../../src/utils/errors';

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'auto', label: 'Auto-detect (Beta)' },
];

const MODES: { value: 'lecture' | 'standard' | 'discussion'; label: string }[] = [
  { value: 'lecture', label: 'LECTURE' },
  { value: 'standard', label: 'STANDARD' },
  { value: 'discussion', label: 'DISCUSSION' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecordSetupScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const { projectId: preselectedProjectId, folderId: preselectedFolderId } = useLocalSearchParams<{ projectId?: string; folderId?: string }>();

  // Form state
  const [title, setTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState<ProjectWithCount | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<{ code: string; label: string }>(LANGUAGES[0]);
  const [selectedMode, setSelectedMode] = useState<'lecture' | 'standard' | 'discussion'>('standard');

  // Data
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);

  // The folder in the course (step 5.3, Lea's option A): the course itself or one of its folders.
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  useEffect(() => {
    const courseId = selectedProject?.id;
    setFolders([]);
    setSelectedFolderId(null);
    if (!courseId) return;
    let current = true;
    getFolders({ projectId: courseId })
      .then((list) => {
        if (!current) return;
        setFolders(list);
        // Opened from inside a folder: that folder, preset.
        if (courseId === preselectedProjectId && preselectedFolderId && list.some((f) => f.id === preselectedFolderId)) {
          setSelectedFolderId(preselectedFolderId);
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [selectedProject?.id, preselectedProjectId, preselectedFolderId]);

  const addFolder = async () => {
    if (!profile?.id || !selectedProject) return;
    // One sheet at a time on the iPhone: the picker closes first.
    setShowFolderPicker(false);
    await new Promise((r) => setTimeout(r, Platform.OS === 'ios' ? 350 : 0));
    const name = await promptText('New folder', { message: `In ${selectedProject.name}`, placeholder: 'Folder name', confirmLabel: 'Create' });
    if (!name) {
      setShowFolderPicker(true);
      return;
    }
    try {
      const folder = await createFolder({ userId: profile.id, projectId: selectedProject.id, parentFolderId: null, name });
      setFolders((list) => [...list, folder]);
      setSelectedFolderId(folder.id);
    } catch (err) {
      showAlert('Could not create the folder', errorMessage(err, 'Please try again.'));
    }
  };

  // The laptop's top bar: "New recording" under the chosen course.
  useShellScreen(
    { courseId: selectedProject?.id ?? null, folderId: selectedFolderId },
    {
      crumbs: selectedProject
        ? [{ label: selectedProject.name, href: `/project/${selectedProject.id}` }]
        : [{ label: 'My library', href: '/library' }],
      title: 'New recording',
      saved: null,
    },
  );

  // UI state
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Credit check
  const [usage, setUsage] = useState<TodayUsage | null>(null);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

  // ── Load settings and projects on mount ────────────────────────
  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [settingsData, projectsData] = await Promise.all([
        getUserSettings(profile.id),
        getProjects(profile.id),
      ]);

      setProjects(projectsData);

      // Apply settings defaults
      if (settingsData) {
        const modeFromSettings = settingsData.default_recording_mode as 'lecture' | 'standard' | 'discussion';
        if (MODES.some(m => m.value === modeFromSettings)) {
          setSelectedMode(modeFromSettings);
        }
        const langFromSettings = LANGUAGES.find(l => l.code === settingsData.default_language);
        if (langFromSettings) setSelectedLanguage(langFromSettings);
      }

      // Pre-select project if coming from project detail, otherwise default
      // to the most recently updated project (first in the list).
      if (preselectedProjectId) {
        const match = projectsData.find(p => p.id === preselectedProjectId);
        if (match) setSelectedProject(match);
      } else if (projectsData.length > 0) {
        setSelectedProject(projectsData[0]);
      }
    } catch {
      // Non-fatal — just use defaults
    } finally {
      setLoadingSettings(false);
    }
  }, [profile?.id, preselectedProjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Today's AI use, to warn when a daily limit is reached (best-effort)
  // Skipped offline: recording never waits for it.
  useEffect(() => {
    if (isOffline()) return;
    getTodayUsage().then(setUsage).catch(() => {});
  }, []);

  // ── Start Recording ────────────────────────────────────────────
  const handleStart = async () => {
    if (!profile?.id || !title.trim()) return;
    setIsStarting(true);

    // The recorder service (web now; the iPhone once expo-audio is in): record, then write in the lecture's My notes.
    if (recorder.supported) {
      try {
        const lectureId = await recordingFlow.start({
          userId: profile.id,
          title: title.trim(),
          courseId: selectedProject?.id ?? null,
          folderId: selectedFolderId,
          mode: selectedMode,
          language: selectedLanguage.code,
        });
        router.replace({ pathname: '/doc/[id]', params: { id: lectureId, tab: 'notes' } });
      } catch (err) {
        const denied = err instanceof Error && err.name === 'NotAllowedError';
        showAlert(
          denied ? 'Microphone access needed' : 'Could not start recording',
          denied
            ? 'Allow the microphone for Studiply (the icon in the address bar), then press Start again.'
            : errorMessage(err, 'Please try again.'),
        );
      } finally {
        setIsStarting(false);
      }
      return;
    }

    try {
      // 1. Request microphone permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert(
          'Microphone Access Required',
          'Studiply needs microphone access to record lectures. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      // 2. Create session record in Supabase
      const session = await createSession({
        userId: profile.id,
        title: title.trim(),
        projectId: selectedProject?.id,
        folderId: selectedFolderId ?? undefined,
        recordingMode: selectedMode,
        language: selectedLanguage.code,
      });

      // 3. Navigate to active recording screen
      router.push({
        pathname: '/record/active',
        params: {
          sessionId: session.id,
          title: title.trim(),
          mode: selectedMode,
        },
      });
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not start recording. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  // One recording at a time: while one runs, this opens it instead.
  const running = useRecorderState();
  const busyRecording = running.status !== 'idle' && !!running.lectureId;
  const canStart = busyRecording || (title.trim().length > 0 && !isStarting);

  // ── Credit warning banners ──────────────────────────────────
  // Recording always works; only the AI step waits for the limit to free up.
  const limitWarning =
    usage && !usage.simulated && !dismissedBanners.has('limit')
      ? usage.transcriptionReached
        ? "You've used today's transcription. You can still record; transcribe it once the limit frees up (it counts the last 24 hours)."
        : usage.claudeReached
          ? "Today's limit for notes and the assistant is reached. You can still record and transcribe."
          : null
      : null;

  if (loadingSettings) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={c.salmon} />
      </View>
    );
  }

  return (
    // KeyboardAvoidingView must be the root container on iOS — nested inside
    // another View it miscalculates the keyboard offset and can stall input.
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientFill />
      <ThemedStatusBar />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <Text style={styles.screenSubtitle}>New Recording</Text>

        {/* ── Credit warnings ────────────────────────────────── */}
        {limitWarning && (
          <View style={styles.creditBanner}>
            <Text style={styles.creditBannerText}>{limitWarning}</Text>
            <TouchableOpacity
              onPress={() => setDismissedBanners(prev => new Set([...prev, 'limit']))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Dismiss"
            >
              <Text style={styles.creditBannerDismiss}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Session title ──────────────────────────────────── */}
        <Text style={styles.fieldLabel}>SESSION TITLE</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Thermodynamics Lecture 3"
          placeholderTextColor={c.text.placeholder}
          value={title}
          onChangeText={setTitle}
          editable={true}
          returnKeyType="done"
          autoCapitalize="words"
        />

          {/* ── Project selector ───────────────────────────────── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>IN WHAT COURSE</Text>
          <TouchableOpacity
            style={styles.pickerPill}
            onPress={() => setShowProjectPicker(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Course: ${selectedProject?.name ?? 'none'}. Choose the course`}
          >
            {selectedProject ? (
              <>
                <View style={[styles.colorDot, { backgroundColor: selectedProject.color }]} />
                <Text style={styles.pickerText}>{selectedProject.name}</Text>
              </>
            ) : (
              <Text style={[styles.pickerText, { color: c.text.placeholder }]}>
                Select project...
              </Text>
            )}
            <Ionicons name="chevron-down" size={16} color={c.text.secondary} />
          </TouchableOpacity>

          {/* ── Folder in the course (option A) ─────────────────── */}
          {selectedProject && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>IN WHAT FOLDER</Text>
              <TouchableOpacity
                style={styles.pickerPill}
                onPress={() => setShowFolderPicker(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Folder: ${folderPath(selectedProject.name, folders, selectedFolderId)}. Choose the folder`}
              >
                <Ionicons name={selectedFolderId ? 'folder' : 'albums-outline'} size={16} color={c.accentDark} />
                <Text style={styles.pickerText} numberOfLines={1} {...{ dataSet: { record: 'folder' } }}>
                  {selectedFolderId ? folderPath(selectedProject.name, folders, selectedFolderId) : `${selectedProject.name} (not in a folder)`}
                </Text>
                <Ionicons name="chevron-down" size={16} color={c.text.secondary} />
              </TouchableOpacity>
            </>
          )}

          {/* ── Language selector ──────────────────────────────── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>LANGUAGE</Text>
          <TouchableOpacity
            style={styles.pickerPill}
            onPress={() => setShowLanguagePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.pickerText}>{selectedLanguage.label}</Text>
            <Ionicons name="chevron-down" size={16} color={c.text.secondary} />
          </TouchableOpacity>

          {/* ── Recording mode ─────────────────────────────────── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SELECT MODE</Text>
          <View style={styles.modeRow}>
            {MODES.map(mode => {
              const active = selectedMode === mode.value;
              return (
                <TouchableOpacity
                  key={mode.value}
                  style={[styles.modePill, active && styles.modePillActive]}
                  onPress={() => setSelectedMode(mode.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modePillText, active && styles.modePillTextActive]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 32 }} />

          {/* ── Start Recording button ─────────────────────────── */}
          <TouchableOpacity
            style={[styles.startButton, !canStart && styles.startButtonDisabled]}
            onPress={() =>
              busyRecording
                ? router.replace({ pathname: '/doc/[id]', params: { id: running.lectureId!, tab: 'notes' } })
                : void handleStart()
            }
            disabled={!canStart}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={busyRecording ? 'Open the recording' : 'Start recording'}
          >
            {isStarting ? (
              <ActivityIndicator color={c.white} size="small" />
            ) : (
              <Text style={styles.startButtonText}>{busyRecording ? 'A lecture is recording · Open it' : 'Start Recording'}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.recordingHint}>Recordings up to 3 hours • Optimized for speech</Text>
        </ScrollView>

      {/* ── Project picker modal ─────────────────────────────── */}
      <Modal
        visible={showProjectPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowProjectPicker(false)}
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.pickerSheetTitle}>Select course</Text>
            <FlatList
              data={[null, ...projects] as (ProjectWithCount | null)[]}
              keyExtractor={item => item?.id ?? '__none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setSelectedProject(item);
                    setShowProjectPicker(false);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.colorDot, { backgroundColor: item ? item.color : c.surfaceMuted }]} />
                  <Text style={styles.pickerRowText}>{item?.name ?? 'No course'}</Text>
                  {(selectedProject?.id === item?.id || (!selectedProject && !item)) && (
                    <Ionicons name="checkmark" size={18} color={c.salmon} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListFooterComponent={
                <>
                  <View style={styles.separator} />
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => {
                      // Close the project picker first — iOS won't render two
                      // Modals simultaneously. Wait for the slide-out animation
                      // to finish before opening the next modal.
                      setShowProjectPicker(false);
                      setTimeout(() => setShowNewProjectModal(true), 350);
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={c.salmon} />
                    <Text style={[styles.pickerRowText, styles.createProjectText]}>
                      + New course
                    </Text>
                  </TouchableOpacity>
                </>
              }
            />
          </View>
        </View>
      </Modal>

      {/* ── Folder picker: the course itself, its folders, + New folder ─── */}
      <Modal
        visible={showFolderPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFolderPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowFolderPicker(false)}
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.pickerSheetTitle}>Select folder</Text>
            <FlatList
              data={[null, ...folderTree(folders)]}
              keyExtractor={item => item?.id ?? '__course'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerRow, item && { paddingLeft: 24 + item.depth * 20 }]}
                  onPress={() => {
                    setSelectedFolderId(item?.id ?? null);
                    setShowFolderPicker(false);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={item ? item.name : `${selectedProject?.name ?? 'The course'}, not in a folder`}
                >
                  <Ionicons name={item ? 'folder-outline' : 'albums-outline'} size={18} color={c.accentDark} />
                  <Text style={styles.pickerRowText}>{item ? item.name : `${selectedProject?.name ?? 'The course'} (not in a folder)`}</Text>
                  {selectedFolderId === (item?.id ?? null) && <Ionicons name="checkmark" size={18} color={c.accentDark} />}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListFooterComponent={
                <>
                  <View style={styles.separator} />
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => void addFolder()}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="New folder"
                  >
                    <Text style={[styles.pickerRowText, styles.newFolderText]}>+ New folder</Text>
                  </TouchableOpacity>
                </>
              }
            />
          </View>
        </View>
      </Modal>

      {profile?.id && (
        <NewCourseDialog
          visible={showNewProjectModal}
          userId={profile.id}
          onClose={() => setShowNewProjectModal(false)}
          onCreated={(project) => {
            setProjects(prev => [project, ...prev]);
            setSelectedProject(project);
            setShowNewProjectModal(false);
            // showProjectPicker was already closed before this modal opened
          }}
        />
      )}

      {/* ── Language picker modal ────────────────────────────── */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowLanguagePicker(false)}
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.pickerSheetTitle}>Select Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setSelectedLanguage(item);
                    setShowLanguagePicker(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.pickerRowText}>{item.label}</Text>
                  {selectedLanguage.code === item.code && (
                    <Ionicons name="checkmark" size={18} color={c.salmon} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
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

  // Field label
  fieldLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 10,
  },

  // Title input
  textInput: {
    backgroundColor: c.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: Typography.size.base,
    color: c.text.primary,
  },

  // Picker pill (project + language)
  pickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    flexShrink: 0,
  },
  pickerText: {
    flex: 1,
    fontSize: Typography.size.base,
    color: c.text.primary,
  },

  // Mode selector
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modePill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 100,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: c.salmon,
  },
  modePillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  modePillTextActive: {
    color: c.text.primary,
  },

  // Start button
  startButton: {
    backgroundColor: c.black,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  startButtonDisabled: {
    backgroundColor: c.button.disabled,
  },
  startButtonText: {
    color: c.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },

  // Modal / picker sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: c.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    maxHeight: '60%',
  },
  pickerSheetTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  pickerRowText: {
    flex: 1,
    fontSize: Typography.size.base,
    color: c.text.primary,
    fontWeight: Typography.weight.medium,
  },
  separator: {
    height: 1,
    backgroundColor: c.surfaceMuted,
    marginLeft: 24,
  },

  // Create new project row
  createProjectText: {
    color: c.salmon,
    fontWeight: Typography.weight.semibold,
  },
  newFolderText: {
    color: c.accentDark,
    fontWeight: Typography.weight.semibold,
  },

  recordingHint: {
    fontSize: Typography.size.xs,
    color: c.text.onGradient,
    textAlign: 'center',
    marginTop: 10,
  },

  creditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.status.warning.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  creditBannerText: {
    flex: 1,
    fontSize: Typography.size.xs,
    color: c.status.warning.text,
    fontWeight: Typography.weight.medium,
    lineHeight: Typography.size.xs * 1.5,
  },
  creditBannerDismiss: {
    fontSize: Typography.size.md,
    color: c.status.warning.text,
    lineHeight: 20,
  },

});
