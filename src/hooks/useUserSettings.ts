/**
 * useUserSettings.ts
 * The student's processing defaults (user_settings) with an optimistic save
 * that reverts on failure; used by the Summaries, Recording and Storage
 * settings (step 3.6; moved from the old General screen unchanged).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { showAlert } from '../components/dialogs/dialogs';
import { getUserSettings, upsertUserSettings } from '../services/settings.service';
import type { UserSettings } from '../types/database';
import { useAuth } from './useAuth';

export const DEFAULT_SETTINGS: Partial<UserSettings> = {
  default_recording_mode: 'standard',
  lecture_mode_default: false,
  default_summary_level: 'standard',
  auto_title: true,
  auto_tags: true,
  include_unclear_parts: true,
  include_formulas: true,
  include_definitions: true,
  default_retention_policy: 'delete_manually',
  default_language: 'en',
};

export type SaveSetting = (label: string, updates: Partial<UserSettings>) => Promise<void>;

export function useUserSettings(): {
  settings: Partial<UserSettings>;
  loading: boolean;
  save: SaveSetting;
  /** Shown for 1.5 s after a save ("✓"). */
  savedLabel: string | null;
} {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Partial<UserSettings>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    getUserSettings(profile.id)
      .then(s => {
        if (s) setSettings(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const save = useCallback<SaveSetting>(
    async (label, updates) => {
      if (!profile?.id) return;
      const prev = settings;
      setSettings(s => ({ ...s, ...updates }));

      try {
        await upsertUserSettings(profile.id, updates);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setSavedLabel(label);
        savedTimerRef.current = setTimeout(() => setSavedLabel(null), 1500);
      } catch {
        setSettings(prev);
        showAlert('Error', 'Could not save setting. Please try again.');
      }
    },
    [profile?.id, settings],
  );

  return { settings, loading, save, savedLabel };
}
