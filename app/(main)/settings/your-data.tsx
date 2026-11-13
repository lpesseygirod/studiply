import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SettingsRows, type SettingsRowItem } from '../../../src/components/settings/SettingsRows';
import { DeleteAccountButton } from '../../../src/components/settings/DeleteAccount';
import { ExportDataButton } from '../../../src/components/settings/ExportData';
import { makeSettingsStyles } from '../../../src/components/settings/styles';
import { legacyDataExists } from '../../../src/services/legacyImport';
import { useThemedStyles } from '../../../src/theme/ThemeProvider';

/**
 * Your data: Export my data, Recently Deleted, the earlier version's data while it is
 * still on this iPhone, and Delete account… (D4: the privacy policy and terms send her here for
 * both; they are also in Account).
 */
export default function YourDataSettingsPage() {
  const router = useRouter();
  const styles = useThemedStyles(makeSettingsStyles);
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
      <View style={styles.card}>
        <ExportDataButton />
      </View>
      <SettingsRows rows={rows} />
      <View style={styles.card}>
        <DeleteAccountButton variant="row" />
      </View>
    </SettingsPage>
  );
}
