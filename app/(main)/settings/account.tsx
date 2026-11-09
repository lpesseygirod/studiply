import React from 'react';

import { useAuth } from '../../../src/hooks/useAuth';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { DangerZone, ProfileCard, SignInInfo, SignInMethods, signedInWith } from '../../../src/components/settings/AccountSettings';
import { SyncBanner } from '../../../src/components/settings/StatusBanners';

/**
 * Account (docs/design desktop-05): profile (how she signs in under the name), the sign-in methods
 * (Sign in with Apple Linked / Not linked, step 10.1), where the library is kept, sync status, Sign
 * out and Delete account… (step 10.1).
 */
export default function AccountSettingsPage() {
  const { session } = useAuth();
  const email = session?.user?.email;
  return (
    <SettingsPage title="Account">
      <ProfileCard title={null} subtitle={[email && !/@privaterelay\.appleid\.com$/i.test(email) ? email : null, signedInWith(session?.user?.identities)].filter(Boolean).join(' · ')} />
      <SignInMethods />
      <SignInInfo showName={false} />
      <SyncBanner />
      <DangerZone title={null} deleteData={false} deleteAccount />
    </SettingsPage>
  );
}
