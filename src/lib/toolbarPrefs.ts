import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the editor's second toolbar row is open (Lea: "remember
 * open/closed per device"): kept on this device (AsyncStorage, localStorage
 * in the browser), one value for the laptop's ⌄ row and one for the
 * iPhone's "more" row.
 */
const KEY = 'studiply.toolbar';

export type ToolbarRow = 'laptop' | 'iphone';

export function useToolbarExpanded(which: ToolbarRow): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as Partial<Record<ToolbarRow, boolean>>) : {};
        if (live) setOpen(saved[which] === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [which]);
  const set = useCallback(
    (next: boolean) => {
      setOpen(next);
      AsyncStorage.getItem(KEY)
        .then((raw) => AsyncStorage.setItem(KEY, JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), [which]: next })))
        .catch(() => {});
    },
    [which],
  );
  return [open, set];
}
