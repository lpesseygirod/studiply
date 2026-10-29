import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { isNetworkError, serviceError } from '../lib/cloudRows';
import { onBackOnline } from '../lib/connectivity';
import { enqueue, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import type { Json } from '../types/supabase';
import { cleanPageSetup, type PageSetup } from '../editor/page/pageSetup';

/**
 * Preferences that follow the student across devices (step 4.5):
 * `profiles.preferences`: the colour picker's Recent colours, and the
 * default page setup for new documents (after test D).
 *
 * Each device keeps a copy (AsyncStorage / localStorage), so the picker
 * opens at once and works offline. A colour picked is merged into the
 * account's list by time (the union of both devices, newest first, 10 kept),
 * so two devices never wipe out each other's colours. The iPhone queues the
 * update while offline; the laptop sends it at once.
 */

export interface RecentColour {
  colour: string;
  /** When it was picked (ms). */
  at: number;
}

export const RECENT_COLOURS = 10;
const localKey = (userId: string) => `studiply.recentColours.${userId}`;

/** Both lists as one: each colour once (its latest pick), newest first, at most 10. */
export function mergeRecent(...lists: (RecentColour[] | null | undefined)[]): RecentColour[] {
  const latest = new Map<string, number>();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!item || typeof item.colour !== 'string' || typeof item.at !== 'number') continue;
      const colour = item.colour.toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(colour)) continue;
      latest.set(colour, Math.max(latest.get(colour) ?? 0, item.at));
    }
  }
  return [...latest.entries()]
    .map(([colour, at]) => ({ colour, at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_COLOURS);
}

const fromPreferences = (preferences: unknown): RecentColour[] =>
  mergeRecent((preferences as { recentColours?: RecentColour[] } | null)?.recentColours);

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function readLocal(id: string): Promise<RecentColour[]> {
  try {
    const raw = await AsyncStorage.getItem(localKey(id));
    return raw ? mergeRecent(JSON.parse(raw) as RecentColour[]) : [];
  } catch {
    return [];
  }
}

async function writeLocal(id: string, list: RecentColour[]): Promise<void> {
  await AsyncStorage.setItem(localKey(id), JSON.stringify(list)).catch(() => {});
}

/**
 * Merges `list` into the account's preferences and returns the result. The
 * profile is read and written in one go of the read-merge-write; a pick on
 * another device between the two is picked up by its own next merge.
 */
export async function pushRecentColours(id: string, list: RecentColour[], fail = serviceError): Promise<RecentColour[]> {
  const { data, error } = await supabase.from('profiles').select('preferences').eq('id', id).maybeSingle();
  if (error) throw fail(error, 'Could not save your recent colours.');
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  const merged = mergeRecent(fromPreferences(preferences), list);
  const { error: writeError } = await supabase
    .from('profiles')
    .update({ preferences: { ...preferences, recentColours: merged } as unknown as NonNullable<Json> })
    .eq('id', id);
  if (writeError) throw fail(writeError, 'Could not save your recent colours.');
  return merged;
}

/** This device's list merged with the account's (the account's when it can be read). */
export async function loadRecentColours(): Promise<RecentColour[]> {
  const id = await userId();
  if (!id) return [];
  const local = await readLocal(id);
  try {
    const { data, error } = await supabase.from('profiles').select('preferences').eq('id', id).maybeSingle();
    if (error) throw error;
    const merged = mergeRecent(local, fromPreferences(data?.preferences));
    await writeLocal(id, merged);
    return merged;
  } catch {
    return local;
  }
}

interface RecentColoursPayload {
  userId: string;
  list: RecentColour[];
}

/** A colour was picked: kept here at once, then merged into the account's list. */
export async function addRecentColour(colour: string, now = Date.now()): Promise<RecentColour[]> {
  const id = await userId();
  if (!id) return [];
  const list = mergeRecent(await readLocal(id), [{ colour, at: now }]);
  await writeLocal(id, list);
  if (syncEnabled) {
    await enqueue<RecentColoursPayload>({ kind: 'recent_colours', key: `${id}:recentColours`, payload: { userId: id, list } });
    return list;
  }
  try {
    const merged = await pushRecentColours(id, list);
    await writeLocal(id, merged);
    return merged;
  } catch (err) {
    // The laptop offline: kept on this computer, sent with the next pick.
    if (!isNetworkError(err) && __DEV__) console.warn('[preferences] recent colours not saved', err);
    return list;
  }
}

registerSyncHandler<RecentColoursPayload>('recent_colours', {
  run: async ({ userId: id, list }) => {
    const merged = await pushRecentColours(id, list, syncError);
    await writeLocal(id, mergeRecent(await readLocal(id), merged));
  },
  merge: (earlier, later) => ({ userId: later.userId, list: mergeRecent(earlier.list, later.list) }),
});

/** The recent colours for the picker, and `add` for a colour just used. */
export function useRecentColours(): { recent: string[]; add: (colour: string) => void } {
  const [list, setList] = useState<RecentColour[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => void loadRecentColours().then((l) => live && setList(l));
    load();
    const off = onBackOnline(load);
    return () => {
      live = false;
      off();
    };
  }, []);
  const add = useCallback((colour: string) => {
    setList((l) => mergeRecent(l, [{ colour, at: Date.now() }]));
    void addRecentColour(colour).then(setList);
  }, []);
  return { recent: list.map((c) => c.colour), add };
}

// -------------------------------------------------------------------
// The default page setup (after test D): Page setup's "Set as default",
// for new documents (as in Google Docs; existing ones keep theirs). Kept on
// this device too, so a new document offline gets it.
// -------------------------------------------------------------------

const pageSetupKey = (id: string) => `studiply.pageSetup.${id}`;

interface DefaultPageSetupPayload {
  userId: string;
  setup: PageSetup;
}

async function pushDefaultPageSetup(id: string, setup: PageSetup, fail = serviceError): Promise<void> {
  const { data, error } = await supabase.from('profiles').select('preferences').eq('id', id).maybeSingle();
  if (error) throw fail(error, 'Could not save the default page setup.');
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  const { error: writeError } = await supabase
    .from('profiles')
    .update({ preferences: { ...preferences, pageSetup: setup } as unknown as NonNullable<Json> })
    .eq('id', id);
  if (writeError) throw fail(writeError, 'Could not save the default page setup.');
}

/** The account's default page setup (this device's copy offline); null when none was set. */
export async function loadDefaultPageSetup(): Promise<PageSetup | null> {
  const id = await userId();
  if (!id) return null;
  try {
    const { data, error } = await supabase.from('profiles').select('preferences').eq('id', id).maybeSingle();
    if (error) throw error;
    const saved = (data?.preferences as { pageSetup?: unknown } | null)?.pageSetup;
    if (saved) {
      const setup = cleanPageSetup(saved);
      await AsyncStorage.setItem(pageSetupKey(id), JSON.stringify(setup)).catch(() => {});
      return setup;
    }
  } catch {
    // Offline: this device's copy.
  }
  try {
    const raw = await AsyncStorage.getItem(pageSetupKey(id));
    return raw ? cleanPageSetup(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Page setup's "Set as default": kept here at once, then on the account (the iPhone queues it). */
export async function saveDefaultPageSetup(setup: PageSetup): Promise<void> {
  const id = await userId();
  if (!id) return;
  const clean = cleanPageSetup(setup);
  await AsyncStorage.setItem(pageSetupKey(id), JSON.stringify(clean)).catch(() => {});
  if (syncEnabled) {
    await enqueue<DefaultPageSetupPayload>({ kind: 'default_page_setup', key: `${id}:pageSetup`, payload: { userId: id, setup: clean } });
    return;
  }
  await pushDefaultPageSetup(id, clean);
}

registerSyncHandler<DefaultPageSetupPayload>('default_page_setup', {
  run: ({ userId: id, setup }) => pushDefaultPageSetup(id, setup, syncError),
  merge: (_earlier, later) => later,
});
