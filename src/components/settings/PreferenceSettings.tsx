/**
 * PreferenceSettings.tsx
 * The settings groups of the old General screen, moved unchanged (step 3.6):
 * Appearance (+ keyboard shortcuts on the laptop), Recording defaults
 * (with the language picker), Summary defaults and file retention.
 * `title` is the group's small header; null hides it (a section page that
 * already says what it is).
 */

import React, { useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { UserSettings } from '../../types/database';
import type { SaveSetting } from '../../hooks/useUserSettings';
import { runShellCommand } from '../shell/ShellContext';
import { makeSettingsStyles } from './styles';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'auto', label: 'Auto-detect' },
];

export const SUMMARY_LEVELS = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'standard', label: 'Standard' },
  { value: 'extra', label: 'Detailed' },
] as const;

export const APPEARANCES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

// Step 10.1b-3: the default ("Delete in 3 days": 3 days after the recording is transcribed) first.
const RETENTION_OPTIONS = [
  { value: 'delete_3_days', label: 'Delete 3 days after transcription' },
  { value: 'delete_now', label: 'Delete immediately' },
  { value: 'delete_manually', label: 'Delete manually' },
  { value: 'keep_permanently', label: 'Keep permanently' },
];

interface GroupProps {
  title?: string | null;
}

interface SettingsProps extends GroupProps {
  settings: Partial<UserSettings>;
  save: SaveSetting;
}

/** A settings switch in the app's colours. */
export function SettingSwitch(props: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel?: string }) {
  const { colors: c } = useTheme();
  return (
    <Switch
      {...props}
      // Off: a track that reads as a switch on the card in both themes (step 10.1).
      trackColor={{ false: c.switchOff, true: c.salmon }}
      thumbColor={c.white}
      ios_backgroundColor={c.switchOff}
    />
  );
}

// ── Appearance (this device) ─────────────────────────────────────────────

export function AppearanceSettings({ title = 'APPEARANCE' }: GroupProps) {
  const styles = useThemedStyles(makeSettingsStyles);
  const { colors: c, appearance, setAppearance } = useTheme();
  return (
    <>
      {title !== null && <Text style={styles.sectionHeader}>{title}</Text>}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Light or dark, on this device</Text>
        </View>
        <View style={styles.pillsRow} accessibilityRole="radiogroup">
          {APPEARANCES.map(({ value, label }) => {
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

      {/* Keyboard (laptop) */}
      {Platform.OS === 'web' && (
        <>
          {title !== null && <Text style={styles.sectionHeader}>KEYBOARD</Text>}
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
    </>
  );
}

// ── Recording defaults ───────────────────────────────────────────────────

export function RecordingSettings({ settings, save, title = 'RECORDING' }: SettingsProps) {
  const styles = useThemedStyles(makeSettingsStyles);
  const pickerStyles = useThemedStyles(makePickerStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const currentLanguage = LANGUAGES.find(l => l.code === settings.default_language) ?? LANGUAGES[0];

  return (
    <>
      {title !== null && <Text style={styles.sectionHeader}>{title}</Text>}
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
                <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1} adjustsFontSizeToFit>
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
          <SettingSwitch
            value={settings.lecture_mode_default ?? false}
            onValueChange={v => save('lecture mode', { lecture_mode_default: v })}
          />
        </View>

        <View style={styles.divider} />

        {/* Default language */}
        <TouchableOpacity style={styles.toggleRow} onPress={() => setShowLangPicker(true)} activeOpacity={0.8}>
          <Text style={styles.rowLabel}>Default transcription language</Text>
          <View style={styles.rowValue}>
            <Text style={styles.rowValueText}>{currentLanguage.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Language picker */}
      <Modal visible={showLangPicker} transparent animationType="slide" onRequestClose={() => setShowLangPicker(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLangPicker(false)} />
          <View style={[pickerStyles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={pickerStyles.pickerTitle}>Transcription Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={pickerStyles.pickerRow}
                  onPress={() => {
                    save('language', { default_language: item.code });
                    setShowLangPicker(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={pickerStyles.pickerRowText}>{item.label}</Text>
                  {settings.default_language === item.code && <Ionicons name="checkmark" size={18} color={c.salmon} />}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={pickerStyles.pickerSeparator} />}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Summary defaults (AI processing) ─────────────────────────────────────

export function SummarySettings({ settings, save, title = 'AI PROCESSING' }: SettingsProps) {
  const styles = useThemedStyles(makeSettingsStyles);
  const toggles: { label: string; key: keyof UserSettings; saveLabel: string }[] = [
    { label: 'Auto-generate title from content', key: 'auto_title', saveLabel: 'auto title' },
    { label: 'Auto-generate tags', key: 'auto_tags', saveLabel: 'auto tags' },
    { label: 'Extract formulas', key: 'include_formulas', saveLabel: 'formulas' },
    { label: 'Extract definitions', key: 'include_definitions', saveLabel: 'definitions' },
    { label: 'Flag unclear sections', key: 'include_unclear_parts', saveLabel: 'unclear parts' },
  ];
  return (
    <>
      {title !== null && <Text style={styles.sectionHeader}>{title}</Text>}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Default summary level</Text>
        </View>
        <View style={styles.pillsRow}>
          {SUMMARY_LEVELS.map(({ value, label }) => {
            const active = settings.default_summary_level === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => save('summary level', { default_summary_level: value })}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {toggles.map(t => (
          <React.Fragment key={t.key}>
            <View style={styles.divider} />
            <View style={styles.toggleRow}>
              <Text style={styles.rowLabel}>{t.label}</Text>
              <SettingSwitch
                value={(settings[t.key] as boolean | undefined) ?? true}
                onValueChange={v => save(t.saveLabel, { [t.key]: v } as Partial<UserSettings>)}
              />
            </View>
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

// ── Source files: default retention ──────────────────────────────────────

export function RetentionSettings({ settings, save, title = 'SOURCE FILES' }: SettingsProps) {
  const styles = useThemedStyles(makeSettingsStyles);
  return (
    <>
      {title !== null && <Text style={styles.sectionHeader}>{title}</Text>}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Default file retention</Text>
        </View>
        {RETENTION_OPTIONS.map((opt, index) => {
          const active = settings.default_retention_policy === opt.value;
          return (
            <React.Fragment key={opt.value}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.radioRow}
                onPress={() => save('retention', { default_retention_policy: opt.value })}
                activeOpacity={0.75}
                accessibilityRole="radio"
                // iOS reads accessibilityState; React Native Web only aria-checked (step 10.1b-3).
                accessibilityState={{ checked: active }}
                aria-checked={active}
              >
                <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                  {active && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.rowLabel}>{opt.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
    </>
  );
}

const makePickerStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    pickerSeparator: { height: 1, backgroundColor: c.surfaceMuted, marginLeft: 20 },
  });
