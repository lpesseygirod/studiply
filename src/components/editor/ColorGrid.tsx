import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { PALETTE } from '../../editor/colors/palette';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * The colour picker's grid (as Word's): "Automatic" or "None",
 * the 10 base colours with their 5 shades below, Recent colours, and More
 * colours… (the spectrum). The same on the laptop (in the toolbar's
 * popovers) and the iPhone (in the colour panel), for text colour,
 * highlight and table cells.
 */
export function ColorGrid({
  value,
  noneLabel,
  recent,
  onPick,
  onMore,
  size = 20,
  kind,
}: {
  /** The colour where the selection is (#RRGGBB), or null. */
  value: string | null;
  /** "Automatic" (text colour) or "None" (highlight, cell). */
  noneLabel: string;
  recent: string[];
  /** A colour, or null for Automatic / None. */
  onPick: (colour: string | null) => void;
  onMore: () => void;
  /** Swatch size: 20 on the laptop, larger on the iPhone. */
  size?: number;
  /** For VoiceOver: "Text colour", "Highlight", "Cell colour". */
  kind: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const current = value?.toUpperCase() ?? null;
  const gap = Math.round(size / 5);

  const swatch = (colour: string, label: string) => (
    <Pressable
      key={`${label}-${colour}`}
      onPress={() => onPick(colour)}
      style={[styles.swatch, { width: size, height: size, backgroundColor: colour }, current === colour && styles.swatchActive]}
      accessibilityRole="button"
      accessibilityLabel={`${kind} ${label}`}
      {...a11yState({ selected: current === colour })}
    />
  );

  return (
    <View style={[styles.wrap, { gap: gap + 4 }]}>
      <Pressable onPress={() => onPick(null)} style={styles.none} accessibilityRole="button" accessibilityLabel={`${kind} ${noneLabel}`}>
        <View style={[styles.noneSwatch, { width: size, height: size }]}>
          {noneLabel === 'Automatic' ? (
            <MaterialCommunityIcons name="format-color-text" size={size * 0.7} color={c.text.primary} />
          ) : (
            <MaterialCommunityIcons name="cancel" size={size * 0.8} color={c.text.secondary} />
          )}
        </View>
        <Text style={styles.label}>{noneLabel}</Text>
        {!current && <MaterialCommunityIcons name="check" size={16} color={c.accentDark} />}
      </Pressable>

      <View style={[styles.grid, { gap }]}>
        {PALETTE.map((col) => (
          <View key={col.key} style={{ gap }}>
            {swatch(col.base, col.label)}
            <View style={{ height: gap / 2 }} />
            {col.shades.map((s, i) => swatch(s, `${col.label} ${['lighter 80 %', 'lighter 60 %', 'lighter 40 %', 'darker 25 %', 'darker 50 %'][i]}`))}
          </View>
        ))}
      </View>

      <View style={{ gap }}>
        <Text style={styles.heading}>Recent colours</Text>
        {recent.length ? (
          <View style={[styles.row, { gap }]}>{recent.map((r) => swatch(r, `recent ${r}`))}</View>
        ) : (
          <Text style={styles.empty}>Colours you pick appear here.</Text>
        )}
      </View>

      <Pressable onPress={onMore} style={styles.more} accessibilityRole="button" accessibilityLabel={`${kind}: more colours`}>
        <MaterialCommunityIcons name="palette-outline" size={18} color={c.text.primary} />
        <Text style={styles.label}>More colours…</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {},
    none: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
    noneSwatch: { borderRadius: 4, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    label: { flex: 1, fontSize: Typography.size.base, color: c.text.primary },
    grid: { flexDirection: 'row' },
    row: { flexDirection: 'row', flexWrap: 'wrap' },
    swatch: { borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    swatchActive: { borderWidth: 2, borderColor: c.accentDark },
    heading: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: c.text.secondary },
    empty: { fontSize: Typography.size.sm, color: c.text.secondary },
    more: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  });
