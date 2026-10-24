/**
 * aiMode.ts
 * When the app uses the simulated AI pipeline instead of the Edge Functions.
 *
 * Only ever in development: either forced with EXPO_PUBLIC_MOCK_AI=1 (work
 * without spending money or without internet), or as a fallback when an
 * Edge Function can't be reached at all (`supabase functions serve` isn't
 * running). A production build always calls the real functions.
 */

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
