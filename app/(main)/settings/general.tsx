import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getUserSettings, upsertUserSettings } from '../../../src/services/settings.service';
import type { UserSettings } from '../../../src/types/database';

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();

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
        Alert.alert('Error', 'Could not save setting. Please try again.');
      }
    },
    [profile?.id, settings],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>General</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.salmon} />
        </View>
      </View>
    );
  }

  const currentLanguage =
    LANGUAGES.find(l => l.code === settings.default_language) ?? LANGUAGES[0];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
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
              trackColor={{ false: Colors.surfaceMuted, true: Colors.salmon }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.surfaceMuted}
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
              <Ionicons name="chevron-forward" size={16} color={Colors.text.secondary} />
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
              trackColor={{ false: Colors.surfaceMuted, true: Colors.salmon }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Auto-generate tags</Text>
            <Switch
              value={settings.auto_tags ?? true}
              onValueChange={v => save('auto tags', { auto_tags: v })}
              trackColor={{ false: Colors.surfaceMuted, true: Colors.salmon }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Extract formulas</Text>
            <Switch
              value={settings.include_formulas ?? true}
              onValueChange={v => save('formulas', { include_formulas: v })}
              trackColor={{ false: Colors.surfaceMuted, true: Colors.salmon }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Extract definitions</Text>
            <Switch
              value={settings.include_definitions ?? true}
              onValueChange={v => save('definitions', { include_definitions: v })}
              trackColor={{ false: Colors.surfaceMuted, true: Colors.salmon }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.surfaceMuted}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>Flag unclear sections</Text>
            <Switch
              value={settings.include_unclear_parts ?? true}
              onValueChange={v => save('unclear parts', { include_unclear_parts: v })}
              trackColor={{ false: Colors.surfaceMuted, true: Colors.salmon }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.surfaceMuted}
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
                    <Ionicons name="checkmark" size={18} color={Colors.salmon} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: Colors.surfaceMuted, marginLeft: 20 }} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  savedIndicatorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedIndicator: {
    fontSize: Typography.size.base,
    color: Colors.success,
    fontWeight: Typography.weight.bold,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },

  sectionHeader: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wider,
    marginBottom: -4,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
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
    color: Colors.text.primary,
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
    color: Colors.text.secondary,
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: Colors.salmon,
  },
  pillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  pillTextActive: {
    color: Colors.text.primary,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
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
    borderColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: Colors.salmon,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.salmon,
  },

  // Language picker modal
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
    maxHeight: '55%',
  },
  pickerTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
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
    color: Colors.text.primary,
  },
});
