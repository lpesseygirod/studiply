import React from 'react';
import { Redirect } from 'expo-router';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { DevelopmentSettings } from '../../../src/components/settings/DevelopmentSettings';

/** Development builds only: server badge, Simulate offline, sync, drag debugging, sample data. */
export default function DevelopmentSettingsPage() {
  if (!__DEV__) return <Redirect href="/settings/account" />;
  return (
    <SettingsPage title="Development">
      <DevelopmentSettings title={null} />
    </SettingsPage>
  );
}
