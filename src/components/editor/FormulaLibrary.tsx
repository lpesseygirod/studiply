import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { FORMULA_GROUPS, searchFormulas } from '../../editor/formulas/library';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

/**
 * The formula library (step 4.7c), the same on both devices: a search box,
 * then the formulas under their group's heading, each with its name and the
 * formula in plain text. A pick puts in its formula card. Laptop: a popover
 * from Insert ▾; iPhone: in the formula sheet.
 */
export function FormulaLibrary({ onPick, maxHeight, autoFocus = false }: { onPick: (id: string) => void; maxHeight?: number; autoFocus?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [query, setQuery] = useState('');
  const found = searchFormulas(query);
  return (
    <View style={styles.box}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search formulas"
        placeholderTextColor={c.text.placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={styles.search}
        accessibilityLabel="Search formulas"
      />
      <ScrollView style={maxHeight ? { maxHeight } : undefined} keyboardShouldPersistTaps="handled">
        {!found.length && <Text style={styles.none}>No formula matches “{query.trim()}”.</Text>}
        {FORMULA_GROUPS.map((group) => {
          const entries = found.filter((e) => e.group === group);
          if (!entries.length) return null;
          return (
            <View key={group}>
              <Text style={styles.heading} accessibilityRole="header">
                {group}
              </Text>
              {entries.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => onPick(e.id)}
                  style={({ hovered }: { hovered?: boolean }) => [styles.row, hovered && styles.hover]}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${e.name}`}
                >
                  <Text style={styles.name}>{e.name}</Text>
                  <Text style={styles.plain}>{e.plain}</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: { gap: 6 },
    search: {
      marginHorizontal: 10,
      height: 36,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: Typography.size.base,
      color: c.text.primary,
      outlineStyle: 'none' as never,
    },
    heading: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 2,
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.semibold,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.text.secondary,
    },
    row: { paddingHorizontal: 10, paddingVertical: 7, marginHorizontal: 4, borderRadius: 8, gap: 1 },
    hover: { backgroundColor: c.cardMuted },
    name: { fontSize: Typography.size.base, color: c.text.primary },
    plain: { fontSize: Typography.size.sm, color: c.text.secondary },
    none: { paddingHorizontal: 14, paddingVertical: 12, fontSize: Typography.size.sm, color: c.text.secondary },
  });
