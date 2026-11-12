import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import { useReminderPrefs } from '../../../src/hooks/useReminderPrefs';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { confirmSignOut } from '../../../src/utils/signOut';
import {
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
import { SettingsRows, type SettingsRowItem } from '../../../src/components/settings/SettingsRows';
import { useExportData } from '../../../src/components/settings/ExportData';
import { SyncBanner } from '../../../src/components/settings/StatusBanners';
import { useCreditUnits } from '../../../src/hooks/useCredits';
import { useIsAdmin } from '../../../src/hooks/useIsAdmin';
import { creditsValue } from '../../../src/lib/credits/format';
import { useAiConsent } from '../../../src/components/settings/AiConsentCard';
import { DeleteAccountButton } from '../../../src/components/settings/DeleteAccount';
import { LegalLinks } from '../../../src/components/legal/LegalLinks';
import { SETTINGS_LEGAL_LINKS } from '../../../src/legal/pages';

/**
 * Settings (docs/design iphone-07). iPhone: the profile card
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
  const creditUnits = useCreditUnits();
  const aiConsent = useAiConsent();
  const reminders = useReminderPrefs();
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof getStorageStats>> | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    getStorageStats(profile.id).then(setStorage).catch(() => {});
  }, [profile?.id]);

  const values: Partial<Record<SettingsSectionKey, string>> = {
    // Credits: "12 left", "6¾ left", "None left".
    credits: creditsValue(creditUnits),
    summaries: loading ? '' : summaryLevelValue(settings.default_summary_level),
    recording: loading ? '' : languageValue(settings.default_language),
    // iphone-07: whether AI is allowed. Today's use moved to Development.
    'ai-privacy': aiConsent.allowed === null ? '' : aiConsent.allowed ? 'Allowed' : 'Off',
    storage: storageValue(storage),
    appearance: appearanceValue(appearance),
    development: backend.label,
    // iphone-07 ("19:00"): the reminders' time, or Off; the web has none.
    ...(reminders.supported && reminders.prefs && { notifications: reminders.prefs.enabled ? reminders.prefs.time : 'Off' }),
  };

  // iphone-07: Export my data as its own row, after Appearance; the same sheet as in
  // Account and Your data.
  const exportData = useExportData();
  // Lea's dashboard (part A: its Codes): admins only, on the web (the iPhone app never asks).
  const isAdmin = useIsAdmin() === true;
  const adminRow: SettingsRowItem[] = isAdmin
    ? [{ key: 'admin', label: 'Admin', letter: 'Z', tone: 'neutral', onPress: () => router.push('/admin'), dataSet: { settings: 'admin' } }]
    : [];
  const sectionRows: SettingsRowItem[] = visibleSections(__DEV__)
    .filter((s) => s.key !== 'account')
    .flatMap((s) => {
      const row: SettingsRowItem = {
        key: s.key,
        label: s.label,
        letter: s.letter,
        tone: s.tone,
        value: values[s.key],
        onPress: () => router.push(sectionHref(s.key)),
      };
      if (s.key !== 'appearance') return [row];
      return [
        row,
        {
          key: 'export-data',
          label: 'Export my data',
          letter: 'E',
          tone: 'neutral',
          value: exportData.offline ? 'Needs a connection' : undefined,
          onPress: exportData.open,
          dataSet: { exportData: 'list-row' },
        },
      ];
    });
  const rows = [...sectionRows, ...adminRow];

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
        {exportData.sheet}

        <TouchableOpacity
          style={styles.signOut}
          onPress={() => confirmSignOut(signOut, { title: 'Sign out', message: 'You can sign in again with your email and password.' })}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
        {/* iphone-07: Delete account… under Sign out. */}
        <DeleteAccountButton variant="link" />

        <Text style={styles.versionText}>Studiply v0.1.0</Text>
        {/* iphone-07's footer: the legal pages. */}
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
