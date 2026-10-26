import React from 'react';
import { ActivityIndicator } from 'react-native';

import { useTheme } from '../../../src/theme/ThemeProvider';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SavedMark } from '../../../src/components/settings/SavedMark';
import { SummarySettings } from '../../../src/components/settings/PreferenceSettings';

/** Summaries: the AI processing defaults (summary level, title, tags, formulas, definitions, unclear parts). */
export default function SummariesSettingsPage() {
  const { colors: c } = useTheme();
  const { settings, loading, save, savedLabel } = useUserSettings();
  return (
    <SettingsPage title="Summaries" right={<SavedMark visible={!!savedLabel} />}>
      {loading ? <ActivityIndicator color={c.salmon} /> : <SummarySettings title={null} settings={settings} save={save} />}
    </SettingsPage>
  );
}
