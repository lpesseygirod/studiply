import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { addDays, localDay, type Day } from '../../lib/review/lecturePlan';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { a11yState } from '../../utils/a11y';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The month's days as weeks (Monday first), with null for the blanks around them. */
export function monthGrid(year: number, month: number): (Day | null)[][] {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells: (Day | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** "Monday 9 November 2026" */
export function dayName(day: Day): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * A small month calendar drawn by the app (step 9.2-2: the exam date; no date-picker dependency): ‹ the
 * month › and its days, Monday first; today ringed, the chosen day filled. Each day is a button named
 * by its date ("Monday 9 November 2026"), the chosen one selected.
 */
export function MonthCalendar({ value, onChange, now = new Date() }: { value: Day | null; onChange: (day: Day) => void; now?: Date }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const today = localDay(now);
  const start = value ?? today;
  const [shown, setShown] = useState({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) - 1 });
  const move = (n: number) =>
    setShown(({ year, month }) => {
      const m = month + n;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  const title = `${MONTHS[shown.month]} ${shown.year}`;
  return (
    <View style={styles.wrap} {...{ dataSet: { calendar: 'month', month: `${shown.year}-${String(shown.month + 1).padStart(2, '0')}` } }}>
      <View style={styles.head}>
        <Pressable onPress={() => move(-1)} style={styles.nav} accessibilityRole="button" accessibilityLabel="Previous month" {...{ dataSet: { calendar: 'previous' } }}>
          <Ionicons name="chevron-back" size={18} color={c.text.primary} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
          {title}
        </Text>
        <Pressable onPress={() => move(1)} style={styles.nav} accessibilityRole="button" accessibilityLabel="Next month" {...{ dataSet: { calendar: 'next' } }}>
          <Ionicons name="chevron-forward" size={18} color={c.text.primary} />
        </Pressable>
      </View>
      <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w.slice(0, 2)}
          </Text>
        ))}
      </View>
      {monthGrid(shown.year, shown.month).map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((day, j) =>
            day ? (
              <Pressable
                key={day}
                onPress={() => onChange(day)}
                style={({ pressed }) => [styles.day, day === today && styles.today, day === value && styles.chosen, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={dayName(day)}
                {...a11yState({ selected: day === value })}
                {...{ dataSet: { day } }}
              >
                <Text style={[styles.dayText, day === value && styles.chosenText]}>{Number(day.slice(8))}</Text>
              </Pressable>
            ) : (
              <View key={`blank-${j}`} style={styles.day} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 4, paddingVertical: 8 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    week: { flexDirection: 'row', justifyContent: 'space-between' },
    weekday: { flex: 1, textAlign: 'center', fontSize: Typography.size.xs, color: c.text.secondary },
    day: { flex: 1, maxWidth: 44, height: 40, marginHorizontal: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    today: { borderWidth: 1, borderColor: c.accent },
    chosen: { backgroundColor: c.accentDark },
    pressed: { opacity: 0.7 },
    dayText: { fontSize: Typography.size.sm, color: c.text.primary },
    chosenText: { fontWeight: Typography.weight.bold, color: c.accentOn },
  });
