/**
 * The laptop's green banner (step 7.7, desktop-03) runs the window's full width under the top bar, so
 * the shell draws it; the document screen says when: its Summary tab holds a summary (and which one,
 * for its "Built from" line). Plain module state, as assistantTarget.
 */

import { useSyncExternalStore } from 'react';

import type { LectureSummary } from '../../services/summarize.service';

/** Shown: the summary it's about (null while its row is being read); hidden: null. */
let banner: { summary: LectureSummary | null } | null = null;
const listeners = new Set<() => void>();

export function setSummaryBanner(next: { summary: LectureSummary | null } | null): void {
  if (next?.summary === banner?.summary && !next === !banner) return;
  banner = next;
  listeners.forEach((fn) => fn());
}

export function useSummaryBanner(): { summary: LectureSummary | null } | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => banner,
    () => banner,
  );
}
