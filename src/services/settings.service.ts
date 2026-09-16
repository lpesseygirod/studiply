import { first, run } from '../lib/db';
import {
  buildSet,
  mapUserSettings,
  now,
  toBool,
  type SqlValue,
  type UserSettingsRow,
} from '../lib/mappers';
import type { UserSettings } from '../types/database';

/** Column -> value patch, with booleans already narrowed to 0/1. */
function toSettingsPatch(
  updates: Partial<Omit<UserSettings, 'user_id' | 'created_at'>>,
): Record<string, SqlValue | undefined> {
  const bool = (v: boolean | undefined) => (v === undefined ? undefined : toBool(v));
  return {
    default_recording_mode: updates.default_recording_mode,
    lecture_mode_default: bool(updates.lecture_mode_default),
    default_summary_level: updates.default_summary_level,
    auto_title: bool(updates.auto_title),
    auto_tags: bool(updates.auto_tags),
    include_unclear_parts: bool(updates.include_unclear_parts),
    include_formulas: bool(updates.include_formulas),
    include_definitions: bool(updates.include_definitions),
    default_retention_policy: updates.default_retention_policy,
    default_language: updates.default_language,
    openai_budget: updates.openai_budget,
    anthropic_budget: updates.anthropic_budget,
    updated_at: now(),
  };
}

// -------------------------------------------------------------------
// getUserSettings
// Returns null if the user's settings row hasn't been created yet.
// -------------------------------------------------------------------
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const row = await first<UserSettingsRow>(`SELECT * FROM user_settings WHERE user_id = ?`, [
    userId,
  ]);
  return row ? mapUserSettings(row) : null;
}

// -------------------------------------------------------------------
// updateUserSettings
// -------------------------------------------------------------------
export async function updateUserSettings(
  userId: string,
  updates: Partial<Omit<UserSettings, 'user_id' | 'created_at'>>,
): Promise<UserSettings> {
  const set = buildSet(toSettingsPatch(updates));
  if (set) {
    await run(`UPDATE user_settings SET ${set.clause} WHERE user_id = ?`, [
      ...set.values,
      userId,
    ]);
  }

  const settings = await getUserSettings(userId);
  if (!settings) throw new Error('Settings not found for this profile.');
  return settings;
}

// -------------------------------------------------------------------
// upsertUserSettings
// Creates the row with defaults if it doesn't exist yet, then applies
// the supplied partial updates. Safe to call even on first-time users.
// -------------------------------------------------------------------
export async function upsertUserSettings(
  userId: string,
  updates: Partial<Omit<UserSettings, 'user_id' | 'created_at'>>,
): Promise<UserSettings> {
  const timestamp = now();

  // Insert the defaults row first if it's missing, then let the update below
  // apply the patch. Column defaults live in the schema, so this stays in
  // sync without repeating them here.
  await run(
    `INSERT OR IGNORE INTO user_settings (user_id, created_at, updated_at) VALUES (?, ?, ?)`,
    [userId, timestamp, timestamp],
  );

  return updateUserSettings(userId, updates);
}
