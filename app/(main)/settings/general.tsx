import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import {
  AppearanceSettings,
  RecordingSettings,
  RetentionSettings,
  SummarySettings,
} from '../../../src/components/settings/PreferenceSettings';
import { DevelopmentSettings } from '../../../src/components/settings/DevelopmentSettings';

export default function GeneralScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, loading, save, savedLabel } = useUserSettings();

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} size={24} color={c.text.onGradientStrong} style={styles.iconButton} />
        <Text style={styles.headerTitle}>General</Text>
        <View style={[styles.iconButton, styles.savedIndicatorWrap]}>
          {savedLabel && !loading && <Text style={styles.savedIndicator}>✓</Text>}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.salmon} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <AppearanceSettings />
          <RecordingSettings settings={settings} save={save} />
          <SummarySettings settings={settings} save={save} />
          <RetentionSettings settings={settings} save={save} />
          <DevelopmentSettings />
        </ScrollView>
      )}
    </View>
  );
}

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
});
