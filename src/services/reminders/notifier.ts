/**
 * notifier.ts — the iPhone's local notifications, through expo-notifications. No push
 * server: every reminder is scheduled on the phone. The web build uses notifier.web.ts (nothing).
 */

import * as Notifications from 'expo-notifications';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export interface ScheduledReminder {
  at: Date;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export const notificationsSupported = true;

// With the app open, a reminder isn't shown (she is in the app; Review today says the same).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const statusOf = (p: { status: string }): NotificationPermission => (p.status === 'granted' ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined');

export async function notificationPermission(): Promise<NotificationPermission> {
  return statusOf(await Notifications.getPermissionsAsync());
}

/** Asks iOS (its own dialog; the app explains first). */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return statusOf(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
}

export async function scheduleNotification(n: ScheduledReminder): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: n.title, body: n.body, data: n.data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at },
  });
}

/** Every scheduled reminder cancelled, and those already shown cleared. */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}

export async function scheduledCount(): Promise<number> {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

/** A tap on a reminder: its data (the app open or opened by it). */
export function onNotificationTap(fn: (data: Record<string, unknown>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => fn((r.notification.request.content.data ?? {}) as Record<string, unknown>));
  return () => sub.remove();
}

/** The reminder that opened the app (a cold start), once. */
export async function takeLaunchTap(): Promise<Record<string, unknown> | null> {
  const r = await Notifications.getLastNotificationResponseAsync();
  if (!r) return null;
  await Notifications.clearLastNotificationResponseAsync().catch(() => {});
  return (r.notification.request.content.data ?? {}) as Record<string, unknown>;
}
