import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../../../src/hooks/useAuth';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { DangerZone, ProfileCard, SignInInfo, SignInMethods, signedInWith } from '../../../src/components/settings/AccountSettings';
import { ExportDataButton } from '../../../src/components/settings/ExportData';
import { SyncBanner } from '../../../src/components/settings/StatusBanners';
import { makeSettingsStyles } from '../../../src/components/settings/styles';
import { useThemedStyles } from '../../../src/theme/ThemeProvider';

/**
 * Account (docs/design desktop-05): profile (how she signs in under the name), the sign-in methods
 * (Sign in with Apple Linked / Not linked), where the library is kept, sync status, Export
 * my data, Sign out and Delete account….
 */
export default function AccountSettingsPage() {
  const { session } = useAuth();
  const styles = useThemedStyles(makeSettingsStyles);
  const email = session?.user?.email;
  return (
    <SettingsPage title="Account">
      <ProfileCard title={null} subtitle={[email && !/@privaterelay\.appleid\.com$/i.test(email) ? email : null, signedInWith(session?.user?.identities)].filter(Boolean).join(' · ')} />
      <SignInMethods />
      <SignInInfo showName={false} />
      <SyncBanner />
      <View style={styles.card}>
        <ExportDataButton />
      </View>
      <DangerZone title={null} deleteData={false} deleteAccount />
    </SettingsPage>
  );
}
