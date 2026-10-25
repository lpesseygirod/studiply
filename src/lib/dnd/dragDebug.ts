/**
 * dragDebug.ts — development only (Settings → General → DEVELOPMENT →
 * Drag debug overlay): what the drag's gestures are doing, for a
 * screenshot from the iPhone. Nothing is recorded unless it is switched on,
 * and nothing leaves the device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface DragDebugState {
  /** The latest events, newest first ("+352 ms pan start"). */
  events: string[];
  finger: { x: number; y: number } | null;
  /** "Tema A ✓" or "Tema B ✗ Can't move a folder into one of its own folders". */
  hover: string | null;
  /** How many drop targets were measured when the drag started, and the drag area. */
  targets: string | null;
}

const KEY = 'studiply.dragDebug';
const PLAIN_KEY = 'studiply.dragPlainScroll';
const MAX_EVENTS = 12;

let enabled = false;
let plainScroll = false;
let state: DragDebugState = { events: [], finger: null, hover: null, targets: null };
let since = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

AsyncStorage.multiGet([KEY, PLAIN_KEY])
  .then(([[, on], [, plain]]) => {
    enabled = __DEV__ && on === '1';
    plainScroll = __DEV__ && plain === '1';
    emit();
  })
  .catch(() => {});

/**
 * Development only: the course list as React Native's own ScrollView and
 * pull-to-refresh instead of gesture-handler's, to compare the iPhone drag
 * with both (the step 3.3 iPhone bug).
 */
export function isPlainScroll(): boolean {
  return plainScroll;
}

export function setPlainScroll(on: boolean): void {
  plainScroll = __DEV__ && on;
  AsyncStorage.setItem(PLAIN_KEY, plainScroll ? '1' : '0').catch(() => {});
  emit();
}

export function isDragDebugOn(): boolean {
  return enabled;
}

export function setDragDebug(on: boolean): void {
  enabled = __DEV__ && on;
  AsyncStorage.setItem(KEY, enabled ? '1' : '0').catch(() => {});
  emit();
}

/** One event; `touchStart` resets the clock so times read from the moment the finger went down. */
export function dragLog(event: string, { touchStart = false } = {}): void {
  if (!enabled) return;
  const now = Date.now();
  if (touchStart || !since) since = now;
  state = { ...state, events: [`+${now - since} ms ${event}`, ...state.events].slice(0, MAX_EVENTS) };
  emit();
}

export function dragDebugSet(change: Partial<Omit<DragDebugState, 'events'>>): void {
  if (!enabled) return;
  state = { ...state, ...change };
  emit();
}

/** The current state (tests). */
export function dragDebugSnapshot(): DragDebugState {
  return state;
}

export function useDragDebug(): { on: boolean; plainScroll: boolean; state: DragDebugState } {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { on: enabled, plainScroll, state };
}
