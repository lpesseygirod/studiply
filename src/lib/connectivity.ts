/**
 * connectivity.ts
 * Whether Studiply's backend can be reached right now.
 *
 * Every Supabase request reports its outcome here (see ./supabase.ts), and
 * while offline a small health probe runs every few seconds until the
 * backend answers again. Probing Supabase itself, rather than asking the
 * phone whether it has Wi-Fi, also notices "Wi-Fi on, backend down", which is
 * how offline is tested against local Supabase (`supabase stop`).
 *
 * The probe is injected by ./supabase.ts so this module has no imports and
 * can be unit tested.
 */

import { useSyncExternalStore } from 'react';

export type Connection = 'unknown' | 'online' | 'offline';

/** How often the probe runs while offline. */
export const PROBE_INTERVAL_MS = 10_000;

let state: Connection = 'unknown';
let simulatedOffline = false;
let probeFn: (() => Promise<boolean>) | null = null;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const backOnlineListeners = new Set<() => void>();

function set(next: Connection): void {
  if (next === state) return;
  const was = state;
  state = next;
  listeners.forEach((fn) => fn());
  if (next === 'offline') scheduleProbe();
  if (next === 'online' && was === 'offline') backOnlineListeners.forEach((fn) => fn());
}

function scheduleProbe(): void {
  if (probeTimer || !probeFn) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    probe().catch(() => {});
  }, PROBE_INTERVAL_MS);
}

export function getConnection(): Connection {
  return state;
}

export function isOffline(): boolean {
  return state === 'offline';
}

/** A request never reached the backend. */
export function reportFailure(): void {
  set('offline');
}

/** The backend answered (with any status). */
export function reportReachable(): void {
  if (simulatedOffline) return;
  set('online');
}

/** Sets the health check; ./supabase.ts calls this once at startup. */
export function configureProbe(fn: () => Promise<boolean>): void {
  probeFn = fn;
}

/** Asks the backend now. Overlapping calls share one request. */
export function probe(): Promise<void> {
  if (!probeFn) return Promise.resolve();
  if (!probing) {
    const fn = probeFn;
    probing = (async () => {
      let ok = false;
      try {
        ok = !simulatedOffline && (await fn());
      } catch {
        ok = false;
      }
      if (ok) set('online');
      else if (state === 'offline') scheduleProbe();
      else set('offline');
    })().finally(() => {
      probing = null;
    });
  }
  return probing;
}

/**
 * Resolves once the first probe (or request) has decided online/offline, or
 * after `maxMs`, so a cold start offline doesn't wait for a request timeout.
 */
export function waitUntilKnown(maxMs: number): Promise<Connection> {
  if (state !== 'unknown') return Promise.resolve(state);
  return new Promise((resolve) => {
    const timer = setTimeout(done, maxMs);
    const unsubscribe = subscribe(() => {
      if (state !== 'unknown') done();
    });
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve(state);
    }
  });
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Runs `fn` each time the backend becomes reachable after being offline. */
export function onBackOnline(fn: () => void): () => void {
  backOnlineListeners.add(fn);
  return () => {
    backOnlineListeners.delete(fn);
  };
}

export function useConnectivity(): Connection {
  return useSyncExternalStore(subscribe, getConnection, getConnection);
}

// ── Development only: "Simulate offline" in Settings → General ──────────

export function isSimulatedOffline(): boolean {
  return simulatedOffline;
}

export function useSimulatedOffline(): boolean {
  return useSyncExternalStore(subscribe, isSimulatedOffline, isSimulatedOffline);
}

/** Makes every Supabase request fail as if there were no connection. */
export function setSimulatedOffline(on: boolean): void {
  if (!__DEV__) return;
  simulatedOffline = on;
  listeners.forEach((fn) => fn());
  if (on) set('offline');
  else probe().catch(() => {});
}

/** Test helper: back to the startup state. */
export function resetConnectivityForTests(): void {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
  probing = null;
  state = 'unknown';
  simulatedOffline = false;
  probeFn = null;
  listeners.clear();
  backOnlineListeners.clear();
}
