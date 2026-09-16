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
  Alert,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getProjects, type ProjectWithCount } from '../../../src/services/project.service';
import { NewProjectModal } from '../../../src/components/NewProjectModal';
import { getUserSettings } from '../../../src/services/settings.service';
import { createSession } from '../../../src/services/session.service';
import { checkAICredits, type AICreditStatus } from '../../../src/services/credit-check.service';

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

  // UI state
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Credit check
  const [creditStatus, setCreditStatus] = useState<AICreditStatus | null>(null);
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

  // Run credit check in background once settings have loaded
  useEffect(() => {
    (async () => {
      try {
        const credits = await checkAICredits();
        setCreditStatus(credits);
      } catch {
        // Non-fatal — credit check is best-effort
      }
    })();
  }, []);

  // ── Start Recording ────────────────────────────────────────────
  const handleStart = async () => {
    if (!profile?.id || !title.trim()) return;
    setIsStarting(true);
    try {
      // 1. Request microphone permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
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
        folderId: preselectedFolderId ?? undefined,
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
      Alert.alert('Error', err?.message ?? 'Could not start recording. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const canStart = title.trim().length > 0 && !isStarting;

  // ── Credit warning banners ──────────────────────────────────
  const openAIError = creditStatus?.openai.error;
  const anthropicError = creditStatus?.anthropic.error;

  const openAIWarning = creditStatus && !creditStatus.openai.ok && !dismissedBanners.has('openai')
    ? {
        message:
          openAIError === 'openai_invalid_key'
            ? '🐷 OpenAI piggy bank needs a key! Transcription won\'t work.'
            : openAIError === 'network_error'
            ? '⚠️ Can\'t check AI credits — no internet connection'
            : '🐷 OpenAI piggy bank is empty! Add credits at platform.openai.com',
        url: openAIError === 'network_error' ? null : 'https://platform.openai.com/settings/organization/billing',
      }
    : null;

  const anthropicWarning = creditStatus && !creditStatus.anthropic.ok && !dismissedBanners.has('anthropic')
    ? {
        message:
          anthropicError === 'anthropic_invalid_key'
            ? '🐷 Claude piggy bank needs a key! Notes won\'t generate.'
            : '🐷 Claude piggy bank is empty! Add credits at console.anthropic.com',
        url: 'https://console.anthropic.com/settings/billing',
      }
    : null;

  if (loadingSettings) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.salmon} />
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
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <Text style={styles.appTitle}>STUDIPLY</Text>
        <Text style={styles.screenSubtitle}>New Recording</Text>

        {/* ── Credit warnings ────────────────────────────────── */}
        {openAIWarning && (
          <TouchableOpacity
            style={styles.creditBanner}
            onPress={() => openAIWarning.url ? Linking.openURL(openAIWarning.url) : undefined}
            activeOpacity={openAIWarning.url ? 0.75 : 1}
          >
            <Text style={styles.creditBannerText}>{openAIWarning.message}</Text>
            <TouchableOpacity
              onPress={() => setDismissedBanners(prev => new Set([...prev, 'openai']))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.creditBannerDismiss}>×</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        {anthropicWarning && (
          <TouchableOpacity
            style={styles.creditBanner}
            onPress={() => Linking.openURL(anthropicWarning.url)}
            activeOpacity={0.75}
          >
            <Text style={styles.creditBannerText}>{anthropicWarning.message}</Text>
            <TouchableOpacity
              onPress={() => setDismissedBanners(prev => new Set([...prev, 'anthropic']))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.creditBannerDismiss}>×</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* ── Session title ──────────────────────────────────── */}
        <Text style={styles.fieldLabel}>SESSION TITLE</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Thermodynamics Lecture 3"
          placeholderTextColor={Colors.text.placeholder}
          value={title}
          onChangeText={setTitle}
          editable={true}
          returnKeyType="done"
          autoCapitalize="words"
        />

          {/* ── Project selector ───────────────────────────────── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>IN WHAT PROJECT</Text>
          <TouchableOpacity
            style={styles.pickerPill}
            onPress={() => setShowProjectPicker(true)}
            activeOpacity={0.8}
          >
            {selectedProject ? (
              <>
                <View style={[styles.colorDot, { backgroundColor: selectedProject.color }]} />
                <Text style={styles.pickerText}>{selectedProject.name}</Text>
              </>
            ) : (
              <Text style={[styles.pickerText, { color: Colors.text.placeholder }]}>
                Select project...
              </Text>
            )}
            <Ionicons name="chevron-down" size={16} color={Colors.text.secondary} />
          </TouchableOpacity>

          {/* ── Language selector ──────────────────────────────── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>LANGUAGE</Text>
          <TouchableOpacity
            style={styles.pickerPill}
            onPress={() => setShowLanguagePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.pickerText}>{selectedLanguage.label}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.text.secondary} />
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
            onPress={handleStart}
            disabled={!canStart}
            activeOpacity={0.85}
          >
            {isStarting ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.startButtonText}>Start Recording</Text>
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
            <Text style={styles.pickerSheetTitle}>Select Project</Text>
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
                  <View style={[styles.colorDot, { backgroundColor: item ? item.color : Colors.surfaceMuted }]} />
                  <Text style={styles.pickerRowText}>{item?.name ?? 'No Project'}</Text>
                  {(selectedProject?.id === item?.id || (!selectedProject && !item)) && (
                    <Ionicons name="checkmark" size={18} color={Colors.salmon} />
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
                    <Ionicons name="add-circle-outline" size={18} color={Colors.salmon} />
                    <Text style={[styles.pickerRowText, styles.createProjectText]}>
                      + Create New Project
                    </Text>
                  </TouchableOpacity>
                </>
              }
            />
          </View>
        </View>
      </Modal>

      {profile?.id && (
        <NewProjectModal
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
                    <Ionicons name="checkmark" size={18} color={Colors.salmon} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF9',
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
    marginBottom: 28,
  },

  // Field label
  fieldLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: 10,
  },

  // Title input
  textInput: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },

  // Picker pill (project + language)
  pickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
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
    color: Colors.text.primary,
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: Colors.salmon,
  },
  modePillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  modePillTextActive: {
    color: Colors.text.primary,
  },

  // Start button
  startButton: {
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  startButtonDisabled: {
    backgroundColor: Colors.button.disabled,
  },
  startButtonText: {
    color: Colors.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },

  // Modal / picker sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    maxHeight: '60%',
  },
  pickerSheetTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
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
    color: Colors.text.primary,
    fontWeight: Typography.weight.medium,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginLeft: 24,
  },

  // Create new project row
  createProjectText: {
    color: Colors.salmon,
    fontWeight: Typography.weight.semibold,
  },

  recordingHint: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 10,
  },

  creditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  creditBannerText: {
    flex: 1,
    fontSize: Typography.size.xs,
    color: '#7A4A00',
    fontWeight: Typography.weight.medium,
    lineHeight: Typography.size.xs * 1.5,
  },
  creditBannerDismiss: {
    fontSize: 18,
    color: '#7A4A00',
    lineHeight: 20,
  },

});
