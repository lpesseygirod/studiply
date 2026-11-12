import React from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { AdminCodes } from '../../../src/components/admin/AdminCodes';

/** The dashboard's Codes (part A): Lea's free-credit codes, made and switched off here. */
export default function AdminCodesPage() {
  return (
    <SettingsPage title="Codes">
      <AdminCodes />
    </SettingsPage>
  );
}
