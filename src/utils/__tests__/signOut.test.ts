import { changes, runSignOut, type SignOutChoice, type SignOutDeps } from '../signOut';

const CONFIRM = { title: 'Sign out', message: 'You can sign in again with your email and password.' };

/** Answers the questions in order and records what was asked. */
function deps(opts: { unsynced: number[]; online?: boolean; answers: SignOutChoice[] }) {
  const asked: { title: string; message: string; buttons: string[] }[] = [];
  const counts = [...opts.unsynced];
  const d: SignOutDeps & { signedOut: boolean; synced: number } = {
    signedOut: false,
    synced: 0,
    unsynced: async () => counts.shift() ?? 0,
    online: () => opts.online ?? true,
    syncNow: async () => {
      d.synced++;
    },
    ask: async (title, message, choices) => {
      asked.push({ title, message, buttons: choices.map((c) => c.text) });
      const answer = opts.answers.shift();
      if (!answer) throw new Error('unexpected question');
      return answer;
    },
    signOut: async () => {
      d.signedOut = true;
    },
  };
  return { d, asked };
}

describe('sign-out', () => {
  it('nothing unsynced: the usual confirmation', async () => {
    const { d, asked } = deps({ unsynced: [0], answers: ['sign_out'] });
    expect(await runSignOut(d, CONFIRM)).toBe(true);
    expect(asked).toEqual([{ title: 'Sign out', message: CONFIRM.message, buttons: ['Cancel', 'Sign out'] }]);
    expect(d.signedOut).toBe(true);
  });

  it('unsynced changes, online: offers Sync now, Cancel and Sign out anyway', async () => {
    const { d, asked } = deps({ unsynced: [3], answers: ['cancel'] });
    expect(await runSignOut(d, CONFIRM)).toBe(false);
    expect(asked[0].buttons).toEqual(['Sync now', 'Cancel', 'Sign out anyway']);
    expect(asked[0].message).toMatch(/^3 changes on this iPhone haven't reached Studiply yet/);
    expect(d.signedOut).toBe(false);
  });

  it('Sync now sends them and, when nothing is left, signs out', async () => {
    const { d, asked } = deps({ unsynced: [2, 0], answers: ['sync'] });
    expect(await runSignOut(d, CONFIRM)).toBe(true);
    expect(d.synced).toBe(1);
    expect(d.signedOut).toBe(true);
    expect(asked).toHaveLength(1);
  });

  it('if something is still left after Sync now, asks again with the new count', async () => {
    const { d, asked } = deps({ unsynced: [2, 1], answers: ['sync', 'cancel'] });
    expect(await runSignOut(d, CONFIRM)).toBe(false);
    expect(asked[1].message).toMatch(/^1 change on this iPhone hasn't reached Studiply yet/);
    expect(d.signedOut).toBe(false);
  });

  it('offline: no Sync now, and it says the changes would be lost', async () => {
    const { d, asked } = deps({ unsynced: [1], online: false, answers: ['sign_out'] });
    expect(await runSignOut(d, CONFIRM)).toBe(true);
    expect(asked[0].buttons).toEqual(['Cancel', 'Sign out anyway']);
    expect(asked[0].message).toMatch(/You're offline: if you sign out now, they are lost/);
    expect(d.signedOut).toBe(true);
  });

  it('counts in words', () => {
    expect(changes(1)).toBe('1 change');
    expect(changes(4)).toBe('4 changes');
  });
});
