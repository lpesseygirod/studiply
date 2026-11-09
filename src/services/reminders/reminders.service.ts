/**
 * reminders.service.ts — review reminders on the iPhone (step 9.2-3; the approved plan,
 * docs/reports/plan-9.2.md, decisions 4–6).
 *
 * - Local notifications only (./notifier: expo-notifications on the iPhone, nothing on the web):
 *   at most one a day, at her time (19:00 unless she picks another), planned 30 days ahead from the
 *   same rows as Review today (lib/review/reminderPlan.ts).
 * - Her choice is kept on this iPhone, per account (not synced: only the iPhone sends them):
 *   `enabled` (off until she says yes), `time`, and `asked` (the offer in Review was answered).
 * - On: iOS is asked for permission when it hasn't been (the app explains first); refused, they stay
 *   off and Settings says how to allow them. Off: every scheduled reminder is cancelled at once.
 * - Planned again (everything cancelled, then scheduled) when the app opens or comes back, when the
 *   library changes (lectures, reviews, an exam date, a lecture's or a course's study reminders: every
 *   such change tells the library), after a card is rated, and when the switch or the time changes.
 * - Signing out (and deleting the account, which signs out) cancels them all.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { cacheUser, readRows } from '../../lib/cache/store';
import type { CardRow } from '../../lib/review/deck';
import { DEFAULT_REMINDER_TIME, isReminderTime, planReminders } from '../../lib/review/reminderPlan';
import { readPlanRows } from '../lectureReview.service';
import {
  cancelAllNotifications,
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  scheduleNotification,
  type NotificationPermission,
} from './notifier';

export interface ReminderPrefs {
  enabled: boolean;
  /** HH:MM, local. */
  time: string;
  /** The offer in Review was answered (yes or not now): it isn't shown again. */
  asked: boolean;
}

export const DEFAULT_PREFS: ReminderPrefs = { enabled: false, time: DEFAULT_REMINDER_TIME, asked: false };
const key = (userId: string) => `studiply.reminders.${userId}`;
/** Changes coming together (a pull, a rating) are planned once, this long after the last. */
export const RESCHEDULE_DELAY_MS = 1_500;

export const remindersSupported = notificationsSupported;

const listeners = new Set<() => void>();
/** Settings and Review follow the switch and the time. */
export function onRemindersChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  const userId = cacheUser();
  if (!userId) return DEFAULT_PREFS;
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const p = raw ? (JSON.parse(raw) as Partial<ReminderPrefs>) : {};
    return { enabled: p.enabled === true, time: isReminderTime(p.time) ? p.time : DEFAULT_REMINDER_TIME, asked: p.asked === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

async function savePrefs(patch: Partial<ReminderPrefs>): Promise<ReminderPrefs> {
  const userId = cacheUser();
  const next = { ...(await getReminderPrefs()), ...patch };
  if (userId) await AsyncStorage.setItem(key(userId), JSON.stringify(next));
  listeners.forEach((fn) => fn());
  return next;
}

export async function reminderPermission(): Promise<NotificationPermission> {
  return remindersSupported ? notificationPermission().catch(() => 'undetermined' as const) : 'denied';
}

let running: Promise<number> = Promise.resolve(0);

/** Plans the reminders again now: every one cancelled, then the next 30 days scheduled. Resolves with how many. */
export function rescheduleReminders(now: Date = new Date()): Promise<number> {
  running = running.catch(() => 0).then(() => plan(now));
  return running;
}

async function plan(now: Date): Promise<number> {
  if (!remindersSupported || !cacheUser()) return 0;
  const prefs = await getReminderPrefs();
  await cancelAllNotifications();
  if (!prefs.enabled || (await reminderPermission()) !== 'granted') return 0;
  const [rows, cards] = await Promise.all([readPlanRows(), readRows<CardRow>('flashcards')]);
  const reminders = planReminders({ plan: rows, cards, now, time: prefs.time });
  for (const r of reminders) await scheduleNotification({ at: r.at, title: r.title, body: r.body, data: r.data });
  return reminders.length;
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Plans them again a moment after the last change (a pull brings many). */
export function requestReschedule(): void {
  if (!remindersSupported) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    rescheduleReminders().catch(() => {});
  }, RESCHEDULE_DELAY_MS);
}

/**
 * The switch. On: iOS is asked first when it hasn't been ('denied' when she refuses: they stay off).
 * Off: every reminder cancelled at once.
 */
export async function setRemindersEnabled(on: boolean): Promise<'on' | 'off' | 'denied'> {
  if (!on) {
    await savePrefs({ enabled: false });
    await rescheduleReminders();
    return 'off';
  }
  let permission = await reminderPermission();
  if (permission === 'undetermined') permission = await requestNotificationPermission().catch(() => 'denied' as const);
  if (permission !== 'granted') {
    await savePrefs({ enabled: false, asked: true });
    await rescheduleReminders();
    return 'denied';
  }
  await savePrefs({ enabled: true, asked: true });
  await rescheduleReminders();
  return 'on';
}

export async function setReminderTime(time: string): Promise<void> {
  if (!isReminderTime(time)) throw new Error('Choose a time.');
  await savePrefs({ time });
  await rescheduleReminders();
}

/** Review's offer, the first time something is due: only on the iPhone, while off and never answered. */
export async function shouldOfferReminders(dueToday: number): Promise<boolean> {
  if (!remindersSupported || dueToday <= 0) return false;
  const prefs = await getReminderPrefs();
  return !prefs.enabled && !prefs.asked;
}

/** "Not now": the offer isn't shown again (the Settings switch stays). */
export async function declineReminderOffer(): Promise<void> {
  await savePrefs({ asked: true });
}

/** Signing out (and deleting the account): every reminder cancelled. Her choice stays for her next sign-in on this iPhone. */
export async function cancelAllReminders(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!remindersSupported) return;
  await cancelAllNotifications().catch(() => {});
}
