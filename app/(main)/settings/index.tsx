import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import Avatar from '../../../src/components/Avatar';
import {
  checkAICredits,
  getEstimatedBalances,
  type AICreditStatus,
  type EstimatedBalances,
} from '../../../src/services/credit-check.service';

// Check whether real AI keys are configured at bundle time.
const hasRealAIKeys = !!(
  process.env.EXPO_PUBLIC_OPENAI_API_KEY &&
  process.env.EXPO_PUBLIC_OPENAI_API_KEY !== 'your_openai_api_key_here' &&
  process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY &&
  process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here'
);

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

// -------------------------------------------------------------------
// AiStatusBanner — shows combined balance for both providers
// -------------------------------------------------------------------
function AiStatusBanner({
  creditStatus,
  balances,
  onPress,
}: {
  creditStatus: AICreditStatus;
  balances: EstimatedBalances | null;
  onPress: () => void;
}) {
  const openaiOk = creditStatus.openai.ok;
  const anthropicOk = creditStatus.anthropic.ok;
  const hasIssue = !openaiOk || !anthropicOk;

  // Determine worst balance status across both providers
  const openaiEmpty = balances?.openai.status === 'empty';
  const anthropicEmpty = balances?.anthropic.status === 'empty';
  const openaiLow = balances?.openai.status === 'low';
  const anthropicLow = balances?.anthropic.status === 'low';
  const anyEmpty = openaiEmpty || anthropicEmpty;
  const anyLow = openaiLow || anthropicLow;

  // Total remaining
  const totalRemaining =
    (balances?.openai.remaining ?? 0) + (balances?.anthropic.remaining ?? 0);

  if (hasIssue) {
    const url = !openaiOk
      ? 'https://platform.openai.com/settings/organization/billing'
      : 'https://console.anthropic.com/settings/billing';
    const label = !openaiOk
      ? creditStatus.openai.error === 'openai_invalid_key'
        ? '🐷 OpenAI: Invalid key'
        : '🐷 OpenAI: Needs credits'
      : creditStatus.anthropic.error === 'anthropic_invalid_key'
      ? '🐷 Claude: Invalid key'
      : '🐷 Claude: Needs credits';
    return (
      <TouchableOpacity
        style={[styles.apiBanner, styles.apiBannerRed]}
        onPress={() => Linking.openURL(url)}
        activeOpacity={0.75}
      >
        <Ionicons name="alert-circle" size={16} color="#CC3333" />
        <Text style={[styles.apiBannerText, styles.apiBannerTextRed]}>{label}</Text>
        <Text style={[styles.apiBannerHint, styles.apiBannerTextRed]}>Add credits →</Text>
      </TouchableOpacity>
    );
  }

  if (anyEmpty) {
    const url = openaiEmpty
      ? 'https://platform.openai.com/settings/organization/billing'
      : 'https://console.anthropic.com/settings/billing';
    return (
      <TouchableOpacity
        style={[styles.apiBanner, styles.apiBannerRed]}
        onPress={() => Linking.openURL(url)}
        activeOpacity={0.75}
      >
        <Ionicons name="alert-circle" size={16} color="#CC3333" />
        <Text style={[styles.apiBannerText, styles.apiBannerTextRed]}>AI: Credits empty! 🐷</Text>
        <Text style={[styles.apiBannerHint, styles.apiBannerTextRed]}>Add credits →</Text>
      </TouchableOpacity>
    );
  }

  if (anyLow) {
    return (
      <TouchableOpacity
        style={[styles.apiBanner, styles.apiBannerAmber]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <Ionicons name="warning-outline" size={16} color="#8B6914" />
        <Text style={[styles.apiBannerText, styles.apiBannerTextAmber]}>
          AI: Low balance • ~${totalRemaining.toFixed(2)} remaining 🐷
        </Text>
        <Text style={[styles.apiBannerHint, styles.apiBannerTextAmber]}>Tap to recheck</Text>
      </TouchableOpacity>
    );
  }

  const remainingLabel = balances
    ? ` • ~$${totalRemaining.toFixed(2)} remaining`
    : '';

  return (
    <TouchableOpacity
      style={[styles.apiBanner, styles.apiBannerGreen]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name="checkmark-circle" size={16} color="#2D8A5A" />
      <Text style={[styles.apiBannerText, styles.apiBannerTextGreen]}>
        AI: Connected{remainingLabel}
      </Text>
      <Text style={[styles.apiBannerHint, styles.apiBannerTextGreen]}>Tap to recheck</Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();

  const [creditStatus, setCreditStatus] = useState<AICreditStatus | null>(null);
  const [balances, setBalances] = useState<EstimatedBalances | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(async () => {
    if (!hasRealAIKeys || isChecking) return;
    setIsChecking(true);
    try {
      const uid = profile?.id;
      const [result, bal] = await Promise.all([
        checkAICredits(uid),
        uid ? getEstimatedBalances(uid) : Promise.resolve(null),
      ]);
      setCreditStatus(result);
      setBalances(bal);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, profile?.id]);

  useEffect(() => {
    if (hasRealAIKeys) runCheck();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = profile?.initials ?? '??';
  const username = profile?.username ?? '—';

  return (
    <View style={styles.container}>
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
          <Avatar size={52} initials={initials} />
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
          {SETTINGS_ROWS.map((row, index) => (
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
              {index < SETTINGS_ROWS.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── AI status banner ──────────────────────────────────── */}
        {!hasRealAIKeys ? (
          <View style={[styles.apiBanner, styles.apiBannerAmber]}>
            <Ionicons name="alert-circle-outline" size={16} color="#8B6914" />
            <Text style={[styles.apiBannerText, styles.apiBannerTextAmber]}>
              AI: Simulated mode — add API keys in .env for real transcription
            </Text>
          </View>
        ) : isChecking ? (
          <View style={[styles.apiBanner, styles.apiBannerAmber]}>
            <ActivityIndicator size="small" color="#8B6914" />
            <Text style={[styles.apiBannerText, styles.apiBannerTextAmber]}>
              Checking AI credits…
            </Text>
          </View>
        ) : creditStatus ? (
          <AiStatusBanner
            creditStatus={creditStatus}
            balances={balances}
            onPress={runCheck}
          />
        ) : null}

        {/* ── App version ───────────────────────────────────────── */}
        <Text style={styles.versionText}>Studiply v0.1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF9',
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
