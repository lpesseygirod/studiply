import React from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { CreditsSettings } from '../../../src/components/settings/CreditsSettings';

/** Credits (step 10.2-2; no mockup): her balance, what a credit covers, what extras use, the history. */
export default function CreditsSettingsPage() {
  return (
    <SettingsPage title="Credits">
      <CreditsSettings />
    </SettingsPage>
  );
}
