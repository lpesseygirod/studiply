/**
 * StatusBanners.tsx
 * The sync line (iPhone: are this phone's changes on Studiply yet?) and
 * today's AI use against the daily limits. Moved unchanged from the old
 * Settings list (step 3.6).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useConnectivity } from '../../lib/connectivity';
import { syncEnabled, syncNow, useSyncCounts } from '../../lib/sync';
import { formatClaude, formatTranscription, getTodayUsage, type TodayUsage } from '../../services/credit-check.service';

/** Today's AI use, loaded once (no request goes to OpenAI or Anthropic for this). */
export function useTodayUsage(): { usage: TodayUsage | null; checking: boolean; refresh: () => Promise<void> } {
  const [usage, setUsage] = useState<TodayUsage | null>(null);
  const [checking, setChecking] = useState(false);
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setUsage(await getTodayUsage());
    } catch {
      setUsage(null);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { usage, checking, refresh };
}

/** "AI today: 12 min of 6 h · $0.04 of $3"; tap to refresh. */
export function AiUsageBanner() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { usage, checking, refresh } = useTodayUsage();

  if (checking && !usage) {
    return (
      <View style={[styles.banner, styles.amber]}>
        <ActivityIndicator size="small" color={c.status.warning.text} />
        <Text style={[styles.text, styles.textAmber]}>Loading AI usage…</Text>
      </View>
    );
  }
  if (!usage) return null;
  if (usage.simulated) {
    return (
      <View style={[styles.banner, styles.amber]}>
        <Ionicons name="flask-outline" size={16} color={c.status.warning.text} />
        <Text style={[styles.text, styles.textAmber]}>AI: Simulated (development)</Text>
      </View>
    );
  }

  const used = `${formatTranscription(usage)} · ${formatClaude(usage)}`;
  const reached = usage.transcriptionReached || usage.claudeReached;
  const nearly =
    usage.transcriptionSeconds >= 0.8 * usage.transcriptionLimitSeconds || usage.claudeUsd >= 0.8 * usage.claudeLimitUsd;
  const [tone, icon, iconColor] = reached
    ? ([styles.red, 'alert-circle', c.status.error.text] as const)
    : nearly
      ? ([styles.amber, 'warning-outline', c.status.warning.text] as const)
      : ([styles.green, 'checkmark-circle', c.status.success.text] as const);
  const textTone = reached ? styles.textRed : nearly ? styles.textAmber : styles.textGreen;

  return (
    <TouchableOpacity style={[styles.banner, tone]} onPress={refresh} activeOpacity={0.75}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text style={[styles.text, textTone]}>{reached ? `Daily AI limit reached · ${used}` : `AI today: ${used}`}</Text>
      <Text style={[styles.hint, textTone]}>Refresh</Text>
    </TouchableOpacity>
  );
}

/** iPhone only: "All changes synced", "2 changes waiting to sync", "1 change couldn't sync" (Try again). */
export function SyncBanner() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
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
      <TouchableOpacity style={[styles.banner, styles.red]} onPress={retry} disabled={busy} activeOpacity={0.75}>
        <Ionicons name="alert-circle" size={16} color={c.error} />
        <Text style={[styles.text, styles.textRed]}>{failed === 1 ? "1 change couldn't sync" : `${failed} changes couldn't sync`}</Text>
        {busy ? <ActivityIndicator size="small" color={c.error} /> : <Text style={[styles.hint, styles.textRed]}>Try again</Text>}
      </TouchableOpacity>
    );
  }
  if (pending > 0) {
    return (
      <TouchableOpacity style={[styles.banner, styles.amber]} onPress={retry} disabled={busy || offline} activeOpacity={0.75}>
        <Ionicons name="cloud-upload-outline" size={16} color={c.status.warning.text} />
        <Text style={[styles.text, styles.textAmber]}>
          {pending === 1 ? '1 change waiting to sync' : `${pending} changes waiting to sync`}
          {offline ? " · syncs when you're back online" : ''}
        </Text>
        {!offline &&
          (busy ? <ActivityIndicator size="small" color={c.status.warning.text} /> : <Text style={[styles.hint, styles.textAmber]}>Sync</Text>)}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.banner, styles.green]}>
      <Ionicons name="checkmark-circle" size={16} color={c.status.success.text} />
      <Text style={[styles.text, styles.textGreen]}>All changes synced</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    green: {
      backgroundColor: c.status.success.bg,
    },
    amber: {
      backgroundColor: c.status.warning.bg,
      borderWidth: 1,
      borderColor: c.status.warning.border,
    },
    red: {
      backgroundColor: c.status.error.bg,
      borderWidth: 1,
      borderColor: c.status.error.border,
    },
    text: {
      flex: 1,
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.medium,
    },
    textGreen: { color: c.status.success.text },
    textAmber: { color: c.status.warning.text },
    textRed: { color: c.status.error.text },
    hint: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.medium,
    },
  });
