import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { NotificationPermission } from '../services/reminders/notifier';
import { getReminderPrefs, onRemindersChanged, reminderPermission, remindersSupported, type ReminderPrefs } from '../services/reminders/reminders.service';

/**
 * The review reminders' switch and time on this iPhone, and whether iOS allows them
 * (read again when the app comes back: she may have changed it in iOS Settings). Null while loading.
 */
export function useReminderPrefs(): { prefs: ReminderPrefs | null; permission: NotificationPermission | null; supported: boolean } {
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const load = useCallback(() => {
    getReminderPrefs().then(setPrefs).catch(() => {});
    reminderPermission().then(setPermission).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const off = onRemindersChanged(load);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => {
      off();
      app.remove();
    };
  }, [load]);
  return { prefs, permission, supported: remindersSupported };
}
