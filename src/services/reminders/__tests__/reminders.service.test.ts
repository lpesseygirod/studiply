// The review reminders on the iPhone, with a fake notifications module. Off until she says
// yes; on: iOS asked once, the plan scheduled (at most one a day, 30 days ahead, ≤ 30 pending); off:
// all cancelled at once; a new time plans them again; refused by iOS: off, nothing scheduled, nothing
// breaks; signing out (and deleting the account) cancels all; Review's offer once, only when something
// is due; changes coming together planned once.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PlanRows } from '../../../lib/review/lectures';
import {
  cancelAllReminders,
  declineReminderOffer,
  getReminderPrefs,
  rescheduleReminders,
  requestReschedule,
  RESCHEDULE_DELAY_MS,
  setReminderTime,
  setRemindersEnabled,
  shouldOfferReminders,
} from '../reminders.service';

jest.mock('../notifier', () => {
  const fake = {
    permission: 'undetermined' as 'granted' | 'denied' | 'undetermined',
    answer: 'granted' as 'granted' | 'denied',
    asked: 0,
    pending: [] as { at: Date; title: string; body: string; data: Record<string, unknown> }[],
    cancels: 0,
  };
  return {
    fake,
    notificationsSupported: true,
    notificationPermission: jest.fn(async () => fake.permission),
    requestNotificationPermission: jest.fn(async () => {
      fake.asked += 1;
      fake.permission = fake.answer;
      return fake.permission;
    }),
    scheduleNotification: jest.fn(async (n: (typeof fake.pending)[number]) => {
      fake.pending.push(n);
    }),
    cancelAllNotifications: jest.fn(async () => {
      fake.cancels += 1;
      fake.pending = [];
    }),
    scheduledCount: jest.fn(async () => fake.pending.length),
    onNotificationTap: () => () => {},
    takeLaunchTap: async () => null,
  };
});
jest.mock('../../../lib/cache/store', () => ({
  cacheUser: () => 'u1',
  readRows: jest.fn(async () => []),
}));
jest.mock('../../lectureReview.service', () => ({ readPlanRows: jest.fn() }));

const notifier = jest.requireMock('../notifier') as { fake: { permission: string; answer: string; asked: number; pending: { at: Date; title: string; body: string }[]; cancels: number } };
const fake = notifier.fake;
const plan = jest.requireMock('../../lectureReview.service') as { readPlanRows: jest.Mock };

const NOW = new Date(2026, 10, 10, 9, 0);
/** A lecture recorded yesterday: due today and every day until its plan ends (27 of the next 30 days). */
const ROWS: PlanRows = {
  files: [{ id: 'a', title: 'Tema 1', kind: 'lecture', course_id: 'k1', deleted_at: null, created_at: '2026-11-09T10:00:00' }],
  lectures: [{ id: 'a', recorded_at: '2026-11-09T10:00:00', study_reminders: null }],
  schedules: [],
  settings: [{ course_id: 'k1', exam_date: null, study_reminders: true }],
  courses: [{ id: 'k1', name: 'Psicobiología' }],
};

beforeEach(async () => {
  await AsyncStorage.clear();
  Object.assign(fake, { permission: 'undetermined', answer: 'granted', asked: 0, pending: [], cancels: 0 });
  plan.readPlanRows.mockResolvedValue(ROWS);
});

describe('off until she says yes', () => {
  it('nothing scheduled; the time 19:00', async () => {
    expect(await getReminderPrefs()).toEqual({ enabled: false, time: '19:00', asked: false });
    expect(await rescheduleReminders(NOW)).toBe(0);
    expect(fake.pending).toHaveLength(0);
  });
});

describe('the switch', () => {
  it('on: iOS asked once, the plan scheduled: one a day at 19:00, at most 30 pending', async () => {
    expect(await setRemindersEnabled(true)).toBe('on');
    expect(fake.asked).toBe(1);
    await rescheduleReminders(NOW);
    expect(fake.pending.length).toBeGreaterThan(20);
    expect(fake.pending.length).toBeLessThanOrEqual(30);
    expect(fake.pending[0]).toMatchObject({ title: 'Time to review', body: 'Tema 1 (1 day since the lecture)' });
    expect(fake.pending.every((n) => n.at.getHours() === 19 && n.at.getMinutes() === 0)).toBe(true);
    expect(new Set(fake.pending.map((n) => n.at.toDateString())).size).toBe(fake.pending.length);
    expect(await getReminderPrefs()).toMatchObject({ enabled: true, asked: true });
  });

  it('planned again: everything cancelled first, so nothing doubles', async () => {
    await setRemindersEnabled(true);
    await rescheduleReminders(NOW);
    const n = fake.pending.length;
    await rescheduleReminders(NOW);
    expect(fake.pending).toHaveLength(n);
  });

  it('off: every reminder cancelled at once, none planned again', async () => {
    await setRemindersEnabled(true);
    await rescheduleReminders(NOW);
    expect(await setRemindersEnabled(false)).toBe('off');
    expect(fake.pending).toHaveLength(0);
    await rescheduleReminders(NOW);
    expect(fake.pending).toHaveLength(0);
  });

  it('on again: planned again, iOS not asked twice', async () => {
    await setRemindersEnabled(true);
    await setRemindersEnabled(false);
    await setRemindersEnabled(true);
    await rescheduleReminders(NOW);
    expect(fake.asked).toBe(1);
    expect(fake.pending.length).toBeGreaterThan(0);
  });

  it('refused by iOS: off, nothing scheduled, the offer answered; nothing breaks', async () => {
    fake.answer = 'denied';
    expect(await setRemindersEnabled(true)).toBe('denied');
    expect(fake.pending).toHaveLength(0);
    expect(await getReminderPrefs()).toEqual({ enabled: false, time: '19:00', asked: true });
    // Asked again later (from the switch): iOS keeps its answer; still denied, still nothing.
    expect(await setRemindersEnabled(true)).toBe('denied');
    expect(fake.asked).toBe(1);
  });

  it('allowed in iOS Settings but switched off here: still nothing', async () => {
    fake.permission = 'granted';
    expect(await rescheduleReminders(NOW)).toBe(0);
  });
});

describe('the time', () => {
  it('a new time plans them again at it', async () => {
    await setRemindersEnabled(true);
    await setReminderTime('07:30');
    await rescheduleReminders(NOW);
    expect(fake.pending.every((n) => n.at.getHours() === 7 && n.at.getMinutes() === 30)).toBe(true);
    // 07:30 has passed today: the first is tomorrow's.
    expect(fake.pending[0].at.getDate()).toBe(11);
    await expect(setReminderTime('7:30')).rejects.toThrow('Choose a time.');
  });
});

describe('signing out', () => {
  it('cancels every reminder (Delete account signs out too); her choice stays on this iPhone', async () => {
    await setRemindersEnabled(true);
    await rescheduleReminders(NOW);
    const before = fake.cancels;
    await cancelAllReminders();
    expect(fake.pending).toHaveLength(0);
    expect(fake.cancels).toBe(before + 1);
    expect((await getReminderPrefs()).enabled).toBe(true);
  });
});

describe('Review’s offer', () => {
  it('only when something is due, and only until answered', async () => {
    expect(await shouldOfferReminders(0)).toBe(false);
    expect(await shouldOfferReminders(3)).toBe(true);
    await declineReminderOffer();
    expect(await shouldOfferReminders(3)).toBe(false);
  });

  it('not once they are on', async () => {
    await setRemindersEnabled(true);
    expect(await shouldOfferReminders(3)).toBe(false);
  });
});

describe('changes coming together', () => {
  it('are planned once, a moment after the last', async () => {
    jest.useFakeTimers();
    try {
      await setRemindersEnabled(true);
      const cancels = fake.cancels;
      requestReschedule();
      requestReschedule();
      requestReschedule();
      jest.advanceTimersByTime(RESCHEDULE_DELAY_MS + 10);
      jest.useRealTimers();
      await rescheduleReminders();
      // The three requests became one planning (+1 for the call just made).
      expect(fake.cancels).toBe(cancels + 2);
    } finally {
      jest.useRealTimers();
    }
  });
});
