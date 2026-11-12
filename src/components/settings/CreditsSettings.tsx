/**
 * CreditsSettings.tsx
 * Settings → Credits (step 10.2-2, docs/reports/plan-10.2-2.md §1; Lea 12 Nov; no mockup: Settings'
 * cards, rows and section headings, desktop-05 / iphone-07). The balance as lectures, what a credit
 * covers, what extras use, the last 20 changes in her words, and the fair-use line. Buying: the laptop
 * names the iPhone app (no link, no price: App Store rule 3.1.1); the iPhone says it comes soon, with
 * no button, until the buy sheet (10.2-4).
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { useCredits } from '../../hooks/useCredits';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { refreshCredits } from '../../services/credits.service';
import { getTodayUsage } from '../../services/credit-check.service';
import { BUY_ON_IPHONE, BUY_SOON, balanceLine, balanceSpoken, historyLine } from '../../lib/credits/format';
import { makeSettingsStyles } from './styles';
import { extrasLine } from '../../lib/credits/extras';
import { RedeemCode } from './RedeemCode';

/** What extras use (plan-10.2 §3, with Sonnet prices). */
const EXTRAS: readonly [string, string][] = [
  ['Quiz', 'up to 10 questions ¼ · up to 25 ½ · more ¾'],
  ['Writing a summary again', '½'],
  ['Extend, Merge or Exam pack', '½'],
];

const clockTime = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function CreditsSettings() {
  const settingsStyles = useThemedStyles(makeSettingsStyles);
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { credits, loading, offline, updatedAt } = useCredits();
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    void refreshCredits({ force: true });
    getTodayUsage()
      .then((u) => setLimitReached(!u.simulated && (u.transcriptionReached || u.claudeReached || u.extrasReached)))
      .catch(() => {});
  }, []);

  if (!credits) {
    return (
      <View style={[settingsStyles.card, styles.balanceCard]}>
        {loading ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <Text style={styles.covers}>{offline ? 'Your credits need a connection.' : 'Your credits couldn’t be read. Try again in a moment.'}</Text>
        )}
      </View>
    );
  }

  const now = new Date();
  return (
    <>
      <View style={[settingsStyles.card, styles.balanceCard]} {...{ dataSet: { credits: 'balance-card' } }}>
        <Text style={styles.balance} accessibilityRole="header" accessibilityLabel={balanceSpoken(credits.units)} {...{ dataSet: { credits: 'balance' } }}>
          {balanceLine(credits.units)}
        </Text>
        {offline && updatedAt !== null && <Text style={styles.small}>Updated {clockTime(updatedAt)} · offline</Text>}
        {offline && updatedAt === null && <Text style={styles.small}>Offline: the last balance this iPhone knows</Text>}
        <Text style={styles.covers}>
          1 credit = 1 lecture: its transcript, its first summary and the study assistant on it. Every started 2 hours of recording counts as one lecture.
        </Text>
        <Text style={styles.covers}>Credits never expire.</Text>
        <Text style={styles.buy} {...{ dataSet: { credits: 'buy' } }}>
          {Platform.OS === 'ios' ? BUY_SOON : BUY_ON_IPHONE}
        </Text>
      </View>

      {/* Codes (part A): on the web only (App Store rule 3.1.1); nothing on the iPhone. */}
      <RedeemCode />

      <Text style={settingsStyles.sectionHeader} accessibilityRole="header">
        WHAT EXTRAS USE
      </Text>
      <View style={settingsStyles.card} {...{ dataSet: { credits: 'extras' } }}>
        {EXTRAS.map(([label, value], i) => (
          <React.Fragment key={label}>
            {i > 0 && <View style={settingsStyles.divider} />}
            <View style={styles.row} accessible accessibilityLabel={`${label}: ${value.replace(/¼/g, 'a quarter').replace(/½/g, 'half').replace(/¾/g, 'three quarters')} of a credit`}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          </React.Fragment>
        ))}
        <View style={settingsStyles.divider} />
        {/* Step 10.2-1b: they cost no credits but use the assistant & extras allowance. */}
        <Text style={[styles.small, styles.free]}>No credits: grading your answers, flashcards, reading a past exam, Clarify and Ask Claude. They use your assistant allowance.</Text>
      </View>

      <Text style={settingsStyles.sectionHeader} accessibilityRole="header">
        HISTORY
      </Text>
      <View style={settingsStyles.card} {...{ dataSet: { credits: 'history' } }}>
        {credits.history.length === 0 ? (
          <Text style={[styles.small, styles.free]}>Nothing yet.</Text>
        ) : (
          credits.history.map((row, i) => {
            const line = historyLine(row, now);
            return (
              <React.Fragment key={row.id}>
                {i > 0 && <View style={settingsStyles.divider} />}
                <View style={styles.row} accessible accessibilityLabel={line.spoken} {...{ dataSet: { credits: 'history-row' } }}>
                  <Text style={[styles.amount, line.added && styles.amountAdded]}>{line.amount}</Text>
                  <Text style={styles.rowLabel}>{line.text}</Text>
                  <Text style={styles.rowValue}>{line.date}</Text>
                </View>
              </React.Fragment>
            );
          })
        )}
      </View>
      {/* Step 10.2-1b: the assistant & extras allowance, never in dollars. */}
      {!!extrasLine(credits.extras) && (
        <Text style={styles.covers} {...{ dataSet: { credits: 'extras-left' } }}>
          {extrasLine(credits.extras)}
        </Text>
      )}
      <Text style={styles.footnote}>
        The last 20 changes.{'\n'}Fair use: up to 6 hours of recording transcribed, and a daily allowance for the assistant and summaries, in any 24 hours.
        {limitReached ? ' Today’s limit is reached; it frees up over the next 24 hours.' : ''}
      </Text>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    balanceCard: { padding: 18, gap: 8 },
    balance: {
      fontSize: Typography.size['3xl'],
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
    },
    covers: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 20 },
    buy: { fontSize: Typography.size.sm, color: c.text.primary, fontWeight: Typography.weight.medium, marginTop: 2 },
    small: { fontSize: Typography.size.xs, color: c.text.secondary },
    free: { paddingHorizontal: 16, paddingVertical: 12, lineHeight: 17 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 44,
    },
    rowLabel: { flex: 1, fontSize: Typography.size.sm, color: c.text.primary },
    rowValue: { fontSize: Typography.size.sm, color: c.text.secondary, fontWeight: Typography.weight.medium },
    amount: { minWidth: 40, fontSize: Typography.size.sm, fontWeight: Typography.weight.bold, color: c.text.primary },
    amountAdded: { color: c.status.success.text },
    footnote: { fontSize: Typography.size.xs, color: c.text.onGradient, lineHeight: 17 },
  });
