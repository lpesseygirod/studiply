import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { confirmSignOut } from '../../../src/utils/signOut';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';

export default function SecurityScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const username = profile?.username ?? '—';

  const handleSignOut = async () => {
    await confirmSignOut(signOut, { title: 'Sign Out', message: 'Are you sure you want to sign out?' });
  };

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={c.text.onGradientStrong} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account info card */}
        <View style={styles.infoCard}>
          <Ionicons name="person-circle-outline" size={28} color={c.text.secondary} />
          <View style={styles.infoText}>
            <Text style={styles.infoName}>{username}</Text>
            <Text style={styles.infoHint}>
              Your library, notes and recordings are stored in your Studiply account in the cloud (Supabase, EU),
              protected by your password.
            </Text>
            <Text style={styles.infoHint}>
              Recordings, notes and photos are sent to OpenAI or Anthropic only after you allow it.
            </Text>
          </View>
        </View>

        {/* Sign out */}
        <Text style={styles.sectionLabel}>SESSION</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleSignOut}
            activeOpacity={0.75}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="log-out-outline" size={18} color={c.error} />
            </View>
            <Text style={[styles.actionLabel, { color: c.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
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
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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

  sectionLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.onGradient,
    letterSpacing: Typography.tracking.wider,
    marginBottom: -4,
  },

  infoCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: c.surfaceMuted,
    borderRadius: 14,
    padding: 16,
  },
  infoText: { flex: 1, gap: 4 },
  infoName: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  infoHint: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    lineHeight: 19,
    marginTop: 4,
  },

  card: {
    backgroundColor: c.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: c.text.primary,
  },
});
