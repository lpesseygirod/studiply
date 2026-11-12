import { useSyncExternalStore } from 'react';

import { getCreditsState, subscribeCredits, type CreditsState } from '../services/credits.service';

/** Her credits as last read (credits.service.ts): every screen shows the same balance. */
export function useCredits(): CreditsState {
  return useSyncExternalStore(subscribeCredits, getCreditsState, getCreditsState);
}

/** Her balance in units (1 lecture = 4), or null while unknown. */
export function useCreditUnits(): number | null {
  return useCredits().credits?.units ?? null;
}
