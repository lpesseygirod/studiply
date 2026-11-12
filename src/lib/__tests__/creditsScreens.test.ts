// Step 10.2-2: what she sees about credits (lib/credits/format.ts, quote.ts), the Summary card's and
// the quiz row's words, and the iPhone Settings row.

import {
  balanceLine,
  balanceSpoken,
  BUY_ON_IPHONE,
  costLine,
  creditsValue,
  historyLine,
  historyText,
  isLow,
  lowCreditsText,
  NO_CREDITS_RECORD,
  parseCredits,
  shortDate,
  unitsSpoken,
  unitsText,
  type CreditRow,
} from '../credits/format';
import { summaryQuote } from '../credits/quote';
import { EXTRAS_USED_UP, PAST_EXAM_EXTRAS_USED, extrasLine, extrasPercent, extrasRefusal, extrasUsedUp } from '../credits/extras';
import { CREDITS_AGAIN, SUMMARY_ERRORS, summaryCardText } from '../../components/summarize/summaryCard';
import type { LectureSummary } from '../../services/summarize.service';

const NOW = new Date('2026-11-12T12:00:00Z');
const row = (over: Partial<CreditRow>): CreditRow => ({ id: 'r', units: -4, kind: 'spend_lecture', label: 'Tema 3', lecture_id: 'L', ref_id: null, created_at: '2026-11-12T10:00:00Z', what: 'lecture', block: 0, ...over });

describe('units as lectures', () => {
  it('quarters', () => {
    expect([0, 1, 2, 3, 4, 5, 27, 48].map(unitsText)).toEqual(['0', '¼', '½', '¾', '1', '1¼', '6¾', '12']);
    expect(unitsText(-5)).toBe('−1¼');
    expect(unitsSpoken(27)).toBe('6.75');
  });

  it('the balance, singular and plural', () => {
    expect(balanceLine(48)).toBe('12 lectures left');
    expect(balanceLine(27)).toBe('6¾ lectures left');
    expect(balanceLine(5)).toBe('1¼ lectures left');
    expect(balanceLine(4)).toBe('1 lecture left');
    expect(balanceLine(3)).toBe('¾ lecture left');
    expect(balanceLine(0)).toBe('No lectures left');
    expect(balanceLine(-4)).toBe('−1 lecture · a purchase was refunded');
    expect(balanceSpoken(27)).toBe('6.75 lectures left');
    expect(balanceSpoken(4)).toBe('1 lecture left');
  });

  it('the iPhone Settings row and the low line', () => {
    expect(creditsValue(null)).toBe('');
    expect(creditsValue(48)).toBe('12 left');
    expect(creditsValue(27)).toBe('6¾ left');
    expect(creditsValue(0)).toBe('None left');
    expect(creditsValue(-2)).toBe('None left');
    expect([0, 1, 4, 5].map(isLow)).toEqual([false, true, true, false]);
    expect(lowCreditsText(null, true)).toBeNull();
    expect(lowCreditsText(8, true)).toBeNull();
    expect(lowCreditsText(4, false)).toBe('1 lecture left');
    expect(lowCreditsText(3, true)).toBe(`¾ lecture left · ${BUY_ON_IPHONE}`);
    expect(lowCreditsText(0, false)).toBe(NO_CREDITS_RECORD);
    expect(lowCreditsText(0, true)).toBe(`${NO_CREDITS_RECORD} · ${BUY_ON_IPHONE}`);
  });
});

describe('cost lines (plan §4)', () => {
  it('included, a part, not enough', () => {
    expect(costLine(0, 48).text).toBe('Included in this lecture’s credit');
    expect(costLine(2, 48)).toEqual({ text: 'Uses ½ credit · 11½ left', short: false });
    expect(costLine(1, 48).text).toBe('Uses ¼ credit · 11¾ left');
    expect(costLine(3, null).text).toBe('Uses ¾ credit');
    expect(costLine(4, 48, { unpaidLecture: true }).text).toBe('Uses 1 credit (this lecture) · 11 left');
    expect(costLine(2, 1)).toEqual({ text: 'Not enough credits: this uses ½ credit, you have ¼', short: true });
    expect(costLine(1, 0).text).toBe('Not enough credits: this uses ¼ credit, you have none');
  });
});

describe('a summary\'s price, as spend_summary decides', () => {
  it('first, again, unpaid, reversed', () => {
    const paid = { id: 'p', kind: 'spend_lecture', reverses: null };
    const carried = { id: 'c', kind: 'carry_over', reverses: null };
    const summary = { id: 's', kind: 'spend_summary', reverses: null };
    expect(summaryQuote([paid])).toEqual({ units: 0, first: true, unpaidLecture: false });
    expect(summaryQuote([carried, summary])).toEqual({ units: 2, first: false, unpaidLecture: false });
    expect(summaryQuote([])).toEqual({ units: 4, first: true, unpaidLecture: true });
    // A first summary that failed was given back: the next one is the first again.
    expect(summaryQuote([paid, summary, { id: 'r', kind: 'reverse', reverses: 's' }]).units).toBe(0);
  });
});

describe('the history in her words', () => {
  it('each kind of row', () => {
    expect(historyText(row({ kind: 'grant_free', units: 8, what: null }))).toBe('Welcome credits');
    expect(historyText(row({ kind: 'grant_beta', units: 40, what: null }))).toBe('Thanks for testing Studiply');
    expect(historyText(row({ kind: 'grant_admin', units: 40, what: null, label: 'web-check' }))).toBe('Added by Studiply');
    expect(historyText(row({ kind: 'purchase', units: 20, what: null }))).toBe('Bought 5 lectures');
    expect(historyText(row({ kind: 'refund', units: -20, what: null }))).toBe('A purchase was refunded');
    expect(historyText(row({}))).toBe('Tema 3');
    expect(historyText(row({ block: 1 }))).toBe('Tema 3 · after 2 hours');
    expect(historyText(row({ label: null }))).toBe('a deleted lecture');
    expect(historyText(row({ kind: 'spend_summary', units: -2, what: 'summary' }))).toBe('Summary again · Tema 3');
    expect(historyText(row({ kind: 'spend_extra', units: -2, what: 'combine', label: 'Exam pack · Psico' }))).toBe('Combined summary · Exam pack · Psico');
    expect(historyText(row({ kind: 'spend_extra', units: -1, what: 'quiz', label: 'Tema 3 quiz' }))).toBe('Quiz · Tema 3 quiz');
    expect(historyText(row({ kind: 'reverse', units: 1, what: 'quiz', label: 'Tema 3 quiz' }))).toBe('Returned · the quiz “Tema 3 quiz” couldn’t be written');
    expect(historyText(row({ kind: 'reverse', units: 2, what: 'summary' }))).toBe('Returned · the summary of “Tema 3” couldn’t be written');
  });

  it('amount, date and one sentence for screen readers', () => {
    expect(historyLine(row({ kind: 'grant_free', units: 8, what: null }), NOW)).toMatchObject({ amount: '+2', date: '12 Nov', added: true, spoken: 'Plus 2 credits, Welcome credits, 12 Nov' });
    expect(historyLine(row({ kind: 'spend_extra', units: -1, what: 'quiz', label: 'Q' }), NOW)).toMatchObject({ amount: '−¼', added: false, spoken: 'Minus 0.25 credits, Quiz · Q, 12 Nov' });
    expect(shortDate('2025-03-02T10:00:00Z', NOW)).toBe('2 Mar 2025');
  });

  it('reads my_credits(), old or new', () => {
    expect(parseCredits(null)).toBeNull();
    expect(parseCredits({ units: 8, history: [{ id: 'a', units: 8, kind: 'grant_free', created_at: 'x' }] })).toEqual({
      units: 8,
      beta: false,
      history: [{ id: 'a', units: 8, kind: 'grant_free', label: null, lecture_id: null, ref_id: null, created_at: 'x', what: null, block: null }],
      extras: null,
    });
    // Step 10.2-1b (20261029153000): what's left of the extras allowance, clamped to 0–1.
    expect(parseCredits({ units: 8, history: [], extras: { left: 0.62, resets_at: '2026-12-01T10:00:00Z' } })?.extras).toEqual({ left: 0.62, resetsAt: '2026-12-01T10:00:00Z' });
    expect(parseCredits({ units: 8, history: [], extras: { left: 1.4, resets_at: null } })?.extras).toEqual({ left: 1, resetsAt: null });
    expect(parseCredits({ units: 8, history: [], extras: { left: 'x' } })?.extras).toBeNull();
    expect(parseCredits({ units: 48, beta: true, history: [{ id: 'b', units: -4, kind: 'spend_lecture', what: 'lecture', block: 1, label: 'T' }] })?.history[0]).toMatchObject({ what: 'lecture', block: 1 });
    expect(parseCredits({ units: 4, history: [{ id: 'c', units: 1, kind: 'x', what: 'nonsense' }] })?.history[0].what).toBeNull();
  });
});

describe('step 10.2-1b: the assistant & extras allowance, never in dollars', () => {
  it('a percentage rounded down to 5 %, "Less than 5%" near the end, nothing when used up', () => {
    expect([1, 0.62, 0.05, 0.049, 0.001, 0, -1].map(extrasPercent)).toEqual(['100%', '60%', '5%', 'Less than 5%', 'Less than 5%', null, null]);
  });

  it('the Credits page line', () => {
    expect(extrasLine(null)).toBeNull();
    expect(extrasLine({ left: 0.62 })).toBe('Assistant & extras: 60% left (it grows with each lecture you record)');
    expect(extrasLine({ left: 0 })).toBe(EXTRAS_USED_UP);
    expect(EXTRAS_USED_UP).toBe('You’ve used the assistant for now. It grows with each lecture you record and frees up over 30 days.');
  });

  it('a refusal for that reason has her words (Ask Claude, flashcards); any other error keeps its own', () => {
    expect(extrasRefusal({ code: 'extras_limit', message: 'x' })).toBe(EXTRAS_USED_UP);
    expect(extrasRefusal({ code: 'daily_limit' })).toBeNull();
    expect(extrasRefusal(new Error('x'))).toBeNull();
    expect(extrasRefusal(null)).toBeNull();
    expect(PAST_EXAM_EXTRAS_USED).toBe('Reading this exam uses your assistant allowance, which is used up for now.');
  });

  it('used up only when known and none left (an older server: never)', () => {
    expect(extrasUsedUp(null)).toBe(false);
    expect(extrasUsedUp(undefined)).toBe(false);
    expect(extrasUsedUp({ left: 0.01 })).toBe(false);
    expect(extrasUsedUp({ left: 0 })).toBe(true);
  });
});

describe('the Summary card at 0, and after', () => {
  const pending = { status: 'pending', error: 'no_credits', settings: null } as unknown as LectureSummary;
  it('why, where to buy (laptop), and that she has credits again (never started by itself)', () => {
    expect(summaryCardText(pending, { units: 0, buy: BUY_ON_IPHONE }).text).toBe(`${SUMMARY_ERRORS.no_credits} ${BUY_ON_IPHONE}.`);
    expect(summaryCardText(pending, { units: 0 }).text).toBe(SUMMARY_ERRORS.no_credits);
    expect(summaryCardText(pending, { units: 8 })).toEqual({ label: 'Summary settings saved', text: CREDITS_AGAIN, action: 'start' });
  });
});
