import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SavedMark } from '../../../src/components/settings/SavedMark';
import { RecordingSettings } from '../../../src/components/settings/PreferenceSettings';
import { RECORDING_REMINDER_TEXT, RECORDING_REMINDER_TITLE } from '../../../src/services/recording-reminder';

/** Recording: default mode, Lecture Mode, transcription language; the reminder to check recording is allowed. */
export default function RecordingSettingsPage() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const { settings, loading, save, savedLabel } = useUserSettings();
  return (
    <SettingsPage title="Recording" right={<SavedMark visible={!!savedLabel} />}>
      {loading ? <ActivityIndicator color={c.salmon} /> : <RecordingSettings title={null} settings={settings} save={save} />}
      <View style={styles.note} {...{ dataSet: { recordingReminder: 'settings' } }}>
        <Ionicons name="information-circle-outline" size={22} color={c.text.secondary} />
        <View style={styles.text}>
          <Text style={styles.title}>{RECORDING_REMINDER_TITLE}</Text>
          <Text style={styles.body}>{RECORDING_REMINDER_TEXT}</Text>
        </View>
      </View>
    </SettingsPage>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    note: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 14, backgroundColor: c.surfaceMuted },
    text: { flex: 1, gap: 4 },
    title: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    body: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 19 },
  });
