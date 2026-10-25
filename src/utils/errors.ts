import { isNetworkError, OFFLINE_MESSAGE } from '../lib/cloudRows';
import { isOffline } from '../lib/connectivity';

/**
 * The sentence to show when an action failed: the offline message when
 * Studiply couldn't be reached (these actions need a connection), otherwise
 * the screen's own message.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (isNetworkError(err) || isOffline()) return OFFLINE_MESSAGE;
  return fallback;
}
