/**
 * codes.ts
 * Free-credit codes (docs/reports/plan-10.2-codes-admin.md, part A; Lea 12 Nov): a code's form, the
 * answers to redeeming one in her words, and the dashboard's new-code checks. Without React; the server
 * (redeem_code, admin_create_code in 20261029153100) is the judge. Jest: codes.test.ts.
 */

import { unitsText } from './format';

/** As the server compares them: spaces dropped, upper-case. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** The server's form: 4–24 of A–Z, 0–9 and "-". */
export const CODE_PATTERN = /^[A-Z0-9-]{4,24}$/;

export type RedeemOutcome = 'redeemed' | 'invalid' | 'already' | 'full' | 'too_many';

const lectures = (units: number) => `${unitsText(units)} ${units > 4 ? 'lectures' : 'lecture'}`;

/** What Settings → Credits says after Redeem. */
export function redeemAnswer(outcome: string, units: number): { text: string; ok: boolean } {
  switch (outcome) {
    case 'redeemed':
      return { text: `Added ${lectures(units)} to your credits.`, ok: true };
    case 'already':
      return { text: 'You’ve already used this code.', ok: false };
    case 'full':
      return { text: 'This code has been fully used.', ok: false };
    case 'too_many':
      return { text: 'Too many tries. Try again in an hour.', ok: false };
    default:
      return { text: 'That code isn’t valid.', ok: false };
  }
}

export const REDEEM_OFFLINE = 'Redeeming a code needs a connection.';

/** The dashboard's New code: what's wrong with it, or null. Lectures in quarters (¼ to 25). */
export function newCodeProblem(c: { code: string; lectures: number; uses: number; expires: string }): string | null {
  if (!CODE_PATTERN.test(normalizeCode(c.code))) return 'A code is 4 to 24 letters, digits or “-”.';
  const units = Math.round(c.lectures * 4);
  if (!Number.isFinite(c.lectures) || units !== c.lectures * 4 || units < 1 || units > 100) return 'Lectures: ¼ to 25, in quarters.';
  if (!Number.isInteger(c.uses) || c.uses < 1 || c.uses > 100000) return 'Uses: a whole number from 1.';
  if (c.expires.trim() && expiresAt(c.expires) === null) return 'Expiry: a date as YYYY-MM-DD, or empty.';
  return null;
}

/** "2026-12-31" → the end of that day (UTC), or null. */
export function expiresAt(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d.toISOString() : null;
}

/** Suggest: 8 characters without look-alikes (no O/0, I/1). */
export function suggestCode(random: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(random() * chars.length)]).join('');
}

/** A code's row in the dashboard: "4 of 50 used · 10 lectures · No expiry". */
export function codeRowLine(c: { used: number; max_redemptions: number; units: number; expires_at: string | null }, now: Date = new Date()): string {
  const expiry = c.expires_at ? (Date.parse(c.expires_at) <= now.getTime() ? 'Expired' : `Expires ${c.expires_at.slice(0, 10)}`) : 'No expiry';
  return `${c.used} of ${c.max_redemptions} used · ${lectures(c.units)} · ${expiry}`;
}
