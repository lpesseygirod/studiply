import React from 'react';
import { Platform, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { PAGE_COLORS } from '../../editor/editorCss';
import { Typography } from '../../constants/typography';
import type { FunctionHelp, HelpPart } from '../../lib/sheets';

const web = Platform.OS === 'web';

/**
 * Under the formula bar while a formula is typed: the
 * functions starting with the letters typed (↑ ↓ to choose, Tab or Enter
 * or a click to take one), else the help line of the function the cursor
 * is in, its current argument in bold: PMT(**rate**, nper, pv, [fv], [type]).
 * Pressing an item keeps the focus in the input (the formula isn't left).
 */
export function FunctionHints({
  suggestions,
  index,
  onPick,
  onPressIn,
  help,
  summary,
  at,
  onHeight,
}: {
  suggestions: FunctionHelp[];
  index: number;
  onPick: (name: string) => void;
  /** A finger (or the mouse) went down on a function: the formula must keep its focus. */
  onPressIn?: () => void;
  help: HelpPart[] | null;
  summary: string | null;
  /** Where in the grid and how wide: under the cell being edited (or above it, low in the grid), always inside the grid. */
  at: { top?: number; bottom?: number; left: number; width: number };
  /** Its height when drawn (the phone keeps the edited cell above it). */
  onHeight?: (height: number) => void;
}) {
  const measured = onHeight ? { onLayout: (e: LayoutChangeEvent) => onHeight(e.nativeEvent.layout.height) } : {};
  if (suggestions.length > 0) {
    return (
      <View style={[styles.panel, at]} {...measured} accessibilityRole="menu" accessibilityLabel="Functions" {...(web ? { dataSet: { hints: 'list' } } : {})}>
        {suggestions.slice(0, 8).map((f, i) => (
          <View
            key={f.name}
            // A press here must not take the focus from the formula (it would end the editing).
            onStartShouldSetResponder={() => true}
            onResponderGrant={(e: GestureResponderEvent) => {
              onPressIn?.();
              e.preventDefault();
            }}
            onResponderRelease={() => onPick(f.name)}
            style={[styles.item, i === index && styles.itemOn]}
            accessibilityRole="menuitem"
            accessibilityLabel={`${f.name}, ${f.group}`}
            {...(web ? { dataSet: { fn: f.name, on: i === index ? '1' : '0' } } : {})}
          >
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.group}>{f.group}</Text>
            {/* Wraps when the list is narrow (never cut). */}
            <Text style={styles.summary}>{f.summary}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (!help) return null;
  return (
    <View style={[styles.panel, at]} {...measured} {...(web ? { dataSet: { hints: 'help' } } : {})}>
      <Text style={styles.help} accessibilityLabel={help.map((p) => p.text).join('')}>
        {help.map((p, i) =>
          p.current ? (
            <Text key={i} style={styles.current} {...(web ? { dataSet: { current: '1' } } : {})}>
              {p.text}
            </Text>
          ) : (
            p.text
          ),
        )}
      </Text>
      {summary && <Text style={styles.helpSummary}>{summary}</Text>}
    </View>
  );
}

const C = PAGE_COLORS;

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    zIndex: 20,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    shadowColor: C.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  item: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  itemOn: { backgroundColor: C.accentLight },
  name: { width: 64, flexShrink: 0, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: C.text.primary },
  group: { width: 50, flexShrink: 0, fontSize: Typography.size.xs, color: C.accentDark },
  summary: { flex: 1, minWidth: 0, fontSize: Typography.size.xs, color: C.text.secondary },
  help: { paddingHorizontal: 12, paddingTop: 4, fontSize: Typography.size.sm, color: C.text.secondary, flexWrap: 'wrap' },
  current: { fontWeight: Typography.weight.bold, color: C.text.primary },
  helpSummary: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 4, fontSize: Typography.size.xs, color: C.text.secondary },
});
