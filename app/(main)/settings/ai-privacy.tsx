import React from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { AiPrivacyNote } from '../../../src/components/settings/AccountSettings';
import { AiUsageSettings } from '../../../src/components/settings/AiUsageSettings';

/** AI & privacy: what goes to an AI service, today's use against the limits, the cost breakdown. */
export default function AiPrivacySettingsPage() {
  return (
    <SettingsPage title="AI & privacy">
      <AiPrivacyNote />
      <AiUsageSettings />
    </SettingsPage>
  );
}
