import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { OutlineHeading } from '../../editor/writing/outline';

const web = Platform.OS === 'web';

/**
 * A document's outline: its headings indented by level, the
 * section the cursor is in in the accent (it follows as the student
 * writes, and stays in view); pressing one jumps there. The laptop shows
 * it beside the page (or over it in a narrow window), the iPhone in a
 * sheet.
 */
export function OutlineList({ headings, current, onPick }: { headings: OutlineHeading[]; current: number; onPick: (heading: OutlineHeading) => void }) {
  const styles = useThemedStyles(makeStyles);
  const scroll = useRef<ScrollView>(null);
  const rows = useRef<number[]>([]);
  // The current heading stays in view as the cursor moves through the text.
  useEffect(() => {
    const y = rows.current[current];
    if (current >= 0 && y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 48), animated: false });
  }, [current]);

  if (headings.length === 0) {
    return <Text style={styles.empty}>Headings you add appear here.</Text>;
  }
  return (
    <ScrollView ref={scroll} style={styles.list} contentContainerStyle={styles.content} {...(web ? { dataSet: { outline: 'list' } } : {})}>
      {headings.map((h, i) => (
        <Pressable
          key={`${h.pos}-${i}`}
          onLayout={(e) => (rows.current[i] = e.nativeEvent.layout.y)}
          onPress={() => onPick(h)}
          style={({ hovered }: { hovered?: boolean }) => [styles.row, { paddingLeft: 10 + Math.max(0, h.level - 1) * 14 }, i === current ? styles.rowOn : hovered && styles.rowHover]}
          accessibilityRole="button"
          aria-selected={i === current}
          {...a11yState({ selected: i === current })}
          accessibilityLabel={h.text}
          {...(web ? { dataSet: { heading: String(i), current: i === current ? '1' : '0' } } : {})}
        >
          <Text style={[styles.text, h.level <= 1 && styles.textTop, h.level === 3 && styles.textSub, i === current && styles.textOn]} numberOfLines={2}>
            {h.text}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    list: { flex: 1 },
    content: { paddingVertical: 6 },
    row: { paddingRight: 10, paddingVertical: 7, borderRadius: 8, minHeight: 34, justifyContent: 'center' },
    rowHover: { backgroundColor: c.cardMuted },
    rowOn: { backgroundColor: c.accentLight },
    text: { fontSize: Typography.size.sm, color: c.text.primary },
    textTop: { fontWeight: Typography.weight.semibold },
    textSub: { color: c.text.secondary },
    textOn: { color: c.accentDark },
    empty: { padding: 12, fontSize: Typography.size.sm, color: c.text.secondary },
  });
