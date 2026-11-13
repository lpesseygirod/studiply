// The exam date's month calendar (drawn by the app, no dependency): the weeks, Monday
// first, and each day's name as VoiceOver reads it.
import { dayName, monthGrid } from '../MonthCalendar';

describe('monthGrid', () => {
  it('November 2026: starts on a Sunday (6 blanks), 30 days, whole weeks', () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.at(-1)?.slice(0, 1)).toEqual(['2026-11-30']);
  });

  it('February 2027 (28 days, starts on a Monday) and December into January', () => {
    expect(monthGrid(2027, 1)[0][0]).toBe('2027-02-01');
    expect(monthGrid(2027, 1).flat().filter(Boolean)).toHaveLength(28);
    expect(monthGrid(2026, 11).flat().filter(Boolean).at(-1)).toBe('2026-12-31');
  });
});

describe('dayName', () => {
  it('the day as it is read', () => {
    expect(dayName('2026-11-09')).toBe('Monday 9 November 2026');
    expect(dayName('2027-01-20')).toBe('Wednesday 20 January 2027');
  });
});
