/**
 * SettingsRows.tsx
 * A white card of rows that open something (docs/design iphone-07): a
 * letter or icon square, the name, an optional line under it, a short value
 * on the right and a chevron. Used by the iPhone's Settings list and by
 * Your data.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { SectionTone } from '../../utils/settingsSections';

export interface SettingsRowItem {
  key: string;
  label: string;
  sub?: string;
  value?: string;
  letter?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  tone?: SectionTone;
  onPress: () => void;
  /** data-* attributes on the row (for the web checks). */
  dataSet?: Record<string, string>;
}

function toneColors(c: ThemeColors, tone: SectionTone): { bg: string; fg: string } {
  switch (tone) {
    case 'accent':
      return { bg: c.accentLight, fg: c.accentDark };
    case 'recording':
      return { bg: c.errorLight, fg: c.error };
    case 'success':
      return { bg: c.status.success.bg, fg: c.status.success.text };
    case 'warning':
      return { bg: c.status.warning.bg, fg: c.status.warning.text };
    case 'exam':
      return { bg: c.marks.exam.bg, fg: c.marks.exam.text };
    case 'neutral':
      return { bg: c.cardMuted, fg: c.text.primary };
  }
}

export function SettingsRows({ rows }: { rows: SettingsRowItem[] }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.card}>
      {rows.map((row, i) => {
        const tone = toneColors(c, row.tone ?? 'neutral');
        return (
          <React.Fragment key={row.key}>
            {i > 0 && <View style={styles.divider} />}
            <TouchableOpacity
              style={styles.row}
              onPress={row.onPress}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={row.value ? `${row.label}, ${row.value}` : row.label}
              {...(row.dataSet ? { dataSet: row.dataSet } : {})}
            >
              <View style={[styles.square, { backgroundColor: tone.bg }]}>
                {row.icon ? (
                  <Ionicons name={row.icon} size={17} color={tone.fg} />
                ) : (
                  <Text style={[styles.letter, { color: tone.fg }]}>{row.letter}</Text>
                )}
              </View>
              <View style={styles.text}>
                <Text style={styles.label}>{row.label}</Text>
                {!!row.sub && <Text style={styles.sub}>{row.sub}</Text>}
              </View>
              {!!row.value && (
                <Text style={styles.value} numberOfLines={1}>
                  {row.value}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.surfaceMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 12,
      minHeight: 52,
    },
    square: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letter: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.bold,
    },
    text: { flex: 1, gap: 1 },
    label: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.text.primary,
    },
    sub: {
      fontSize: Typography.size.xs,
      color: c.text.secondary,
    },
    value: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      maxWidth: 150,
    },
    divider: {
      height: 1,
      backgroundColor: c.surfaceMuted,
      marginLeft: 58,
    },
  });
