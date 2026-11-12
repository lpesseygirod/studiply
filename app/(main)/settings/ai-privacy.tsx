import React from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { AiConsentCard } from '../../../src/components/settings/AiConsentCard';

/**
 * AI & privacy (iphone-08): "Use AI on my lectures". Today's use against the limits and the
 * cost breakdown moved to Development (Lea 12 Nov): she pays in credits (Settings → Credits).
 */
export default function AiPrivacySettingsPage() {
  return (
    <SettingsPage title="AI & privacy">
      <AiConsentCard />
    </SettingsPage>
  );
}
