/**
 * credits.service.ts
 * Step 10.2-2 (docs/reports/plan-10.2-2.md §7): the one place the app reads her credits, from the
 * server's my_credits() (her balance, the last 20 rows, the beta grant). One store for every screen;
 * refreshed at sign-in, when the app or tab comes back (CreditsHost), when Settings → Credits opens,
 * after a 402 no_credits and after a summary or quiz is started (lib/credits/signals). The iPhone keeps
 * the last answer per account for offline; the laptop only in memory. Signing out forgets it.
 * The server alone decides what anything costs; this is only what she sees.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { cacheEnabled } from '../lib/cache/store';
import { isNetworkError, serviceError } from '../lib/cloudRows';
import { onCreditsMayHaveChanged } from '../lib/credits/signals';
import { parseCredits, type Credits } from '../lib/credits/format';
import { summaryQuote, type LedgerRow, type SummaryQuote } from '../lib/credits/quote';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/supabase';

export interface CreditsState {
  userId: string | null;
  credits: Credits | null;
  loading: boolean;
  /** The last read failed for want of a connection (what's shown is the cached answer, if any). */
  offline: boolean;
  /** When `credits` was read from the server (ms), or null. */
  updatedAt: number | null;
}

/** Reads closer together than this are skipped (unless forced). */
export const REFRESH_EVERY_MS = 30_000;

const EMPTY: CreditsState = { userId: null, credits: null, loading: false, offline: false, updatedAt: null };
const cacheKey = (userId: string) => `studiply.credits.${userId}`;

let state: CreditsState = EMPTY;
let lastRead = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const riseListeners = new Set<() => void>();

function set(patch: Partial<CreditsState>): void {
  const before = state.credits?.units;
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
  const after = state.credits?.units;
  // From none to some (a grant, later a purchase): what waited for credits can go.
  if (before !== undefined && before <= 0 && after !== undefined && after > 0) riseListeners.forEach((fn) => fn());
}

export function getCreditsState(): CreditsState {
  return state;
}

export function subscribeCredits(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called when her balance goes from 0 (or less) to more (CreditsHost sends the waiting recordings). */
export function onCreditsRise(fn: () => void): () => void {
  riseListeners.add(fn);
  return () => riseListeners.delete(fn);
}

/** Who is signed in (CreditsHost). A new account starts empty; signing out forgets the old one's copy. */
export async function setCreditsUser(userId: string | null): Promise<void> {
  if (userId === state.userId) return;
  const previous = state.userId;
  state = { ...EMPTY, userId };
  lastRead = 0;
  listeners.forEach((fn) => fn());
  if (previous && !userId && cacheEnabled) await AsyncStorage.removeItem(cacheKey(previous)).catch(() => {});
  if (!userId) return;
  if (cacheEnabled) {
    const raw = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
    let cached = null;
    try {
      cached = raw ? parseCredits(JSON.parse(raw)) : null;
    } catch {
      // A damaged copy: read from the server below.
    }
    if (cached && state.userId === userId && !state.credits) set({ credits: cached });
  }
  await refreshCredits({ force: true });
}

/** Reads my_credits() again (at most every 30 s unless forced). Never throws. */
export function refreshCredits(options: { force?: boolean } = {}): Promise<void> {
  const userId = state.userId;
  if (!userId) return Promise.resolve();
  if (inFlight) return inFlight;
  if (!options.force && Date.now() - lastRead < REFRESH_EVERY_MS) return Promise.resolve();
  lastRead = Date.now();
  set({ loading: true });
  inFlight = (async () => {
    try {
      const { data, error } = await supabase.rpc('my_credits');
      if (error) throw serviceError(error, 'Could not read your credits.');
      const credits = parseCredits(data);
      if (state.userId !== userId) return;
      if (!credits) {
        set({ loading: false });
        return;
      }
      set({ credits, loading: false, offline: false, updatedAt: Date.now() });
      if (cacheEnabled) await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(credits)).catch(() => {});
    } catch (err) {
      if (state.userId === userId) set({ loading: false, offline: isNetworkError(err) });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// A 402 or a started summary or quiz: read again (the throttle keeps it cheap).
onCreditsMayHaveChanged(() => {
  void refreshCredits();
});

/** For tests: back to signed out, nothing cached in memory. */
export function resetCreditsForTests(): void {
  state = EMPTY;
  lastRead = 0;
  inFlight = null;
}

// ---------- the beta friends' notice (plan §6): once per account ----------

const betaKey = (userId: string) => `studiply.betaCreditsSeen.${userId}`;

/** Whether she has dismissed it: on this device, or on any (profiles.preferences.betaCreditsSeen). */
export async function betaNoticeSeen(userId: string): Promise<boolean> {
  if ((await AsyncStorage.getItem(betaKey(userId)).catch(() => null)) === '1') {
    // Dismissed here while offline: tell the account now (the other devices then don't show it).
    void saveBetaSeen(userId).catch(() => {});
    return true;
  }
  const { data, error } = await supabase.from('profiles').select('preferences').eq('id', userId).maybeSingle();
  if (error) return true; // Unknown: never shown twice by mistake.
  return (data?.preferences as { betaCreditsSeen?: unknown } | null)?.betaCreditsSeen === true;
}

async function saveBetaSeen(userId: string): Promise<void> {
  const { data, error } = await supabase.from('profiles').select('preferences').eq('id', userId).maybeSingle();
  if (error) throw error;
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  if (preferences.betaCreditsSeen === true) return;
  const { error: writeError } = await supabase
    .from('profiles')
    .update({ preferences: { ...preferences, betaCreditsSeen: true } as unknown as NonNullable<Json> })
    .eq('id', userId);
  if (writeError) throw writeError;
}

/** Hidden at once on this device; saved to the account (again later if offline now). */
export async function dismissBetaNotice(userId: string): Promise<void> {
  await AsyncStorage.setItem(betaKey(userId), '1').catch(() => {});
  await saveBetaSeen(userId).catch(() => {});
}

/** What a lecture's summary will cost (the panel's line); null when it can't be read. */
export async function quoteLectureSummary(lectureId: string): Promise<SummaryQuote | null> {
  const { data, error } = await supabase.from('credit_ledger').select('id, kind, reverses').eq('lecture_id', lectureId);
  if (error || !data) return null;
  return summaryQuote(data as LedgerRow[]);
}
