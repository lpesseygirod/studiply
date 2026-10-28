import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import type { DocTab } from '../../services/document.service';
import { useThemedStyles } from '../../theme/ThemeProvider';

export const TAB_LABELS: Record<DocTab, string> = { notes: 'My notes', summary: 'Summary', transcript: 'Transcript' };
const TABS: DocTab[] = ['notes', 'summary', 'transcript'];

/**
 * A lecture's tabs: a white pill on the laptop (docs/design desktop-01), a
 * segmented control filling the width on the iPhone (iphone-06).
 */
export function DocumentTabs({ tab, onChange, fill = false }: { tab: DocTab; onChange: (tab: DocTab) => void; fill?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.bar, fill && styles.barFill]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const selected = t === tab;
        return (
          <Pressable
            key={t}
            onPress={() => onChange(t)}
            style={[styles.tab, fill && styles.tabFill, selected && (fill ? styles.selectedFill : styles.selected)]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{TAB_LABELS[t]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: c.card, alignSelf: 'flex-start' },
    barFill: { alignSelf: 'stretch', backgroundColor: c.cardMuted },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9 },
    tabFill: { flex: 1, alignItems: 'center' },
    selected: { backgroundColor: c.cardMuted },
    selectedFill: { backgroundColor: c.card },
    label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.text.secondary },
    labelSelected: { color: c.text.primary, fontWeight: Typography.weight.semibold },
  });
