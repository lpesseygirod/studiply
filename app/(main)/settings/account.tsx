import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import { IconButton } from '../../../src/components/IconButton';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { DangerZone, ProfileCard } from '../../../src/components/settings/AccountSettings';
import { AiUsageSettings } from '../../../src/components/settings/AiUsageSettings';
import { SourceFilesCard } from '../../../src/components/settings/StorageSettings';

export default function AccountScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} size={24} color={c.text.onGradientStrong} style={styles.iconButton} />
        <Text style={styles.headerTitle}>Manage Account</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileCard />
        <AiUsageSettings />
        <SourceFilesCard />
        <DangerZone />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },

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
