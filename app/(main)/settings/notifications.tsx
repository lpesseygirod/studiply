import React, { useCallback, useEffect, useRef, useState } from 'react';

import { SettingsPage } from '../../../src/components/settings/SettingsPage';
import { SavedMark } from '../../../src/components/settings/SavedMark';
import { ReminderSettings } from '../../../src/components/settings/ReminderSettings';

/** Notifications (step 9.2-3): the review reminders on the iPhone; on the laptop, where they come. */
export default function NotificationsSettingsPage() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaved = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <SettingsPage title="Notifications" right={<SavedMark visible={saved} />}>
      <ReminderSettings onSaved={onSaved} />
    </SettingsPage>
  );
}
