import React from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { AppearanceSettings } from '../../../src/components/settings/PreferenceSettings';

/** Appearance: System / Light / Dark on this device, and the keyboard shortcuts (laptop). */
export default function AppearanceSettingsPage() {
  return (
    <SettingsPage title="Appearance">
      <AppearanceSettings title={null} />
    </SettingsPage>
  );
}
