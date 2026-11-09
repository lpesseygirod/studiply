/**
 * account.service.ts
 * Step 10.1: Delete account (Settings → Account; App Review 5.1.1(v)). The delete-account Edge
 * Function deletes everything of hers on Studiply: her files in Storage, every row (they cascade from
 * her account) and the account itself; with Sign in with Apple, Apple is asked once more for a code
 * so the server can revoke her Apple token. Needs a connection (nothing is queued: a deletion waiting
 * on a phone would be surprising). Afterwards this device is signed out and its copy wiped
 * (AuthProvider's signOut: the offline copy, pending files, the cached profile).
 */

import { NetworkError } from '../lib/cloudRows';
import { isOffline } from '../lib/connectivity';
import { callFunction } from '../lib/functions';
import { appleCodeForDeletion, hasAppleIdentity } from './apple-auth';
import { CONFIRM_WORD } from '../../supabase/functions/_shared/account-deletion';

export { CONFIRM_WORD };

/** Whether what she typed confirms the deletion (case and spaces forgiven: "delete" works). */
export const confirmsDeletion = (typed: string) => typed.trim().toUpperCase() === CONFIRM_WORD;

/**
 * Deletes her account on Studiply. Resolves once the server has deleted it; the caller then signs out
 * this device. Throws (nothing deleted, or only her files) with a message to show.
 */
export async function deleteAccount(): Promise<{ files: number }> {
  if (isOffline()) throw new NetworkError();
  const apple = (await hasAppleIdentity().catch(() => false)) ? await appleCodeForDeletion() : null;
  const res = await callFunction<{ deleted: boolean; files: number }>('delete-account', {
    confirm: CONFIRM_WORD,
    ...(apple && { appleCode: apple.code, appleClient: apple.client }),
  });
  if (!res.deleted) throw new Error('Your account couldn’t be deleted. Please try again.');
  return { files: res.files };
}
