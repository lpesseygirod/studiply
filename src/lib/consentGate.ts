/**
 * consentGate.ts
 * "AI is off" for the signed-in student on this device. Set the moment she switches "Use
 * AI on my lectures" off in Settings → AI & privacy (also offline, before the server knows), cleared
 * when she allows it again. While it is set, ./functions.ts sends nothing to an AI function (the
 * server refuses anyway once the withdrawal has reached it; this covers the time before, and queued
 * jobs on the iPhone). Kept in AsyncStorage per account, so it survives a restart and doesn't carry
 * over to another account. Without imports from services, so functions.ts can use it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string) => `studiply.ai.paused.${userId}`;

let userId: string | null = null;
let paused = false;
let loaded: Promise<void> = Promise.resolve();
const listeners = new Set<(paused: boolean) => void>();

/** The signed-in account (lib/cache's setCacheSession, on every sign-in and sign-out). */
export function setAiPauseUser(next: string | null): void {
  if (next === userId) return;
  userId = next;
  paused = false;
  loaded = next
    ? AsyncStorage.getItem(keyFor(next))
        .then((v) => {
          if (userId === next) paused = v === '1';
        })
        .catch(() => {})
    : Promise.resolve();
}

/** Whether AI is off for her on this device (read from storage before the first answer). */
export async function isAiPaused(): Promise<boolean> {
  await loaded;
  return paused;
}

export async function setAiPaused(on: boolean): Promise<void> {
  await loaded;
  paused = on;
  listeners.forEach((fn) => fn(on));
  if (!userId) return;
  try {
    if (on) await AsyncStorage.setItem(keyFor(userId), '1');
    else await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // No storage: kept for this session.
  }
}

export function onAiPausedChange(fn: (paused: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
