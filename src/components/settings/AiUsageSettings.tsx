/**
 * AiUsageSettings.tsx
 * Today's AI use against the daily limits, the all-time cost breakdown and
 * the note about the limits. Moved unchanged from the old Manage Account
 * screen.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../hooks/useAuth';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { getSpendingByOperation, getSpendingByProvider } from '../../services/ai-usage.service';
import { formatClaude, formatExtras, formatTranscription, getTodayUsage, type TodayUsage } from '../../services/credit-check.service';
import { makeSettingsStyles } from './styles';

type ProviderStats = {
  transcription: { totalCost: number; totalMinutes: number; callCount: number };
  anthropic: { totalCost: number; totalTokensIn: number; totalTokensOut: number; callCount: number };
};

type OperationRow = { operation: string; count: number; totalCost: number; label: string };

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function progressColor(pct: number, c: ThemeColors): string {
  if (pct > 0.5) return c.meter.good;
  if (pct > 0.2) return c.meter.low;
  return c.meter.empty;
}

export function AiUsageSettings({ title = 'AI USAGE TODAY' }: { title?: string | null }) {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { profile } = useAuth();

  const [today, setToday] = useState<TodayUsage | null>(null);
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
  const [operationRows, setOperationRows] = useState<OperationRow[]>([]);
  const [piggyLoading, setPiggyLoading] = useState(false);

  const loadPiggyData = useCallback(async (uid: string) => {
    setPiggyLoading(true);
    try {
      const [usage, stats, ops] = await Promise.all([getTodayUsage(), getSpendingByProvider(uid), getSpendingByOperation(uid)]);
      setToday(usage);
      setProviderStats(stats);
      setOperationRows(ops);
    } catch {
      // non-fatal
    } finally {
      setPiggyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.id) loadPiggyData(profile.id);
  }, [profile?.id, loadPiggyData]);

  const totalSpent = (providerStats?.transcription.totalCost ?? 0) + (providerStats?.anthropic.totalCost ?? 0);

  return (
    <>
      {title !== null && <Text style={settingsStyles.sectionHeader}>{title}</Text>}

      {piggyLoading ? (
        <View style={styles.piggyLoading}>
          <ActivityIndicator color={c.salmon} size="small" />
          <Text style={styles.piggyLoadingText}>Loading usage…</Text>
        </View>
      ) : (
        <>
          {today?.simulated && <Text style={styles.costRefNote}>Simulated AI (development): nothing is sent or counted.</Text>}

          <UsageCard
            title="Transcription"
            icon="mic-outline"
            borderColor={c.status.warning.border}
            bgColor={c.status.warning.bg}
            usedLabel={today ? formatTranscription(today) : '—'}
            fraction={today ? today.transcriptionSeconds / today.transcriptionLimitSeconds : 0}
            reached={today?.transcriptionReached ?? false}
            subStats={
              providerStats
                ? `All time: ${fmt(providerStats.transcription.totalMinutes, 1)} min transcribed • ${providerStats.transcription.callCount} part${providerStats.transcription.callCount !== 1 ? 's' : ''}`
                : undefined
            }
          />

          <UsageCard
            title="Summaries & quizzes (Claude)"
            icon="sparkles-outline"
            borderColor={c.accent}
            bgColor={c.accentLight}
            usedLabel={today ? formatClaude(today) : '—'}
            fraction={today ? today.claudeUsd / today.claudeLimitUsd : 0}
            reached={today?.claudeReached ?? false}
            subStats={
              providerStats
                ? `All time: ${providerStats.anthropic.callCount} request${providerStats.anthropic.callCount !== 1 ? 's' : ''} • ${Math.round((providerStats.anthropic.totalTokensIn + providerStats.anthropic.totalTokensOut) / 1000)}K tokens`
                : undefined
            }
          />

          {/* The extras' own daily guard (the 30-day allowance is on Settings → Credits). */}
          <UsageCard
            title="Assistant & extras (Claude)"
            icon="chatbubble-ellipses-outline"
            borderColor={c.accent}
            bgColor={c.accentLight}
            usedLabel={today ? formatExtras(today) : '—'}
            fraction={today ? today.extrasUsd / today.extrasLimitUsd : 0}
            reached={today?.extrasReached ?? false}
          />

          {/* Cost breakdown */}
          {operationRows.length > 0 && (
            <>
              <Text style={[settingsStyles.sectionHeader, { marginTop: 4 }]}>COST BREAKDOWN</Text>
              <View style={settingsStyles.card}>
                {operationRows.map((row, i) => (
                  <React.Fragment key={row.operation}>
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{row.label}</Text>
                      <View style={styles.breakdownRight}>
                        <Text style={styles.breakdownCost}>${fmt(row.totalCost, 4)}</Text>
                        <Text style={styles.breakdownCount}>
                          {row.count} call{row.count !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                    {i < operationRows.length - 1 && <View style={settingsStyles.divider} />}
                  </React.Fragment>
                ))}
                <View style={settingsStyles.divider} />
                <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                  <Text style={styles.breakdownTotalLabel}>Total AI cost (all time)</Text>
                  <Text style={styles.breakdownTotalCost}>${fmt(totalSpent, 4)}</Text>
                </View>
              </View>
            </>
          )}

          {/* Cost reference */}
          <View style={styles.costRefCard}>
            <Text style={styles.costRefTitle}>About these limits</Text>
            <Text style={styles.costRefLine}>• Studiply runs the AI for you; no ElevenLabs or Anthropic account needed</Text>
            <Text style={styles.costRefLine}>• Each limit counts the last 24 hours, so it frees up gradually</Text>
            <Text style={styles.costRefLine}>• 10 min transcription ≈ $0.04 · lecture notes ≈ $0.02–0.30</Text>
          </View>
        </>
      )}
    </>
  );
}

// ── UsageCard — today's use of one daily limit ───────────────────────────

interface UsageCardProps {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  borderColor: string;
  bgColor: string;
  /** e.g. "12 min of 6 h" */
  usedLabel: string;
  /** Share of the limit used, 0–1. */
  fraction: number;
  reached: boolean;
  subStats?: string;
}

function UsageCard({ title, icon, borderColor, bgColor, usedLabel, fraction, reached, subStats }: UsageCardProps) {
  const piggyStyles = useThemedStyles(makePiggyStyles);
  const { colors: c } = useTheme();
  const pctLeft = Math.max(0, 1 - Math.min(fraction, 1));
  const barColor = progressColor(pctLeft, c);

  return (
    <View style={[piggyStyles.card, { borderColor, backgroundColor: bgColor }]}>
      <View style={piggyStyles.header}>
        <View style={[piggyStyles.iconWrap, { borderColor }]}>
          <Ionicons name={icon} size={16} color={borderColor} />
        </View>
        <Text style={piggyStyles.title}>{title}</Text>
      </View>

      <View style={piggyStyles.balanceRow}>
        <Text style={piggyStyles.balanceLabel}>Used today</Text>
        <Text style={[piggyStyles.balanceValue, { color: barColor, fontWeight: Typography.weight.bold }]}>{usedLabel}</Text>
      </View>

      <View style={piggyStyles.barTrack}>
        <View style={[piggyStyles.barFill, { width: `${Math.round(Math.min(fraction, 1) * 100)}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[piggyStyles.barLabel, { color: barColor }]}>{Math.round(pctLeft * 100)}% left today</Text>

      {subStats ? <Text style={piggyStyles.subStats}>{subStats}</Text> : null}

      {reached && (
        <View style={piggyStyles.warningRed}>
          <Ionicons name="alert-circle" size={14} color={c.status.error.text} />
          <Text style={piggyStyles.warningTextRed}>Daily limit reached. It frees up over the next 24 hours.</Text>
        </View>
      )}
    </View>
  );
}

const makePiggyStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1.5,
      padding: 16,
      gap: 8,
      marginBottom: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 4,
    },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glass,
    },
    title: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
      flex: 1,
    },
    balanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    balanceLabel: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
    },
    balanceValue: {
      fontSize: Typography.size.sm,
      color: c.text.primary,
      fontWeight: Typography.weight.medium,
    },
    barTrack: {
      height: 8,
      backgroundColor: c.track,
      borderRadius: 4,
      overflow: 'hidden',
      marginTop: 4,
    },
    barFill: {
      height: '100%',
      borderRadius: 4,
    },
    barLabel: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.medium,
      marginTop: -2,
    },
    subStats: {
      fontSize: Typography.size.xs,
      color: c.text.secondary,
      marginTop: 2,
    },
    warningRed: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.status.error.bg,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginTop: 4,
    },
    warningTextRed: {
      fontSize: Typography.size.xs,
      color: c.status.error.text,
      fontWeight: Typography.weight.medium,
    },
  });

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    piggyLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 20,
    },
    piggyLoadingText: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
    },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    breakdownLabel: {
      fontSize: Typography.size.sm,
      color: c.text.primary,
      fontWeight: Typography.weight.medium,
      flex: 1,
    },
    breakdownRight: {
      alignItems: 'flex-end',
      gap: 1,
    },
    breakdownCost: {
      fontSize: Typography.size.sm,
      color: c.text.primary,
      fontWeight: Typography.weight.semibold,
    },
    breakdownCount: {
      fontSize: Typography.size.xs,
      color: c.text.secondary,
    },
    breakdownTotal: {
      paddingTop: 14,
      paddingBottom: 14,
    },
    breakdownTotalLabel: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
      flex: 1,
    },
    breakdownTotalCost: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
    },
    costRefCard: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 12,
      padding: 14,
      gap: 5,
    },
    costRefTitle: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.bold,
      color: c.text.secondary,
      marginBottom: 2,
      letterSpacing: Typography.tracking.wide,
    },
    costRefLine: {
      fontSize: Typography.size.xs,
      color: c.text.secondary,
      lineHeight: 18,
    },
    costRefNote: {
      fontSize: Typography.size.xs,
      color: c.text.placeholder,
      marginTop: 6,
      lineHeight: 16,
      fontStyle: 'italic',
    },
  });
