/**
 * libraryPrefs.ts
 * How the course grid is shown on this device: the sort order,
 * grid or list (iPhone), and whether "Photos & PDFs from lectures" is open.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { LibrarySort } from '../utils/libraryGrid';

export interface LibraryPrefs {
  sort: LibrarySort;
  view: 'grid' | 'list';
  lecturePhotosOpen: boolean;
}

export const DEFAULT_LIBRARY_PREFS: LibraryPrefs = { sort: 'kind', view: 'grid', lecturePhotosOpen: false };

const KEY = 'studiply.library';

export function parseLibraryPrefs(raw: string | null): LibraryPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<LibraryPrefs>) : {};
    return {
      sort: v.sort === 'name' || v.sort === 'edited' || v.sort === 'kind' ? v.sort : DEFAULT_LIBRARY_PREFS.sort,
      view: v.view === 'list' || v.view === 'grid' ? v.view : DEFAULT_LIBRARY_PREFS.view,
      lecturePhotosOpen:
        typeof v.lecturePhotosOpen === 'boolean' ? v.lecturePhotosOpen : DEFAULT_LIBRARY_PREFS.lecturePhotosOpen,
    };
  } catch {
    return DEFAULT_LIBRARY_PREFS;
  }
}

export async function readLibraryPrefs(): Promise<LibraryPrefs> {
  return parseLibraryPrefs(await AsyncStorage.getItem(KEY).catch(() => null));
}

export async function saveLibraryPrefs(prefs: LibraryPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

export function useLibraryPrefs(): [LibraryPrefs, (change: Partial<LibraryPrefs>) => void] {
  const [prefs, setPrefs] = useState(DEFAULT_LIBRARY_PREFS);
  useEffect(() => {
    readLibraryPrefs().then(setPrefs);
  }, []);
  const update = useCallback((change: Partial<LibraryPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...change };
      saveLibraryPrefs(next);
      return next;
    });
  }, []);
  return [prefs, update];
}
