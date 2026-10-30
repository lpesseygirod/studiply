import { showAlert, type DialogButton } from '../components/dialogs/dialogs';
import { isOffline } from '../lib/connectivity';
import { syncCounts, syncNow } from '../lib/sync';
import { recorder } from '../services/recorder';

/**
 * Signing out, on iPhone and web. When this iPhone still has changes that
 * haven't reached Studiply, signing out would lose them (the offline copy is
 * removed), so the student is told how many and can:
 *  - Sync now (only when online): send them; if all went through, the
 *    sign-out continues, otherwise the question comes back with the new count;
 *  - Cancel;
 *  - Sign out anyway (the changes are lost).
 * Without unsynced changes it is the usual confirmation.
 */

export type SignOutChoice = 'sync' | 'cancel' | 'sign_out';

export interface SignOutDeps {
  unsynced: () => Promise<number>;
  online: () => boolean;
  syncNow: () => Promise<void>;
  /** Shows a question and resolves with the button chosen. */
  ask: (title: string, message: string, choices: { choice: SignOutChoice; text: string; style?: DialogButton['style'] }[]) => Promise<SignOutChoice>;
  signOut: () => Promise<void>;
}

/** "1 change", "3 changes". */
export function changes(n: number): string {
  return n === 1 ? '1 change' : `${n} changes`;
}

/** Resolves true once signed out, false when the student cancelled. */
export async function runSignOut(
  deps: SignOutDeps,
  confirm: { title: string; message: string },
): Promise<boolean> {
  let waiting = await deps.unsynced();
  if (waiting === 0) {
    const choice = await deps.ask(confirm.title, confirm.message, [
      { choice: 'cancel', text: 'Cancel', style: 'cancel' },
      { choice: 'sign_out', text: 'Sign out', style: 'destructive' },
    ]);
    if (choice !== 'sign_out') return false;
    await deps.signOut();
    return true;
  }

  for (;;) {
    const online = deps.online();
    const choice = await deps.ask(
      'Changes not synced yet',
      `${changes(waiting)} on this iPhone ${waiting === 1 ? "hasn't" : "haven't"} reached Studiply yet. ` +
        (online
          ? 'Sync now to keep them, or sign out anyway and lose them.'
          : "You're offline: if you sign out now, they are lost."),
      [
        ...(online ? [{ choice: 'sync' as const, text: 'Sync now' }] : []),
        { choice: 'cancel', text: 'Cancel', style: 'cancel' },
        { choice: 'sign_out', text: 'Sign out anyway', style: 'destructive' },
      ],
    );
    if (choice === 'cancel') return false;
    if (choice === 'sync') {
      await deps.syncNow().catch(() => {});
      waiting = await deps.unsynced();
      if (waiting > 0) continue;
    }
    await deps.signOut();
    return true;
  }
}

/** The app's sign-out: the shared dialogs, the sync queue, AuthProvider's signOut. */
export function confirmSignOut(signOut: () => Promise<void>, confirm: { title: string; message: string }): Promise<boolean> {
  // Nothing but Stop stops a recording (step 5.3).
  if (recorder.state().status !== 'idle') {
    showAlert('A lecture is recording', 'Stop the recording before signing out.');
    return Promise.resolve(false);
  }
  return runSignOut(
    {
      unsynced: async () => {
        const { pending, failed } = await syncCounts();
        return pending + failed;
      },
      online: () => !isOffline(),
      syncNow,
      ask: (title, message, choices) =>
        new Promise((resolve) => {
          showAlert(
            title,
            message,
            choices.map((c) => ({ text: c.text, style: c.style, onPress: () => resolve(c.choice) })),
          );
        }),
      signOut,
    },
    confirm,
  );
}
