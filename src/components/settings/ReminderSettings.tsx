import React, { useState } from 'react';
import { FlatList, Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useReminderPrefs } from '../../hooks/useReminderPrefs';
import { REMINDER_TIMES } from '../../lib/review/reminderPlan';
import { setReminderTime, setRemindersEnabled } from '../../services/reminders/reminders.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { a11yState } from '../../utils/a11y';
import { errorMessage } from '../../utils/errors';
import { showAlert } from '../dialogs/dialogs';
import { turnOnReminders } from '../reminders/reminderDialogs';
import { SettingSwitch } from './PreferenceSettings';
import { makeSettingsStyles } from './styles';

/**
 * Settings → Notifications (step 9.2-3; no mockup: Settings' cards, iphone-07's "Notifications 19:00").
 * - iPhone: **Review reminders** (a switch: off cancels every reminder at once, on plans them again;
 *   the first time, the app explains, then iOS asks) and **Time** (a list every 30 minutes, 06:00–23:30;
 *   greyed while off). When iOS refuses them: a line and **Open iOS Settings**. Kept on this iPhone.
 * - The laptop (and the web at any width): no reminders; one card says they come on the iPhone.
 * `onSaved` shows the page's ✓.
 */
export function ReminderSettings({ onSaved }: { onSaved: () => void }) {
  const styles = useThemedStyles(makeSettingsStyles);
  const own = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, permission, supported } = useReminderPrefs();
  const [picking, setPicking] = useState(false);

  if (!supported) {
    return (
      <View style={[styles.card, own.padded]} {...{ dataSet: { reminders: 'laptop' } }}>
        <Ionicons name="phone-portrait-outline" size={22} color={c.text.secondary} />
        <View style={own.grow}>
          <Text style={own.title}>Review reminders come on your iPhone</Text>
          <Text style={own.body}>
            Studiply’s iPhone app reminds you 1, 3, 7 and 21 days after each lecture, and before an exam: one notification a day. Turn them on or change their time in the iPhone app’s Settings → Notifications. Here, Review today in the sidebar shows what’s due.
          </Text>
        </View>
      </View>
    );
  }
  if (!prefs) return null;

  const denied = permission === 'denied';
  const toggle = async (on: boolean) => {
    try {
      const done = on ? await turnOnReminders(prefs.time, { explain: true }) : (await setRemindersEnabled(false)) === 'off';
      if (done) onSaved();
    } catch (err) {
      showAlert('Not saved', errorMessage(err, 'Please try again.'));
    }
  };
  const pick = async (time: string) => {
    setPicking(false);
    try {
      await setReminderTime(time);
      onSaved();
    } catch (err) {
      showAlert('Not saved', errorMessage(err, 'Please try again.'));
    }
  };

  return (
    <>
      <View style={styles.card} {...{ dataSet: { reminders: 'card', enabled: String(prefs.enabled) } }}>
        <View style={styles.toggleRow}>
          <View style={own.grow}>
            <Text style={styles.rowLabel}>Review reminders</Text>
            <Text style={own.body}>One notification a day when lectures or flashcards are due: 1, 3, 7 and 21 days after each lecture, and before an exam.</Text>
          </View>
          <SettingSwitch value={prefs.enabled} onValueChange={(v) => void toggle(v)} accessibilityLabel="Review reminders" />
        </View>
        <View style={styles.divider} />
        <Pressable
          style={[styles.toggleRow, !prefs.enabled && own.dim]}
          onPress={() => setPicking(true)}
          disabled={!prefs.enabled}
          accessibilityRole="button"
          accessibilityLabel={`Time, ${prefs.time}`}
          {...a11yState({ disabled: !prefs.enabled })}
          {...{ dataSet: { reminders: 'time' } }}
        >
          <Text style={styles.rowLabel}>Time</Text>
          <View style={styles.rowValue}>
            <Text style={styles.rowValueText}>{prefs.time}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.text.secondary} />
          </View>
        </Pressable>
        {denied && (
          <>
            <View style={styles.divider} />
            <View style={own.padded} {...{ dataSet: { reminders: 'denied' } }}>
              <Text style={own.body}>Notifications are off for Studiply in iOS Settings.</Text>
              <Pressable onPress={() => void Linking.openSettings().catch(() => {})} style={own.linkButton} accessibilityRole="button">
                <Text style={own.link}>Open iOS Settings</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPicking(false)} accessibilityRole="button" accessibilityLabel="Close" />
          <View style={[own.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={own.sheetTitle} accessibilityRole="header">
              Reminder time
            </Text>
            <FlatList
              data={REMINDER_TIMES}
              keyExtractor={(t) => t}
              initialScrollIndex={Math.max(0, REMINDER_TIMES.indexOf(prefs.time) - 3)}
              getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
              accessibilityRole="radiogroup"
              renderItem={({ item }) => (
                <TouchableOpacity style={own.timeRow} onPress={() => void pick(item)} accessibilityRole="radio" {...a11yState({ checked: item === prefs.time })}>
                  <Text style={own.timeText}>{item}</Text>
                  {item === prefs.time && <Ionicons name="checkmark" size={18} color={c.accentDark} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const ROW = 52;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    padded: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    grow: { flex: 1, gap: 4 },
    title: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    body: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 19 },
    dim: { opacity: 0.5 },
    linkButton: { minHeight: 44, justifyContent: 'center' },
    link: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    sheet: { backgroundColor: c.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, maxHeight: '60%' },
    sheetTitle: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary, paddingHorizontal: 20, marginBottom: 12 },
    timeRow: { height: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
    timeText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
  });
