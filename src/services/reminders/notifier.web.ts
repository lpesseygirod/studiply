/**
 * notifier.web.ts — the laptop has no reminders (step 9.2-3: they come on the iPhone). Same shape as
 * notifier.ts, doing nothing, so the web bundle never loads expo-notifications.
 */

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export interface ScheduledReminder {
  at: Date;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export const notificationsSupported = false;

export async function notificationPermission(): Promise<NotificationPermission> {
  return 'denied';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return 'denied';
}

export async function scheduleNotification(_n: ScheduledReminder): Promise<void> {}

export async function cancelAllNotifications(): Promise<void> {}

export async function scheduledCount(): Promise<number> {
  return 0;
}

export function onNotificationTap(_fn: (data: Record<string, unknown>) => void): () => void {
  return () => {};
}

export async function takeLaunchTap(): Promise<Record<string, unknown> | null> {
  return null;
}
