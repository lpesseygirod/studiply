import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';

/** Notifications: nothing to set yet; study reminders arrive with Review (Phase 9). */
export default function NotificationsSettingsPage() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <SettingsPage title="Notifications">
      <View style={styles.card}>
        <Ionicons name="notifications-outline" size={22} color={c.text.secondary} />
        <View style={styles.text}>
          <Text style={styles.title}>Reminders come with Review</Text>
          <Text style={styles.body}>
            Study reminders (what to review today, before an exam) arrive in a later update together with the Review tab.
          </Text>
        </View>
      </View>
    </SettingsPage>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.surfaceMuted,
      padding: 16,
    },
    text: { flex: 1, gap: 4 },
    title: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    body: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      lineHeight: 19,
    },
  });
