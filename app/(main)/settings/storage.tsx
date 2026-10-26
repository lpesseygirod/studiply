import React from 'react';
import { ActivityIndicator } from 'react-native';

import { useTheme } from '../../../src/theme/ThemeProvider';
import { useUserSettings } from '../../../src/hooks/useUserSettings';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SavedMark } from '../../../src/components/settings/SavedMark';
import { RetentionSettings } from '../../../src/components/settings/PreferenceSettings';
import { SourceFilesCard } from '../../../src/components/settings/StorageSettings';
import { DangerZone } from '../../../src/components/settings/AccountSettings';
import { SyncBanner } from '../../../src/components/settings/StatusBanners';

/** Storage & sync: sync status (and failed syncs), the source files kept, retention, data on this device. */
export default function StorageSettingsPage() {
  const { colors: c } = useTheme();
  const { settings, loading, save, savedLabel } = useUserSettings();
  return (
    <SettingsPage title="Storage & sync" right={<SavedMark visible={!!savedLabel} />}>
      <SyncBanner />
      <SourceFilesCard title="STORAGE" />
      {loading ? <ActivityIndicator color={c.salmon} /> : <RetentionSettings settings={settings} save={save} />}
      <DangerZone title="ON THIS DEVICE" signOut={false} />
    </SettingsPage>
  );
}
