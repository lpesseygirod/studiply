import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import { runShellCommand } from '../../../src/components/shell/ShellContext';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getUserSettings, upsertUserSettings } from '../../../src/services/settings.service';
import type { UserSettings } from '../../../src/types/database';
import { showAlert } from '../../../src/components/dialogs/dialogs';
import { setSimulatedOffline, useSimulatedOffline } from '../../../src/lib/connectivity';
import { setDragDebug, setPlainScroll, useDragDebug } from '../../../src/lib/dnd/dragDebug';
import { BackendBadge } from '../../../src/components/BackendBadge';
import { SyncDebugPanel } from '../../../src/components/SyncDebugPanel';
import { legacyImportAvailable, setUseSampleData, usesSampleData } from '../../../src/services/legacyImport';
import { createSampleEarlierVersion } from '../../../src/services/legacyImport/sample';

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const DEFAULT_SETTINGS: Partial<UserSettings> = {
  default_recording_mode: 'standard',
  lecture_mode_default: false,
  default_summary_level: 'standard',
  auto_title: true,
  auto_tags: true,
  include_unclear_parts: true,
  include_formulas: true,
  include_definitions: true,
  default_retention_policy: 'delete_manually',
  default_language: 'en',
};

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'auto', label: 'Auto-detect' },
];

const RETENTION_OPTIONS = [
  { value: 'delete_now', label: 'Delete immediately' },
  { value: 'delete_3_days', label: 'Delete after 3 days' },
  { value: 'delete_manually', label: 'Delete manually' },
  { value: 'keep_permanently', label: 'Keep permanently' },
];

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function GeneralScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { appearance, setAppearance } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const simulatedOffline = useSimulatedOffline();
  const dragDebug = useDragDebug();
  // Development: step 1.9 tested on sample data, never the real earlier-version data.
  const [useSample, setUseSample] = useState(false);
  const [creatingSample, setCreatingSample] = useState(false);
  useEffect(() => {
    if (__DEV__) usesSampleData().then(setUseSample).catch(() => {});
  }, []);
  const toggleSample = async (on: boolean) => {
    await setUseSampleData(on);
    setUseSample(on);
  };
  const createSample = async () => {
    setCreatingSample(true);
    try {
      await createSampleEarlierVersion();
      await toggleSample(true);
      showAlert('Sample created', 'Open Settings → Earlier version data, or go to Home.');
    } catch (err) {
      showAlert('Could not create the sample', err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSample(false);
    }
  };

  const [settings, setSettings] = useState<Partial<UserSettings>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    if (!profile?.id) return;
    getUserSettings(profile.id)
      .then(s => {
        if (s) setSettings(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.id]);

  // -------------------------------------------------------------------
  // Save helper — optimistic update + revert on failure
  // -------------------------------------------------------------------
  const save = useCallback(
    async (label: string, updates: Partial<UserSettings>) => {
      if (!profile?.id) return;
      const prev = settings;
      setSettings(s => ({ ...s, ...updates }));

      try {
        await upsertUserSettings(profile.id, updates);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setSavedLabel(label);
        savedTimerRef.current = setTimeout(() => setSavedLabel(null), 1500);
      } catch {
        setSettings(prev);
        showAlert('Error', 'Could not save setting. Please try again.');
      }
    },
    [profile?.id, settings],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <GradientFill />
        <ThemedStatusBar />
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} size={24} color={c.text.onGradientStrong} style={styles.iconButton} />
          <Text style={styles.headerTitle}>General</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={c.salmon} />
        </View>
      </View>
    );
  }

  const currentLanguage =
    LANGUAGES.find(l => l.code === settings.default_language) ?? LANGUAGES[0];

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} size={24} color={c.text.onGradientStrong} style={styles.iconButton} />
        <Text style={styles.headerTitle}>General</Text>
        <View style={[styles.iconButton, styles.savedIndicatorWrap]}>
          {savedLabel && (
            <Text style={styles.savedIndicator}>✓</Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── APPEARANCE (this device) ───────────────────────────── */}
        <Text style={styles.sectionHeader}>APPEARANCE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Light or dark, on this device</Text>
          </View>
          <View style={styles.pillsRow} accessibilityRole="radiogroup">
            {([
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ] as const).map(({ value, label }) => {
              const active = appearance === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setAppearance(value)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── KEYBOARD (laptop) ─────────────────────────────────── */}
        {Platform.OS === 'web' && (
          <>
            <Text style={styles.sectionHeader}>KEYBOARD</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => runShellCommand('showShortcuts')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.rowLabel}>Keyboard shortcuts</Text>
                <View style={styles.rowValue}>
                  <Text style={styles.rowValueText}>?</Text>
                  <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── RECORDING ──────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>RECORDING</Text>
        <View style={styles.card}>
          {/* Default recording mode */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Default recording mode</Text>
          </View>
          <View style={styles.pillsRow}>
            {(['lecture', 'standard', 'discussion'] as const).map(mode => {
              const active = settings.default_recording_mode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => save('mode', { default_recording_mode: mode })}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.pillText, active && styles.pillTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          {/* Lecture mode default toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Start in Lecture Mode</Text>
            <Switch
              value={settings.lecture_mode_default ?? false}
              onValueChange={v => save('lecture mode', { lecture_mode_default: v })}
              trackColor={{ false: c.surfaceMuted, true: c.salmon }}
              thumbColor={c.white}
              ios_backgroundColor={c.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          {/* Default language */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setShowLangPicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.rowLabel}>Default transcription language</Text>
            <View style={styles.rowValue}>
              <Text style={styles.rowValueText}>{currentLanguage.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── AI PROCESSING ──────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>AI PROCESSING</Text>
        <View style={styles.card}>
          {/* Summary level */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Default summary level</Text>
          </View>
          <View style={styles.pillsRow}>
            {([
              { value: 'minimal', label: 'Minimal' },
              { value: 'standard', label: 'Standard' },
              { value: 'extra', label: 'Detailed' },
            ] as const).map(({ value, label }) => {
              const active = settings.default_summary_level === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => save('summary level', { default_summary_level: value })}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.pillText, active && styles.pillTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Auto-generate title from content</Text>
            <Switch
              value={settings.auto_title ?? true}
              onValueChange={v => save('auto title', { auto_title: v })}
              trackColor={{ false: c.surfaceMuted, true: c.salmon }}
              thumbColor={c.white}
              ios_backgroundColor={c.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Auto-generate tags</Text>
            <Switch
              value={settings.auto_tags ?? true}
              onValueChange={v => save('auto tags', { auto_tags: v })}
              trackColor={{ false: c.surfaceMuted, true: c.salmon }}
              thumbColor={c.white}
              ios_backgroundColor={c.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Extract formulas</Text>
            <Switch
              value={settings.include_formulas ?? true}
              onValueChange={v => save('formulas', { include_formulas: v })}
              trackColor={{ false: c.surfaceMuted, true: c.salmon }}
              thumbColor={c.white}
              ios_backgroundColor={c.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Extract definitions</Text>
            <Switch
              value={settings.include_definitions ?? true}
              onValueChange={v => save('definitions', { include_definitions: v })}
              trackColor={{ false: c.surfaceMuted, true: c.salmon }}
              thumbColor={c.white}
              ios_backgroundColor={c.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Flag unclear sections</Text>
            <Switch
              value={settings.include_unclear_parts ?? true}
              onValueChange={v => save('unclear parts', { include_unclear_parts: v })}
              trackColor={{ false: c.surfaceMuted, true: c.salmon }}
              thumbColor={c.white}
              ios_backgroundColor={c.surfaceMuted}
            />
          </View>
        </View>

        {/* ── SOURCE FILES ────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>SOURCE FILES</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Default file retention</Text>
          </View>
          {RETENTION_OPTIONS.map((opt, index) => (
            <React.Fragment key={opt.value}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.radioRow}
                onPress={() =>
                  save('retention', { default_retention_policy: opt.value })
                }
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.radioOuter,
                    settings.default_retention_policy === opt.value && styles.radioOuterActive,
                  ]}
                >
                  {settings.default_retention_policy === opt.value && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <Text style={styles.rowLabel}>{opt.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── DEVELOPMENT (never in a release build) ──────────────── */}
        {__DEV__ && (
          <>
            <Text style={styles.sectionHeader}>DEVELOPMENT</Text>
            <View style={styles.backendRow}>
              <BackendBadge />
            </View>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <Text style={styles.rowLabel}>Simulate offline</Text>
                <Switch
                  value={simulatedOffline}
                  onValueChange={setSimulatedOffline}
                  trackColor={{ false: c.surfaceMuted, true: c.salmon }}
                  thumbColor={c.white}
                  ios_backgroundColor={c.surfaceMuted}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <SyncDebugPanel />
              </View>
              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <Text style={styles.rowLabel}>Drag debug overlay</Text>
                <Switch
                  value={dragDebug.on}
                  onValueChange={setDragDebug}
                  trackColor={{ false: c.surfaceMuted, true: c.salmon }}
                  thumbColor={c.white}
                  ios_backgroundColor={c.surfaceMuted}
                  accessibilityLabel="Drag debug overlay"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <Text style={styles.rowLabel}>Drag: plain ScrollView</Text>
                <Switch
                  value={dragDebug.plainScroll}
                  onValueChange={setPlainScroll}
                  trackColor={{ false: c.surfaceMuted, true: c.salmon }}
                  thumbColor={c.white}
                  ios_backgroundColor={c.surfaceMuted}
                  accessibilityLabel="Drag: plain ScrollView"
                />
              </View>
              {legacyImportAvailable && (
              <>
              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <Text style={styles.rowLabel}>Use sample earlier-version data</Text>
                <Switch
                  value={useSample}
                  onValueChange={toggleSample}
                  trackColor={{ false: c.surfaceMuted, true: c.salmon }}
                  thumbColor={c.white}
                  ios_backgroundColor={c.surfaceMuted}
                />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.toggleRow} onPress={createSample} disabled={creatingSample} activeOpacity={0.75}>
                <Text style={styles.rowLabel}>Create sample earlier-version data</Text>
                {creatingSample ? (
                  <ActivityIndicator size="small" color={c.salmon} />
                ) : (
                  <Ionicons name="add-circle-outline" size={20} color={c.salmon} />
                )}
              </TouchableOpacity>
              </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Language picker modal */}
      <Modal
        visible={showLangPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowLangPicker(false)}
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.pickerTitle}>Transcription Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    save('language', { default_language: item.code });
                    setShowLangPicker(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.pickerRowText}>{item.label}</Text>
                  {settings.default_language === item.code && (
                    <Ionicons name="checkmark" size={18} color={c.salmon} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: c.surfaceMuted, marginLeft: 20 }} />
              )}
            />
          </View>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.surfaceMuted,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedIndicatorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedIndicator: {
    fontSize: Typography.size.base,
    color: c.success,
    fontWeight: Typography.weight.bold,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: c.text.onGradientStrong,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },

  sectionHeader: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginBottom: -4,
  },
  backendRow: { marginTop: 4 },

  card: {
    backgroundColor: c.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    overflow: 'hidden',
  },

  row: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  rowLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: c.text.primary,
    flex: 1,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },

  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowValueText: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    fontWeight: Typography.weight.medium,
  },

  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  pill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 100,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: c.salmon,
  },
  pillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: c.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  pillTextActive: {
    color: c.text.primary,
  },

  divider: {
    height: 1,
    backgroundColor: c.surfaceMuted,
    marginLeft: 16,
  },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 14,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: c.salmon,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.salmon,
  },

  // Language picker modal
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
    maxHeight: '55%',
  },
  pickerTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'space-between',
  },
  pickerRowText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: c.text.primary,
  },
});
