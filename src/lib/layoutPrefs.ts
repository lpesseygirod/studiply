/**
 * layoutPrefs.ts
 * Whether the laptop shell's sidebar and assistant panel are open,
 * remembered per device (localStorage on the web).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export interface LayoutPrefs {
  sidebarOpen: boolean;
  assistantOpen: boolean;
}

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = { sidebarOpen: true, assistantOpen: true };

const KEY = 'studiply.layout';

/** Whatever is stored, a complete and valid value. */
export function parseLayoutPrefs(raw: string | null): LayoutPrefs {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<LayoutPrefs>) : {};
    return {
      sidebarOpen: typeof value.sidebarOpen === 'boolean' ? value.sidebarOpen : DEFAULT_LAYOUT_PREFS.sidebarOpen,
      assistantOpen: typeof value.assistantOpen === 'boolean' ? value.assistantOpen : DEFAULT_LAYOUT_PREFS.assistantOpen,
    };
  } catch {
    return DEFAULT_LAYOUT_PREFS;
  }
}

export async function readLayoutPrefs(): Promise<LayoutPrefs> {
  return parseLayoutPrefs(await AsyncStorage.getItem(KEY).catch(() => null));
}

export async function saveLayoutPrefs(prefs: LayoutPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

export function useLayoutPrefs(): [LayoutPrefs, (change: Partial<LayoutPrefs>) => void] {
  const [prefs, setPrefs] = useState(DEFAULT_LAYOUT_PREFS);
  useEffect(() => {
    readLayoutPrefs().then(setPrefs);
  }, []);
  const update = useCallback((change: Partial<LayoutPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...change };
      saveLayoutPrefs(next);
      return next;
    });
  }, []);
  return [prefs, update];
}
