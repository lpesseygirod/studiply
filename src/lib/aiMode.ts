/**
 * aiMode.ts
 * When the app uses the simulated AI pipeline instead of the Edge Functions.
 *
 * Only ever in development: either forced with EXPO_PUBLIC_MOCK_AI=1 (work
 * without spending money or without internet), or as a fallback when an
 * Edge Function can't be reached at all (`supabase functions serve` isn't
 * running). A production build always calls the real functions.
 *
 * The development badge ("SIMULATED AI") follows simulatedAiState(): forced,
 * or the last AI call fell back; a real answer clears the fallback.
 */

import { useSyncExternalStore } from 'react';

export interface MockAiInput {
  isDev: boolean;
  flag: string | undefined;
}

export function mockAiForced({ isDev, flag }: MockAiInput): boolean {
  return isDev && flag === '1';
}

/** True when this build is told to simulate AI. */
export function isMockAiForced(): boolean {
  return mockAiForced({ isDev: __DEV__, flag: process.env.EXPO_PUBLIC_MOCK_AI });
}

/** True when a failed call may fall back to the simulation (development only). */
export function canFallBackToMock(error: unknown, isDev: boolean = __DEV__): boolean {
  return isDev && typeof error === 'object' && error !== null && (error as { unreachable?: boolean }).unreachable === true;
}

// ── What the development badge shows ────────────────────────────────────

export type SimulatedAi = 'forced' | 'fallback' | null;

let lastCallFellBack = false;
const listeners = new Set<() => void>();

function setFellBack(value: boolean): void {
  if (lastCallFellBack === value) return;
  lastCallFellBack = value;
  listeners.forEach((l) => l());
}

/** An AI call used the simulation because the functions couldn't be reached. */
export function noteAiFellBack(): void {
  setFellBack(true);
}

/** An AI call got a real answer from an Edge Function. */
export function noteAiReal(): void {
  setFellBack(false);
}

export function simulatedAiState(forced: boolean = isMockAiForced()): SimulatedAi {
  if (forced) return 'forced';
  return lastCallFellBack ? 'fallback' : null;
}

export function useSimulatedAi(): SimulatedAi {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => simulatedAiState(),
  );
}

/** For tests. */
export function resetSimulatedAiForTests(): void {
  lastCallFellBack = false;
}
