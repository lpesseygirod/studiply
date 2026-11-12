import React from 'react';
import { Redirect } from 'expo-router';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { DevelopmentSettings } from '../../../src/components/settings/DevelopmentSettings';
import { AiUsageSettings } from '../../../src/components/settings/AiUsageSettings';

/**
 * Development builds only: server badge, Simulate offline, sync, drag debugging, sample data; and
 * (step 10.2-2, Lea 12 Nov) AI usage today against the daily limits with the cost breakdown, moved
 * from AI & privacy.
 */
export default function DevelopmentSettingsPage() {
  if (!__DEV__) return <Redirect href="/settings/account" />;
  return (
    <SettingsPage title="Development">
      <DevelopmentSettings title={null} />
      <AiUsageSettings />
    </SettingsPage>
  );
}
