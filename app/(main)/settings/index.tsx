import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { useConnectivity } from '../../../src/lib/connectivity';
import { syncEnabled, syncNow, useSyncCounts } from '../../../src/lib/sync';
import { legacyDataExists } from '../../../src/services/legacyImport';
import UserAvatar from '../../../src/components/UserAvatar';
import {
  formatClaude,
  formatTranscription,
  getTodayUsage,
  type TodayUsage,
} from '../../../src/services/credit-check.service';
import { GradientFill } from '../../../src/components/GradientBackground';

const SETTINGS_ROWS = [
  {
    label: 'General',
    subtitle: 'Recording, AI, retention defaults',
    route: '/settings/general',
    icon: 'settings-outline' as const,
  },
  {
    label: 'Manage Account',
    subtitle: 'Profile, usage, data',
    route: '/settings/account',
    icon: 'person-outline' as const,
  },
  {
    label: 'Security',
    subtitle: 'Sign-in methods and account linking',
    route: '/settings/security',
    icon: 'lock-closed-outline' as const,
  },
  {
    label: 'Recently Deleted',
    subtitle: 'Items are kept for 30 days',
    route: '/settings/trash',
    icon: 'trash-outline' as const,
  },
];

/** Shown while the earlier version's data is still on this iPhone (step 1.9). */
const EARLIER_VERSION_ROW = {
  label: 'Earlier version data',
  subtitle: 'Upload what the earlier app kept on this iPhone',
  icon: 'phone-portrait-outline' as const,
  route: '/settings/earlier-version',
};

// -------------------------------------------------------------------
// AiUsageBanner — today's AI use against the daily limits
// -------------------------------------------------------------------
function AiUsageBanner({ usage, onPress }: { usage: TodayUsage; onPress: () => void }) {
  if (usage.simulated) {
    return (
      <View style={[styles.apiBanner, styles.apiBannerAmber]}>
        <Ionicons name="flask-outline" size={16} color="#8B6914" />
        <Text style={[styles.apiBannerText, styles.apiBannerTextAmber]}>AI: Simulated (development)</Text>
      </View>
    );
  }

  const used = `${formatTranscription(usage)} · ${formatClaude(usage)}`;
  const reached = usage.transcriptionReached || usage.claudeReached;
  const nearly =
    usage.transcriptionSeconds >= 0.8 * usage.transcriptionLimitSeconds || usage.claudeUsd >= 0.8 * usage.claudeLimitUsd;
  const [tone, icon, iconColor] = reached
    ? ([styles.apiBannerRed, 'alert-circle', '#CC3333'] as const)
    : nearly
      ? ([styles.apiBannerAmber, 'warning-outline', '#8B6914'] as const)
      : ([styles.apiBannerGreen, 'checkmark-circle', '#2D8A5A'] as const);
  const textTone = reached ? styles.apiBannerTextRed : nearly ? styles.apiBannerTextAmber : styles.apiBannerTextGreen;

  return (
    <TouchableOpacity style={[styles.apiBanner, tone]} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text style={[styles.apiBannerText, textTone]}>{reached ? `Daily AI limit reached · ${used}` : `AI today: ${used}`}</Text>
      <Text style={[styles.apiBannerHint, textTone]}>Refresh</Text>
    </TouchableOpacity>
  );
}

// -------------------------------------------------------------------
// SyncBanner — iPhone: are this phone's changes on Studiply yet?
// -------------------------------------------------------------------
function SyncBanner() {
  const { pending, failed } = useSyncCounts();
  const offline = useConnectivity() === 'offline';
  const [busy, setBusy] = useState(false);
  if (!syncEnabled) return null;

  const retry = async () => {
    setBusy(true);
    await syncNow().catch(() => {});
    setBusy(false);
  };

  if (failed > 0) {
    return (
      <TouchableOpacity style={[styles.apiBanner, styles.apiBannerRed]} onPress={retry} disabled={busy} activeOpacity={0.75}>
        <Ionicons name="alert-circle" size={16} color={Colors.error} />
        <Text style={[styles.apiBannerText, styles.apiBannerTextRed]}>
          {failed === 1 ? "1 change couldn't sync" : `${failed} changes couldn't sync`}
        </Text>
        {busy ? <ActivityIndicator size="small" color={Colors.error} /> : <Text style={[styles.apiBannerHint, styles.apiBannerTextRed]}>Try again</Text>}
      </TouchableOpacity>
    );
  }
  if (pending > 0) {
    return (
      <TouchableOpacity style={[styles.apiBanner, styles.apiBannerAmber]} onPress={retry} disabled={busy || offline} activeOpacity={0.75}>
        <Ionicons name="cloud-upload-outline" size={16} color="#8B6914" />
        <Text style={[styles.apiBannerText, styles.apiBannerTextAmber]}>
          {pending === 1 ? '1 change waiting to sync' : `${pending} changes waiting to sync`}
          {offline ? " · syncs when you're back online" : ''}
        </Text>
        {!offline && (busy ? <ActivityIndicator size="small" color="#8B6914" /> : <Text style={[styles.apiBannerHint, styles.apiBannerTextAmber]}>Sync</Text>)}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.apiBanner, styles.apiBannerGreen]}>
      <Ionicons name="checkmark-circle" size={16} color="#2D8A5A" />
      <Text style={[styles.apiBannerText, styles.apiBannerTextGreen]}>All changes synced</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();

  // Today's AI use; no request goes to OpenAI or Anthropic for this.
  const [usage, setUsage] = useState<TodayUsage | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      setUsage(await getTodayUsage());
    } catch {
      setUsage(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  // Checked again each time Settings is shown (the old copy may have been removed).
  const [hasEarlier, setHasEarlier] = useState(false);
  useFocusEffect(
    useCallback(() => {
      legacyDataExists().then(setHasEarlier).catch(() => setHasEarlier(false));
    }, []),
  );
  const rows = hasEarlier ? [...SETTINGS_ROWS, EARLIER_VERSION_ROW] : SETTINGS_ROWS;

  const username = profile?.username ?? '—';

  return (
    <View style={styles.container}>
      <GradientFill />
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <Text style={styles.appTitle}>STUDIPLY</Text>
        <Text style={styles.screenSubtitle}>Settings</Text>

        {/* ── Profile card ──────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => router.push('/settings/account')}
          activeOpacity={0.85}
        >
          <UserAvatar size={52} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{username}</Text>
            <View style={styles.profileMeta}>
              <Text style={styles.profileEditHint}>Edit profile →</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
        </TouchableOpacity>

        {/* ── Settings rows ─────────────────────────────────────── */}
        <View style={styles.settingsSection}>
          {rows.map((row, index) => (
            <React.Fragment key={row.route}>
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => router.push(row.route as any)}
                activeOpacity={0.75}
              >
                <View style={styles.settingsRowIcon}>
                  <Ionicons name={row.icon} size={18} color={Colors.text.secondary} />
                </View>
                <View style={styles.settingsRowText}>
                  <Text style={styles.settingsRowLabel}>{row.label}</Text>
                  <Text style={styles.settingsRowSub}>{row.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.text.secondary} />
              </TouchableOpacity>
              {index < rows.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── AI usage banner ───────────────────────────────────── */}
        {isChecking && !usage ? (
          <View style={[styles.apiBanner, styles.apiBannerAmber]}>
            <ActivityIndicator size="small" color="#8B6914" />
            <Text style={[styles.apiBannerText, styles.apiBannerTextAmber]}>Loading AI usage…</Text>
          </View>
        ) : usage ? (
          <AiUsageBanner usage={usage} onPress={runCheck} />
        ) : null}

        {/* ── Sync status (iPhone) ──────────────────────────────── */}
        <SyncBanner />

        {/* ── App version ───────────────────────────────────────── */}
        <Text style={styles.versionText}>Studiply v0.1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

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
    marginBottom: 24,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.salmonLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 14,
  },
  profileInfo: { flex: 1, gap: 4 },
  profileName: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileEditHint: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
  },
  // Settings rows
  settingsSection: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    marginBottom: 20,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  settingsRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowText: { flex: 1, gap: 1 },
  settingsRowLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  settingsRowSub: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginLeft: 60,
  },

  // API banner
  apiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  apiBannerGreen: {
    backgroundColor: '#E8F5EE',
  },
  apiBannerAmber: {
    backgroundColor: '#FFFBF0',
    borderWidth: 1,
    borderColor: '#FFE4B5',
  },
  apiBannerRed: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFCCCC',
  },
  apiBannerText: {
    flex: 1,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  apiBannerTextGreen: {
    color: '#2D8A5A',
  },
  apiBannerTextAmber: {
    color: '#8B6914',
  },
  apiBannerTextRed: {
    color: '#CC3333',
  },
  apiBannerHint: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },

  // Version
  versionText: {
    fontSize: Typography.size.xs,
    color: Colors.text.placeholder,
    textAlign: 'center',
    marginTop: 4,
  },
});
