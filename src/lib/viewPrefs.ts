import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How documents are shown on this device: Pages or Pageless,
 * and the zoom. Kept on the device (AsyncStorage, localStorage in the
 * browser), not in the document: the laptop starts with Pages at Fit (the
 * sheet fits the column, never above 100 %), the iPhone Pageless at 100 %.
 */
const KEY = 'studiply.view';

export type ViewDevice = 'laptop' | 'iphone';
/** A zoom (0.5–2), or `fit`: the page as wide as the column allows, at most 100 %. */
export type ZoomSetting = number | 'fit';
export interface ViewPrefs {
  pages: boolean;
  zoom: ZoomSetting;
}

export const DEFAULT_VIEW: Record<ViewDevice, ViewPrefs> = {
  laptop: { pages: true, zoom: 'fit' },
  iphone: { pages: false, zoom: 1 },
};

/** The zoom steps of the menu and of ⌘+ / ⌘−. */
export const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];

/** The next step up (+1) or down (−1) from `current`. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0];
}

/**
 * How small Fit may make the sheet: below the zoom steps' 50 %, so at phone
 * width (an A4 sheet in about 300 px is 38 %) the page fits the width with
 * equal margins instead of overflowing sideways. The editor's page view
 * allows the same (editor/page/pageView `clampZoom`).
 */
export const FIT_MIN_ZOOM = 0.25;

/** The zoom shown: Fit is the column's width for the sheet, never above 100 %. */
export function effectiveZoom(zoom: ZoomSetting, pages: boolean, room: number, sheet: number): number {
  if (zoom !== 'fit') return zoom;
  if (!pages || room <= 0) return 1;
  return Math.max(FIT_MIN_ZOOM, Math.min(1, Math.floor((room / sheet) * 100) / 100));
}

function clean(raw: unknown, device: ViewDevice): ViewPrefs {
  const saved = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[device] : null) as Partial<ViewPrefs> | null;
  const fallback = DEFAULT_VIEW[device];
  const zoom = saved?.zoom === 'fit' || (typeof saved?.zoom === 'number' && saved.zoom >= 0.5 && saved.zoom <= 2) ? saved.zoom : fallback.zoom;
  return { pages: typeof saved?.pages === 'boolean' ? saved.pages : fallback.pages, zoom };
}

/** This device's view as kept (the defaults when nothing or nothing usable is). */
export async function readViewPrefs(device: ViewDevice): Promise<ViewPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return clean(raw ? JSON.parse(raw) : null, device);
  } catch {
    return DEFAULT_VIEW[device];
  }
}

/** Keeps this device's view (the other device's entry stays). */
export async function saveViewPrefs(device: ViewDevice, prefs: ViewPrefs): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    let all: Record<string, unknown> = {};
    try {
      all = raw ? JSON.parse(raw) : {};
    } catch {
      all = {};
    }
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...all, [device]: prefs }));
  } catch {
    // Not kept this time; the view still changes.
  }
}

/** This device's view, and a setter that keeps it (null until it has loaded). */
export function useViewPrefs(device: ViewDevice): [ViewPrefs | null, (change: Partial<ViewPrefs>) => void] {
  const [prefs, setPrefs] = useState<ViewPrefs | null>(null);
  useEffect(() => {
    let live = true;
    void readViewPrefs(device).then((saved) => live && setPrefs(saved));
    return () => {
      live = false;
    };
  }, [device]);
  const set = useCallback(
    (change: Partial<ViewPrefs>) => {
      setPrefs((current) => {
        const next = { ...(current ?? DEFAULT_VIEW[device]), ...change };
        void saveViewPrefs(device, next);
        return next;
      });
    },
    [device],
  );
  return [prefs, set];
}
