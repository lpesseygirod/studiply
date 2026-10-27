/**
 * SimulatedAiBadge.tsx
 * Development builds only: "SIMULATED AI" at the top of every screen while
 * AI answers are simulated (forced with EXPO_PUBLIC_MOCK_AI=1, or the last
 * call fell back because the Edge Functions weren't running), so simulated
 * notes are never mistaken for real ones. Touches pass through it.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../theme/ThemeProvider';
import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useSimulatedAi } from '../lib/aiMode';

export function SimulatedAiBadge({ top }: { top: number }) {
  const styles = useThemedStyles(makeStyles);
  const state = useSimulatedAi();
  if (!__DEV__ || !state) return null;
  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none" testID="simulated-ai-badge">
      <View style={styles.badge}>
        <Text style={styles.text}>
          SIMULATED AI · {state === 'forced' ? 'EXPO_PUBLIC_MOCK_AI=1' : 'functions not running'}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 1000,
    },
    badge: {
      backgroundColor: c.status.warning.bg,
      borderColor: c.status.warning.border,
      borderWidth: 1,
      borderRadius: 100,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    text: {
      fontSize: Typography.size.xxs,
      fontWeight: Typography.weight.bold,
      letterSpacing: Typography.tracking.wide,
      color: c.status.warning.text,
    },
  });
