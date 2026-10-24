/**
 * settings.service.ts
 * The student's recording and notes defaults.
 *
 * The step 1.2 schema has no table for the old app's settings (Phase 7
 * replaces most of them with per-course sliders), so they are kept per
 * device: AsyncStorage on iPhone, localStorage in the browser. Only the
 * default language is in the cloud (profiles.default_language), because it
 * also decides the lecture language on every device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { serviceError } from '../lib/cloudRows';
import type { UserSettings } from '../types/database';

type Stored = Omit<UserSettings, 'user_id' | 'default_language'>;
type Updates = Partial<Omit<UserSettings, 'user_id' | 'created_at'>>;

const storageKey = (userId: string) => `studiply.settings.${userId}`;

/** The old app's column defaults. */
function defaults(): Stored {
  const now = new Date().toISOString();
  return {
    default_recording_mode: 'standard',
    lecture_mode_default: true,
    default_summary_level: 'standard',
    auto_title: true,
    auto_tags: true,
    include_unclear_parts: true,
    include_formulas: true,
    include_definitions: true,
    default_retention_policy: 'delete_3_days',
    created_at: now,
    updated_at: now,
  };
}

async function readStored(userId: string): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
    return { ...defaults(), ...parsed };
  } catch {
    // Unreadable or unavailable storage (e.g. a private browser window): use the defaults.
    return defaults();
  }
}

async function readLanguage(userId: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('default_language').eq('id', userId).maybeSingle();
  if (error) throw serviceError(error, 'Could not load your settings.');
  return data?.default_language ?? 'en';
}

// -------------------------------------------------------------------
// getUserSettings
// Always returns settings (defaults for anything not set yet).
// -------------------------------------------------------------------
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const [stored, language] = await Promise.all([readStored(userId), readLanguage(userId)]);
  return { user_id: userId, ...stored, default_language: language };
}

// -------------------------------------------------------------------
// updateUserSettings
// -------------------------------------------------------------------
export async function updateUserSettings(userId: string, updates: Updates): Promise<UserSettings> {
  const { default_language, ...local } = updates;

  if (default_language !== undefined) {
    const { error } = await supabase.from('profiles').update({ default_language }).eq('id', userId);
    if (error) throw serviceError(error, 'Could not save your settings.');
  }

  const localKeys = Object.entries(local).filter(([, v]) => v !== undefined);
  if (localKeys.length > 0) {
    const next: Stored = { ...(await readStored(userId)), ...Object.fromEntries(localKeys), updated_at: new Date().toISOString() };
    try {
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      throw new Error('Could not save your settings on this device.');
    }
  }

  const settings = await getUserSettings(userId);
  if (!settings) throw new Error('Settings not found for this profile.');
  return settings;
}

// -------------------------------------------------------------------
// upsertUserSettings
// Same as updateUserSettings: there is no row to create first.
// -------------------------------------------------------------------
export async function upsertUserSettings(userId: string, updates: Updates): Promise<UserSettings> {
  return updateUserSettings(userId, updates);
}
