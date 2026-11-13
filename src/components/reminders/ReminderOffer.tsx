import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { declineReminderOffer, getReminderPrefs, shouldOfferReminders } from '../../services/reminders/reminders.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { reminderExplanation, turnOnReminders } from './reminderDialogs';

/**
 * The reminders offer (decision 5), on the iPhone's Review the first time something is due: the app explains
 * the reminders (iOS's own question has no text of ours), then **Turn on reminders** (iOS asks) or
 * **Not now**. Either answer hides it for good; the Settings switch stays. Never on the web.
 */
export function ReminderOffer({ dueToday }: { dueToday: number }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    shouldOfferReminders(dueToday)
      .then(async (show) => {
        if (live) setTime(show ? (await getReminderPrefs()).time : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [dueToday]);
  if (!time) return null;
  const done = () => setTime(null);
  return (
    <View style={styles.card} {...{ dataSet: { reminders: 'offer' } }}>
      <View style={styles.head}>
        <Ionicons name="notifications-outline" size={20} color={c.accentDark} />
        <Text style={styles.title} accessibilityRole="header">
          Get a daily reminder?
        </Text>
      </View>
      <Text style={styles.body}>{reminderExplanation(time)}</Text>
      <View style={styles.buttons}>
        <Pressable
          onPress={() => {
            done();
            void declineReminderOffer();
          }}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            done();
            void turnOnReminders(time, { explain: false });
          }}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Turn on reminders</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: { padding: 16, borderRadius: 14, backgroundColor: c.card, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    body: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 19 },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    secondary: { height: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    secondaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.button.primary, justifyContent: 'center' },
    primaryText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    pressed: { opacity: 0.7 },
  });
