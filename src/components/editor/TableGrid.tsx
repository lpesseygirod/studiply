import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';

const GRID = 10;

/**
 * The laptop's table grid (as Google Docs): point at a cell to
 * choose rows × columns ("3 × 4" shows under it), click to insert. Bigger
 * tables are typed in below it (TableSizeForm).
 */
export function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const [at, setAt] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {Array.from({ length: GRID }, (_, r) => (
          <View key={r} style={styles.row}>
            {Array.from({ length: GRID }, (_, c) => {
              const on = r < at.r && c < at.c;
              return (
                <Pressable
                  key={c}
                  onHoverIn={() => setAt({ r: r + 1, c: c + 1 })}
                  onPressIn={() => setAt({ r: r + 1, c: c + 1 })}
                  onPress={() => onPick(r + 1, c + 1)}
                  style={[styles.cell, on && styles.cellOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${r + 1} by ${c + 1}`}
                />
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.size}>{at.r ? `${at.r} × ${at.c}` : 'Choose the size'}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { padding: 12, gap: 8, alignItems: 'center' },
    grid: { gap: 3 },
    row: { flexDirection: 'row', gap: 3 },
    cell: { width: 20, height: 20, borderRadius: 3, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    cellOn: { backgroundColor: c.accentLight, borderColor: c.accent },
    size: { fontSize: Typography.size.sm, color: c.text.secondary },
  });
