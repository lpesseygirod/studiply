import React from 'react';

import { useAuth } from '../../../src/hooks/useAuth';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { DangerZone, ProfileCard, SignInInfo } from '../../../src/components/settings/AccountSettings';
import { SyncBanner } from '../../../src/components/settings/StatusBanners';

/** Account (docs/design desktop-05): profile, where the library is kept, sync status, Sign out. */
export default function AccountSettingsPage() {
  const { session } = useAuth();
  return (
    <SettingsPage title="Account">
      <ProfileCard title={null} subtitle={session?.user?.email ?? undefined} />
      <SignInInfo showName={false} />
      <SyncBanner />
      <DangerZone title={null} deleteData={false} />
    </SettingsPage>
  );
}
