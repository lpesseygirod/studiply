import React from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { AiConsentCard } from '../../../src/components/settings/AiConsentCard';
import { AiUsageSettings } from '../../../src/components/settings/AiUsageSettings';

/** AI & privacy (iphone-08): "Use AI on my lectures" (step 10.1), today's use against the limits, the cost breakdown. */
export default function AiPrivacySettingsPage() {
  return (
    <SettingsPage title="AI & privacy">
      <AiConsentCard />
      <AiUsageSettings />
    </SettingsPage>
  );
}
