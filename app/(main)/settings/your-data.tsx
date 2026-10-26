import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SettingsRows, type SettingsRowItem } from '../../../src/components/settings/SettingsRows';
import { legacyDataExists } from '../../../src/services/legacyImport';

/** Your data: Recently Deleted, and the earlier version's data while it is still on this iPhone. */
export default function YourDataSettingsPage() {
  const router = useRouter();
  // Checked again each time (the old copy may have been removed).
  const [hasEarlier, setHasEarlier] = useState(false);
  useFocusEffect(
    useCallback(() => {
      legacyDataExists().then(setHasEarlier).catch(() => setHasEarlier(false));
    }, []),
  );

  const rows: SettingsRowItem[] = [
    {
      key: 'trash',
      label: 'Recently Deleted',
      sub: 'Items are kept for 30 days',
      icon: 'trash-outline',
      onPress: () => router.push('/settings/trash'),
    },
    ...(hasEarlier
      ? [
          {
            key: 'earlier',
            label: 'Earlier version data',
            sub: 'Upload what the earlier app kept on this iPhone',
            icon: 'phone-portrait-outline' as const,
            onPress: () => router.push('/settings/earlier-version'),
          },
        ]
      : []),
  ];

  return (
    <SettingsPage title="Your data">
      <SettingsRows rows={rows} />
    </SettingsPage>
  );
}
