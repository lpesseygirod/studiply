import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { confirmSignOut } from '../../../src/utils/signOut';
import {
  aiUseValue,
  appearanceValue,
  languageValue,
  sectionHref,
  storageValue,
  summaryLevelValue,
  visibleSections,
  type SettingsSectionKey,
} from '../../../src/utils/settingsSections';
import { getStorageStats } from '../../../src/services/source-file.service';
import UserAvatar from '../../../src/components/UserAvatar';
import { GradientFill } from '../../../src/components/GradientBackground';
import { backend } from '../../../src/components/BackendBadge';
import { SettingsRows } from '../../../src/components/settings/SettingsRows';
import { SyncBanner, useTodayUsage } from '../../../src/components/settings/StatusBanners';
import { useAiConsent } from '../../../src/components/settings/AiConsentCard';
import { DeleteAccountButton } from '../../../src/components/settings/DeleteAccount';
import { LegalLinks } from '../../../src/components/legal/LegalLinks';
import { SETTINGS_LEGAL_LINKS } from '../../../src/legal/pages';

/**
 * Settings (step 3.6, docs/design iphone-07). iPhone: the profile card
 * (Account), the sync line, one row per section with a short value, Sign
 * out. On the laptop /settings opens Account beside the section menu.
 */
export default function SettingsScreen() {
  const wide = useLayoutMode() === 'wide';
  if (wide) return <Redirect href="/settings/account" />;
  return <SettingsList />;
}

function SettingsList() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c, appearance } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { settings, loading } = useUserSettings();
  const { usage } = useTodayUsage();
  const aiConsent = useAiConsent();
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof getStorageStats>> | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    getStorageStats(profile.id).then(setStorage).catch(() => {});
  }, [profile?.id]);

  const values: Partial<Record<SettingsSectionKey, string>> = {
    summaries: loading ? '' : summaryLevelValue(settings.default_summary_level),
    recording: loading ? '' : languageValue(settings.default_language),
    // iphone-07: whether AI is allowed (step 10.1); today's use is on the page itself.
    'ai-privacy': aiConsent.allowed === null ? aiUseValue(usage) : aiConsent.allowed ? 'Allowed' : 'Off',
    storage: storageValue(storage),
    appearance: appearanceValue(appearance),
    development: backend.label,
  };

  const rows = visibleSections(__DEV__)
    .filter((s) => s.key !== 'account')
    .map((s) => ({
      key: s.key,
      label: s.label,
      letter: s.letter,
      tone: s.tone,
      value: values[s.key],
      onPress: () => router.push(sectionHref(s.key)),
    }));

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Settings</Text>

        {/* Profile card: Account */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => router.push('/settings/account')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${profile?.username ?? 'Account'}, Account, sign-in and sync`}
        >
          <UserAvatar size={52} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.username ?? '—'}</Text>
            <Text style={styles.profileHint}>Account, sign-in and sync</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.text.secondary} />
        </TouchableOpacity>

        <SyncBanner />

        <SettingsRows rows={rows} />

        <TouchableOpacity
          style={styles.signOut}
          onPress={() => confirmSignOut(signOut, { title: 'Sign out', message: 'You can sign in again with your email and password.' })}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
        {/* Step 10.1 (iphone-07): Delete account… under Sign out. */}
        <DeleteAccountButton variant="link" />

        <Text style={styles.versionText}>Studiply v0.1.0</Text>
        {/* Step 10.1b-1 (iphone-07's footer): the legal pages. */}
        <LegalLinks slugs={SETTINGS_LEGAL_LINKS} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      gap: 14,
    },

    // The big screen title, as on Library (docs/design iphone-07)
    screenTitle: {
      fontSize: Typography.size['3xl'],
      fontWeight: Typography.weight.extrabold,
      color: c.text.onGradientStrong,
      marginBottom: 6,
    },

    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      gap: 14,
    },
    profileInfo: { flex: 1, gap: 2 },
    profileName: {
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    profileHint: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
    },

    signOut: {
      backgroundColor: c.card,
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
    },
    signOutText: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.accentDark,
    },

    versionText: {
      fontSize: Typography.size.xs,
      color: c.text.onGradient,
      textAlign: 'center',
      marginTop: 4,
    },
  });
