import React from 'react';
import { ActivityIndicator } from 'react-native';

import { useTheme } from '../../../src/theme/ThemeProvider';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SavedMark } from '../../../src/components/settings/SavedMark';
import { RecordingSettings } from '../../../src/components/settings/PreferenceSettings';

/** Recording: default mode, Lecture Mode, transcription language. */
export default function RecordingSettingsPage() {
  const { colors: c } = useTheme();
  const { settings, loading, save, savedLabel } = useUserSettings();
  return (
    <SettingsPage title="Recording" right={<SavedMark visible={!!savedLabel} />}>
      {loading ? <ActivityIndicator color={c.salmon} /> : <RecordingSettings title={null} settings={settings} save={save} />}
    </SettingsPage>
  );
}
