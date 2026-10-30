import { useSyncExternalStore } from 'react';

/**
 * Stop & summarize (step 7.3): which lecture the panel is open for. Opened
 * by the recording's Stop & summarize (the laptop's strip, the iPhone's
 * bar), by the Summary tab and by an item's Summarize; drawn once, by the
 * app's layout, over any screen.
 */
export interface SummarizeRequest {
  lectureId: string;
  /** Opened from a recording: Keep recording · Stop & generate summary; else Cancel · Generate summary. */
  recording: boolean;
}

let current: SummarizeRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openSummarize(request: SummarizeRequest): void {
  current = request;
  emit();
}

export function closeSummarize(): void {
  if (!current) return;
  current = null;
  emit();
}

export function useSummarizePanel(): SummarizeRequest | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
