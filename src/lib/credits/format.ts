/**
 * format.ts
 * Step 10.2-2 (docs/reports/plan-10.2-2.md): credits in the student's words, without React. The
 * server counts quarter credits ("units": 1 lecture = 4); she sees lectures ("6¾ lectures left") and
 * credits ("Uses ½ credit"), which are the same thing. Jest: credits.test.ts.
 */

export type CreditWhat = 'lecture' | 'summary' | 'combine' | 'quiz';

/** One row of my_credits().history (20261029152900_my_credits_detail). */
export interface CreditRow {
  id: string;
  units: number;
  kind: string;
  label: string | null;
  lecture_id: string | null;
  ref_id: string | null;
  created_at: string;
  what?: CreditWhat | null;
  block?: number | null;
}

export interface Credits {
  units: number;
  /** She has the beta grant (the beta friends' notice). */
  beta: boolean;
  history: CreditRow[];
  /** Step 10.2-1b: what's left of the assistant & extras allowance (0–1), or null (an older server). */
  extras: { left: number; resetsAt: string | null } | null;
}

const WHATS: readonly string[] = ['lecture', 'summary', 'combine', 'quiz'];

/** my_credits()'s answer, checked; null when it isn't one. Missing new fields (an older server) read as none. */
export function parseCredits(json: unknown): Credits | null {
  const j = json as { units?: unknown; beta?: unknown; history?: unknown; extras?: unknown } | null;
  if (!j || typeof j !== 'object' || !Number.isFinite(Number(j.units))) return null;
  const history = Array.isArray(j.history) ? j.history : [];
  const e = j.extras as { left?: unknown; resets_at?: unknown } | null | undefined;
  const left = Number(e?.left);
  return {
    units: Math.trunc(Number(j.units)),
    beta: j.beta === true,
    extras: e && typeof e === 'object' && Number.isFinite(left) ? { left: Math.min(1, Math.max(0, left)), resetsAt: typeof e.resets_at === 'string' ? e.resets_at : null } : null,
    history: history
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
      .map((r) => ({
        id: String(r.id),
        units: Math.trunc(Number(r.units) || 0),
        kind: String(r.kind ?? ''),
        label: typeof r.label === 'string' ? r.label : null,
        lecture_id: typeof r.lecture_id === 'string' ? r.lecture_id : null,
        ref_id: typeof r.ref_id === 'string' ? r.ref_id : null,
        created_at: String(r.created_at ?? ''),
        what: typeof r.what === 'string' && WHATS.includes(r.what) ? (r.what as CreditWhat) : null,
        block: Number.isInteger(r.block) ? (r.block as number) : null,
      })),
  };
}

const QUARTERS = ['', '¼', '½', '¾'];

/** Units as lectures: 27 → "6¾", 2 → "½", 4 → "1", 0 → "0", −5 → "−1¼". */
export function unitsText(units: number): string {
  const n = Math.abs(Math.trunc(units));
  const whole = Math.floor(n / 4);
  const q = QUARTERS[n % 4];
  const text = whole > 0 ? `${whole}${q}` : q || '0';
  return units < 0 ? `−${text}` : text;
}

/** For VoiceOver and screen readers ("¾" is read differently by each): 27 → "6.75". */
export function unitsSpoken(units: number): string {
  return String(Math.trunc(units) / 4);
}

const lecturesWord = (units: number) => (Math.abs(units) > 4 ? 'lectures' : 'lecture');

/** The balance: "12 lectures left", "1 lecture left", "¾ lecture left", "No lectures left". */
export function balanceLine(units: number): string {
  if (units === 0) return 'No lectures left';
  if (units < 0) return `${unitsText(units)} ${lecturesWord(units)} · a purchase was refunded`;
  return `${unitsText(units)} ${lecturesWord(units)} left`;
}

export function balanceSpoken(units: number): string {
  if (units === 0) return 'No lectures left';
  if (units < 0) return `Minus ${unitsSpoken(-units)} lectures, a purchase was refunded`;
  return `${unitsSpoken(units)} ${units === 4 ? 'lecture' : 'lectures'} left`;
}

/** The iPhone Settings row's value: "12 left", "6¾ left", "None left"; '' while unknown. */
export function creditsValue(units: number | null): string {
  if (units === null) return '';
  return units <= 0 ? 'None left' : `${unitsText(units)} left`;
}

/** 1 lecture or less, but some (step 10.2-2's quiet line). */
export const isLow = (units: number) => units > 0 && units <= 4;

/** A cost: "¼ credit", "1 credit", "2 credits". */
export function costText(units: number): string {
  return `${unitsText(units)} ${units > 4 ? 'credits' : 'credit'}`;
}

/**
 * The line next to a button that costs a part of a credit (plan §4). `balance` null: unknown (the
 * line says only the cost). `unpaidLecture`: the summary first pays its lecture (rare).
 */
export function costLine(cost: number, balance: number | null, options: { unpaidLecture?: boolean } = {}): { text: string; short: boolean } {
  if (cost === 0) return { text: 'Included in this lecture’s credit', short: false };
  if (balance !== null && balance < cost) {
    return { text: `Not enough credits: this uses ${costText(cost)}, you have ${balance <= 0 ? 'none' : unitsText(balance)}`, short: true };
  }
  const what = options.unpaidLecture && cost === 4 ? `${costText(cost)} (this lecture)` : costText(cost);
  return { text: `Uses ${what}${balance === null ? '' : ` · ${unitsText(balance - cost)} left`}`, short: false };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov", with the year when it isn't this year's. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** What a history row was, in her words (plan §1's table). */
export function historyText(row: CreditRow): string {
  const title = row.label ?? (row.what === 'quiz' ? 'a deleted quiz' : 'a deleted lecture');
  switch (row.kind) {
    case 'grant_free':
      return 'Welcome credits';
    case 'grant_beta':
      return 'Thanks for testing Studiply';
    case 'grant_admin':
      return 'Added by Studiply';
    case 'purchase':
      return `Bought ${unitsText(row.units)} ${lecturesWord(row.units)}`;
    case 'refund':
      return 'A purchase was refunded';
    case 'spend_lecture':
      return row.block ? `${title} · after ${row.block * 2} hours` : title;
    case 'spend_summary':
      return `Summary again · ${title}`;
    case 'spend_extra':
      if (row.what === 'quiz') return `Quiz · ${title}`;
      if (row.what === 'combine') return `Combined summary · ${title}`;
      return title;
    case 'reverse':
      if (row.what === 'quiz') return `Returned · the quiz “${title}” couldn’t be written`;
      if (row.what === 'summary') return `Returned · the summary of “${title}” couldn’t be written`;
      if (row.what === 'combine') return `Returned · “${title}” couldn’t be written`;
      return row.what === 'lecture' ? `Returned · ${title}` : 'Returned';
    default:
      return title;
  }
}

/** A history row: "+2" / "−¼", what it was, the date; and one sentence for screen readers. */
export function historyLine(row: CreditRow, now: Date = new Date()): { amount: string; text: string; date: string; spoken: string; added: boolean } {
  const added = row.units > 0;
  const amount = `${added ? '+' : '−'}${unitsText(Math.abs(row.units))}`;
  const text = historyText(row);
  const date = shortDate(row.created_at, now);
  const n = Math.abs(row.units) / 4;
  const spoken = `${added ? 'Plus' : 'Minus'} ${n} ${n === 1 ? 'credit' : 'credits'}, ${text}${date ? `, ${date}` : ''}`;
  return { amount, text, date, spoken, added };
}

export const NO_CREDITS_RECORD = 'No lecture credits left. You can still record and take notes; it’s transcribed when you add credits.';

/**
 * The quiet line on Record's setup and in Library (plan §5): with 1 lecture or less, or none; null
 * otherwise or while unknown. `laptop`: the web names the iPhone app; the iPhone says nothing of buying.
 */
export function lowCreditsText(units: number | null, laptop: boolean): string | null {
  if (units === null) return null;
  const buy = laptop ? ` · ${BUY_ON_IPHONE}` : '';
  if (units <= 0) return `${NO_CREDITS_RECORD}${buy}`;
  if (isLow(units)) return `${balanceLine(units)}${buy}`;
  return null;
}

/** With no credits, where a recording is shown (the strip, the iPhone's recording header). */
export const WAITING_FOR_CREDITS_TEXT = 'transcribed when you add credits';
export const WAITING_FOR_CREDITS_SENTENCE = 'No credits left: recording goes on, and it’s transcribed when you add credits.';

/** The laptop's only word on buying (App Store rule 3.1.1: no link, no price). */
export const BUY_ON_IPHONE = 'Buy credits in the Studiply iPhone app';
/** The iPhone, until the buy sheet exists (step 10.2-4): nothing that pretends to sell. */
export const BUY_SOON = 'You’ll be able to buy more credits here soon.';
